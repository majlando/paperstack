import type { Platform } from "../platform/platform.ts";

export interface FileNode {
  /** Entry name, no path. */
  name: string;
  /** Project-relative path, forward slashes. */
  path: string;
  isDir: boolean;
  /** Present for directories — the recursively built children. */
  children?: FileNode[];
}

/** Names never shown in the Files panel: generated output, VCS, temp files. */
const IGNORED = new Set(["output", ".git", "node_modules", ".DS_Store"]);

function ignored(name: string): boolean {
  return IGNORED.has(name) || name.endsWith(".paperstack-tmp");
}

/**
 * Lists the project folder as a tree for the Files panel — directories first,
 * then files, each sorted case-insensitively. Generated output, the Git
 * directory, and crash-temp files are hidden so the tree shows the project as
 * the group shares it, not build artefacts. Pure over the injected Platform,
 * so it runs in tests against FakePlatform.
 */
export async function buildFileTree(
  platform: Platform,
  projectDir: string,
  rel = "",
): Promise<FileNode[]> {
  const base = rel ? `${projectDir}/${rel}` : projectDir;
  let names: string[];
  try {
    names = await platform.listDir(base);
  } catch {
    return []; // unreadable or empty directory
  }
  const nodes: FileNode[] = [];
  for (const name of names) {
    if (ignored(name)) continue;
    const path = rel ? `${rel}/${name}` : name;
    const isDir = await platform.dirExists(`${projectDir}/${path}`);
    nodes.push({
      name,
      path,
      isDir,
      children: isDir ? await buildFileTree(platform, projectDir, path) : undefined,
    });
  }
  nodes.sort((a, b) =>
    a.isDir !== b.isDir
      ? a.isDir
        ? -1
        : 1
      : a.name.localeCompare(b.name, undefined, { sensitivity: "base" }),
  );
  return nodes;
}
