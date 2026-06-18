import { useEffect, useState } from "react";
import { useStore } from "../store.ts";
import { gitStatus, gitFetch, gitPull, gitPush, gitCommitAll, type GitStatus } from "../platform/git.ts";

/**
 * The group-collaboration surface for a project shared over Git: branch,
 * how far ahead/behind the shared history, and uncommitted changes — with
 * fetch, fast-forward pull, push, and commit. Pull is fast-forward only, so a
 * divergent history fails loudly rather than producing a surprise merge.
 */
export function GitPanel(props: { onClose: () => void }) {
  const projectDir = useStore((s) => s.projectDir);
  const reloadProject = useStore((s) => s.reloadProject);
  const [status, setStatus] = useState<GitStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState("");

  async function refresh() {
    if (!projectDir) return;
    setStatus(await gitStatus(projectDir));
  }
  useEffect(() => {
    void refresh();
  }, []);

  async function run(fn: () => Promise<void>, reload = false) {
    if (!projectDir) return;
    setBusy(true);
    setError(null);
    try {
      await fn();
      if (reload) await reloadProject();
      await refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const dir = projectDir ?? "";
  const btn =
    "rounded border border-zinc-700 px-3 py-1 text-sm text-zinc-200 hover:bg-zinc-800 disabled:opacity-40";

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
      onClick={props.onClose}
      onKeyDown={(e) => {
        if (e.key === "Escape") props.onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Git"
        className="w-full max-w-md rounded-lg border border-zinc-700 bg-zinc-900 p-4 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="pb-3 text-sm font-semibold text-zinc-100">Share over Git</div>

        {status === null ? (
          <div className="py-2 text-sm text-zinc-500">Checking…</div>
        ) : !status.isRepo ? (
          <div className="py-2 text-sm text-zinc-400">
            This project folder isn’t a Git repository yet. Initialise one (git init) and add a
            remote to share it with your group.
          </div>
        ) : (
          <>
            <div className="flex items-center gap-2 text-sm">
              <span className="rounded bg-zinc-800 px-2 py-0.5 text-zinc-200">
                {status.branch ?? "detached"}
              </span>
              {status.upstream ? (
                <span className="text-xs text-zinc-500">→ {status.upstream}</span>
              ) : (
                <span className="text-xs text-amber-400">no upstream set</span>
              )}
            </div>
            <div className="flex gap-4 pt-2 text-xs text-zinc-400">
              <span title="Commits to push">↑ {status.ahead} to push</span>
              <span title="Commits to pull (after a fetch)">↓ {status.behind} to pull</span>
              <span title="Uncommitted changes" className={status.changed > 0 ? "text-amber-400" : ""}>
                {status.changed} uncommitted
              </span>
            </div>

            <div className="flex flex-wrap gap-2 pt-3">
              <button className={btn} disabled={busy} onClick={() => void run(() => gitFetch(dir))}>
                Fetch
              </button>
              <button
                className={btn}
                disabled={busy || status.behind === 0}
                onClick={() => void run(() => gitPull(dir), true)}
              >
                Pull
              </button>
              <button
                className={btn}
                disabled={busy || status.ahead === 0}
                onClick={() => void run(() => gitPush(dir))}
              >
                Push
              </button>
            </div>

            <div className="mt-4 border-t border-zinc-800 pt-3">
              <input
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="Commit message — describe what you changed"
                className="w-full rounded border border-zinc-700 bg-zinc-950 px-2.5 py-1.5 text-sm text-zinc-100 outline-none focus:border-zinc-500"
              />
              <button
                className="mt-2 rounded bg-blue-600 px-3 py-1 text-sm font-medium text-white hover:bg-blue-500 disabled:opacity-40"
                disabled={busy || status.changed === 0 || message.trim() === ""}
                onClick={() =>
                  void run(async () => {
                    await gitCommitAll(dir, message.trim());
                    setMessage("");
                  })
                }
              >
                Commit all changes
              </button>
            </div>
          </>
        )}

        {error && (
          <div className="mt-3 rounded border border-red-900 bg-red-950/60 px-2 py-1 text-xs text-red-300">
            {error}
          </div>
        )}

        <div className="flex justify-end pt-3">
          <button
            onClick={props.onClose}
            className="rounded border border-zinc-700 px-3 py-1 text-sm text-zinc-300 hover:bg-zinc-800"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
