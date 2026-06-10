import { useEffect, useRef } from "react";
import { useStore } from "../store.ts";

/**
 * Plain-textarea editor as the Milestone 2 starting point — replaced by the
 * CodeMirror 6 wrapper next. Autosaves 800 ms after the last keystroke.
 */
export function Editor() {
  const activeFile = useStore((s) => s.activeFile);
  const content = useStore((s) => s.content);
  const setContent = useStore((s) => s.setContent);
  const saveActive = useStore((s) => s.saveActive);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  if (!activeFile) {
    return (
      <div className="flex flex-1 items-center justify-center text-zinc-600">
        Select a section to start writing
      </div>
    );
  }

  return (
    <div className="flex min-w-0 flex-1 flex-col">
      <div className="border-b border-zinc-800 bg-zinc-900/60 px-4 py-1.5 text-xs text-zinc-500">
        {activeFile}
      </div>
      <textarea
        className="flex-1 resize-none bg-zinc-950 p-4 font-mono text-sm leading-relaxed text-zinc-200 outline-none"
        value={content}
        spellCheck={false}
        onChange={(e) => {
          setContent(e.target.value);
          if (timer.current) clearTimeout(timer.current);
          timer.current = setTimeout(() => void saveActive(), 800);
        }}
        onBlur={() => void saveActive()}
      />
    </div>
  );
}
