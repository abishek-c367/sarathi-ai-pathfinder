/**
 * Server-side AI provider configuration.
 *
 * The API key never leaves this process: it is read from the server
 * environment, or set once through the protected admin endpoint and held in
 * server memory. Nothing here is ever serialised to the browser except the
 * boolean `hasApiKey`.
 *
 * Replace the in-memory store with a database/secret-manager write when
 * persistent configuration becomes available — the shape stays the same.
 */

export type ProviderId = "lovable" | "groq";

export type ProviderDescriptor = {
  id: ProviderId;
  label: string;
  defaultModel: string;
  envVar: string;
};

export const PROVIDERS: Record<ProviderId, ProviderDescriptor> = {
  lovable: {
    id: "lovable",
    label: "Lovable AI (built-in)",
    defaultModel: "openai/gpt-6-astra",
    envVar: "LOVABLE_API_KEY",
  },
  groq: {
    id: "groq",
    label: "Groq",
    defaultModel: "openai/gpt-oss-20b",
    envVar: "GROQ_API_KEY",
  },
};

export type RuntimeSettings = {
  provider: ProviderId;
  model: string;
  temperature: number;
  maxTokens: number;
};

type ConnectionRecord = {
  status: "connected" | "failed" | "unknown";
  checkedAt: number | null;
  detail?: string;
};

const overrides: Partial<RuntimeSettings> = {};
const runtimeKeys = new Map<ProviderId, string>();
let connection: ConnectionRecord = { status: "unknown", checkedAt: null };

function envKey(provider: ProviderId): string | undefined {
  const value = process.env[PROVIDERS[provider].envVar];
  return value && value.trim() ? value.trim() : undefined;
}

function defaultProvider(): ProviderId {
  if (envKey("groq") || runtimeKeys.has("groq")) return "groq";
  return "lovable";
}

export function getApiKey(provider: ProviderId): string | undefined {
  return runtimeKeys.get(provider) ?? envKey(provider);
}

export function apiKeySource(provider: ProviderId): string {
  if (runtimeKeys.has(provider)) return "admin (server memory)";
  if (envKey(provider)) return `environment (${PROVIDERS[provider].envVar})`;
  return "not configured";
}

export function getSettings(): RuntimeSettings {
  const provider = overrides.provider ?? defaultProvider();
  return {
    provider,
    model: overrides.model ?? PROVIDERS[provider].defaultModel,
    temperature: overrides.temperature ?? 0.4,
    maxTokens: overrides.maxTokens ?? 1400,
  };
}

export function updateSettings(update: {
  provider?: string;
  model?: string;
  temperature?: number;
  maxTokens?: number;
  apiKey?: string;
}) {
  if (update.provider && update.provider in PROVIDERS) {
    const next = update.provider as ProviderId;
    if (next !== overrides.provider) delete overrides.model;
    overrides.provider = next;
  }
  if (typeof update.model === "string" && update.model.trim()) {
    overrides.model = update.model.trim();
  }
  if (typeof update.temperature === "number" && Number.isFinite(update.temperature)) {
    overrides.temperature = Math.min(2, Math.max(0, update.temperature));
  }
  if (typeof update.maxTokens === "number" && Number.isFinite(update.maxTokens)) {
    overrides.maxTokens = Math.min(8000, Math.max(128, Math.round(update.maxTokens)));
  }
  if (typeof update.apiKey === "string" && update.apiKey.trim()) {
    runtimeKeys.set(overrides.provider ?? defaultProvider(), update.apiKey.trim());
    connection = { status: "unknown", checkedAt: null };
  }
  return getSettings();
}

export function recordConnection(next: ConnectionRecord) {
  connection = next;
}

export function getConnection(): ConnectionRecord {
  return connection;
}

/** Browser-safe view of the configuration. Never includes the key itself. */
export function publicSettings() {
  const settings = getSettings();
  return {
    ...settings,
    hasApiKey: Boolean(getApiKey(settings.provider)),
    apiKeySource: apiKeySource(settings.provider),
    availableProviders: Object.values(PROVIDERS).map((p) => ({
      id: p.id,
      label: p.label,
      configured: Boolean(getApiKey(p.id)),
      defaultModel: p.defaultModel,
    })),
    connection: getConnection(),
  };
}
