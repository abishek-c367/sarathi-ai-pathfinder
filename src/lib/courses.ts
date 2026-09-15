import type { Course } from "./course-types";
import { gpt2Course } from "./gpt2-course";
import { seedCourses } from "./seed-courses";

/**
 * The course registry. Demo courses and backend-authored courses live side by
 * side so the app supports both without special-casing either.
 */
export const builtInCourses: Course[] = [gpt2Course, ...seedCourses];

export function findCourse(courses: Course[], courseId: string): Course | undefined {
  return courses.find((c) => c.id === courseId);
}
