import type { Course } from "@/lib/course-types";
import { builtInCourses } from "@/lib/courses";

/** Course catalogue the tutor backend teaches from. */
export function listCourses(): Course[] {
  return builtInCourses;
}

export function getCourse(courseId: string): Course | undefined {
  return builtInCourses.find((c) => c.id === courseId);
}
