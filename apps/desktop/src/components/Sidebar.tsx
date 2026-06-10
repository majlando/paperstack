import { useState, type ReactNode } from "react";
import { useStore } from "../store.ts";
import type { SectionRole } from "@paperstack/engine";

const GROUPS: { role: SectionRole; label: string; addHint: string }[] = [
  { role: "front-matter", label: "Front matter", addHint: "Add front matter" },
  { role: "body", label: "Sections", addHint: "Add a section" },
  { role: "back-matter", label: "Back matter", addHint: "Add back matter" },
  { role: "appendix", label: "Appendices", addHint: "Add an appendix" },
];

/** "sections/02-implementation.md" → "02-implementation" (what rename edits). */
function fileStem(file: string): string {
  return file.slice(file.lastIndexOf("/") + 1).replace(/\.md$/i, "");
}

function displayName(file: string): string {
  return fileStem(file)
    .replace(/^\d+[-_]?/, "")
    .replace(/^appendix-[a-z][-_]?/, "")
    .replace(/-/g, " ");
}

function ActionButton(props: { title: string; onClick: () => void; children: ReactNode }) {
  return (
    <button
      title={props.title}
      onClick={props.onClick}
      className="rounded px-1 py-0.5 hover:bg-zinc-700 hover:text-zinc-100"
    >
      {props.children}
    </button>
  );
}

/** Uncontrolled one-line input: Enter commits, Escape or leaving cancels. */
function InlineInput(props: {
  placeholder?: string;
  defaultValue?: string;
  onCommit: (value: string) => void;
  onClose: () => void;
}) {
  return (
    <div className="px-4 py-1">
      <input
        autoFocus
        defaultValue={props.defaultValue}
        placeholder={props.placeholder}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            const value = e.currentTarget.value.trim();
            if (value) props.onCommit(value);
            props.onClose();
          } else if (e.key === "Escape") {
            props.onClose();
          }
        }}
        onBlur={props.onClose}
        className="w-full rounded border border-zinc-600 bg-zinc-800 px-2 py-1 text-sm text-zinc-100 outline-none placeholder:text-zinc-600"
      />
    </div>
  );
}

export function Sidebar() {
  const project = useStore((s) => s.project);
  const counts = useStore((s) => s.counts);
  const activeFile = useStore((s) => s.activeFile);
  const openSection = useStore((s) => s.openSection);
  const reloadProject = useStore((s) => s.reloadProject);
  const openMetadata = useStore((s) => s.openMetadata);
  const addSection = useStore((s) => s.addSection);
  const removeSection = useStore((s) => s.removeSection);
  const moveSection = useStore((s) => s.moveSection);
  const renameSection = useStore((s) => s.renameSection);

  const [adding, setAdding] = useState<SectionRole | null>(null);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [confirmRemove, setConfirmRemove] = useState<string | null>(null);

  if (!project) return null;

  return (
    <aside className="w-64 shrink-0 overflow-y-auto border-r border-zinc-800 bg-zinc-900 text-zinc-300">
      <div className="flex items-start justify-between gap-2 px-4 py-3 border-b border-zinc-800">
        <div className="min-w-0">
          <div className="font-semibold text-zinc-100 truncate" title={project.meta.title}>
            {project.meta.title}
          </div>
          <div className="text-xs text-zinc-500 truncate">{project.dir}</div>
        </div>
        <span className="flex shrink-0 gap-0.5">
          <button
            onClick={() => void openMetadata()}
            title="Report details — title, authors, language, length cap"
            className="rounded px-1.5 py-0.5 text-zinc-500 hover:bg-zinc-800 hover:text-zinc-200"
          >
            ⚙
          </button>
          <button
            onClick={() => void reloadProject()}
            title="Reload project — pick up changes made outside Paperstack (e.g. after a git pull)"
            className="rounded px-1.5 py-0.5 text-zinc-500 hover:bg-zinc-800 hover:text-zinc-200"
          >
            ⟳
          </button>
        </span>
      </div>
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
                <div
                  key={s.file}
                  className={`group flex items-center ${
                    active ? "bg-zinc-700/60" : "hover:bg-zinc-800"
                  }`}
                >
                  <button
                    onClick={() => void openSection(s.file)}
                    className={`min-w-0 flex-1 px-4 py-1.5 text-left text-sm capitalize ${
                      active ? "text-white" : "text-zinc-300"
                    }`}
                  >
                    <span className="block truncate">{displayName(s.file)}</span>
                  </button>
                  {count && count.todos > 0 && (
                    <span className="mr-2 shrink-0 rounded bg-amber-500/20 px-1.5 text-[10px] font-medium text-amber-400 group-hover:hidden">
                      {count.todos} TODO
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
    </aside>
  );
}
