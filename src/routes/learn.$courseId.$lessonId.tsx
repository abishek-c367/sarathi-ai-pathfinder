import { createFileRoute, Link, notFound, useNavigate } from "@tanstack/react-router";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  CircleDot,
  Cpu,
  Gauge,
  Loader2,
  Rabbit,
  Send,
  Sparkles,
  Turtle,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import { TutorBlockView } from "@/components/tutor/TutorBlockView";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Textarea } from "@/components/ui/textarea";
import { useAppStore } from "@/lib/app-store";
import { flattenLessons } from "@/lib/course-types";
import { useTutorSession } from "@/lib/use-tutor-session";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/learn/$courseId/$lessonId")({
  head: () => ({
    meta: [
      { title: "Tutor workspace — Sarathi AI Tutor" },
      {
        name: "description",
        content:
          "Learn one concept at a time: the tutor explains, checks your understanding, and adapts its pace to you.",
      },
      { property: "og:title", content: "Tutor workspace — Sarathi AI Tutor" },
      {
        property: "og:description",
        content: "A step-by-step AI tutor that adapts its pace and depth to how you're doing.",
      },
    ],
  }),
  component: TutorWorkspace,
});

const PACE_LABEL: Record<string, { label: string; icon: typeof Gauge }> = {
  brisk: { label: "Pace: quick", icon: Rabbit },
  slow: { label: "Pace: careful", icon: Turtle },
  balanced: { label: "Pace: steady", icon: Gauge },
};

function TutorWorkspace() {
  const { courseId, lessonId } = Route.useParams();
  const navigate = useNavigate();
  const {
    courses,
    hydrated,
    enrollmentFor,
    enroll,
    touchLesson,
    completeLesson,
    recordAttempt,
    progressFor,
  } = useAppStore();

  const course = courses.find((c) => c.id === courseId);
  const lessons = useMemo(() => (course ? flattenLessons(course) : []), [course]);
  const index = lessons.findIndex((l) => l.lessonId === lessonId);
  const current = index >= 0 ? lessons[index] : undefined;

  const {
    turns,
    streaming,
    engine,
    conceptIndex,
    lessonDone,
    error,
    mastery,
    checkinResults,
    activeCheckinId,
    teachConcept,
    askQuestion,
    submitCheckin,
    reset,
  } = useTutorSession();
  const [question, setQuestion] = useState("");
  const [answered, setAnswered] = useState<Record<string, boolean>>({});
  const streamEnd = useRef<HTMLDivElement>(null);
  const started = useRef(false);

  const enrollment = course ? enrollmentFor(course.id) : undefined;

  useEffect(() => {
    if (!course || !current) return;
    if (!enrollmentFor(course.id)) enroll(course.id);
    touchLesson(course.id, current.lessonId);
    reset();
    setAnswered({});
    started.current = false;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [courseId, lessonId, hydrated]);

  useEffect(() => {
    streamEnd.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [turns]);

  // Every time the session advances to a new concept (after a correct
  // check-in), teach that concept automatically — this is what makes the
  // lesson feel like a guided conversation rather than a button to mash.
  useEffect(() => {
    if (!started.current || !course || !current) return;
    if (lessonDone) return;
    teachConcept(
      {
        courseTitle: course.title,
        moduleTitle: current.moduleTitle,
        teaching: course.teaching,
        lesson: current.lesson,
      },
      conceptIndex,
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conceptIndex]);

  if (!course || !current) {
    if (!hydrated) return <div className="p-10 text-sm text-muted-foreground">Loading lesson…</div>;
    throw notFound();
  }

  const lesson = current.lesson;
  const prev = index > 0 ? lessons[index - 1] : undefined;
  const next = index < lessons.length - 1 ? lessons[index + 1] : undefined;
  const mastered = enrollment?.masteredConcepts ?? [];
  const masteredHere = lesson.concepts.filter((c) => mastered.includes(c));
  const answeredList = Object.values(answered);
  const quizScore =
    answeredList.length === 0
      ? null
      : Math.round((answeredList.filter(Boolean).length / answeredList.length) * 100);

  const baseRequest = {
    courseTitle: course.title,
    moduleTitle: current.moduleTitle,
    teaching: course.teaching,
    lesson,
  };

  const requiresQuiz = course.teaching.enforceQuizzes;
  const quizPassed = answeredList.some(Boolean);
  const pace = PACE_LABEL[mastery.pace] ?? PACE_LABEL["balanced"]!;
  const PaceIcon = pace.icon;

  const onAnswer = (questionId: string, correct: boolean) => {
    setAnswered((a) => ({ ...a, [questionId]: correct }));
    recordAttempt(course.id, questionId, correct);
    toast[correct ? "success" : "error"](correct ? "Correct — nice." : "Review the explanation.");
  };

  const startLesson = () => {
    started.current = true;
    teachConcept(baseRequest, 0);
  };

  const finish = () => {
    if (requiresQuiz && !quizPassed) {
      toast.error("Answer the checkpoint question correctly to complete this lesson.");
      return;
    }
    completeLesson(course.id, lesson.id, lesson.concepts);
    toast.success(`${lesson.title} marked as mastered`);
    if (next) {
      void navigate({
        to: "/learn/$courseId/$lessonId",
        params: { courseId: course.id, lessonId: next.lessonId },
      });
    }
  };

  return (
    <div className="mx-auto grid max-w-7xl gap-8 px-4 py-8 sm:px-6 lg:grid-cols-[minmax(0,1fr)_320px]">
      <section className="min-w-0">
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <Link to="/catalog" className="hover:text-foreground">
            {course.title}
          </Link>
          <span>/</span>
          <span>{current.moduleTitle}</span>
        </div>
        <h1 className="mt-2 text-2xl font-semibold sm:text-3xl">{lesson.title}</h1>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Badge variant="secondary">{lesson.minutes} min</Badge>
          {turns.length > 0 && (
            <Badge variant="outline" className="gap-1">
              <PaceIcon className="size-3" />
              {pace.label}
            </Badge>
          )}
          <Badge variant="outline" className="gap-1">
            <Cpu className="size-3" />
            {engine === "groq" ? "Live AI tutor" : "Built-in tutor"}
          </Badge>
        </div>

        <div className="mt-6 space-y-6">
          {turns.length === 0 && !streaming && (
            <div className="rounded-2xl border border-dashed border-border bg-card/60 p-8 text-center">
              <Sparkles className="mx-auto size-6 text-primary" />
              <h2 className="mt-3 font-serif text-lg font-semibold">Ready when you are</h2>
              <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
                {lesson.intuition}
              </p>
              <p className="mx-auto mt-2 max-w-md text-xs text-muted-foreground">
                We'll go one concept at a time — {lesson.concepts.length} in this lesson — and the
                pace adjusts to how you're doing.
              </p>
              <Button className="mt-4" onClick={startLesson}>
                Start lesson
              </Button>
            </div>
          )}

          {turns.map((turn) => (
            <article
              key={turn.id}
              className={cn(
                "rounded-2xl border p-5",
                turn.author === "student"
                  ? "ml-auto max-w-[85%] border-primary/30 bg-accent/40"
                  : "border-border bg-card",
              )}
            >
              <p className="mb-3 text-[11px] font-semibold tracking-widest text-muted-foreground uppercase">
                {turn.author === "student" ? "You" : "Sarathi"}
              </p>
              {turn.pending ? (
                <p className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="size-4 animate-spin" /> Thinking…
                </p>
              ) : (
                <div className="space-y-4">
                  {turn.blocks.map((block) => (
                    <TutorBlockView
                      key={block.id}
                      block={block}
                      onAnswer={onAnswer}
                      onCheckin={
                        block.kind === "checkin"
                          ? (text) => submitCheckin(baseRequest, text)
                          : undefined
                      }
                      checkinResult={
                        block.kind === "checkin" ? checkinResults[block.id] : undefined
                      }
                      checkinBusy={
                        block.kind === "checkin" && block.id === activeCheckinId ? streaming : false
                      }
                    />
                  ))}
                </div>
              )}
            </article>
          ))}
          <div ref={streamEnd} />
        </div>

        {error && (
          <p className="mt-4 rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
            {error}
          </p>
        )}

        <div className="sticky bottom-0 mt-6 space-y-3 bg-background/90 py-4 backdrop-blur">
          <div className="flex flex-wrap items-center gap-2">
            {turns.length > 0 && (
              <span className="text-xs text-muted-foreground">
                Concept {Math.min(conceptIndex + 1, lesson.concepts.length)} of{" "}
                {lesson.concepts.length}
                {quizScore !== null && ` · checkpoint score ${quizScore}%`}
              </span>
            )}
            <Button variant="outline" onClick={finish} disabled={streaming} className="ml-auto">
              <Check className="mr-2 size-4" /> Mark lesson complete
            </Button>
          </div>
          <form
            className="flex items-end gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              const q = question.trim();
              if (!q || streaming || turns.length === 0) return;
              setQuestion("");
              askQuestion(baseRequest, q);
            }}
          >
            <Textarea
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              placeholder={
                turns.length === 0
                  ? "Start the lesson to ask Sarathi questions…"
                  : "Ask Sarathi anything about this lesson…"
              }
              rows={2}
              className="resize-none"
              disabled={turns.length === 0}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  e.currentTarget.form?.requestSubmit();
                }
              }}
            />
            <Button
              type="submit"
              size="icon"
              disabled={streaming || !question.trim() || turns.length === 0}
            >
              <Send className="size-4" />
            </Button>
          </form>
        </div>
      </section>

      <aside className="space-y-6 lg:sticky lg:top-24 lg:self-start">
        <div className="rounded-2xl border border-border bg-card p-5">
          <h2 className="text-sm font-semibold">Concepts in this lesson</h2>
          <ul className="mt-3 space-y-2 text-sm">
            {lesson.concepts.map((concept, i) => {
              const reached = conceptIndex > i || lessonDone;
              const active = conceptIndex === i && !lessonDone && turns.length > 0;
              return (
                <li key={concept} className="flex gap-2">
                  {reached ? (
                    <Check className="mt-0.5 size-4 shrink-0 text-chart-2" />
                  ) : (
                    <CircleDot
                      className={cn(
                        "mt-0.5 size-4 shrink-0",
                        active ? "text-primary" : "text-muted-foreground",
                      )}
                    />
                  )}
                  <span
                    className={cn(
                      reached || active ? "text-foreground" : "text-muted-foreground",
                      active && "font-medium",
                    )}
                  >
                    {concept}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>

        <div className="rounded-2xl border border-border bg-card p-5">
          <div className="flex items-center justify-between text-sm font-semibold">
            <span>Concepts mastered</span>
            <span className="text-muted-foreground">
              {masteredHere.length}/{lesson.concepts.length}
            </span>
          </div>
          <Progress
            className="mt-3"
            value={
              lesson.concepts.length === 0
                ? 0
                : (masteredHere.length / lesson.concepts.length) * 100
            }
          />
          <div className="mt-3 flex flex-wrap gap-1.5">
            {lesson.concepts.map((concept) => (
              <Badge
                key={concept}
                variant={masteredHere.includes(concept) ? "default" : "outline"}
                className="text-[11px]"
              >
                {concept}
              </Badge>
            ))}
          </div>
          <p className="mt-3 text-xs text-muted-foreground">
            Course progress: {progressFor(course.id)}%
          </p>
        </div>

        <div className="rounded-2xl border border-border bg-card p-5">
          <h2 className="text-sm font-semibold">Course outline</h2>
          <ScrollArea className="mt-3 max-h-72 pr-3">
            <div className="space-y-4">
              {course.modules.map((module) => (
                <div key={module.id}>
                  <p className="text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
                    {module.title}
                  </p>
                  <ul className="mt-1.5 space-y-1">
                    {module.lessons.map((l) => (
                      <li key={l.id}>
                        <Link
                          to="/learn/$courseId/$lessonId"
                          params={{ courseId: course.id, lessonId: l.id }}
                          className={cn(
                            "flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm transition-colors hover:bg-accent",
                            l.id === lesson.id && "bg-accent font-medium text-accent-foreground",
                          )}
                        >
                          {enrollment?.completedLessons.includes(l.id) ? (
                            <Check className="size-3.5 text-chart-2" />
                          ) : (
                            <CircleDot className="size-3.5 text-muted-foreground" />
                          )}
                          <span className="truncate">{l.title}</span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </ScrollArea>
        </div>

        <div className="flex gap-2">
          <Button asChild variant="outline" size="sm" className="flex-1" disabled={!prev}>
            {prev ? (
              <Link
                to="/learn/$courseId/$lessonId"
                params={{ courseId: course.id, lessonId: prev.lessonId }}
              >
                <ArrowLeft className="mr-1 size-4" /> Previous
              </Link>
            ) : (
              <span className="opacity-50">
                <ArrowLeft className="mr-1 size-4" /> Previous
              </span>
            )}
          </Button>
          <Button asChild size="sm" className="flex-1">
            {next ? (
              <Link
                to="/learn/$courseId/$lessonId"
                params={{ courseId: course.id, lessonId: next.lessonId }}
              >
                Next <ArrowRight className="ml-1 size-4" />
              </Link>
            ) : (
              <Link to="/">Finish course</Link>
            )}
          </Button>
        </div>
      </aside>
    </div>
  );
}
