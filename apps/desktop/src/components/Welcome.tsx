import { open } from "@tauri-apps/plugin-dialog";
import { useStore, getRecentProjects } from "../store.ts";

export function Welcome() {
  const openProject = useStore((s) => s.openProject);
  const createProject = useStore((s) => s.createProject);
  // Read once per mount: the list only changes by opening a project, which unmounts this screen.
  const recents = getRecentProjects();

  async function pickExisting() {
    const dir = await open({ directory: true, title: "Open a Paperstack report project" });
    if (typeof dir === "string") await openProject(dir);
  }

  async function pickNew() {
    const dir = await open({
      directory: true,
      title: "Choose an empty folder for the new report",
    });
    if (typeof dir === "string") await createProject(dir);
  }

  return (
    <div className="flex h-full flex-col items-center justify-center gap-6 text-zinc-300">
      <div className="text-center">
        <h1 className="text-4xl font-bold text-white">Paperstack</h1>
        <p className="mt-2 text-zinc-400">Professional reports from Markdown sections.</p>
      </div>
      <div className="flex gap-3">
        <button
          onClick={() => void pickNew()}
          className="rounded-lg bg-blue-600 px-6 py-2.5 font-medium text-white hover:bg-blue-500"
        >
          Create New Report
        </button>
        <button
          onClick={() => void pickExisting()}
          className="rounded-lg border border-zinc-700 px-6 py-2.5 font-medium text-zinc-200 hover:bg-zinc-900"
        >
          Open Report Project
        </button>
      </div>
      {recents.length > 0 && (
        <div className="w-full max-w-md">
          <div className="px-2 pb-1 text-[11px] font-semibold uppercase tracking-wider text-zinc-600">
            Recent
          </div>
          {recents.map((dir) => (
            <button
              key={dir}
              onClick={() => void openProject(dir)}
              title={dir}
              className="block w-full truncate rounded px-2 py-1 text-left text-sm hover:bg-zinc-900"
            >
              <span className="text-zinc-200">{dir.slice(dir.lastIndexOf("/") + 1)}</span>
              <span className="ml-2 text-xs text-zinc-600">{dir}</span>
            </button>
          ))}
        </div>
      )}
      <p className="max-w-md text-center text-sm text-zinc-500">
        A new report starts from the SEA template — or open any folder containing a{" "}
        <code className="text-zinc-400">document.yaml</code>.
      </p>
    </div>
  );
}
