import type { Course } from "@/lib/course-types";
import { countLessons, flattenLessons } from "@/lib/course-types";
import type { ConceptState, StudentState, TutorMessage } from "@/services/types";

/**
 * Student learning state + conversation history.
 *
 * In-memory for now (per server instance). Swap the Map for PostgreSQL/Redis
 * later; every reader goes through the accessors below, so nothing else changes.
 */

export type ConceptRecord = ConceptState;

export type Session = {
  studentId: string;
  courseId: string;
  currentLessonId: string;
  completedLessons: string[];
  currentConcept: string | null;
  concepts: Record<string, ConceptRecord>;
  learningStatus: string;
  messages: TutorMessage[];
  updatedAt: number;
};

const sessions = new Map<string, Session>();

function key(studentId: string, courseId: string) {
  return `${studentId}::${courseId}`;
}

export function getSession(studentId: string, courseId: string, course: Course): Session {
  const k = key(studentId, courseId);
  const existing = sessions.get(k);
  if (existing) return existing;
  const first = flattenLessons(course)[0];
  const session: Session = {
    studentId,
    courseId,
    currentLessonId: first?.lessonId ?? "",
    completedLessons: [],
    currentConcept: first?.lesson.concepts[0] ?? null,
    concepts: {},
    learningStatus: "starting",
    messages: [],
    updatedAt: Date.now(),
  };
  sessions.set(k, session);
  return session;
}

export function setLesson(session: Session, lessonId: string) {
  session.currentLessonId = lessonId;
  session.updatedAt = Date.now();
}

export function markLessonComplete(session: Session, lessonId: string) {
  if (!session.completedLessons.includes(lessonId)) session.completedLessons.push(lessonId);
  session.updatedAt = Date.now();
}

export function conceptRecord(session: Session, name: string): ConceptRecord {
  return session.concepts[name] ?? { name, status: "unknown", confidence: 0 };
}

export function setConcept(session: Session, record: ConceptRecord) {
  session.concepts[record.name] = record;
  session.currentConcept = record.name;
  session.updatedAt = Date.now();
}

export function addMessage(session: Session, message: TutorMessage) {
  session.messages.push(message);
  if (session.messages.length > 60) session.messages.splice(0, session.messages.length - 60);
  session.updatedAt = Date.now();
}

export function setLearningStatus(session: Session, status: string) {
  session.learningStatus = status;
  session.updatedAt = Date.now();
}

export function buildState(session: Session, course: Course): StudentState {
  const lessons = flattenLessons(course);
  const current = lessons.find((l) => l.lessonId === session.currentLessonId) ?? lessons[0];
  const total = countLessons(course);
  const lessonConcepts = current?.lesson.concepts ?? [];
  const concepts: ConceptState[] = lessonConcepts.map((name) => conceptRecord(session, name));
  for (const record of Object.values(session.concepts)) {
    if (!lessonConcepts.includes(record.name)) concepts.push(record);
  }
  return {
    studentId: session.studentId,
    courseId: course.id,
    courseTitle: course.title,
    currentModuleTitle: current?.moduleTitle ?? "",
    currentLessonId: current?.lessonId ?? "",
    currentLessonTitle: current?.lesson.title ?? "",
    completedLessons: [...session.completedLessons],
    currentConcept: session.currentConcept,
    concepts,
    learningStatus: session.learningStatus,
    progress: total === 0 ? 0 : Math.round((session.completedLessons.length / total) * 100),
    updatedAt: session.updatedAt,
  };
}
