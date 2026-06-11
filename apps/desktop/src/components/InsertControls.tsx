import { useEffect, useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { figureMarkdown, formatTableAt, tableMarkdown, type BibEntry } from "@paperstack/engine";
import { useStore } from "../store.ts";
import { activeEditor } from "../editor/editor-registry.ts";

const CODE_SNIPPET = "```\n\n```";
const DIAGRAM_SNIPPET = "```mermaid\nflowchart TD\n    A[Start] --> B[Next step]\n```";

/**
 * The editor-header insert actions. Figure: pick an image (or paste one into
 * the editor — both flows land in the store's pendingFigure), give it the
 * caption that becomes "Figure N: …" in the PDF, and the image lands in the
 * project's images folder. Code/diagram insert ready-made fenced blocks at
 * the cursor. The caption prompt is a deliberately tiny hand-rolled overlay —
 * one input, two buttons; shadcn/radix arrive when a dialog needs real
 * plumbing.
 */
export function InsertControls() {
  const pendingFigure = useStore((s) => s.pendingFigure);
  const requestFigure = useStore((s) => s.requestFigure);
  const cancelFigure = useStore((s) => s.cancelFigure);
  const hasReferences = useStore((s) => s.hasReferences);
  const [caption, setCaption] = useState("");
  const [references, setReferences] = useState<BibEntry[] | null>(null);
  const [tableShape, setTableShape] = useState<{ rows: string; cols: string } | null>(null);

  async function openCitations() {
    setReferences(await useStore.getState().listReferences());
  }

  function insertCitation(key: string) {
    setReferences(null);
    activeEditor()?.insertInline(`[@${key}]`);
  }

  // One Table button, two jobs: inside an existing table it re-aligns the
  // pipes; anywhere else it asks for a shape and inserts a skeleton.
  function tableAction() {
    const editor = activeEditor();
    if (!editor) return;
    const edit = formatTableAt(editor.getDoc(), editor.cursorOffset());
    if (edit) {
      editor.applyEdit(edit.from, edit.to, edit.text);
      return;
    }
    setTableShape({ rows: "2", cols: "3" });
  }

  function insertTable() {
    if (!tableShape) return;
    const rows = Number.parseInt(tableShape.rows, 10) || 2;
    const cols = Number.parseInt(tableShape.cols, 10) || 3;
    setTableShape(null);
    // cursor lands in the first header cell
    activeEditor()?.insertBlock(tableMarkdown(rows, cols), 2);
  }

  // A new pending figure (picked or pasted) starts from its suggested caption.
  useEffect(() => {
    setCaption(pendingFigure?.suggestedCaption ?? "");
  }, [pendingFigure]);

  async function pickFigure() {
    const file = await open({
      title: "Insert Figure — choose an image",
      filters: [{ name: "Images", extensions: ["png", "jpg", "jpeg", "svg", "gif", "webp"] }],
    });
    if (typeof file !== "string") return;
    requestFigure({ kind: "path", path: file });
  }

  async function confirmFigure() {
    const rel = await useStore.getState().confirmFigure();
    if (!rel) return; // error banner already explains
    activeEditor()?.insertBlock(figureMarkdown(rel, caption.trim()));
  }

  const buttonCls = "rounded px-1.5 py-0.5 text-zinc-500 hover:bg-zinc-800 hover:text-zinc-200";

  return (
    <span className="flex shrink-0 items-center gap-0.5">
      <button title="Insert Figure" className={buttonCls} onClick={() => void pickFigure()}>
        Figure
      </button>
      <button
        title="Insert Code Block"
        className={buttonCls}
        onClick={() => activeEditor()?.insertBlock(CODE_SNIPPET, 3)}
      >
        Code
      </button>
      <button
        title="Insert Diagram (Mermaid)"
        className={buttonCls}
        onClick={() => activeEditor()?.insertBlock(DIAGRAM_SNIPPET)}
      >
        Diagram
      </button>
      <button
        title="Insert a table — or re-align the table under the cursor"
        className={buttonCls}
        onClick={tableAction}
      >
        Table
      </button>
      {/* Only offered when the project has a references.bib — without one,
          [@key] would print literally in the report. */}
      {hasReferences && (
        <button
          title="Insert Citation — a numbered reference from references.bib"
          className={buttonCls}
          onClick={() => void openCitations()}
        >
          Cite
        </button>
      )}

      {tableShape !== null && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
          onClick={() => setTableShape(null)}
        >
          <div
            className="w-full max-w-xs rounded-lg border border-zinc-700 bg-zinc-900 p-4 shadow-xl"
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => {
              if (e.key === "Enter") insertTable();
              if (e.key === "Escape") setTableShape(null);
            }}
          >
            <div className="pb-3 text-sm font-semibold text-zinc-100">Insert Table</div>
            <div className="flex items-center gap-3">
              <label className="flex-1 text-xs text-zinc-500">
                Rows
                <input
                  autoFocus
                  value={tableShape.rows}
                  inputMode="numeric"
                  onChange={(e) => setTableShape({ ...tableShape, rows: e.target.value })}
                  className="mt-1 w-full rounded border border-zinc-700 bg-zinc-950 px-2.5 py-1.5 text-sm text-zinc-100 outline-none focus:border-zinc-500"
                />
              </label>
              <label className="flex-1 text-xs text-zinc-500">
                Columns
                <input
                  value={tableShape.cols}
                  inputMode="numeric"
                  onChange={(e) => setTableShape({ ...tableShape, cols: e.target.value })}
                  className="mt-1 w-full rounded border border-zinc-700 bg-zinc-950 px-2.5 py-1.5 text-sm text-zinc-100 outline-none focus:border-zinc-500"
                />
              </label>
            </div>
            <div className="flex justify-end gap-2 pt-4">
              <button
                onClick={() => setTableShape(null)}
                className="rounded border border-zinc-700 px-3 py-1 text-sm text-zinc-300 hover:bg-zinc-800"
              >
                Cancel
              </button>
              <button
                onClick={insertTable}
                className="rounded bg-blue-600 px-3 py-1 text-sm font-medium text-white hover:bg-blue-500"
              >
                Insert Table
              </button>
            </div>
          </div>
        </div>
      )}

      {references !== null && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
          onClick={() => setReferences(null)}
          onKeyDown={(e) => {
            if (e.key === "Escape") setReferences(null);
          }}
        >
          <div
            className="w-full max-w-lg rounded-lg border border-zinc-700 bg-zinc-900 p-4 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="pb-1 text-sm font-semibold text-zinc-100">Insert Citation</div>
            <div className="pb-3 text-xs text-zinc-500">
              From references.bib — inserted as [@key], numbered in the report.
            </div>
            {references.length === 0 ? (
              <div className="py-2 text-sm text-zinc-500">
                No entries found in references.bib.
              </div>
            ) : (
              <div className="max-h-72 overflow-y-auto">
                {references.map((r) => (
                  <button
                    key={r.key}
                    autoFocus={r === references[0]}
                    onClick={() => insertCitation(r.key)}
                    className="block w-full rounded px-2 py-1.5 text-left hover:bg-zinc-800"
                  >
                    <span className="text-sm text-sky-300">[{r.key}]</span>
                    <span className="ml-2 text-sm text-zinc-300">
                      {r.title ?? "(no title)"}
                      {r.year && <span className="text-zinc-500"> ({r.year})</span>}
                    </span>
                  </button>
                ))}
              </div>
            )}
            <div className="flex justify-end pt-3">
              <button
                onClick={() => setReferences(null)}
                className="rounded border border-zinc-700 px-3 py-1 text-sm text-zinc-300 hover:bg-zinc-800"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {pendingFigure !== null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <div className="w-full max-w-md rounded-lg border border-zinc-700 bg-zinc-900 p-4 shadow-xl">
            <div className="pb-1 text-sm font-semibold text-zinc-100">Figure caption</div>
            <div className="pb-3 text-xs text-zinc-500">
              Shown under the figure as “Figure N: …” in the report.
            </div>
            <input
              autoFocus
              value={caption}
              onChange={(e) => setCaption(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void confirmFigure();
                if (e.key === "Escape") cancelFigure();
              }}
              className="w-full rounded border border-zinc-700 bg-zinc-950 px-2.5 py-1.5 text-sm text-zinc-100 outline-none focus:border-zinc-500"
            />
            <div className="flex justify-end gap-2 pt-3">
              <button
                onClick={cancelFigure}
                className="rounded border border-zinc-700 px-3 py-1 text-sm text-zinc-300 hover:bg-zinc-800"
              >
                Cancel
              </button>
              <button
                onClick={() => void confirmFigure()}
                className="rounded bg-blue-600 px-3 py-1 text-sm font-medium text-white hover:bg-blue-500"
              >
                Insert Figure
              </button>
            </div>
          </div>
        </div>
      )}
    </span>
  );
}
