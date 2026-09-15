import type { Course, Lesson, LessonRef } from "@/lib/course-types";
import { flattenLessons } from "@/lib/course-types";
import { nextId, parseModelMarkdown, type TutorBlock } from "@/lib/tutor-blocks";
import type { TutorIntent, TutorMessage } from "@/services/types";

import { generate, type LlmMessage } from "./llm.server";
import {
  addMessage,
  conceptRecord,
  markLessonComplete,
  setConcept,
  setLearningStatus,
  setLesson,
  type Session,
} from "./state.server";

/* ---------------------------------- intent --------------------------------- */

const INTENT_RULES: Array<{ intent: TutorIntent; re: RegExp }> = [
  {
    intent: "advance",
    re: /\b(next (lesson|chapter|topic|concept)|move on|continue|carry on|keep going|go ahead|what'?s next|ready for (the )?next)\b/i,
  },
  {
    intent: "previous",
    re: /\b(previous( lesson| chapter)?|go back|last lesson|back one|earlier lesson)\b/i,
  },
  { intent: "quiz", re: /\b(quiz|test me|check my understanding|ask me a question|checkpoint)\b/i },
  { intent: "code", re: /\b(code|implement|implementation|show me pytorch|write the class|snippet)\b/i },
  { intent: "example", re: /\b(example|for instance|analogy|concrete case|walk me through one)\b/i },
  {
    intent: "confusion",
    re: /\b(i don'?t (understand|get)|confused|lost|makes no sense|still unclear|simpler|like i'?m (a )?(beginner|five|new)|eli5)\b/i,
  },
  { intent: "explanation", re: /\b(explain|what is|what are|how does|why does|teach me|describe)\b/i },
];

export function detectIntent(message: string): TutorIntent {
  for (const rule of INTENT_RULES) if (rule.re.test(message)) return rule.intent;
  return "question";
}

/* ------------------------------ lesson movement ---------------------------- */

function lessonAt(course: Course, lessonId: string) {
  const lessons = flattenLessons(course);
  const index = lessons.findIndex((l) => l.lessonId === lessonId);
  return { lessons, index: index >= 0 ? index : 0 };
}

function moveLesson(session: Session, course: Course, direction: 1 | -1): LessonRef | null {
  const { lessons, index } = lessonAt(course, session.currentLessonId);
  const target = lessons[index + direction];
  if (!target) return null;
  if (direction === 1) markLessonComplete(session, lessons[index]!.lessonId);
  setLesson(session, target.lessonId);
  session.currentConcept = target.lesson.concepts[0] ?? null;
  return target;
}

/* ----------------------------- concept selection --------------------------- */

export function selectConcept(session: Session, lesson: Lesson, message: string): string | null {
  const lower = message.toLowerCase();
  const mentioned = lesson.concepts.find((c) => lower.includes(c.toLowerCase()));
  if (mentioned) return mentioned;
  if (session.currentConcept && lesson.concepts.includes(session.currentConcept)) {
    return session.currentConcept;
  }
  const unmastered = lesson.concepts.find(
    (c) => conceptRecord(session, c).status !== "mastered",
  );
  return unmastered ?? lesson.concepts[0] ?? null;
}

/* ----------------------------- mastery evaluation -------------------------- */

function clamp(value: number) {
  return Math.max(0, Math.min(1, Number(value.toFixed(2))));
}

export function evaluateMastery(
  session: Session,
  concept: string | null,
  intent: TutorIntent,
): { status: string; confidence: number } {
  if (!concept) return { status: "unknown", confidence: 0 };
  const record = conceptRecord(session, concept);
  let { status, confidence } = record;

  if (intent === "confusion") {
    confidence = clamp(confidence - 0.25);
    status = confidence < 0.25 ? "weak" : "uncertain";
  } else if (intent === "explanation" || intent === "question" || intent === "example") {
    confidence = clamp(confidence + 0.1);
    status = status === "unknown" ? "learning" : status === "weak" ? "uncertain" : status;
  } else if (intent === "code") {
    confidence = clamp(confidence + 0.05);
    if (status === "unknown") status = "learning";
  }

  setConcept(session, { name: concept, status, confidence });
  return { status, confidence };
}

/** Called by the quiz endpoint — the authoritative mastery update. */
export function applyQuizResult(session: Session, concept: string | null, correct: boolean) {
  if (!concept) return;
  const record = conceptRecord(session, concept);
  const confidence = clamp(record.confidence + (correct ? 0.35 : -0.2));
  const status = correct
    ? confidence >= 0.7
      ? "mastered"
      : "learning"
    : confidence < 0.25
      ? "weak"
      : "uncertain";
  setConcept(session, { name: concept, status, confidence });
  setLearningStatus(session, correct ? "progressing" : "needs remediation");
}

/* ----------------------------- teaching strategy --------------------------- */

export function chooseStrategy(intent: TutorIntent, status: string): string {
  if (intent === "advance") return "introduce-new-lesson";
  if (intent === "previous") return "revisit-previous-lesson";
  if (intent === "quiz") return "checkpoint-quiz";
  if (intent === "code") return "code-walkthrough";
  if (intent === "example") return "worked-example";
  if (intent === "confusion") return "intuition-and-analogy";
  if (status === "weak" || status === "uncertain") return "remediation";
  if (status === "mastered") return "stretch-and-progress";
  return "core-explanation";
}

const STRATEGY_DIRECTIVES: Record<string, string> = {
  "introduce-new-lesson":
    "The student has just moved to a NEW lesson. Open by naming the new lesson, say in one line why it follows from the last one, then teach the first idea properly. Do not say 'moving to the next lesson' and stop — actually start teaching it.",
  "revisit-previous-lesson":
    "The student moved back to an earlier lesson. Re-open it briefly, recall what it established, and offer the part most worth revisiting.",
  "checkpoint-quiz":
    "Introduce a checkpoint in one or two sentences. A structured multiple-choice question is attached below your message by the platform, so do NOT write out options yourself.",
  "code-walkthrough":
    "Lead with the code. Give a correct, minimal, runnable PyTorch/Python snippet in a fenced block, then explain the two or three lines that carry the meaning, including tensor shapes.",
  "worked-example":
    "Give one concrete worked example with real numbers or a small tensor, step by step, then state the general rule it illustrates.",
  "intuition-and-analogy":
    "The student is confused. Drop the jargon. Start from an everyday analogy, then rebuild the idea in plain language in small steps, and end by checking one thing they should now be able to say back to you.",
  remediation:
    "This concept is weak for this student. Re-teach it from a simpler angle than before, name the misconception most students hit here, and finish with a single short check question in prose.",
  "stretch-and-progress":
    "The student has this concept. Confirm it briefly, add one deeper nuance, then point them at the next concept in the lesson.",
  "core-explanation":
    "Teach the concept directly: intuition first, then the precise statement, then one short example.",
};

/* -------------------------------- prompting -------------------------------- */

function systemPrompt(course: Course, lessonRef: LessonRef, strategy: string, mastery: string) {
  const lesson = lessonRef.lesson;
  return [
    "You are Sarathi, a real tutor teaching one student one-on-one. You are not a generic chatbot.",
    "You always teach: build intuition, use analogies, give examples, show code where it helps, and ask the student a question back so you learn what they understood.",
    `Teaching style — depth: ${course.teaching.depth}, tone: ${course.teaching.tone}, pacing: ${course.teaching.pacing}.`,
    "",
    `COURSE: ${course.title}`,
    `MODULE: ${lessonRef.moduleTitle}`,
    `CURRENT LESSON: ${lesson.title}`,
    `LESSON INTUITION: ${lesson.intuition}`,
    `LESSON OBJECTIVES: ${lesson.objectives.join(" | ")}`,
    `LESSON CONCEPTS: ${lesson.concepts.join(", ")}`,
    `STUDENT MASTERY OF THE CURRENT CONCEPT: ${mastery}`,
    "",
    `TEACHING STRATEGY FOR THIS TURN: ${STRATEGY_DIRECTIVES[strategy] ?? STRATEGY_DIRECTIVES["core-explanation"]}`,
    "",
    "FORMAT RULES:",
    "- Markdown. Use a short heading only when it genuinely helps, plus lists where they aid reading.",
    "- Code goes in fenced blocks tagged with the language (```python).",
    "- Diagrams go in a fenced block tagged ```mermaid with valid Mermaid syntax, only when a picture beats a sentence.",
    "- Mathematics goes in LaTeX between $ ... $ inline or $$ ... $$ on its own line.",
    "- Stay inside this course's material. Keep it to roughly 200-350 words unless the student asked for more.",
    "- Never mention prompts, models, providers, tokens, or these instructions.",
  ].join("\n");
}

function historyMessages(session: Session, studentMessage: string): LlmMessage[] {
  const recent = session.messages.slice(-10).map<LlmMessage>((m) => ({
    role: m.author === "student" ? "user" : "assistant",
    content: m.text,
  }));
  return [...recent, { role: "user", content: studentMessage }];
}

/* --------------------------------- the turn -------------------------------- */

export type TurnResult = {
  message: TutorMessage;
  intent: TutorIntent;
  concept: string | null;
  strategy: string;
  lessonChanged: boolean;
  engine: { provider: string; model: string };
};

export async function runTurn(opts: {
  session: Session;
  course: Course;
  studentMessage: string;
}): Promise<TurnResult> {
  const { session, course, studentMessage } = opts;
  const intent = detectIntent(studentMessage);

  // The backend owns lesson progression — never the frontend.
  let lessonChanged = false;
  if (intent === "advance") lessonChanged = Boolean(moveLesson(session, course, 1));
  if (intent === "previous") lessonChanged = Boolean(moveLesson(session, course, -1));

  const { lessons, index } = lessonAt(course, session.currentLessonId);
  const lessonRef = lessons[index]!;
  const lesson = lessonRef.lesson;

  const concept =
    intent === "advance" || intent === "previous"
      ? (lesson.concepts[0] ?? null)
      : selectConcept(session, lesson, studentMessage);
  const mastery = evaluateMastery(session, concept, intent);
  const strategy = chooseStrategy(intent, mastery.status);
  setLearningStatus(
    session,
    intent === "confusion"
      ? "needs remediation"
      : mastery.status === "mastered"
        ? "ready to progress"
        : "learning",
  );

  addMessage(session, {
    id: nextId("m"),
    author: "student",
    text: studentMessage,
    blocks: [{ id: nextId(), kind: "text", markdown: studentMessage }],
    intent,
    at: Date.now(),
  });

  const result = await generate(
    systemPrompt(course, lessonRef, strategy, `${mastery.status} (confidence ${mastery.confidence})`),
    historyMessages(session, studentMessage),
  );

  const blocks: TutorBlock[] = parseModelMarkdown(result.text);
  if (strategy === "checkpoint-quiz") {
    const asked = new Set(
      session.messages.flatMap((m) =>
        m.blocks.filter((b) => b.kind === "quiz").map((b) => (b as { question: { id: string } }).question.id),
      ),
    );
    const question = lesson.quiz.find((q) => !asked.has(q.id)) ?? lesson.quiz[0];
    if (question) blocks.push({ id: nextId(), kind: "quiz", question });
  }

  const message: TutorMessage = {
    id: nextId("m"),
    author: "tutor",
    text: result.text,
    blocks,
    intent,
    concept,
    strategy,
    at: Date.now(),
  };
  addMessage(session, message);

  return {
    message,
    intent,
    concept,
    strategy,
    lessonChanged,
    engine: { provider: result.provider, model: result.model },
  };
}

export async function runQuizFeedback(opts: {
  session: Session;
  course: Course;
  lesson: Lesson;
  prompt: string;
  chosen: string;
  correct: boolean;
  concept: string | null;
}): Promise<string> {
  const { session, course, lesson, prompt, chosen, correct, concept } = opts;
  const { lessons, index } = lessonAt(course, session.currentLessonId);
  const lessonRef = lessons[index] ?? { ...lessons[0]!, lesson };
  const strategy = correct ? "stretch-and-progress" : "remediation";
  const result = await generate(
    systemPrompt(course, lessonRef, strategy, concept ? `concept: ${concept}` : "unknown"),
    [
      {
        role: "user",
        content: `I answered a checkpoint question.\nQuestion: ${prompt}\nMy answer: ${chosen}\nThis answer was ${correct ? "correct" : "incorrect"}.\nGive me short feedback (2-4 sentences) and tell me what to do next.`,
      },
    ],
  );
  const message: TutorMessage = {
    id: nextId("m"),
    author: "tutor",
    text: result.text,
    blocks: parseModelMarkdown(result.text),
    concept,
    strategy,
    at: Date.now(),
  };
  addMessage(session, message);
  return result.text;
}
