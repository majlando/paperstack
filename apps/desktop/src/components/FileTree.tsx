import { useCallback, useEffect, useState, type ReactNode } from "react";
import { convertFileSrc } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { buildFileTree, type FileNode } from "@paperstack/engine";
import { platform, revealInFolder } from "../platform/tauri-platform.ts";

const IMAGE_RE = /\.(png|jpe?g|gif|svg|webp|avif)$/i;

function cacheBusted(url: string, version: number): string {
  return `${url}${url.includes("?") ? "&" : "?"}v=${version}`;
}

/**
 * The Files panel: a real file tree of the project folder, so figures and
 * other assets can be seen and managed like a file explorer while the Sections
 * view stays the writing surface. Markdown files that are sections open in the
 * editor; everything else reveals in the OS file manager. Images can be
 * replaced in place (keeping the filename, so references stay valid).
 */
export function FileTree(props: {
  projectDir: string;
  /** document.yaml section files — these open in the editor when clicked. */
  sectionFiles: ReadonlySet<string>;
  onOpenSection: (file: string) => void;
}) {
  const { projectDir } = props;
  const [tree, setTree] = useState<FileNode[] | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  // Bumped after any change so image thumbnails reload past the WebView cache.
  const [version, setVersion] = useState(0);

  const reload = useCallback(() => {
    buildFileTree(platform, projectDir).then(setTree, (e) => setError(String(e)));
  }, [projectDir]);

  useEffect(() => {
    reload();
  }, [reload]);

  function toggle(path: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  }

  async function run(action: () => Promise<void>) {
    setError(null);
    try {
      await action();
      setVersion((v) => v + 1);
      reload();
    } catch (e) {
      setError(String(e));
    }
  }

  async function replaceImage(node: FileNode) {
    const source = await open({
      title: `Replace ${node.name}`,
      filters: [{ name: "Images", extensions: ["png", "jpg", "jpeg", "svg", "gif", "webp"] }],
    });
    if (typeof source !== "string") return;
    await run(() => platform.copyFile(source, `${projectDir}/${node.path}`));
  }

  function rows(nodes: FileNode[], depth: number): ReactNode {
    return nodes.map((node) => {
      const isImage = !node.isDir && IMAGE_RE.test(node.name);
      const isSection = props.sectionFiles.has(node.path);
      const isOpen = expanded.has(node.path);
      const pad = { paddingLeft: `${depth * 12 + 12}px` };
      return (
        <div key={node.path}>
          <div className="group flex items-center pr-2 hover:bg-zinc-800">
            <button
              onClick={() =>
                node.isDir
                  ? toggle(node.path)
                  : isSection
                    ? props.onOpenSection(node.path)
                    : void revealInFolder(`${projectDir}/${node.path}`)
              }
              title={node.path}
              style={pad}
              className="flex min-w-0 flex-1 items-center gap-1.5 py-1 text-left text-sm text-zinc-300"
            >
              <span className="w-3 shrink-0 text-center text-[10px] text-zinc-500">
                {node.isDir ? (isOpen ? "▾" : "▸") : ""}
              </span>
              {isImage ? (
                <img
                  src={cacheBusted(convertFileSrc(`${projectDir}/${node.path}`), version)}
                  alt=""
                  onError={(e) => (e.currentTarget.style.visibility = "hidden")}
                  className="h-5 w-7 shrink-0 rounded-sm border border-zinc-800 bg-white/5 object-contain"
                />
              ) : (
                <span className="w-4 shrink-0 text-center text-zinc-500">
                  {node.isDir ? "📁" : node.name.endsWith(".md") ? "📝" : "📄"}
                </span>
              )}
              <span className={`truncate ${isSection ? "text-zinc-200" : ""}`}>{node.name}</span>
            </button>
            {!node.isDir && (
              <span className="hidden shrink-0 items-center gap-0.5 text-zinc-500 group-hover:flex">
                {isImage && (
                  <ActionButton title="Replace with another image" onClick={() => void replaceImage(node)}>
                    ⟳
                  </ActionButton>
                )}
                <ActionButton
                  title="Show in file manager"
                  onClick={() => void revealInFolder(`${projectDir}/${node.path}`)}
                >
                  ⤷
                </ActionButton>
                {!isSection && (
                  <ActionButton title="Delete file" onClick={() => setConfirmDelete(node.path)}>
                    ✕
                  </ActionButton>
                )}
              </span>
            )}
          </div>
          {confirmDelete === node.path && (
            <div className="flex items-center gap-2 bg-zinc-800/60 py-1 pr-2 text-xs" style={pad}>
              <span className="text-zinc-400">Delete this file?</span>
              <button
                className="rounded bg-red-600/80 px-1.5 text-white hover:bg-red-600"
                onClick={() => {
                  setConfirmDelete(null);
                  void run(() => platform.removeFile(`${projectDir}/${node.path}`));
                }}
              >
                Delete
              </button>
              <button className="text-zinc-400 hover:text-zinc-200" onClick={() => setConfirmDelete(null)}>
                Cancel
              </button>
            </div>
          )}
          {node.isDir && isOpen && node.children && rows(node.children, depth + 1)}
        </div>
      );
    });
  }

  return (
    <div className="py-1">
      {error && (
        <div className="mx-2 my-1 rounded border border-red-900 bg-red-950/60 px-2 py-1 text-xs text-red-300">
          {error}
        </div>
      )}
      {tree === null ? (
        <div className="px-4 py-2 text-xs text-zinc-500">Loading…</div>
      ) : tree.length === 0 ? (
        <div className="px-4 py-2 text-xs text-zinc-500">No files.</div>
      ) : (
        rows(tree, 0)
      )}
    </div>
  );
}

function ActionButton(props: { title: string; onClick: () => void; children: ReactNode }) {
  return (
    <button
      title={props.title}
      onClick={props.onClick}
      className="rounded px-1 py-0.5 hover:bg-zinc-700 hover:text-zinc-200"
    >
      {props.children}
    </button>
  );
}
