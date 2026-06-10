import { useEffect, useRef } from "react";
import { useStore } from "../store.ts";
import { MarkdownEditor } from "../editor/markdown-editor.ts";
import { registerEditor } from "../editor/editor-registry.ts";

/**
 * Thin React bridge for the vanilla-TS CodeMirror wrapper: mounts it once
 * via a ref, pushes store content in only when it changed outside the
 * editor (contentVersion), and forwards edits to the store. Autosaves
 * 800 ms after the last keystroke and on blur.
 */
export function Editor() {
  const activeFile = useStore((s) => s.activeFile);
  const contentVersion = useStore((s) => s.contentVersion);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const editorRef = useRef<MarkdownEditor | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;
    const editor = new MarkdownEditor(containerRef.current, {
      doc: useStore.getState().content,
      onChange: (doc) => {
        useStore.getState().setContent(doc);
        if (timer.current) clearTimeout(timer.current);
        timer.current = setTimeout(() => void useStore.getState().saveActive(), 800);
      },
      onBlur: () => void useStore.getState().saveActive(),
    });
    editorRef.current = editor;
    registerEditor(editor);
    return () => {
      if (timer.current) clearTimeout(timer.current);
      registerEditor(null);
      editor.destroy();
      editorRef.current = null;
    };
  }, []);

  // Content was replaced from outside the editor (section switch, reload).
  // Only grab focus when the user moved to a different section — a project
  // reload with the same section open must not steal focus.
  const lastFocusedFile = useRef<string | null>(null);
  useEffect(() => {
    const editor = editorRef.current;
    if (!editor) return;
    editor.setDoc(useStore.getState().content);
    const file = useStore.getState().activeFile;
    if (file && file !== lastFocusedFile.current) editor.focus();
    lastFocusedFile.current = file;
  }, [contentVersion]);

  return (
    <div className="relative flex min-w-0 flex-1 flex-col">
      <div className="border-b border-zinc-800 bg-zinc-900/60 px-4 py-1.5 text-xs text-zinc-500">
        {activeFile ?? "no section open"}
      </div>
      <div ref={containerRef} className="min-h-0 flex-1 bg-zinc-950" />
      {!activeFile && (
        <div className="absolute inset-0 top-7 flex items-center justify-center bg-zinc-950 text-zinc-600">
          Select a section to start writing
        </div>
      )}
    </div>
  );
}
