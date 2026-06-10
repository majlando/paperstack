import { useEffect, useRef } from "react";
import { convertFileSrc } from "@tauri-apps/api/core";
import { resolveProjectPath } from "@paperstack/engine";
import { MarkdownPreview } from "../preview/markdown-preview.ts";
import { useStore } from "../store.ts";

/** Thin React bridge for the vanilla-TS preview; re-renders 300 ms after typing stops. */
export function Preview() {
  const content = useStore((s) => s.content);
  const activeFile = useStore((s) => s.activeFile);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const previewRef = useRef<MarkdownPreview | null>(null);
  const lastFileRef = useRef<string | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;
    const preview = new MarkdownPreview(containerRef.current, {
      resolveImageUrl: (src, sectionDir) => {
        const projectDir = useStore.getState().projectDir;
        if (!projectDir) return src;
        const projectRelative = src.startsWith("/")
          ? src.slice(1)
          : resolveProjectPath(sectionDir, src).slice(1);
        return convertFileSrc(`${projectDir}/${projectRelative}`);
      },
    });
    previewRef.current = preview;
    return () => {
      preview.destroy();
      previewRef.current = null;
    };
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      const preview = previewRef.current;
      if (!preview || activeFile === null) return;
      const slash = activeFile.lastIndexOf("/");
      const sectionDir = slash === -1 ? "" : activeFile.slice(0, slash);
      const resetScroll = lastFileRef.current !== activeFile;
      lastFileRef.current = activeFile;
      void preview.render(content, sectionDir, { resetScroll });
    }, 300);
    return () => clearTimeout(timer);
  }, [content, activeFile]);

  return (
    <div className="flex min-w-0 flex-1 flex-col border-l border-zinc-800">
      <div className="border-b border-zinc-800 bg-zinc-900/60 px-4 py-1.5 text-xs text-zinc-500">
        Preview
      </div>
      <div
        ref={containerRef}
        className="prose prose-invert prose-zinc min-h-0 max-w-none flex-1 overflow-y-auto px-6 py-4 prose-headings:text-zinc-100 prose-pre:border prose-pre:border-zinc-800 prose-pre:bg-zinc-900 prose-code:text-emerald-300 prose-img:rounded prose-img:bg-white prose-img:p-1"
      />
    </div>
  );
}
