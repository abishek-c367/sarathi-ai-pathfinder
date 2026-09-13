import { ClientOnly } from "@tanstack/react-router";
import { lazy, Suspense } from "react";
import Markdown from "react-markdown";

import { CodeBlock } from "@/components/tutor/CodeBlock";
import { QuizCard } from "@/components/tutor/QuizCard";
import type { TutorBlock } from "@/lib/tutor-blocks";

const Mermaid = lazy(() => import("@/components/tutor/Mermaid"));

export function TutorBlockView({
  block,
  onAnswer,
}: {
  block: TutorBlock;
  onAnswer?: (questionId: string, correct: boolean) => void;
}) {
  if (block.kind === "text") {
    return (
      <div className="tutor-prose max-w-[68ch]">
        <Markdown>{block.markdown}</Markdown>
      </div>
    );
  }

  if (block.kind === "code") {
    return <CodeBlock code={block.code} language={block.language} label={block.label} />;
  }

  if (block.kind === "mermaid") {
    return (
      <ClientOnly
        fallback={<div className="h-32 animate-pulse rounded-xl border border-border bg-muted" />}
      >
        <Suspense
          fallback={<div className="h-32 animate-pulse rounded-xl border border-border bg-muted" />}
        >
          <Mermaid chart={block.chart} title={block.title} />
        </Suspense>
      </ClientOnly>
    );
  }

  return (
    <QuizCard
      question={block.question}
      onAnswer={(correct) => onAnswer?.(block.question.id, correct)}
    />
  );
}
