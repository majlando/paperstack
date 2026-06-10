import type { Platform } from "./platform.ts";

/** In-memory Platform for tests — no disk, no processes. */
export class FakePlatform implements Platform {
  constructor(readonly files: Map<string, string> = new Map()) {}

  async readTextFile(path: string): Promise<string> {
    const content = this.files.get(path);
    if (content === undefined) throw new Error(`ENOENT: ${path}`);
    return content;
  }

  async writeTextFile(path: string, content: string): Promise<void> {
    this.files.set(path, content);
  }

  async fileExists(path: string): Promise<boolean> {
    return this.files.has(path);
  }

  /** A directory exists when any stored file lives under it. */
  async dirExists(path: string): Promise<boolean> {
    const prefix = path.endsWith("/") ? path : `${path}/`;
    return [...this.files.keys()].some((f) => f.startsWith(prefix));
  }

  /** Names of entries directly under `path` (files and subdirectories). */
  async listDir(path: string): Promise<string[]> {
    const prefix = path.endsWith("/") ? path : `${path}/`;
    const names = new Set<string>();
    for (const file of this.files.keys()) {
      if (!file.startsWith(prefix)) continue;
      names.add(file.slice(prefix.length).split("/")[0]!);
    }
    if (names.size === 0) throw new Error(`ENOENT: ${path}`);
    return [...names];
  }

  async mkdir(): Promise<void> {}

  async rename(oldPath: string, newPath: string): Promise<void> {
    const content = this.files.get(oldPath);
    if (content === undefined) throw new Error(`ENOENT: ${oldPath}`);
    this.files.delete(oldPath);
    this.files.set(newPath, content);
  }

  async removeFile(path: string): Promise<void> {
    if (!this.files.delete(path)) throw new Error(`ENOENT: ${path}`);
  }

  async copyFile(sourcePath: string, destPath: string): Promise<void> {
    const content = this.files.get(sourcePath);
    if (content === undefined) throw new Error(`ENOENT: ${sourcePath}`);
    this.files.set(destPath, content);
  }

  async runBinary(): Promise<{ exitCode: number; stdout: string; stderr: string }> {
    throw new Error("not supported in FakePlatform");
  }
}
