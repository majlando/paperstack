import { useEffect } from "react";
import { useStore } from "./store.ts";
import { Welcome } from "./components/Welcome.tsx";
import { Sidebar } from "./components/Sidebar.tsx";
import { Editor } from "./components/Editor.tsx";
import { Preview } from "./components/Preview.tsx";
import { StatusBar } from "./components/StatusBar.tsx";

// Dev convenience: VITE_OPEN_PROJECT=<path> auto-opens a project on launch,
// VITE_OPEN_SECTION=<file> jumps to a section, VITE_SMOKE_EXPORT=1 runs
// Export PDF right after opening, VITE_SMOKE_VIEW=1 runs View Report
// (=2 recompiles once more while the PDF pane is showing — exercises the
// file-locked-by-viewer path). Smoke tests; the folder dialog and buttons
// can't be driven from scripts.
const devProject = import.meta.env.VITE_OPEN_PROJECT as string | undefined;
const devSection = import.meta.env.VITE_OPEN_SECTION as string | undefined;
const devSmokeExport = import.meta.env.VITE_SMOKE_EXPORT as string | undefined;
const devSmokeView = import.meta.env.VITE_SMOKE_VIEW as string | undefined;
// Module-level guard: StrictMode runs effects twice, and two concurrent
// openProject calls race — the loser would override the devSection jump.
let devAutoOpened = false;

export default function App() {
  const project = useStore((s) => s.project);
  const error = useStore((s) => s.error);
  const notice = useStore((s) => s.notice);
  const conflict = useStore((s) => s.conflict);
  const clearError = useStore((s) => s.clearError);
  const clearNotice = useStore((s) => s.clearNotice);
  const openProject = useStore((s) => s.openProject);
  const keepMine = useStore((s) => s.resolveConflictKeepMine);
  const useDisk = useStore((s) => s.resolveConflictUseDisk);

  useEffect(() => {
    if (devProject && !devAutoOpened) {
      devAutoOpened = true;
      void openProject(devProject).then(() => {
        if (devSection) void useStore.getState().openSection(devSection);
        if (devSmokeExport) void useStore.getState().exportPdf();
        if (devSmokeView) {
          void useStore.getState().viewReport().then(() => {
            if (devSmokeView === "2") {
              setTimeout(() => void useStore.getState().viewReport(), 4000);
            }
          });
        }
      });
    }
  }, [openProject]);

  return (
    <div className="flex h-screen flex-col bg-zinc-950 text-zinc-200">
      {error && (
        <div className="flex items-start justify-between gap-4 border-b border-red-900 bg-red-950 px-4 py-2 text-sm text-red-200">
          <pre className="whitespace-pre-wrap font-sans">{error}</pre>
          <button onClick={clearError} className="shrink-0 text-red-400 hover:text-red-200">
            dismiss
          </button>
        </div>
      )}
      {notice && (
        <div className="flex items-start justify-between gap-4 border-b border-emerald-900 bg-emerald-950 px-4 py-2 text-sm text-emerald-200">
          <span>{notice}</span>
          <button onClick={clearNotice} className="shrink-0 text-emerald-400 hover:text-emerald-200">
            dismiss
          </button>
        </div>
      )}
      {conflict && (
        <div className="flex items-center justify-between gap-4 border-b border-amber-900 bg-amber-950 px-4 py-2 text-sm text-amber-200">
          <span>
            “{conflict.file}” changed on disk while you were editing — probably a git pull or
            another editor. Which version do you want to keep?
          </span>
          <span className="flex shrink-0 gap-2">
            <button
              onClick={() => void keepMine()}
              className="rounded border border-amber-700 px-2.5 py-0.5 font-medium hover:bg-amber-900"
            >
              Keep my version
            </button>
            <button
              onClick={useDisk}
              className="rounded border border-amber-700 px-2.5 py-0.5 hover:bg-amber-900"
            >
              Use the version on disk
            </button>
          </span>
        </div>
      )}
      {project ? (
        <>
          <div className="flex min-h-0 flex-1">
            <Sidebar />
            <Editor />
            <Preview />
          </div>
          <StatusBar />
        </>
      ) : (
        <Welcome />
      )}
    </div>
  );
}
