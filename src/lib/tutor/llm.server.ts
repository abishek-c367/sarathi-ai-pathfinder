import { getApiKey, getSettings, PROVIDERS, recordConnection } from "./ai-settings.server";
import type { ProviderId } from "./ai-settings.server";

export type LlmMessage = { role: "user" | "assistant"; content: string };

export type LlmErrorCode =
  | "not_configured"
  | "auth"
  | "rate_limit"
  | "credits"
  | "bad_request"
  | "timeout"
  | "upstream"
  | "malformed";

export class LlmError extends Error {
  code: LlmErrorCode;
  status?: number;

  constructor(code: LlmErrorCode, message: string, status?: number) {
    super(message);
    this.code = code;
    this.status = status;
  }

  /** Friendly, student-safe message. Never leaks keys or stack traces. */
  get friendly(): string {
    switch (this.code) {
      case "not_configured":
        return "Your AI Tutor is not configured yet. An administrator needs to add an AI provider key in Admin → AI Settings.";
      case "auth":
        return "Your AI Tutor could not authenticate with the AI provider. An administrator needs to check the API key.";
      case "rate_limit":
        return "Your AI Tutor is handling a lot of requests right now. Please wait a few seconds and try again.";
      case "credits":
        return "Your AI Tutor has run out of AI credits. An administrator needs to top up the workspace.";
      case "timeout":
        return "Your AI Tutor took too long to answer. Please try again.";
      case "malformed":
        return "Your AI Tutor sent back an unreadable answer. Please try again.";
      default:
        return "Your AI Tutor is temporarily unavailable. Please try again.";
    }
  }
}

function mapStatus(status: number, detail: string): LlmError {
  if (status === 401 || status === 403) return new LlmError("auth", detail, status);
  if (status === 402) return new LlmError("credits", detail, status);
  if (status === 429) return new LlmError("rate_limit", detail, status);
  if (status === 400 || status === 404 || status === 422)
    return new LlmError("bad_request", detail, status);
  return new LlmError("upstream", detail, status);
}

async function readSseText(response: Response, pick: (event: unknown) => string | null) {
  if (!response.body) throw new LlmError("malformed", "Empty stream");
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let text = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith("data:")) continue;
      const payload = trimmed.slice(5).trim();
      if (!payload || payload === "[DONE]") continue;
      try {
        const delta = pick(JSON.parse(payload));
        if (delta) text += delta;
      } catch {
        // ignore non-JSON keepalives
      }
    }
  }
  return text;
}

/** Lovable AI Gateway — OpenAI Responses API, always streamed, consumed server-side. */
async function callLovable(
  apiKey: string,
  model: string,
  system: string,
  messages: LlmMessage[],
  maxTokens: number,
) {
  const response = await fetch("https://ai.gateway.lovable.dev/v1/responses", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "Lovable-API-Key": apiKey,
      "X-Lovable-AIG-SDK": "fetch",
    },
    body: JSON.stringify({
      model,
      instructions: system,
      input: messages.map((m) => ({
        role: m.role,
        content: [{ type: m.role === "assistant" ? "output_text" : "input_text", text: m.content }],
      })),
      stream: true,
      store: false,
      max_output_tokens: maxTokens,
      reasoning: { effort: "low" },
    }),
  });

  if (!response.ok) {
    throw mapStatus(response.status, await response.text().catch(() => response.statusText));
  }

  const text = await readSseText(response, (event) => {
    const e = event as { type?: string; delta?: string };
    return e.type === "response.output_text.delta" && typeof e.delta === "string" ? e.delta : null;
  });
  if (!text.trim()) throw new LlmError("malformed", "No text in response");
  return text;
}

/** Groq — OpenAI-compatible chat completions. */
async function callGroq(
  apiKey: string,
  model: string,
  system: string,
  messages: LlmMessage[],
  temperature: number,
  maxTokens: number,
) {
  const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model,
      temperature,
      max_tokens: maxTokens,
      messages: [{ role: "system", content: system }, ...messages],
    }),
  });

  if (!response.ok) {
    throw mapStatus(response.status, await response.text().catch(() => response.statusText));
  }

  let payload: { choices?: Array<{ message?: { content?: string } }> };
  try {
    payload = (await response.json()) as typeof payload;
  } catch {
    throw new LlmError("malformed", "Provider returned non-JSON");
  }
  const text = payload.choices?.[0]?.message?.content ?? "";
  if (!text.trim()) throw new LlmError("malformed", "Empty completion");
  return text;
}

export type LlmResult = { text: string; provider: ProviderId; model: string };

export async function generate(system: string, messages: LlmMessage[]): Promise<LlmResult> {
  const { provider, model, temperature, maxTokens } = getSettings();
  const apiKey = getApiKey(provider);
  if (!apiKey) {
    throw new LlmError(
      "not_configured",
      `No API key configured for ${PROVIDERS[provider].label}`,
    );
  }

  try {
    const text =
      provider === "groq"
        ? await callGroq(apiKey, model, system, messages, temperature, maxTokens)
        : await callLovable(apiKey, model, system, messages, maxTokens);
    recordConnection({ status: "connected", checkedAt: Date.now() });
    return { text, provider, model };
  } catch (error) {
    const err =
      error instanceof LlmError
        ? error
        : new LlmError("upstream", error instanceof Error ? error.message : "Unknown error");
    recordConnection({ status: "failed", checkedAt: Date.now(), detail: err.code });
    throw err;
  }
}

/** Cheap round-trip used by the admin "Test connection" button. */
export async function testConnection() {
  const started = Date.now();
  const { provider, model } = getSettings();
  try {
    await generate("You are a connection test. Reply with the single word: ok.", [
      { role: "user", content: "ping" },
    ]);
    return {
      status: "connected" as const,
      provider,
      model,
      latencyMs: Date.now() - started,
    };
  } catch (error) {
    const err = error instanceof LlmError ? error : new LlmError("upstream", "Unknown error");
    return {
      status: "failed" as const,
      provider,
      model,
      latencyMs: Date.now() - started,
      detail: err.friendly,
    };
  }
}
