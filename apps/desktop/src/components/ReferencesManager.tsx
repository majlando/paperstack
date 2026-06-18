import { useEffect, useState } from "react";
import type { BibRecord } from "@paperstack/engine";
import { useStore } from "../store.ts";

const TYPES = ["article", "book", "inproceedings", "online", "techreport", "thesis", "misc"];
// Common fields the form exposes; the user fills what applies to the type.
const FIELDS = [
  ["author", "Author(s)"],
  ["title", "Title"],
  ["year", "Year"],
  ["journal", "Journal"],
  ["booktitle", "Book / proceedings title"],
  ["publisher", "Publisher"],
  ["url", "URL"],
  ["doi", "DOI"],
  ["pages", "Pages"],
  ["note", "Note"],
] as const;

type Draft = { key: string; type: string } & Record<string, string>;

function emptyDraft(): Draft {
  const d: Draft = { key: "", type: "article" };
  for (const [name] of FIELDS) d[name] = "";
  return d;
}

function toDraft(r: BibRecord): Draft {
  const d: Draft = { key: r.key, type: r.type };
  for (const [name] of FIELDS) d[name] = r.fields.find((f) => f.name === name)?.value ?? "";
  return d;
}

function toRecord(d: Draft): BibRecord {
  return {
    key: d.key.trim(),
    type: d.type,
    fields: FIELDS.map(([name]) => ({ name, value: d[name] ?? "" })).filter((f) => f.value.trim() !== ""),
  };
}

const inputCls =
  "w-full rounded border border-zinc-700 bg-zinc-950 px-2.5 py-1.5 text-sm text-zinc-100 outline-none focus:border-zinc-500";

/**
 * Manage references.bib through a form instead of hand-editing BibTeX: list,
 * add, edit, and delete entries. Keys are inserted as `[@key]` from Insert
 * Citation; here you maintain the entries those keys resolve to.
 */
export function ReferencesManager(props: { onClose: () => void }) {
  const [records, setRecords] = useState<BibRecord[] | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  async function reload() {
    setRecords(await useStore.getState().listReferenceRecords());
  }
  useEffect(() => {
    void reload();
  }, []);

  async function save() {
    if (!draft || draft.key.trim() === "") return;
    if (await useStore.getState().saveReference(toRecord(draft))) {
      setDraft(null);
      void reload();
    }
  }

  async function del(key: string) {
    setConfirmDelete(null);
    if (await useStore.getState().deleteReference(key)) void reload();
  }

  const editing = draft !== null;
  const knownKeys = new Set((records ?? []).map((r) => r.key));
  const isNewKey = draft !== null && !knownKeys.has(draft.key.trim());

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
      onClick={props.onClose}
      onKeyDown={(e) => {
        if (e.key === "Escape") (editing ? setDraft(null) : props.onClose());
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="References"
        className="flex max-h-[80vh] w-full max-w-2xl flex-col rounded-lg border border-zinc-700 bg-zinc-900 p-4 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between pb-3">
          <div className="text-sm font-semibold text-zinc-100">
            {editing ? (isNewKey ? "Add reference" : `Edit ${draft!.key}`) : "References"}
          </div>
          {!editing && (
            <button
              onClick={() => setDraft(emptyDraft())}
              className="rounded bg-blue-600 px-3 py-1 text-sm font-medium text-white hover:bg-blue-500"
            >
              Add reference
            </button>
          )}
        </div>

        {editing ? (
          <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto pr-1">
            <div className="flex gap-2">
              <label className="w-40 text-xs text-zinc-500">
                Type
                <select
                  value={draft!.type}
                  onChange={(e) => setDraft({ ...draft!, type: e.target.value })}
                  className={inputCls}
                >
                  {TYPES.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex-1 text-xs text-zinc-500">
                Citation key — used as [@key]
                <input
                  autoFocus
                  value={draft!.key}
                  onChange={(e) => setDraft({ ...draft!, key: e.target.value.replace(/\s/g, "") })}
                  placeholder="e.g. knuth84"
                  className={inputCls}
                />
              </label>
            </div>
            {FIELDS.map(([name, label]) => (
              <label key={name} className="text-xs text-zinc-500">
                {label}
                <input
                  value={draft![name] ?? ""}
                  onChange={(e) => setDraft({ ...draft!, [name]: e.target.value })}
                  className={inputCls}
                />
              </label>
            ))}
          </div>
        ) : records === null ? (
          <div className="py-4 text-sm text-zinc-500">Loading…</div>
        ) : records.length === 0 ? (
          <div className="py-4 text-sm text-zinc-500">
            No references yet. Add one — it activates [@key] citations and the bibliography.
          </div>
        ) : (
          <div className="min-h-0 flex-1 overflow-y-auto">
            {records.map((r) => {
              const f = (n: string) => r.fields.find((x) => x.name === n)?.value;
              return (
                <div key={r.key} className="group flex items-center gap-2 rounded px-2 py-1.5 hover:bg-zinc-800">
                  <div className="min-w-0 flex-1">
                    <span className="text-sm text-sky-300">[{r.key}]</span>
                    <span className="ml-2 text-sm text-zinc-300">{f("title") ?? "(no title)"}</span>
                    <div className="truncate text-xs text-zinc-500">
                      {[f("author"), f("year"), r.type].filter(Boolean).join(" · ")}
                    </div>
                  </div>
                  {confirmDelete === r.key ? (
                    <span className="flex shrink-0 items-center gap-1 text-xs">
                      <button onClick={() => void del(r.key)} className="rounded bg-red-600/80 px-1.5 text-white">
                        Delete
                      </button>
                      <button onClick={() => setConfirmDelete(null)} className="text-zinc-400">
                        Cancel
                      </button>
                    </span>
                  ) : (
                    <span className="hidden shrink-0 gap-1 text-xs text-zinc-400 group-hover:flex">
                      <button onClick={() => setDraft(toDraft(r))} className="rounded px-1.5 py-0.5 hover:bg-zinc-700">
                        Edit
                      </button>
                      <button onClick={() => setConfirmDelete(r.key)} className="rounded px-1.5 py-0.5 hover:bg-zinc-700">
                        Delete
                      </button>
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        )}

        <div className="flex justify-end gap-2 pt-3">
          {editing ? (
            <>
              <button
                onClick={() => setDraft(null)}
                className="rounded border border-zinc-700 px-3 py-1 text-sm text-zinc-300 hover:bg-zinc-800"
              >
                Cancel
              </button>
              <button
                onClick={() => void save()}
                disabled={draft!.key.trim() === ""}
                className="rounded bg-blue-600 px-3 py-1 text-sm font-medium text-white hover:bg-blue-500 disabled:opacity-40"
              >
                Save reference
              </button>
            </>
          ) : (
            <button
              onClick={props.onClose}
              className="rounded border border-zinc-700 px-3 py-1 text-sm text-zinc-300 hover:bg-zinc-800"
            >
              Close
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
