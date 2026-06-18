import { useEffect, useState } from "react";
import type { Problem } from "@paperstack/engine";
import { useStore } from "../store.ts";
import { activeEditor } from "../editor/editor-registry.ts";

function stem(file: string): string {
  return file.replace(/.*\//, "").replace(/\.md$/i, "");
}

async function jumpTo(problem: Problem): Promise<void> {
  if (problem.file === null) return;
  const { activeFile, openSection } = useStore.getState();
  const select = () => {
    if (problem.offset !== undefined) activeEditor()?.select(problem.offset, problem.offset);
  };
  if (activeFile === problem.file) {
    select();
  } else {
    await openSection(problem.file);
    setTimeout(select, 50); // wait for the editor to receive the new content
  }
}

/**
 * The pre-hand-in checklist: a single place that surfaces everything blocking a
 * clean submission — TODOs, missing images, unknown citations and figure
 * references, an over-cap body — with click-to-jump. Errors break the export
 * or render wrong; warnings (TODOs) just shouldn't reach a hand-in.
 */
export function ProblemsPanel(props: { onClose: () => void }) {
  const [problems, setProblems] = useState<Problem[] | null>(null);

  async function check() {
    setProblems(null);
    setProblems(await useStore.getState().checkProblems());
  }
  useEffect(() => {
    void check();
  }, []);

  const errors = (problems ?? []).filter((p) => p.severity === "error");
  const warnings = (problems ?? []).filter((p) => p.severity === "warning");

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
      onClick={props.onClose}
      onKeyDown={(e) => {
        if (e.key === "Escape") props.onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Report check"
        className="flex max-h-[80vh] w-full max-w-xl flex-col rounded-lg border border-zinc-700 bg-zinc-900 p-4 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between pb-1">
          <div className="text-sm font-semibold text-zinc-100">Report check</div>
          <button
            onClick={() => void check()}
            className="rounded px-2 py-0.5 text-xs text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200"
          >
            Re-check
          </button>
        </div>
        <div className="pb-3 text-xs text-zinc-500">
          {problems === null
            ? "Checking…"
            : problems.length === 0
              ? ""
              : `${errors.length} error${errors.length === 1 ? "" : "s"}, ${warnings.length} to resolve`}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto">
          {problems !== null && problems.length === 0 && (
            <div className="py-4 text-sm text-emerald-300">All clear — nothing blocking a hand-in.</div>
          )}
          {[...errors, ...warnings].map((p, i) => (
            <button
              key={i}
              onClick={() => void jumpTo(p)}
              disabled={p.file === null}
              className="flex w-full items-start gap-2 rounded px-2 py-1.5 text-left hover:bg-zinc-800 disabled:cursor-default disabled:hover:bg-transparent"
            >
              <span
                className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${
                  p.severity === "error" ? "bg-red-400" : "bg-amber-400"
                }`}
              />
              <span className="min-w-0">
                <span className="text-sm text-zinc-200">{p.message}</span>
                {p.file && <span className="ml-2 text-xs text-zinc-500">{stem(p.file)}</span>}
              </span>
            </button>
          ))}
        </div>

        <div className="flex justify-end pt-3">
          <button
            onClick={props.onClose}
            className="rounded border border-zinc-700 px-3 py-1 text-sm text-zinc-300 hover:bg-zinc-800"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
