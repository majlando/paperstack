import { useEffect, useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { figureMarkdown, formatTableAt, tableMarkdown, type BibEntry } from "@paperstack/engine";
import { useStore } from "../store.ts";
import { activeEditor } from "../editor/editor-registry.ts";

const CODE_SNIPPET = "```\n\n```";

// Starter Mermaid diagrams, one per kind (body only — the fence is added at
// insert time so an optional caption can ride in the info string). All render
// to plain SVG text (htmlLabels stays off) so they survive the print pipeline.
// Keep this list to kinds that export cleanly.
const DIAGRAM_TEMPLATES: { label: string; hint: string; body: string }[] = [
  {
    label: "Flowchart",
    hint: "Steps and decisions",
    body: "flowchart TD\n    A[Start] --> B{Decision?}\n    B -->|Yes| C[Do this]\n    B -->|No| D[Do that]",
  },
  {
    label: "Sequence",
    hint: "Messages between participants over time",
    body: "sequenceDiagram\n    participant A as Client\n    participant B as Server\n    A->>B: Request\n    B-->>A: Response",
  },
  {
    label: "Class",
    hint: "Classes, fields, and relationships",
    body: "classDiagram\n    class Animal {\n        +String name\n        +eat()\n    }\n    Animal <|-- Dog",
  },
  {
    label: "State",
    hint: "States and transitions",
    body: "stateDiagram-v2\n    [*] --> Idle\n    Idle --> Running: start\n    Running --> Idle: stop\n    Running --> [*]",
  },
  {
    label: "Entity relationship",
    hint: "Tables and how they relate",
    body: "erDiagram\n    CUSTOMER ||--o{ ORDER : places\n    ORDER ||--|{ LINE_ITEM : contains",
  },
  {
    label: "Gantt",
    hint: "Tasks on a timeline",
    body: "gantt\n    title Project plan\n    dateFormat YYYY-MM-DD\n    section Phase 1\n    Analysis :a1, 2026-01-01, 7d\n    Design   :after a1, 5d",
  },
  {
    label: "Pie",
    hint: "Proportions of a whole",
    body: 'pie title Time spent\n    "Coding" : 45\n    "Testing" : 30\n    "Docs" : 25',
  },
];

/**
 * A fenced mermaid block. A non-empty caption rides in the info string as a
 * quoted string (```mermaid "caption"```), which the build turns into a
 * numbered figure; quotes and backticks are dropped so they can't break the
 * fence or the caption parse.
 */
function diagramSnippet(body: string, caption: string): string {
  const clean = caption.replace(/["`]/g, "").trim();
  const fence = clean ? `\`\`\`mermaid "${clean}"` : "```mermaid";
  return `${fence}\n${body}\n\`\`\``;
}

/**
 * The editor-header insert actions. Figure: pick an image (or paste one into
 * the editor — both flows land in the store's pendingFigure), give it the
 * caption that becomes "Figure N: …" in the PDF, and the image lands in the
 * project's images folder. Code inserts a fenced block at the cursor; Diagram
 * opens a small picker of Mermaid starter blocks (flowchart, sequence, class,
 * …). The caption prompt is a deliberately tiny hand-rolled overlay —
 * one input, two buttons; shadcn/radix arrive when a dialog needs real
 * plumbing.
 */
export function InsertControls() {
  const pendingFigure = useStore((s) => s.pendingFigure);
  const requestFigure = useStore((s) => s.requestFigure);
  const cancelFigure = useStore((s) => s.cancelFigure);
  const hasReferences = useStore((s) => s.hasReferences);
  const [caption, setCaption] = useState("");
  const [figureWidth, setFigureWidth] = useState("");
  const [figureAlign, setFigureAlign] = useState<"left" | "center" | "right">("center");
  const [references, setReferences] = useState<BibEntry[] | null>(null);
  const [citationForm, setCitationForm] = useState<"parenthetical" | "narrative">("parenthetical");
  const [tableShape, setTableShape] = useState<{ rows: string; cols: string } | null>(null);
  const [diagramPicker, setDiagramPicker] = useState(false);
  const [diagramCaption, setDiagramCaption] = useState("");

  function insertDiagram(body: string) {
    setDiagramPicker(false);
    const snippet = diagramSnippet(body, diagramCaption);
    setDiagramCaption("");
    activeEditor()?.insertBlock(snippet);
  }

  async function openCitations() {
    setReferences(await useStore.getState().listReferences());
  }

  function insertCitation(key: string) {
    setReferences(null);
    // Parenthetical "(Author, year)" via [@key]; narrative "Author (year)"
    // via the bare @key form — both resolve to APA in the PDF.
    activeEditor()?.insertInline(citationForm === "narrative" ? `@${key}` : `[@${key}]`);
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

  // A new pending figure (picked or pasted) starts from its suggested caption
  // at full width.
  useEffect(() => {
    setCaption(pendingFigure?.suggestedCaption ?? "");
    setFigureWidth("");
    setFigureAlign("center");
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
    activeEditor()?.insertBlock(
      figureMarkdown(rel, caption.trim(), figureWidth.trim() || undefined, figureAlign),
    );
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
        title="Insert Diagram (Mermaid) — pick a kind"
        className={buttonCls}
        onClick={() => setDiagramPicker(true)}
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
          title="Insert Citation — an author-date reference from references.bib"
          className={buttonCls}
          onClick={() => void openCitations()}
        >
          Cite
        </button>
      )}

      {diagramPicker && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
          onClick={() => setDiagramPicker(false)}
          onKeyDown={(e) => {
            if (e.key === "Escape") setDiagramPicker(false);
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Insert Diagram"
            className="w-full max-w-lg rounded-lg border border-zinc-700 bg-zinc-900 p-4 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="pb-1 text-sm font-semibold text-zinc-100">Insert Diagram</div>
            <div className="pb-3 text-xs text-zinc-500">
              Pick a kind to insert a starter Mermaid block you then edit. Rendered to SVG in the
              preview and PDF.
            </div>
            <label className="block pb-3 text-xs text-zinc-500">
              Caption (optional) — makes it a numbered figure
              <input
                value={diagramCaption}
                onChange={(e) => setDiagramCaption(e.target.value)}
                placeholder="e.g. System architecture"
                className="mt-1 w-full rounded border border-zinc-700 bg-zinc-950 px-2.5 py-1.5 text-sm text-zinc-100 outline-none focus:border-zinc-500"
              />
            </label>
            <div className="max-h-72 overflow-y-auto">
              {DIAGRAM_TEMPLATES.map((d, i) => (
                <button
                  key={d.label}
                  autoFocus={i === 0}
                  onClick={() => insertDiagram(d.body)}
                  className="block w-full rounded px-2 py-1.5 text-left hover:bg-zinc-800"
                >
                  <span className="text-sm text-zinc-200">{d.label}</span>
                  <span className="ml-2 text-xs text-zinc-500">{d.hint}</span>
                </button>
              ))}
            </div>
            <div className="flex justify-end pt-3">
              <button
                onClick={() => {
                  setDiagramPicker(false);
                  setDiagramCaption("");
                }}
                className="rounded border border-zinc-700 px-3 py-1 text-sm text-zinc-300 hover:bg-zinc-800"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {tableShape !== null && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
          onClick={() => setTableShape(null)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Insert Table"
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
            role="dialog"
            aria-modal="true"
            aria-label="Insert Citation"
            className="w-full max-w-lg rounded-lg border border-zinc-700 bg-zinc-900 p-4 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="pb-1 text-sm font-semibold text-zinc-100">Insert Citation</div>
            <div className="pb-2 text-xs text-zinc-500">From references.bib — pick an entry to insert.</div>
            <div className="flex gap-1 pb-3 text-xs">
              {(
                [
                  ["parenthetical", "Parenthetical", "(Author, year)"],
                  ["narrative", "Narrative", "Author (year)"],
                ] as const
              ).map(([form, label, example]) => (
                <button
                  key={form}
                  onClick={() => setCitationForm(form)}
                  title={`Inserted as ${form === "narrative" ? "@key" : "[@key]"} → ${example}`}
                  className={`rounded border px-2 py-1 ${
                    citationForm === form
                      ? "border-sky-500 bg-sky-500/10 text-sky-200"
                      : "border-zinc-700 text-zinc-400 hover:bg-zinc-800"
                  }`}
                >
                  {label} <span className="text-zinc-500">{example}</span>
                </button>
              ))}
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
                    <span className="text-sm text-sky-300">
                      {citationForm === "narrative" ? `@${r.key}` : `[@${r.key}]`}
                    </span>
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
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Figure caption"
            className="w-full max-w-md rounded-lg border border-zinc-700 bg-zinc-900 p-4 shadow-xl"
          >
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
            <label className="mt-3 block text-xs text-zinc-500">
              Width (optional) — e.g. 60% or 8cm; blank fits the page
              <input
                value={figureWidth}
                onChange={(e) => setFigureWidth(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") void confirmFigure();
                  if (e.key === "Escape") cancelFigure();
                }}
                placeholder="100%"
                className="mt-1 w-full rounded border border-zinc-700 bg-zinc-950 px-2.5 py-1.5 text-sm text-zinc-100 outline-none focus:border-zinc-500"
              />
            </label>
            <div className="mt-3 text-xs text-zinc-500">
              Alignment
              <div className="mt-1 flex gap-1">
                {(["left", "center", "right"] as const).map((a) => (
                  <button
                    key={a}
                    onClick={() => setFigureAlign(a)}
                    className={`flex-1 rounded border px-2 py-1 capitalize ${
                      figureAlign === a
                        ? "border-sky-500 bg-sky-500/10 text-sky-200"
                        : "border-zinc-700 text-zinc-400 hover:bg-zinc-800"
                    }`}
                  >
                    {a}
                  </button>
                ))}
              </div>
            </div>
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
