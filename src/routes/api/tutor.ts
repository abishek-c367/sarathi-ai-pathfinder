import { createFileRoute } from "@tanstack/react-router";

import {
  adaptTeachingStyle,
  capWords,
  defaultMastery,
  fallbackCheckPrompt,
  finalConceptExtras,
  nextId,
  parseModelMarkdown,
  simulatedAsk,
  simulatedConceptTeach,
  simulatedJudge,
  splitConceptResponse,
  wordBudget,
  type TutorBlock,
  type TutorHistoryItem,
  type TutorRequest,
} from "@/lib/tutor-blocks";
import type { TeachingStyle } from "@/lib/course-types";

type StreamEvent =
  | { type: "meta"; engine: string }
  | { type: "block"; block: TutorBlock }
  | { type: "judgement"; correct: boolean; advance: boolean }
  | { type: "done"; done: boolean };

function encodeEvent(event: StreamEvent) {
  return `${JSON.stringify(event)}\n`;
}

function historyText(history: TutorHistoryItem[]): string {
  if (history.length === 0) return "(no prior turns yet)";
  return history
    .slice(-6)
    .map((h) => `${h.role === "tutor" ? "Tutor" : "Student"}: ${h.text.slice(0, 300)}`)
    .join("\n");
}

function masteryNote(mastery: TutorRequest["mastery"]): string {
  if (mastery.streak >= 2) {
    return `The student is on a ${mastery.streak}-answer correct streak — they're moving fast. Keep this brief, skip basic scaffolding, don't over-explain.`;
  }
  if (mastery.streak <= -2) {
    return `The student has struggled on the last ${Math.abs(mastery.streak)} check-ins. Slow down, use one concrete example, keep the tone warm and encouraging, and avoid jargon.`;
  }
  return "The student's understanding so far looks about average for this point in the lesson — keep a steady, clear pace.";
}

async function callGroq(
  apiKey: string,
  system: string,
  user: string,
  opts?: { json?: boolean },
): Promise<string> {
  const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: "llama-3.3-70b-versatile",
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      temperature: opts?.json ? 0.2 : 0.4,
      ...(opts?.json ? { response_format: { type: "json_object" } } : {}),
    }),
  });
  if (!res.ok) throw new Error(`Groq error ${res.status}`);
  const payload = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
  return payload.choices?.[0]?.message?.content ?? "";
}

/** Teach exactly one concept, ending (for non-final concepts) with a `CHECK:` line. */
async function groqTeachConcept(
  body: TutorRequest,
  teaching: TeachingStyle,
  apiKey: string,
): Promise<{ blocks: TutorBlock[] }> {
  const { lesson, conceptIndex } = body;
  const concept = lesson.concepts[conceptIndex] ?? lesson.title;
  const isFinal = conceptIndex >= lesson.concepts.length - 1;
  const budget = wordBudget(teaching.pacing);

  const system = [
    "You are Sarathi, a warm, precise 1:1 tutor teaching ONE concept at a time.",
    "Never introduce or explain any concept other than the single one you are given.",
    `Teach ONLY this concept: "${concept}".`,
    `Style: depth=${teaching.depth}, tone=${teaching.tone}, pacing=${teaching.pacing}.`,
    `Hard limit: at most ${budget} words, plain prose, no headers, at most one short paragraph.`,
    "Do not restate concepts already covered in the conversation history.",
    isFinal
      ? "This is the last concept in the lesson — a code example, diagram, and quiz will be shown right after your explanation, so do not write your own code block."
      : "After your explanation, on its own final line, write exactly: CHECK: <one short question that makes the student apply or restate this concept in their own words — never a yes/no question>.",
    masteryNote(body.mastery),
  ].join(" ");

  const user = [
    `Course: ${body.courseTitle}. Module: ${body.moduleTitle}. Lesson: ${lesson.title}.`,
    `Lesson objectives: ${lesson.objectives.join("; ")}.`,
    `Recent conversation:\n${historyText(body.history)}`,
  ].join("\n");

  const raw = await callGroq(apiKey, system, user);
  const { explanation, checkPrompt } = splitConceptResponse(raw);
  const blocks = parseModelMarkdown(capWords(explanation, budget));

  if (isFinal) {
    blocks.push(...finalConceptExtras(lesson, teaching));
    if (!lesson.quiz[0]) {
      blocks.push({
        id: nextId(),
        kind: "checkin",
        concept,
        prompt: checkPrompt ?? fallbackCheckPrompt(concept, lesson.objectives),
      });
    }
  } else {
    blocks.push({
      id: nextId(),
      kind: "checkin",
      concept,
      prompt: checkPrompt ?? fallbackCheckPrompt(concept, lesson.objectives),
    });
  }
  return { blocks };
}

async function groqAsk(
  body: TutorRequest,
  teaching: TeachingStyle,
  apiKey: string,
): Promise<TutorBlock[]> {
  const { lesson, conceptIndex } = body;
  const concept = lesson.concepts[conceptIndex] ?? lesson.concepts[0] ?? lesson.title;
  const budget = wordBudget(teaching.pacing);

  const system = [
    "You are Sarathi, a warm, precise 1:1 tutor.",
    `The student is currently focused on the concept "${concept}" within the lesson "${lesson.title}".`,
    `Style: depth=${teaching.depth}, tone=${teaching.tone}, pacing=${teaching.pacing}.`,
    `Answer their question directly in at most ${budget} words.`,
    "Markdown is fine; use a fenced code block only if a short example genuinely helps, and a `mermaid` fenced block only if a diagram genuinely helps.",
    "If their question reveals a misunderstanding, gently correct it before answering.",
    masteryNote(body.mastery),
  ].join(" ");

  const user = [
    `Course: ${body.courseTitle}. Module: ${body.moduleTitle}.`,
    `Recent conversation:\n${historyText(body.history)}`,
    `Student question: ${body.question ?? ""}`,
  ].join("\n");

  const raw = await callGroq(apiKey, system, user);
  const blocks = parseModelMarkdown(capWords(raw, budget));
  return blocks.length > 0 ? blocks : [{ id: nextId(), kind: "text", markdown: raw }];
}

async function groqJudge(
  body: TutorRequest,
  apiKey: string,
): Promise<{ understood: boolean; feedback: string }> {
  const { lesson, conceptIndex } = body;
  const concept = lesson.concepts[conceptIndex] ?? lesson.title;

  const system = [
    "You are grading a student's short answer to a comprehension check for ONE concept.",
    "Judge generously but honestly: partial, imprecise phrasing that shows real understanding still counts as understood.",
    'Respond with ONLY compact JSON, no prose, no markdown fences: {"understood": true|false, "feedback": "<=2 short sentences, speak directly to the student"}.',
  ].join(" ");

  const user = [
    `Concept: ${concept}.`,
    `Recent conversation (includes how the concept was taught):\n${historyText(body.history)}`,
    `Student's answer: ${body.answerText ?? ""}`,
  ].join("\n");

  const raw = await callGroq(apiKey, system, user, { json: true });
  const match = raw.match(/\{[\s\S]*\}/);
  if (!match) throw new Error("No JSON in judge response");
  const parsed = JSON.parse(match[0]) as { understood?: unknown; feedback?: unknown };
  if (typeof parsed.understood !== "boolean" || typeof parsed.feedback !== "string") {
    throw new Error("Malformed judge response");
  }
  return { understood: parsed.understood, feedback: parsed.feedback };
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
        if (
          !body?.lesson?.title ||
          (body.mode !== "concept" && body.mode !== "check" && body.mode !== "ask")
        ) {
          return new Response("Invalid tutor request", { status: 400 });
        }
        body.mastery = body.mastery ?? defaultMastery();
        body.history = Array.isArray(body.history) ? body.history : [];

        const groqKey = process.env["GROQ_API_KEY"];
        const teaching = adaptTeachingStyle(body.teaching, body.mastery);
        const isFinal = body.conceptIndex >= body.lesson.concepts.length - 1;
        const concept = body.lesson.concepts[body.conceptIndex] ?? body.lesson.title;

        let engine = "simulated";
        let blocks: TutorBlock[] = [];
        let judgement: { correct: boolean; advance: boolean } | null = null;

        try {
          if (!groqKey) throw new Error("no key configured");
          if (body.mode === "concept") {
            blocks = (await groqTeachConcept(body, teaching, groqKey)).blocks;
          } else if (body.mode === "ask") {
            blocks = await groqAsk(body, teaching, groqKey);
          } else {
            const { understood, feedback } = await groqJudge(body, groqKey);
            const advance = understood || !!body.hinted;
            blocks = [{ id: nextId(), kind: "text", markdown: feedback }];
            if (!advance) {
              blocks.push({
                id: nextId(),
                kind: "checkin",
                concept,
                prompt: fallbackCheckPrompt(concept, body.lesson.objectives),
              });
            }
            judgement = { correct: understood, advance };
          }
          engine = "groq";
        } catch {
          if (body.mode === "concept") {
            blocks = simulatedConceptTeach(body, teaching);
          } else if (body.mode === "ask") {
            blocks = simulatedAsk(body, teaching);
          } else {
            const { understood, feedback } = simulatedJudge(concept, body.answerText ?? "");
            const advance = understood || !!body.hinted;
            blocks = [{ id: nextId(), kind: "text", markdown: feedback }];
            if (!advance) {
              blocks.push({
                id: nextId(),
                kind: "text",
                markdown: `Hint: think about ${lessonHint(body)}`,
              });
              blocks.push({
                id: nextId(),
                kind: "checkin",
                concept,
                prompt: fallbackCheckPrompt(concept, body.lesson.objectives),
              });
            }
            judgement = { correct: understood, advance };
          }
        }

        const done = body.mode === "concept" ? isFinal : false;

        const stream = new ReadableStream<Uint8Array>({
          async start(controller) {
            const encoder = new TextEncoder();
            controller.enqueue(encoder.encode(encodeEvent({ type: "meta", engine })));
            for (const block of blocks) {
              await new Promise((r) => setTimeout(r, 220));
              controller.enqueue(encoder.encode(encodeEvent({ type: "block", block })));
            }
            if (judgement) {
              controller.enqueue(encoder.encode(encodeEvent({ type: "judgement", ...judgement })));
            }
            controller.enqueue(encoder.encode(encodeEvent({ type: "done", done })));
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

function lessonHint(body: TutorRequest): string {
  const objective = body.lesson.objectives[0];
  return objective ? objective.toLowerCase() : body.lesson.intuition;
}

