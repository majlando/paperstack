import { useEffect } from "react";
import { useStore } from "./store.ts";
import { Welcome } from "./components/Welcome.tsx";
import { Sidebar } from "./components/Sidebar.tsx";
import { Editor } from "./components/Editor.tsx";
import { Preview } from "./components/Preview.tsx";
import { StatusBar } from "./components/StatusBar.tsx";

// Dev convenience: VITE_OPEN_PROJECT=<path> auto-opens a project on launch,
// VITE_OPEN_SECTION=<file> jumps to a section (smoke tests; the folder
// dialog can't be driven from scripts).
const devProject = import.meta.env.VITE_OPEN_PROJECT as string | undefined;
const devSection = import.meta.env.VITE_OPEN_SECTION as string | undefined;
// Module-level guard: StrictMode runs effects twice, and two concurrent
// openProject calls race — the loser would override the devSection jump.
let devAutoOpened = false;

export default function App() {
  const project = useStore((s) => s.project);
  const error = useStore((s) => s.error);
  const clearError = useStore((s) => s.clearError);
  const openProject = useStore((s) => s.openProject);

  useEffect(() => {
    if (devProject && !devAutoOpened) {
      devAutoOpened = true;
      void openProject(devProject).then(() => {
        if (devSection) void useStore.getState().openSection(devSection);
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
