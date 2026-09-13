import { useCallback, useRef, useState } from "react";

import { nextId, type TutorBlock, type TutorRequest, type TutorTurn } from "./tutor-blocks";

type StreamEvent =
  | { type: "meta"; engine: string }
  | { type: "block"; block: TutorBlock }
  | { type: "done"; done: boolean };

export function useTutorStream() {
  const [turns, setTurns] = useState<TutorTurn[]>([]);
  const [streaming, setStreaming] = useState(false);
  const [engine, setEngine] = useState<string>("simulated");
  const [beat, setBeat] = useState(0);
  const [lessonDone, setLessonDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const busy = useRef(false);

  const reset = useCallback(() => {
    setTurns([]);
    setBeat(0);
    setLessonDone(false);
    setError(null);
  }, []);

  const send = useCallback(
    async (req: Omit<TutorRequest, "beat"> & { beat?: number }) => {
      if (busy.current) return;
      busy.current = true;
      setError(null);
      setStreaming(true);

      const turnId = nextId("turn");
      if (req.mode === "ask" && req.question) {
        setTurns((t) => [
          ...t,
          {
            id: nextId("turn"),
            author: "student",
            blocks: [{ id: nextId(), kind: "text", markdown: req.question! }],
          },
        ]);
      }
      setTurns((t) => [...t, { id: turnId, author: "tutor", blocks: [], pending: true }]);

      try {
        const res = await fetch("/api/tutor", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ ...req, beat: req.beat ?? beat } satisfies TutorRequest),
        });
        if (!res.ok || !res.body) throw new Error(`Tutor unavailable (${res.status})`);

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        for (;;) {
          const { value, done } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";
          for (const line of lines) {
            if (!line.trim()) continue;
            let event: StreamEvent;
            try {
              event = JSON.parse(line) as StreamEvent;
            } catch {
              continue;
            }
            if (event.type === "meta") setEngine(event.engine);
            if (event.type === "block") {
              setTurns((t) =>
                t.map((turn) =>
                  turn.id === turnId
                    ? { ...turn, pending: false, blocks: [...turn.blocks, event.block] }
                    : turn,
                ),
              );
            }
            if (event.type === "done") {
              if (event.done) setLessonDone(true);
              if (req.mode === "continue") setBeat((b) => (req.beat ?? b) + 1);
            }
          }
        }
        setTurns((t) => t.map((turn) => (turn.id === turnId ? { ...turn, pending: false } : turn)));
      } catch (e) {
        setError(e instanceof Error ? e.message : "The tutor could not respond.");
        setTurns((t) => t.filter((turn) => turn.id !== turnId));
      } finally {
        busy.current = false;
        setStreaming(false);
      }
    },
    [beat],
  );

  return { turns, streaming, engine, beat, lessonDone, error, send, reset };
}
