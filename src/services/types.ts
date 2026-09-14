import type { Course, QuizQuestion } from "@/lib/course-types";
import type { TutorBlock } from "@/lib/tutor-blocks";

/** Intents the tutor backend recognises. Treated as backend data, never as frontend logic. */
export type TutorIntent =
  | "question"
  | "explanation"
  | "example"
  | "confusion"
  | "advance"
  | "previous"
  | "quiz"
  | "code";

/** Concept status strings come from the backend mastery model. */
export type ConceptStatus = string;

export type ConceptState = {
  name: string;
  status: ConceptStatus;
  confidence: number;
};

export type StudentState = {
  studentId: string;
  courseId: string;
  courseTitle: string;
  currentModuleTitle: string;
  currentLessonId: string;
  currentLessonTitle: string;
  completedLessons: string[];
  currentConcept: string | null;
  concepts: ConceptState[];
  learningStatus: string;
  progress: number;
  updatedAt: number;
};

export type TutorMessage = {
  id: string;
  author: "student" | "tutor";
  text: string;
  blocks: TutorBlock[];
  intent?: TutorIntent;
  concept?: string | null;
  strategy?: string;
  at: number;
};

export type TutorEngineInfo = {
  provider: string;
  model: string;
};

export type TutorChatRequest = {
  studentId: string;
  courseId: string;
  lessonId?: string;
  message: string;
};

export type TutorChatResponse = {
  message: TutorMessage;
  intent: TutorIntent;
  concept: string | null;
  strategy: string;
  lessonChanged: boolean;
  engine: TutorEngineInfo;
  state: StudentState;
};

export type TutorHistoryResponse = {
  messages: TutorMessage[];
  state: StudentState;
};

export type AISettings = {
  provider: string;
  model: string;
  temperature: number;
  maxTokens: number;
  /** The key itself is never sent to the browser. */
  hasApiKey: boolean;
  apiKeySource: string;
  availableProviders: Array<{ id: string; label: string; configured: boolean; defaultModel: string }>;
  connection: { status: "connected" | "failed" | "unknown"; checkedAt: number | null; detail?: string };
};

export type AISettingsUpdate = {
  provider?: string;
  model?: string;
  temperature?: number;
  maxTokens?: number;
  /** Sent once, stored server-side only. Never persisted in the browser. */
  apiKey?: string;
};

export type AIConnectionTest = {
  status: "connected" | "failed";
  provider: string;
  model: string;
  latencyMs?: number;
  detail?: string;
};

export type CourseListResponse = {
  courses: Course[];
  source: "backend" | "demo";
};

export type QuizAnswerRequest = {
  studentId: string;
  courseId: string;
  lessonId: string;
  question: QuizQuestion;
  selectedIndex: number;
};

export type QuizAnswerResponse = {
  /** Authoritative evaluation from the backend — never decided in the browser. */
  correct: boolean;
  feedback: string;
  concept: string | null;
  state: StudentState;
};

export type CodeRunRequest = {
  studentId: string;
  courseId: string;
  lessonId: string;
  language: string;
  code: string;
};

export type CodeRunResponse = {
  status: "ok" | "error" | "unavailable";
  stdout: string;
  stderr: string;
  detail?: string;
};
