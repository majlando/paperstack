import { useEffect, useRef, useState, type ReactNode } from "react";
import { convertFileSrc } from "@tauri-apps/api/core";
import { useStore, type ProjectSearchMatch } from "../store.ts";
import { activeEditor } from "../editor/editor-registry.ts";
import { baseOf, documentOutline, type SectionCount, type SectionRole } from "@paperstack/engine";
import { FileTree } from "./FileTree.tsx";
import { ReferencesManager } from "./ReferencesManager.tsx";

const GROUPS: { role: SectionRole; label: string; addHint: string }[] = [
  { role: "front-matter", label: "Front matter", addHint: "Add front matter" },
  { role: "body", label: "Sections", addHint: "Add a section" },
  { role: "back-matter", label: "Back matter", addHint: "Add back matter" },
  { role: "appendix", label: "Appendices", addHint: "Add an appendix" },
];

/** "sections/02-implementation.md" → "02-implementation" (what rename edits). */
function fileStem(file: string): string {
  return baseOf(file).replace(/\.md$/i, "");
}

function displayName(file: string): string {
  return fileStem(file)
    .replace(/^\d+[-_]?/, "")
    .replace(/^appendix-[a-z][-_]?/, "")
    .replace(/-/g, " ");
}

/**
 * What to call a section in the sidebar and search results: the file's own
 * `# heading` (live — editing the heading renames the entry), falling back
 * to the de-slugged file name for files without one. Only the fallback is
 * CSS-capitalized; a real title already carries the author's casing.
 */
function sectionLabel(
  file: string,
  count: SectionCount | undefined,
): { text: string; capitalized: boolean } {
  const title = count?.title;
  return title ? { text: title, capitalized: false } : { text: displayName(file), capitalized: true };
}

function ActionButton(props: { title: string; onClick: () => void; children: ReactNode }) {
  return (
    <button
      title={props.title}
      aria-label={props.title}
      onClick={props.onClick}
      className="rounded px-1 py-0.5 hover:bg-zinc-700 hover:text-zinc-100"
    >
      {props.children}
    </button>
  );
}

/**
 * 24×24 stroke icon (Lucide outlines, vendored as paths — no icon package;
 * see "React, used thin"). Emoji glyphs rendered inconsistently here: the
 * magnifier came out in color while its neighbors stayed monochrome.
 */
function Icon(props: { children: ReactNode }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className="h-4 w-4"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {props.children}
    </svg>
  );
}

const searchIcon = (
  <Icon>
    <circle cx="11" cy="11" r="8" />
    <path d="m21 21-4.3-4.3" />
  </Icon>
);
const detailsIcon = (
  <Icon>
    <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
    <circle cx="12" cy="12" r="3" />
  </Icon>
);
const reloadIcon = (
  <Icon>
    <path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8" />
    <path d="M21 3v5h-5" />
  </Icon>
);
const switchIcon = (
  <Icon>
    <path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z" />
  </Icon>
);
const referencesIcon = (
  <Icon>
    <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
    <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
  </Icon>
);

/**
 * The active section's sub-headings (everything after its title), indented by
 * level and click-to-jump in the editor — an outline for navigating a long
 * section without scrolling.
 */
function SectionOutline(props: { content: string }) {
  const items = documentOutline(props.content).slice(1);
  if (items.length === 0) return null;
  return (
    <div className="pb-1">
      {items.map((h, i) => (
        <button
          key={`${i}-${h.offset}`}
          onClick={() => activeEditor()?.select(h.offset, h.offset)}
          style={{ paddingLeft: `${(h.depth - 1) * 10 + 28}px` }}
          className="block w-full truncate py-0.5 pr-2 text-left text-xs text-zinc-500 hover:bg-zinc-800 hover:text-zinc-300"
        >
          {h.text}
        </button>
      ))}
    </div>
  );
}

/**
 * Uncontrolled one-line input: Enter or leaving the field commits (clicking
 * elsewhere must not silently discard what was typed), Escape cancels.
 */
function InlineInput(props: {
  placeholder?: string;
  defaultValue?: string;
  onCommit: (value: string) => void;
  onClose: () => void;
}) {
  // Enter/Escape close the input, which fires a blur on unmount — `settled`
  // keeps that trailing blur from committing (or double-committing).
  const settled = useRef(false);
  const finish = (commit: boolean, value: string) => {
    if (settled.current) return;
    settled.current = true;
    const trimmed = value.trim();
    if (commit && trimmed) props.onCommit(trimmed);
    props.onClose();
  };
  return (
    <div className="px-4 py-1">
      <input
        autoFocus
        defaultValue={props.defaultValue}
        placeholder={props.placeholder}
        onKeyDown={(e) => {
          if (e.key === "Enter") finish(true, e.currentTarget.value);
          else if (e.key === "Escape") finish(false, "");
        }}
        onBlur={(e) => finish(true, e.currentTarget.value)}
        className="w-full rounded border border-zinc-600 bg-zinc-800 px-2 py-1 text-sm text-zinc-100 outline-none placeholder:text-zinc-600"
      />
    </div>
  );
}

/** Select the match in the editor, switching sections first when needed. */
async function jumpToMatch(match: ProjectSearchMatch, length: number): Promise<void> {
  const { activeFile, openSection } = useStore.getState();
  const select = () => activeEditor()?.select(match.offset, match.offset + length);
  if (activeFile === match.file) {
    select();
    return;
  }
  await openSection(match.file);
  // same deferred-select pattern as the TODO jump: wait for the editor to
  // receive the newly opened section before selecting into it
  setTimeout(select, 50);
}

function SearchPanel(props: { onClose: () => void }) {
  const searchProject = useStore((s) => s.searchProject);
  const counts = useStore((s) => s.counts);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<ProjectSearchMatch[]>([]);
  const [replacement, setReplacement] = useState("");
  const [summary, setSummary] = useState<string | null>(null);
  const seq = useRef(0);

  // Debounced live search; a stale (slower) search must not overwrite a newer one.
  useEffect(() => {
    const mine = ++seq.current;
    setSummary(null);
    const t = setTimeout(() => {
      void searchProject(query).then((r) => {
        if (seq.current === mine) setResults(r);
      });
    }, 200);
    return () => clearTimeout(t);
  }, [query, searchProject]);

  async function replaceAll() {
    const { sections, count } = await useStore.getState().replaceAll(query, replacement);
    setResults(await useStore.getState().searchProject(query));
    setSummary(
      count === 0
        ? "Nothing replaced."
        : `Replaced ${count} match${count === 1 ? "" : "es"} in ${sections} section${sections === 1 ? "" : "s"}.`,
    );
  }

  const grouped = new Map<string, ProjectSearchMatch[]>();
  for (const m of results) {
    const list = grouped.get(m.file) ?? [];
    list.push(m);
    grouped.set(m.file, list);
  }

  return (
    <div className="border-b border-zinc-800">
      <div className="flex flex-col gap-1.5 px-4 py-2">
        <input
          autoFocus
          value={query}
          placeholder="Search all sections"
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Escape") props.onClose();
          }}
          className="w-full rounded border border-zinc-600 bg-zinc-800 px-2 py-1 text-sm text-zinc-100 outline-none placeholder:text-zinc-600"
        />
        <div className="flex gap-1.5">
          <input
            value={replacement}
            placeholder="Replace with"
            onChange={(e) => setReplacement(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape") props.onClose();
            }}
            className="min-w-0 flex-1 rounded border border-zinc-600 bg-zinc-800 px-2 py-1 text-sm text-zinc-100 outline-none placeholder:text-zinc-600"
          />
          <button
            disabled={results.length === 0}
            onClick={() => void replaceAll()}
            title="Replace every match, in all sections — saved immediately"
            className="shrink-0 rounded border border-zinc-600 px-2 py-1 text-xs text-zinc-300 hover:bg-zinc-800 disabled:opacity-40"
          >
            Replace all
          </button>
        </div>
        {summary && <div className="text-xs text-zinc-500">{summary}</div>}
      </div>
      {query.trim() !== "" && (
        <div className="max-h-72 overflow-y-auto pb-2">
          {results.length === 0 && (
            <div className="px-4 py-1 text-xs text-zinc-500">No matches.</div>
          )}
          {[...grouped].map(([file, matches]) => (
            <div key={file}>
              <div className="px-4 pt-1 text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
                {sectionLabel(file, counts?.sections.find((c) => c.file === file)).text}
              </div>
              {matches.map((m) => {
                // keep the match visible even when it sits deep in a long line
                const start = m.column > 32 ? m.column - 24 : 0;
                const preview = (start > 0 ? "…" : "") + m.preview.slice(start);
                const at = m.column - start + (start > 0 ? 1 : 0);
                return (
                  <button
                    key={`${m.offset}-${m.line}-${m.column}`}
                    onClick={() => void jumpToMatch(m, query.length)}
                    title={`Line ${m.line}`}
                    className="block w-full truncate px-4 py-0.5 text-left text-xs text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200"
                  >
                    {preview.slice(0, at)}
                    <span className="rounded-sm bg-amber-500/30 text-amber-200">
                      {preview.slice(at, at + query.length)}
                    </span>
                    {preview.slice(at + query.length)}
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function Sidebar() {
  const project = useStore((s) => s.project);
  const counts = useStore((s) => s.counts);
  const activeFile = useStore((s) => s.activeFile);
  const content = useStore((s) => s.content);
  const changedOnDisk = useStore((s) => s.changedOnDisk);
  const building = useStore((s) => s.building);
  const openSection = useStore((s) => s.openSection);
  const reloadProject = useStore((s) => s.reloadProject);
  const closeProject = useStore((s) => s.closeProject);
  const openMetadata = useStore((s) => s.openMetadata);
  const addSection = useStore((s) => s.addSection);
  const removeSection = useStore((s) => s.removeSection);
  const moveSection = useStore((s) => s.moveSection);
  const renameSection = useStore((s) => s.renameSection);

  const [adding, setAdding] = useState<SectionRole | null>(null);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [confirmRemove, setConfirmRemove] = useState<string | null>(null);
  const [searching, setSearching] = useState(false);
  const [view, setView] = useState<"sections" | "files">("sections");
  const [managingRefs, setManagingRefs] = useState(false);

  // Writers expect the IDE shortcuts: Ctrl+Shift+F for project-wide search,
  // Ctrl+PageUp/PageDown to walk the sections in report order.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === "f") {
        e.preventDefault();
        setView("sections");
        setSearching(true);
        return;
      }
      if ((e.ctrlKey || e.metaKey) && (e.key === "PageUp" || e.key === "PageDown")) {
        e.preventDefault();
        void useStore.getState().gotoAdjacentSection(e.key === "PageDown" ? "next" : "prev");
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  if (!project) return null;

  return (
    <aside className="w-64 shrink-0 overflow-y-auto border-r border-zinc-800 bg-zinc-900 text-zinc-300">
      <div className="flex items-start justify-between gap-2 px-4 py-3 border-b border-zinc-800">
        <div className="flex min-w-0 items-start gap-2">
          {/* Cover logo from document.yaml — the one image on the front page. */}
          {project.meta.logo && (
            <img
              src={convertFileSrc(`${project.dir}/${project.meta.logo}`)}
              alt="Cover logo"
              title={`Cover logo — ${project.meta.logo}`}
              onError={(e) => {
                e.currentTarget.style.display = "none";
              }}
              className="mt-0.5 h-8 w-8 shrink-0 rounded border border-zinc-800 bg-white/5 object-contain"
            />
          )}
          <div className="min-w-0">
            <div className="font-semibold text-zinc-100 truncate" title={project.meta.title}>
              {project.meta.title}
            </div>
            <div className="text-xs text-zinc-500 truncate">{project.dir}</div>
          </div>
        </div>
        <span className="flex shrink-0 gap-0.5">
          <button
            onClick={() => {
              setView("sections");
              setSearching((s) => !s);
            }}
            title="Search all sections (Ctrl+Shift+F)"
            aria-label="Search all sections"
            className={`rounded px-1.5 py-1 hover:bg-zinc-800 hover:text-zinc-200 ${
              searching ? "text-zinc-200" : "text-zinc-500"
            }`}
          >
            {searchIcon}
          </button>
          <button
            onClick={() => void openMetadata()}
            title="Report details — title, authors, language, length cap"
            aria-label="Report details"
            className="rounded px-1.5 py-1 text-zinc-500 hover:bg-zinc-800 hover:text-zinc-200"
          >
            {detailsIcon}
          </button>
          <button
            onClick={() => setManagingRefs(true)}
            title="References — add, edit, and organise references.bib"
            aria-label="References"
            className="rounded px-1.5 py-1 text-zinc-500 hover:bg-zinc-800 hover:text-zinc-200"
          >
            {referencesIcon}
          </button>
          <button
            onClick={() => void reloadProject()}
            title="Reload project — pick up changes made outside Paperstack (e.g. after a git pull)"
            aria-label="Reload project"
            className="rounded px-1.5 py-1 text-zinc-500 hover:bg-zinc-800 hover:text-zinc-200"
          >
            {reloadIcon}
          </button>
          <button
            onClick={() => void closeProject()}
            disabled={building}
            title="Switch report — back to the start screen to open or create another"
            aria-label="Switch report"
            className="rounded px-1.5 py-1 text-zinc-500 hover:bg-zinc-800 hover:text-zinc-200 disabled:opacity-40"
          >
            {switchIcon}
          </button>
        </span>
      </div>
      <div className="flex gap-1 px-3 pt-2 text-xs">
        {(["sections", "files"] as const).map((v) => (
          <button
            key={v}
            onClick={() => setView(v)}
            className={`flex-1 rounded px-2 py-1 capitalize ${
              view === v
                ? "bg-zinc-700/70 text-zinc-100"
                : "text-zinc-500 hover:bg-zinc-800 hover:text-zinc-300"
            }`}
          >
            {v}
          </button>
        ))}
      </div>
      {view === "files" ? (
        <FileTree
          projectDir={project.dir}
          sectionFiles={new Set(project.meta.sections.map((s) => s.file))}
          onOpenSection={(f) => void openSection(f)}
        />
      ) : (
        <>
          {searching && <SearchPanel onClose={() => setSearching(false)} />}
          {GROUPS.map(({ role, label, addHint }) => {
        const sections = project.meta.sections.filter((s) => s.role === role);
        return (
          <div key={role} className="py-2">
            <div className="flex items-center justify-between px-4 pb-1">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
                {label}
              </span>
              <button
                title={addHint}
                onClick={() => setAdding(role)}
                className="rounded px-1.5 text-zinc-500 hover:bg-zinc-800 hover:text-zinc-200"
              >
                +
              </button>
            </div>
            {sections.map((s) => {
              const count = counts?.sections.find((c) => c.file === s.file);
              const active = s.file === activeFile;
              const label = sectionLabel(s.file, count);

              if (renaming === s.file) {
                return (
                  <InlineInput
                    key={s.file}
                    defaultValue={fileStem(s.file)}
                    onCommit={(stem) => void renameSection(s.file, stem)}
                    onClose={() => setRenaming(null)}
                  />
                );
              }
              if (confirmRemove === s.file) {
                return (
                  <div key={s.file} className="px-4 py-1.5 text-xs">
                    <div className="pb-1 text-zinc-400">
                      Remove from the report? The file stays on disk.
                    </div>
                    <div className="flex gap-1.5">
                      <button
                        onClick={() => {
                          setConfirmRemove(null);
                          void removeSection(s.file);
                        }}
                        className="rounded bg-red-900/60 px-2 py-0.5 text-red-200 hover:bg-red-900"
                      >
                        Remove
                      </button>
                      <button
                        onClick={() => setConfirmRemove(null)}
                        className="rounded px-2 py-0.5 text-zinc-400 hover:bg-zinc-800"
                      >
                        Keep
                      </button>
                    </div>
                  </div>
                );
              }
              return (
                <div key={s.file}>
                <div
                  className={`group flex items-center ${
                    active ? "bg-zinc-700/60" : "hover:bg-zinc-800"
                  }`}
                >
                  <button
                    onClick={() => void openSection(s.file)}
                    title={s.file}
                    className={`min-w-0 flex-1 px-4 py-1.5 text-left text-sm ${
                      label.capitalized ? "capitalize" : ""
                    } ${active ? "text-white" : "text-zinc-300"}`}
                  >
                    <span className="flex min-w-0 items-center gap-1.5">
                      <span className="truncate">{label.text}</span>
                      {changedOnDisk.includes(s.file) && (
                        <span
                          title="Changed on disk since you last opened it — e.g. a git pull or another editor"
                          className="h-1.5 w-1.5 shrink-0 rounded-full bg-sky-400"
                        />
                      )}
                    </span>
                  </button>
                  {count && count.todos > 0 && (
                    <span className="mr-2 shrink-0 rounded bg-amber-500/20 px-1.5 text-[10px] font-medium text-amber-400 group-hover:hidden">
                      {count.todos} TODO
                    </span>
                  )}
                  {count && count.role === "body" && (
                    <span
                      title={`${count.normalsider.toFixed(2)} normalsider — counts toward the cap`}
                      className="mr-2 shrink-0 text-[10px] tabular-nums text-zinc-600 group-hover:hidden"
                    >
                      {count.normalsider.toFixed(1)}
                    </span>
                  )}
                  <span className="mr-2 hidden shrink-0 items-center gap-0.5 text-zinc-500 group-hover:flex">
                    <ActionButton title="Move up" onClick={() => void moveSection(s.file, "up")}>
                      ↑
                    </ActionButton>
                    <ActionButton title="Move down" onClick={() => void moveSection(s.file, "down")}>
                      ↓
                    </ActionButton>
                    <ActionButton title="Rename file" onClick={() => setRenaming(s.file)}>
                      ✎
                    </ActionButton>
                    <ActionButton
                      title="Remove from report"
                      onClick={() => setConfirmRemove(s.file)}
                    >
                      ✕
                    </ActionButton>
                  </span>
                </div>
                {active && <SectionOutline content={content} />}
                </div>
              );
            })}
            {adding === role && (
              <InlineInput
                placeholder="Section title"
                onCommit={(name) => void addSection(role, name)}
                onClose={() => setAdding(null)}
              />
            )}
          </div>
        );
      })}
        </>
      )}
      {managingRefs && <ReferencesManager onClose={() => setManagingRefs(false)} />}
    </aside>
  );
}
