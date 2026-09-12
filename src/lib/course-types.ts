export type Difficulty = "beginner" | "intermediate" | "advanced";
export type CourseStatus = "draft" | "published" | "archived";

export type TeachingStyle = {
  depth: "overview" | "balanced" | "deep-dive";
  tone: "neutral" | "encouraging" | "socratic";
  pacing: "slow" | "balanced" | "brisk";
  enforceQuizzes: boolean;
};

export type CodeExample = {
  label: string;
  language: string;
  code: string;
};

export type QuizQuestion = {
  id: string;
  kind: "multiple-choice" | "code-prediction";
  prompt: string;
  code?: string;
  language?: string;
  options: string[];
  answerIndex: number;
  explanation: string;
};

export type Lesson = {
  id: string;
  title: string;
  minutes: number;
  intuition: string;
  objectives: string[];
  concepts: string[];
  codeExamples: CodeExample[];
  diagram?: { title: string; mermaid: string };
  quiz: QuizQuestion[];
};

export type Module = {
  id: string;
  title: string;
  summary: string;
  lessons: Lesson[];
};

export type Course = {
  id: string;
  title: string;
  tagline: string;
  description: string;
  difficulty: Difficulty;
  status: CourseStatus;
  tags: string[];
  teaching: TeachingStyle;
  modules: Module[];
};

export type LessonRef = {
  courseId: string;
  moduleId: string;
  lessonId: string;
  moduleTitle: string;
  lesson: Lesson;
};

export function flattenLessons(course: Course): LessonRef[] {
  return course.modules.flatMap((m) =>
    m.lessons.map((lesson) => ({
      courseId: course.id,
      moduleId: m.id,
      lessonId: lesson.id,
      moduleTitle: m.title,
      lesson,
    })),
  );
}

export function countLessons(course: Course): number {
  return course.modules.reduce((n, m) => n + m.lessons.length, 0);
}
