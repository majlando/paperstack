import {
  readTextFile,
  writeTextFile,
  exists,
  readDir,
  mkdir,
  rename,
} from "@tauri-apps/plugin-fs";
import type { Platform } from "@paperstack/engine";

/**
 * Platform implementation backed by Tauri's fs plugin, so the engine runs
 * unchanged inside the webview. runBinary is wired in Milestone 3 (sidecars).
 */
export class TauriPlatform implements Platform {
  readTextFile(path: string): Promise<string> {
    return readTextFile(path);
  }

  async writeTextFile(path: string, content: string): Promise<void> {
    await writeTextFile(path, content);
  }

  fileExists(path: string): Promise<boolean> {
    return exists(path);
  }

  async listDir(path: string): Promise<string[]> {
    const entries = await readDir(path);
    return entries.map((e) => e.name);
  }

  async mkdir(path: string): Promise<void> {
    await mkdir(path, { recursive: true });
  }

  async rename(oldPath: string, newPath: string): Promise<void> {
    await rename(oldPath, newPath);
  }

  async runBinary(): Promise<{ exitCode: number; stdout: string; stderr: string }> {
    throw new Error("Sidecar binaries are wired up in Milestone 3 (View Report / Export PDF).");
  }
}

export const platform = new TauriPlatform();
