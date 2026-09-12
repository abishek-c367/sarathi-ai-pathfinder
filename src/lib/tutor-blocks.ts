import type { Lesson, QuizQuestion, TeachingStyle } from "./course-types";

export type TutorBlock =
  | { id: string; kind: "text"; markdown: string }
  | { id: string; kind: "code"; label: string; language: string; code: string }
  | { id: string; kind: "mermaid"; title: string; chart: string }
  | { id: string; kind: "quiz"; question: QuizQuestion };

export type TutorTurn = {
  id: string;
  author: "tutor" | "student";
  blocks: TutorBlock[];
  pending?: boolean;
};

export type TutorRequest = {
  mode: "continue" | "ask";
  beat: number;
  question?: string;
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

const toneOpeners: Record<TeachingStyle["tone"], string[]> = {
  encouraging: [
    "Great — let's build the intuition first.",
    "You're set up well for this next piece.",
    "Nice progress. Time to make this concrete.",
  ],
  neutral: ["Here is the next section.", "Continuing.", "Next concept."],
  socratic: [
    "Before the answer — what would you expect to happen here?",
    "Let's reason toward it together.",
    "Ask yourself why the naive approach fails.",
  ],
};

function opener(teaching: TeachingStyle, beat: number) {
  const list = toneOpeners[teaching.tone];
  return list[beat % list.length]!;
}

/**
 * Deterministic, lesson-aware tutor script. Used as the built-in tutor and as
 * the fallback whenever no AI provider key is configured.
 */
export function simulatedBeat(req: TutorRequest): { blocks: TutorBlock[]; done: boolean } {
  const { lesson, teaching, beat, moduleTitle, courseTitle } = req;

  if (req.mode === "ask") {
    const q = (req.question ?? "").trim();
    const concept =
      lesson.concepts.find((c) => q.toLowerCase().includes(c.toLowerCase().split(" ")[0]!)) ??
      lesson.concepts[0] ??
      lesson.title;
    return {
      done: false,
      blocks: [
        {
          id: nextId(),
          kind: "text",
          markdown: [
            `**On "${q || lesson.title}":**`,
            "",
            `The centre of gravity here is **${concept}**. ${lesson.intuition}`,
            "",
            `Applied to your question: start from what *must* be true for ${concept.toLowerCase()} to hold, then ask what breaks first when that assumption fails. In **${moduleTitle}** (${courseTitle}) that failure mode is exactly what the lesson objectives target:`,
            "",
            ...lesson.objectives.map((o) => `- ${o}`),
            "",
            "Want me to walk through a worked example, or keep going with the lesson?",
          ].join("\n"),
        },
      ],
    };
  }

  const beats: Array<() => TutorBlock[]> = [
    () => [
      {
        id: nextId(),
        kind: "text",
        markdown: [
          `### ${lesson.title}`,
          "",
          `${opener(teaching, beat)} ${lesson.intuition}`,
          "",
          "**What you'll be able to do after this lesson**",
          ...lesson.objectives.map((o) => `- ${o}`),
        ].join("\n"),
      },
      {
        id: nextId(),
        kind: "text",
        markdown: `Key vocabulary we'll keep coming back to: ${lesson.concepts
          .map((c) => `\`${c}\``)
          .join(", ")}.`,
      },
    ],
    () => {
      const example = lesson.codeExamples[0];
      if (!example) return [];
      return [
        {
          id: nextId(),
          kind: "text",
          markdown: `Let's ground it in code. ${example.label} — read it once, then I'll point out the part that matters.`,
        },
        {
          id: nextId(),
          kind: "code",
          label: example.label,
          language: example.language,
          code: example.code,
        },
        {
          id: nextId(),
          kind: "text",
          markdown: `The important line is the one that changes the *cost* or the *guarantee*, not the one that prints. Trace it against **${lesson.concepts[0] ?? "the core concept"}**.`,
        },
      ];
    },
    () => {
      if (!lesson.diagram) return [];
      return [
        {
          id: nextId(),
          kind: "text",
          markdown: `Here's the same idea as a picture — **${lesson.diagram.title}**.`,
        },
        {
          id: nextId(),
          kind: "mermaid",
          title: lesson.diagram.title,
          chart: lesson.diagram.mermaid,
        },
      ];
    },
    () => {
      const question = lesson.quiz[0];
      if (!question) return [];
      return [
        {
          id: nextId(),
          kind: "text",
          markdown: teaching.enforceQuizzes
            ? "Checkpoint time — this one is required before the lesson counts as mastered."
            : "Quick optional checkpoint:",
        },
        { id: nextId(), kind: "quiz", question },
      ];
    },
    () => [
      {
        id: nextId(),
        kind: "text",
        markdown: [
          "### Recap",
          "",
          ...lesson.concepts.map((c) => `- **${c}**`),
          "",
          `That's ${lesson.title} covered. Ask me anything about it, or move to the next lesson from the sidebar.`,
        ].join("\n"),
      },
    ],
  ];

  const factory = beats[beat];
  if (!factory) {
    return {
      done: true,
      blocks: [
        {
          id: nextId(),
          kind: "text",
          markdown:
            "We've covered this lesson end to end. Ask a follow-up question, or continue to the next lesson.",
        },
      ],
    };
  }
  const blocks = factory();
  if (blocks.length === 0) return simulatedBeat({ ...req, beat: beat + 1 });
  return { blocks, done: beat >= beats.length - 1 };
}

export function totalBeats() {
  return 5;
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
