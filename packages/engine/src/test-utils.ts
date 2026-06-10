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

  async listDir(): Promise<string[]> {
    return [];
  }

  async mkdir(): Promise<void> {}

  async rename(oldPath: string, newPath: string): Promise<void> {
    const content = this.files.get(oldPath);
    if (content === undefined) throw new Error(`ENOENT: ${oldPath}`);
    this.files.delete(oldPath);
    this.files.set(newPath, content);
  }

  async runBinary(): Promise<{ exitCode: number; stdout: string; stderr: string }> {
    throw new Error("not supported in FakePlatform");
  }
}
