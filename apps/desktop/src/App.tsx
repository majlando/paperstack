import { useStore } from "./store.ts";
import { Welcome } from "./components/Welcome.tsx";
import { Sidebar } from "./components/Sidebar.tsx";
import { Editor } from "./components/Editor.tsx";
import { StatusBar } from "./components/StatusBar.tsx";

export default function App() {
  const project = useStore((s) => s.project);
  const error = useStore((s) => s.error);
  const clearError = useStore((s) => s.clearError);

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
          </div>
          <StatusBar />
        </>
      ) : (
        <Welcome />
      )}
    </div>
  );
}
