import { useEffect, useRef } from "react";
import { convertFileSrc } from "@tauri-apps/api/core";
import { resolveProjectPath } from "@paperstack/engine";
import { MarkdownPreview } from "../preview/markdown-preview.ts";
import { useStore } from "../store.ts";

function TabButton(props: {
  active: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: string;
}) {
  return (
    <button
      onClick={props.onClick}
      disabled={props.disabled}
      className={`rounded px-2 py-0.5 ${
        props.active ? "bg-zinc-700/80 text-zinc-100" : "text-zinc-500 hover:text-zinc-200"
      } disabled:opacity-50`}
    >
      {props.children}
    </button>
  );
}

/**
 * The right pane: live per-section preview, or the compiled report PDF.
 * The preview is the vanilla-TS MarkdownPreview behind a thin bridge
 * (re-renders 300 ms after typing stops). The PDF view is WebView2's built-in
 * viewer in an iframe — purely declarative, so no vanilla wrapper class is
 * warranted; that changes if pdf.js ever replaces it (see STACK.md).
 */
export function Preview() {
  const content = useStore((s) => s.content);
  const activeFile = useStore((s) => s.activeFile);
  const pane = useStore((s) => s.pane);
  const report = useStore((s) => s.report);
  const building = useStore((s) => s.building);
  const viewReport = useStore((s) => s.viewReport);
  const exportPdf = useStore((s) => s.exportPdf);
  const showPreview = useStore((s) => s.showPreview);
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
      <div className="flex items-center justify-between border-b border-zinc-800 bg-zinc-900/60 px-2 py-1 text-xs">
        <span className="flex gap-1">
          <TabButton active={pane === "preview"} onClick={showPreview}>
            Preview
          </TabButton>
          <TabButton
            active={pane === "report"}
            disabled={building}
            onClick={() => void viewReport()}
          >
            {building ? "Building…" : "View Report"}
          </TabButton>
        </span>
        <button
          onClick={() => void exportPdf()}
          disabled={building}
          className="rounded bg-blue-600/90 px-2.5 py-0.5 font-medium text-white hover:bg-blue-500 disabled:opacity-50"
        >
          Export PDF
        </button>
      </div>
      {pane === "report" && report && report.warnings.length > 0 && (
        <div className="border-b border-amber-900/60 bg-amber-950/60 px-4 py-1.5 text-xs text-amber-300">
          {report.warnings.join(" · ")}
        </div>
      )}
      {/* The preview stays mounted while the Report tab is shown so its
          instance and scroll position survive switching back. */}
      <div
        ref={containerRef}
        className={`prose prose-invert prose-zinc min-h-0 max-w-none flex-1 overflow-y-auto px-6 py-4 prose-headings:text-zinc-100 prose-pre:border prose-pre:border-zinc-800 prose-pre:bg-zinc-900 prose-code:text-emerald-300 prose-img:rounded prose-img:bg-white prose-img:p-1 ${
          pane === "report" ? "hidden" : ""
        }`}
      />
      {pane === "report" &&
        (report ? (
          <iframe
            title="Report PDF"
            src={`${convertFileSrc(report.pdfPath)}?v=${report.builtAt}`}
            className="min-h-0 flex-1 border-0 bg-zinc-900"
          />
        ) : (
          <div className="flex flex-1 items-center justify-center text-zinc-600">
            {building ? "Building the report…" : "No report built yet"}
          </div>
        ))}
    </div>
  );
}
