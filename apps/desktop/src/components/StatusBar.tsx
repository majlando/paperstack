import { useStore } from "../store.ts";

export function StatusBar() {
  const counts = useStore((s) => s.counts);
  const activeFile = useStore((s) => s.activeFile);
  const dirty = useStore((s) => s.dirty);

  if (!counts) return null;

  const active = counts.sections.find((s) => s.file === activeFile);
  const over = counts.overCap;

  return (
    <footer className="flex h-7 shrink-0 items-center gap-4 border-t border-zinc-800 bg-zinc-900 px-4 text-xs text-zinc-400">
      <span className={over ? "font-semibold text-red-400" : ""}>
        Body: {counts.bodyNormalsider.toFixed(2)} / {counts.cap} normalsider
        {over && " — over the cap"}
      </span>
      {counts.todosTotal > 0 && (
        <span className="text-amber-400">{counts.todosTotal} TODO</span>
      )}
      <span className="ml-auto flex items-center gap-3">
        {active && (
          <span>
            This section: {active.normalsider.toFixed(2)} ns
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
