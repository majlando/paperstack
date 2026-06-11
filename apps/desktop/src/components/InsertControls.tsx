import { useEffect, useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { figureMarkdown } from "@paperstack/engine";
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
  const [caption, setCaption] = useState("");

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
