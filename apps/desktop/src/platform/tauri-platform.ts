import {
  readTextFile,
  writeTextFile,
  exists,
  readDir,
  mkdir,
  rename,
  remove,
} from "@tauri-apps/plugin-fs";
import { Command } from "@tauri-apps/plugin-shell";
import type { Platform } from "@paperstack/engine";

/** Sidecar names as configured in tauri.conf.json `bundle.externalBin`. */
export const SIDECARS = { typst: "binaries/typst", pandoc: "binaries/pandoc" } as const;

/**
 * Platform implementation backed by Tauri's fs plugin, so the engine runs
 * unchanged inside the webview. Binaries run as bundled sidecars via the
 * shell plugin, scoped in capabilities/default.json to exactly typst+pandoc.
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

  async removeFile(path: string): Promise<void> {
    await remove(path);
  }

  async runBinary(
    binary: string,
    args: string[],
  ): Promise<{ exitCode: number; stdout: string; stderr: string }> {
    try {
      const output = await Command.sidecar(binary, args).execute();
      return { exitCode: output.code ?? -1, stdout: output.stdout, stderr: output.stderr };
    } catch (e) {
      // spawn failure (sidecar missing/not permitted) — same shape as a
      // failed run so the engine's preflight reports it readably
      return { exitCode: -1, stdout: "", stderr: String(e) };
    }
  }
}

export const platform = new TauriPlatform();
