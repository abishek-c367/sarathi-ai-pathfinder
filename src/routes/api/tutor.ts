import { createFileRoute } from "@tanstack/react-router";

import {
  nextId,
  parseModelMarkdown,
  simulatedBeat,
  type TutorBlock,
  type TutorRequest,
} from "@/lib/tutor-blocks";

function encodeBlock(block: TutorBlock) {
  return `${JSON.stringify({ type: "block", block })}\n`;
}

async function groqBlocks(req: TutorRequest, apiKey: string): Promise<TutorBlock[]> {
  const system = [
    "You are Sarathi, a warm, precise programming tutor.",
    `Teaching style: depth=${req.teaching.depth}, tone=${req.teaching.tone}, pacing=${req.teaching.pacing}.`,
    "Answer in Markdown. Use fenced code blocks with a language tag for code.",
    "When a diagram helps, emit a fenced block tagged `mermaid` with valid Mermaid syntax.",
    "Be concrete and short: intuition first, then one example.",
  ].join(" ");

  const user =
    req.mode === "ask"
      ? `Course: ${req.courseTitle}. Module: ${req.moduleTitle}. Lesson: ${req.lesson.title}.\nLesson concepts: ${req.lesson.concepts.join(", ")}.\nStudent question: ${req.question}`
      : `Continue teaching the lesson "${req.lesson.title}" (module ${req.moduleTitle}, course ${req.courseTitle}). This is teaching beat ${req.beat + 1}. Objectives: ${req.lesson.objectives.join("; ")}. Concepts: ${req.lesson.concepts.join(", ")}. Do not repeat earlier beats verbatim.`;

  const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: "llama-3.3-70b-versatile",
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      temperature: 0.4,
    }),
  });
  if (!res.ok) throw new Error(`Groq error ${res.status}`);
  const payload = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const text = payload.choices?.[0]?.message?.content ?? "";
  const blocks = parseModelMarkdown(text);
  return blocks.length > 0 ? blocks : [{ id: nextId(), kind: "text", markdown: text }];
}

export const Route = createFileRoute("/api/tutor")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        let body: TutorRequest;
        try {
          body = (await request.json()) as TutorRequest;
        } catch {
          return new Response("Invalid JSON", { status: 400 });
        }
        if (!body?.lesson?.title || (body.mode !== "ask" && body.mode !== "continue")) {
          return new Response("Invalid tutor request", { status: 400 });
        }

        const groqKey = process.env["GROQ_API_KEY"];
        let engine = "simulated";
        let blocks: TutorBlock[];
        let done = false;

        if (groqKey) {
          try {
            blocks = await groqBlocks(body, groqKey);
            engine = "groq";
          } catch {
            const fallback = simulatedBeat(body);
            blocks = fallback.blocks;
            done = fallback.done;
          }
        } else {
          const fallback = simulatedBeat(body);
          blocks = fallback.blocks;
          done = fallback.done;
        }

        const stream = new ReadableStream<Uint8Array>({
          async start(controller) {
            const encoder = new TextEncoder();
            controller.enqueue(encoder.encode(`${JSON.stringify({ type: "meta", engine })}\n`));
            for (const block of blocks) {
              await new Promise((r) => setTimeout(r, 260));
              controller.enqueue(encoder.encode(encodeBlock(block)));
            }
            controller.enqueue(encoder.encode(`${JSON.stringify({ type: "done", done })}\n`));
            controller.close();
          },
        });

        return new Response(stream, {
          headers: {
            "content-type": "application/x-ndjson; charset=utf-8",
            "cache-control": "no-store",
          },
        });
      },
    },
  },
});
