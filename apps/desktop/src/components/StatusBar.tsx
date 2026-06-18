import { useState } from "react";
import { findTodoOffsets } from "@paperstack/engine";
import { useStore } from "../store.ts";
import { activeEditor } from "../editor/editor-registry.ts";
import { LengthBudget } from "./LengthBudget.tsx";
import { ProblemsPanel } from "./ProblemsPanel.tsx";

/**
 * Cycle to the next [TODO] in the active section; when it has none, open the
 * first section that still has one. The deferred select after a section
 * switch waits for the editor to receive the new content.
 */
async function jumpToNextTodo(): Promise<void> {
  const { content, counts, openSection } = useStore.getState();
  const editor = activeEditor();
  if (!editor) return;

  const select = (text: string, offset: number) => {
    const end = text.indexOf("]", offset);
    editor.select(offset, end === -1 ? offset + "[TODO".length : end + 1);
  };

  const offsets = findTodoOffsets(content);
  if (offsets.length > 0) {
    const next = offsets.find((o) => o > editor.cursorOffset()) ?? offsets[0]!;
    select(content, next);
    return;
  }
  const target = counts?.sections.find((s) => s.todos > 0);
  if (!target) return;
  await openSection(target.file);
  setTimeout(() => {
    const opened = useStore.getState().content;
    const first = findTodoOffsets(opened)[0];
    if (first !== undefined) select(opened, first);
  }, 50);
}

export function StatusBar() {
  const counts = useStore((s) => s.counts);
  const activeFile = useStore((s) => s.activeFile);
  const dirty = useStore((s) => s.dirty);
  const [budgetOpen, setBudgetOpen] = useState(false);
  const [problemsOpen, setProblemsOpen] = useState(false);

  if (!counts) return null;

  const active = counts.sections.find((s) => s.file === activeFile);
  const over = counts.overCap;
  // Hitting the cap is a hand-in blocker — start warning at 90% so the
  // last sections get written with the limit in view, not discovered late.
  const nearCap = !over && counts.cap > 0 && counts.bodyNormalsider >= 0.9 * counts.cap;

  return (
    <footer className="flex h-7 shrink-0 items-center gap-4 border-t border-zinc-800 bg-zinc-900 px-4 text-xs text-zinc-400">
      <button
        onClick={() => setBudgetOpen(true)}
        title="Length budget — per-section breakdown"
        className={`rounded px-1 hover:bg-zinc-800 ${
          over ? "font-semibold text-red-400" : nearCap ? "font-medium text-amber-400" : "text-zinc-400"
        }`}
      >
        Body: {counts.bodyNormalsider.toFixed(2)} / {counts.cap} normalsider
        {over && " — over the cap"}
        {nearCap && " — nearing the cap"}
      </button>
      {budgetOpen && <LengthBudget onClose={() => setBudgetOpen(false)} />}
      {counts.todosTotal > 0 && (
        <button
          onClick={() => void jumpToNextTodo()}
          title="Jump to the next [TODO]"
          className="rounded px-1 text-amber-400 hover:bg-zinc-800 hover:text-amber-300"
        >
          {counts.todosTotal} TODO
        </button>
      )}
      <button
        onClick={() => setProblemsOpen(true)}
        title="Check the report before hand-in — TODOs, missing images, citations, length"
        className="rounded px-1 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200"
      >
        Check
      </button>
      {problemsOpen && <ProblemsPanel onClose={() => setProblemsOpen(false)} />}
      <span className="ml-auto flex items-center gap-3">
        {active && (
          <span>
            This section: {active.normalsider.toFixed(2)} normalsider
            {active.role !== "body" && " (not counted)"}
          </span>
        )}
        <span className={dirty ? "text-amber-400" : "text-zinc-600"}>
          {dirty ? "unsaved" : "saved"}
        </span>
      </span>
    </footer>
  );
}
