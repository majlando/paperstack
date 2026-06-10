import { findTodoOffsets } from "@paperstack/engine";
import { useStore } from "../store.ts";
import { activeEditor } from "../editor/editor-registry.ts";

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
        <button
          onClick={() => void jumpToNextTodo()}
          title="Jump to the next [TODO]"
          className="rounded px-1 text-amber-400 hover:bg-zinc-800 hover:text-amber-300"
        >
          {counts.todosTotal} TODO
        </button>
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
