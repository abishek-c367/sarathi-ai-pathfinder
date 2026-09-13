import { createFileRoute } from "@tanstack/react-router";
import { FileUp, Sparkles } from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useAppStore } from "@/lib/app-store";
import type { Lesson, Module } from "@/lib/course-types";

export const Route = createFileRoute("/admin/ingest")({
  head: () => ({
    meta: [
      { title: "Ingest notes into a course — Sarathi AI Tutor" },
      {
        name: "description",
        content:
          "Paste raw notes or upload a text file and turn them into a structured module outline with objectives and concepts.",
      },
      { property: "og:title", content: "Ingest notes into a course — Sarathi AI Tutor" },
      {
        property: "og:description",
        content: "Turn raw notes into a structured module outline with objectives and concepts.",
      },
    ],
  }),
  component: Ingest,
});

type Draft = { title: string; summary: string; lessons: Array<{ title: string; objectives: string[]; concepts: string[] }> };

function slug(text: string) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 40);
}

function outlineFromNotes(raw: string): Draft | null {
  const lines = raw
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
  if (lines.length === 0) return null;

  const title = lines[0]!.replace(/^#+\s*/, "");
  const headings = lines.slice(1).filter((l) => /^(#{2,}|\d+[.)]|-\s*\*\*)/.test(l));
  const candidates = (headings.length > 0 ? headings : lines.slice(1)).slice(0, 6);

  const sentences = raw
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 25);

  const lessons = candidates.map((line, i) => {
    const clean = line.replace(/^(#{2,}\s*|\d+[.)]\s*|-\s*)/, "").replace(/\*\*/g, "");
    const body = sentences.slice(i * 2, i * 2 + 2);
    return {
      title: clean.slice(0, 70) || `Lesson ${i + 1}`,
      objectives:
        body.length > 0
          ? body.map((s) => `Explain: ${s.slice(0, 90)}`)
          : [`Understand ${clean.slice(0, 50)}`, `Apply ${clean.slice(0, 50)} to a problem`],
      concepts: clean
        .split(/[\s,/&]+/)
        .filter((w) => w.length > 4)
        .slice(0, 4),
    };
  });

  return {
    title,
    summary: sentences[0]?.slice(0, 160) ?? `Generated from ${lines.length} lines of notes.`,
    lessons: lessons.length > 0 ? lessons : [{ title, objectives: [], concepts: [] }],
  };
}

function Ingest() {
  const { courses, updateCourse } = useAppStore();
  const [raw, setRaw] = useState("");
  const [draft, setDraft] = useState<Draft | null>(null);
  const [target, setTarget] = useState(courses[0]?.id ?? "");
  const fileRef = useRef<HTMLInputElement>(null);

  const generate = () => {
    const result = outlineFromNotes(raw);
    if (!result) {
      toast.error("Paste some notes first.");
      return;
    }
    setDraft(result);
  };

  const insert = () => {
    if (!draft || !target) return;
    const base = slug(draft.title) || `module-${Date.now()}`;
    const module: Module = {
      id: `${base}-${Date.now().toString(36)}`,
      title: draft.title,
      summary: draft.summary,
      lessons: draft.lessons.map<Lesson>((l, i) => ({
        id: `${base}-l${i + 1}-${Date.now().toString(36)}`,
        title: l.title,
        minutes: 12,
        intuition: draft.summary,
        objectives: l.objectives,
        concepts: l.concepts,
        codeExamples: [],
        quiz: [],
      })),
    };
    updateCourse(target, (course) => ({ ...course, modules: [...course.modules, module] }));
    toast.success(`Added "${draft.title}" to the course outline`);
    setDraft(null);
    setRaw("");
  };

  return (
    <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6">
      <h1 className="text-3xl font-semibold sm:text-4xl">Ingest raw notes</h1>
      <p className="mt-2 max-w-2xl text-muted-foreground">
        Paste lecture notes, a README or a transcript. Sarathi proposes a module with lessons,
        objectives and key concepts you can insert into any course.
      </p>

      <div className="mt-8 grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Source material</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <Textarea
              rows={14}
              value={raw}
              onChange={(e) => setRaw(e.target.value)}
              placeholder={"# Kafka fundamentals\n## Topics and partitions\n...notes..."}
              className="font-mono text-xs"
            />
            <div className="flex flex-wrap gap-2">
              <Button onClick={generate}>
                <Sparkles className="mr-2 size-4" /> Generate outline
              </Button>
              <Button variant="outline" onClick={() => fileRef.current?.click()}>
                <FileUp className="mr-2 size-4" /> Upload .txt / .md
              </Button>
              <input
                ref={fileRef}
                type="file"
                accept=".txt,.md,text/plain,text/markdown"
                className="hidden"
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  setRaw(await file.text());
                  toast.success(`Loaded ${file.name}`);
                }}
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Suggested outline</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {!draft ? (
              <p className="text-sm text-muted-foreground">
                Nothing yet — generate an outline to preview it here.
              </p>
            ) : (
              <>
                <div>
                  <p className="font-serif text-lg font-semibold">{draft.title}</p>
                  <p className="text-sm text-muted-foreground">{draft.summary}</p>
                </div>
                <ol className="space-y-3">
                  {draft.lessons.map((lesson, i) => (
                    <li key={`${lesson.title}-${i}`} className="rounded-lg border border-border p-3">
                      <p className="text-sm font-medium">
                        {i + 1}. {lesson.title}
                      </p>
                      <ul className="mt-1.5 list-disc space-y-0.5 pl-4 text-xs text-muted-foreground">
                        {lesson.objectives.map((o) => (
                          <li key={o}>{o}</li>
                        ))}
                      </ul>
                      <div className="mt-2 flex flex-wrap gap-1">
                        {lesson.concepts.map((c) => (
                          <Badge key={c} variant="outline" className="text-[11px]">
                            {c}
                          </Badge>
                        ))}
                      </div>
                    </li>
                  ))}
                </ol>
                <div className="flex flex-wrap items-center gap-2">
                  <Select value={target} onValueChange={setTarget}>
                    <SelectTrigger className="w-56">
                      <SelectValue placeholder="Choose a course" />
                    </SelectTrigger>
                    <SelectContent>
                      {courses.map((course) => (
                        <SelectItem key={course.id} value={course.id}>
                          {course.title}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button onClick={insert} disabled={!target}>
                    Insert module
                  </Button>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
