import { open } from "@tauri-apps/plugin-dialog";
import { useStore } from "../store.ts";

export function Welcome() {
  const openProject = useStore((s) => s.openProject);

  async function pickFolder() {
    const dir = await open({ directory: true, title: "Open a Paperstack report project" });
    if (typeof dir === "string") await openProject(dir);
  }

  return (
    <div className="flex h-full flex-col items-center justify-center gap-6 text-zinc-300">
      <div className="text-center">
        <h1 className="text-4xl font-bold text-white">Paperstack</h1>
        <p className="mt-2 text-zinc-400">Professional reports from Markdown sections.</p>
      </div>
      <button
        onClick={() => void pickFolder()}
        className="rounded-lg bg-blue-600 px-6 py-2.5 font-medium text-white hover:bg-blue-500"
      >
        Open Report Project
      </button>
      <p className="max-w-md text-center text-sm text-zinc-500">
        Pick a folder containing a <code className="text-zinc-400">document.yaml</code>.
        Creating new projects from a template arrives later in this milestone.
      </p>
    </div>
  );
}
