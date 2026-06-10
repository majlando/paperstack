import { useStore } from "../store.ts";
import type { SectionRole } from "@paperstack/engine";

const GROUPS: { role: SectionRole; label: string }[] = [
  { role: "front-matter", label: "Front matter" },
  { role: "body", label: "Sections" },
  { role: "back-matter", label: "Back matter" },
  { role: "appendix", label: "Appendices" },
];

function displayName(file: string): string {
  const base = file.slice(file.lastIndexOf("/") + 1).replace(/\.md$/i, "");
  return base.replace(/^\d+[-_]?/, "").replace(/^appendix-[a-z][-_]?/, "").replace(/-/g, " ");
}

export function Sidebar() {
  const project = useStore((s) => s.project);
  const counts = useStore((s) => s.counts);
  const activeFile = useStore((s) => s.activeFile);
  const openSection = useStore((s) => s.openSection);
  const reloadProject = useStore((s) => s.reloadProject);

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
        <button
          onClick={() => void reloadProject()}
          title="Reload project — pick up changes made outside Paperstack (e.g. after a git pull)"
          className="shrink-0 rounded px-1.5 py-0.5 text-zinc-500 hover:bg-zinc-800 hover:text-zinc-200"
        >
          ⟳
        </button>
      </div>
      {GROUPS.map(({ role, label }) => {
        const sections = project.meta.sections.filter((s) => s.role === role);
        if (sections.length === 0) return null;
        return (
          <div key={role} className="py-2">
            <div className="px-4 pb-1 text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
              {label}
            </div>
            {sections.map((s) => {
              const count = counts?.sections.find((c) => c.file === s.file);
              const active = s.file === activeFile;
              return (
                <button
                  key={s.file}
                  onClick={() => void openSection(s.file)}
                  className={`flex w-full items-center justify-between px-4 py-1.5 text-left text-sm capitalize ${
                    active ? "bg-zinc-700/60 text-white" : "hover:bg-zinc-800 text-zinc-300"
                  }`}
                >
                  <span className="truncate">{displayName(s.file)}</span>
                  {count && count.todos > 0 && (
                    <span className="ml-2 shrink-0 rounded bg-amber-500/20 px-1.5 text-[10px] font-medium text-amber-400">
                      {count.todos} TODO
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        );
      })}
    </aside>
  );
}
