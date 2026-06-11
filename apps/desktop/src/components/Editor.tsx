import { useEffect, useRef } from "react";
import { useStore } from "../store.ts";
import { MarkdownEditor } from "../editor/markdown-editor.ts";
import { registerEditor } from "../editor/editor-registry.ts";
import { InsertControls } from "./InsertControls.tsx";

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
      onPasteImage: (image) => {
        // Screenshots are the bulk of a CS report's figures — Ctrl+V goes
        // straight into the Insert Figure flow (caption prompt included).
        void image.arrayBuffer().then((buffer) => {
          useStore.getState().requestFigure({
            kind: "bytes",
            bytes: new Uint8Array(buffer),
            name: image.name || "pasted-image.png",
          });
        });
        return true;
      },
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
    const { content, activeFile, projectDir } = useStore.getState();
    const sameFile = activeFile === lastFocusedFile.current;
    if (!sameFile) {
      // Section switch: park this section's undo history and cursor, restore
      // the target's if it has one (keys carry the project dir so a same-named
      // file in another project can never inherit history).
      editor.switchTo(activeFile && `${projectDir}/${activeFile}`, content);
    } else if (editor.getDoc() !== content) {
      // Same section, new text (reload, conflict resolved from disk): rebuild.
      // Same section, same text (a structure edit bumped contentVersion):
      // leave the editor alone — rebuilding would only wipe undo history.
      editor.setDoc(content);
    }
    if (activeFile && !sameFile) editor.focus();
    lastFocusedFile.current = activeFile;
  }, [contentVersion]);

  return (
    <div className="relative flex min-w-0 flex-1 flex-col">
      <div className="flex items-center justify-between border-b border-zinc-800 bg-zinc-900/60 px-4 py-1 text-xs text-zinc-500">
        <span className="truncate py-0.5">{activeFile ?? "no section open"}</span>
        {activeFile && <InsertControls />}
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
