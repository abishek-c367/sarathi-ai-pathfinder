import type { Lesson, QuizQuestion, TeachingStyle } from "./course-types";

export type CheckinBlock = {
  id: string;
  kind: "checkin";
  concept: string;
  prompt: string;
};

export type TutorBlock =
  | { id: string; kind: "text"; markdown: string }
  | { id: string; kind: "code"; label: string; language: string; code: string }
  | { id: string; kind: "mermaid"; title: string; chart: string }
  | { id: string; kind: "quiz"; question: QuizQuestion }
  | CheckinBlock;

export type TutorTurn = {
  id: string;
  author: "tutor" | "student";
  blocks: TutorBlock[];
  pending?: boolean;
};

/** One tutor/student exchange, trimmed for sending back to the model as context. */
export type TutorHistoryItem = { role: "tutor" | "student"; text: string };

/** Rolling estimate of how well the student understands the current lesson. */
export type MasterySignal = {
  /** 0 (struggling) .. 1 (confident) */
  level: number;
  /** Signed run length: positive = consecutive correct check-ins, negative = consecutive misses. */
  streak: number;
  /** Derived pacing — reuses the same vocabulary as the course-authored TeachingStyle. */
  pace: TeachingStyle["pacing"];
};

export type ConceptOutcome = {
  concept: string;
  correct: boolean;
  hinted: boolean;
  at: number;
};

export type TutorRequest = {
  mode: "concept" | "check" | "ask";
  /** Index into lesson.concepts — which single concept this turn is about. */
  conceptIndex: number;
  /** True if the student already got one hint on this concept this round (caps the retry loop). */
  hinted?: boolean;
  /** Free-form student question — only used for mode "ask". */
  question?: string;
  /** Student's free-text answer to a checkin prompt — only used for mode "check". */
  answerText?: string;
  history: TutorHistoryItem[];
  mastery: MasterySignal;
  courseTitle: string;
  moduleTitle: string;
  teaching: TeachingStyle;
  lesson: Lesson;
};

let counter = 0;
export function nextId(prefix = "b") {
  counter += 1;
  return `${prefix}-${Date.now().toString(36)}-${counter}`;
}

const NEUTRAL_MASTERY: MasterySignal = { level: 0.6, streak: 0, pace: "balanced" };

export function defaultMastery(): MasterySignal {
  return { ...NEUTRAL_MASTERY };
}

/**
 * Turns a running list of check-in outcomes into a single mastery estimate.
 * Recent answers matter more than old ones (simple exponential smoothing),
 * and a run of consecutive hits/misses drives the derived pace.
 */
export function deriveMastery(outcomes: ConceptOutcome[]): MasterySignal {
  let level = NEUTRAL_MASTERY.level;
  let streak = 0;
  for (const outcome of outcomes) {
    if (outcome.correct) {
      level = level * 0.65 + 0.35 * (outcome.hinted ? 0.75 : 1);
      streak = streak >= 0 ? streak + 1 : 1;
    } else {
      level = level * 0.65;
      streak = streak <= 0 ? streak - 1 : -1;
    }
  }
  level = Math.min(1, Math.max(0, level));
  const pace: TeachingStyle["pacing"] =
    streak >= 2 && level >= 0.7 ? "brisk" : streak <= -2 || level <= 0.35 ? "slow" : "balanced";
  return { level, streak, pace };
}

/**
 * Adapts the course author's base teaching style using the live mastery signal.
 * This is what actually changes turn to turn as the student answers checkins —
 * pacing tracks mastery directly, depth/tone shift at the edges (fast or struggling).
 */
export function adaptTeachingStyle(base: TeachingStyle, mastery: MasterySignal): TeachingStyle {
  return {
    ...base,
    pacing: mastery.pace,
    depth:
      mastery.pace === "brisk" ? "overview" : mastery.pace === "slow" ? "deep-dive" : base.depth,
    tone: mastery.pace === "slow" ? "encouraging" : base.tone,
  };
}

/** How many words a single explanation should target, given the live pace. */
export function wordBudget(pacing: TeachingStyle["pacing"]): number {
  return pacing === "brisk" ? 55 : pacing === "slow" ? 130 : 90;
}

export function capWords(text: string, max: number): string {
  const trimmed = text.trim();
  const words = trimmed.split(/\s+/);
  if (words.length <= max) return trimmed;
  return `${words.slice(0, max).join(" ")}…`;
}

export function fallbackCheckPrompt(concept: string, objectives: string[]): string {
  const objective = objectives[0];
  return objective
    ? `In your own words: how does "${concept}" help with — ${objective.toLowerCase()}?`
    : `In your own words, what is "${concept}" and why does it matter here?`;
}

/** A gentler, differently-worded retry prompt — avoids repeating the first prompt verbatim. */
export function retryCheckPrompt(concept: string): string {
  return `In one sentence — what's the core idea behind "${concept}"?`;
}

/** True for empty, very short, or explicit "I don't know" style non-answers. */
export function isNonAnswer(text: string): boolean {
  const t = text.trim().toLowerCase();
  if (t.length < 4) return true;
  return /\b(i\s*)?(do\s*n['o]?t|dont)\s*know\b|no\s*idea|not\s*sure|^idk\b/.test(t);
}

function cleanObjective(objective: string): string {
  return objective.replace(/^[\s#*•-]*\d+[.):]?\s*/, "").trim();
}

/** A real, substantive explanation of a concept — used to give retries actual content, not just a nudge. */
export function explainConcept(lesson: Lesson, concept: string): string {
  const objective = lesson.objectives[0];
  const goal = objective ? ` The goal here: ${cleanObjective(objective).toLowerCase()}.` : "";
  return `For **${concept}**: ${lesson.intuition}${goal}`;
}

/** Splits a concept-teaching model response into its explanation and an optional trailing `CHECK:` line. */
export function splitConceptResponse(markdown: string): {
  explanation: string;
  checkPrompt: string | null;
} {
  const lines = markdown.split("\n");
  const checkLineIndex = lines.findIndex((line) => /^CHECK:\s*/i.test(line.trim()));
  if (checkLineIndex === -1) return { explanation: markdown.trim(), checkPrompt: null };
  const checkPrompt = lines[checkLineIndex]!.trim()
    .replace(/^CHECK:\s*/i, "")
    .trim();
  const explanation = lines.slice(0, checkLineIndex).join("\n").trim();
  return { explanation, checkPrompt: checkPrompt || null };
}

/** Splits a model's markdown answer into typed blocks. */
export function parseModelMarkdown(markdown: string): TutorBlock[] {
  const blocks: TutorBlock[] = [];
  const parts = markdown.split(/```/);
  parts.forEach((part, index) => {
    if (index % 2 === 0) {
      const text = part.trim();
      if (text) blocks.push({ id: nextId(), kind: "text", markdown: text });
      return;
    }
    const newline = part.indexOf("\n");
    const language = (newline === -1 ? "" : part.slice(0, newline)).trim() || "text";
    const code = (newline === -1 ? part : part.slice(newline + 1)).replace(/\s+$/, "");
    if (!code) return;
    if (language === "mermaid") {
      blocks.push({ id: nextId(), kind: "mermaid", title: "Diagram", chart: code });
    } else {
      blocks.push({ id: nextId(), kind: "code", label: language, language, code });
    }
  });
  return blocks;
}

/**
 * Deterministic content attached to the FINAL concept in a lesson: the lesson's
 * one code example, its diagram, and its authored checkpoint quiz (if present).
 * Always sourced from real lesson data — never model-generated — so it can't
 * hallucinate code or a wrong answer key.
 */
export function finalConceptExtras(lesson: Lesson, teaching: TeachingStyle): TutorBlock[] {
  const blocks: TutorBlock[] = [];
  const example = lesson.codeExamples[0];
  if (example) {
    blocks.push({
      id: nextId(),
      kind: "text",
      markdown: `Here's how it shows up in code — ${example.label}.`,
    });
    blocks.push({
      id: nextId(),
      kind: "code",
      label: example.label,
      language: example.language,
      code: example.code,
    });
  }
  if (lesson.diagram) {
    blocks.push({
      id: nextId(),
      kind: "text",
      markdown: `And the same idea as a picture — **${lesson.diagram.title}**.`,
    });
    blocks.push({
      id: nextId(),
      kind: "mermaid",
      title: lesson.diagram.title,
      chart: lesson.diagram.mermaid,
    });
  }
  const quiz = lesson.quiz[0];
  if (quiz) {
    blocks.push({
      id: nextId(),
      kind: "text",
      markdown: teaching.enforceQuizzes
        ? "One required checkpoint before this lesson counts as mastered:"
        : "Quick checkpoint to pull it together:",
    });
    blocks.push({ id: nextId(), kind: "quiz", question: quiz });
  }
  return blocks;
}

/**
 * Built-in, deterministic tutor script for a single concept. Used whenever no
 * AI provider key is configured, or whenever the AI call fails.
 */
export function simulatedConceptTeach(req: TutorRequest, teaching: TeachingStyle): TutorBlock[] {
  const { lesson, conceptIndex } = req;
  const concept = lesson.concepts[conceptIndex] ?? lesson.title;
  const isFinal = conceptIndex >= lesson.concepts.length - 1;
  const budget = wordBudget(teaching.pacing);

  const opening =
    conceptIndex === 0
      ? `${lesson.intuition} Let's take it one idea at a time, starting with **${concept}**.`
      : teaching.tone === "socratic"
        ? `Next up: **${concept}**. Before I explain — what would you expect happens here, based on what we just covered?`
        : `Next up: **${concept}**. ${teaching.pacing === "slow" ? "Let's slow down and build this one carefully." : "Here's the core of it."}`;

  const blocks: TutorBlock[] = [
    { id: nextId(), kind: "text", markdown: capWords(opening, budget) },
  ];

  if (isFinal) {
    blocks.push(...finalConceptExtras(lesson, teaching));
    if (!lesson.quiz[0]) {
      blocks.push({
        id: nextId(),
        kind: "checkin",
        concept,
        prompt: fallbackCheckPrompt(concept, lesson.objectives),
      });
    }
    return blocks;
  }

  blocks.push({
    id: nextId(),
    kind: "checkin",
    concept,
    prompt: fallbackCheckPrompt(concept, lesson.objectives),
  });
  return blocks;
}

export function simulatedAsk(req: TutorRequest, teaching: TeachingStyle): TutorBlock[] {
  const { lesson, conceptIndex } = req;
  const concept = lesson.concepts[conceptIndex] ?? lesson.concepts[0] ?? lesson.title;
  const question = (req.question ?? "").trim();
  const markdown = capWords(
    `On "${question || lesson.title}": the centre of gravity is **${concept}**. ${lesson.intuition} Tie your question back to what must be true for ${concept.toLowerCase()} to hold — that's usually where the confusion lives.`,
    wordBudget(teaching.pacing),
  );
  return [{ id: nextId(), kind: "text", markdown }];
}

export function simulatedJudge(
  lesson: Lesson,
  concept: string,
  answerText: string,
  hinted: boolean,
): { understood: boolean; feedback: string } {
  const text = answerText.trim();

  if (isNonAnswer(text)) {
    return {
      understood: false,
      feedback: hinted
        ? `That's alright. Here's the idea plainly: ${explainConcept(lesson, concept)} We'll move on — ask anytime if you want this again.`
        : `No worries — here's a fuller nudge: ${explainConcept(lesson, concept)}`,
    };
  }

  const keywords = concept
    .toLowerCase()
    .split(/[\s/-]+/)
    .filter((w) => w.length > 3);
  const hit = keywords.length === 0 || keywords.some((k) => text.toLowerCase().includes(k));
  if (hit) {
    return { understood: true, feedback: "That lines up with the idea — nice." };
  }
  return {
    understood: false,
    feedback: hinted
      ? `Close, but let's make sure this one's clear: ${explainConcept(lesson, concept)} Moving on.`
      : `Not quite yet. ${explainConcept(lesson, concept)}`,
  };
}
