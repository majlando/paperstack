import {
  readTextFile,
  writeTextFile,
  writeFile,
  exists,
  readDir,
  mkdir,
  rename,
  remove,
  copyFile,
} from "@tauri-apps/plugin-fs";
import { invoke } from "@tauri-apps/api/core";
import type { Platform } from "@paperstack/engine";

/**
 * Grants the webview access to an existing Paperstack project folder. The app
 * ships with empty static fs/asset scopes; Rust canonicalizes and validates
 * folders before adding them to the scopes.
 */
export async function allowExistingProjectScope(dir: string): Promise<string> {
  return await invoke<string>("allow_existing_project_scope", { dir });
}

/** Grants access to a folder selected as the destination for a new project. */
export async function allowNewProjectScope(dir: string): Promise<string> {
  return await invoke<string>("allow_new_project_scope", { dir });
}

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
    // Crash-safe: write a sibling temp file, then rename over the target —
    // a crash mid-write must never leave a truncated document.yaml or
    // section file (often the only copy of the user's writing). Rust's
    // rename replaces the destination atomically on every desktop platform.
    const tmp = `${path}.paperstack-tmp`;
    await writeTextFile(tmp, content);
    try {
      await rename(tmp, path);
    } catch (e) {
      await remove(tmp).catch(() => {});
      throw e;
    }
  }

  async writeBinaryFile(path: string, bytes: Uint8Array): Promise<void> {
    // Same crash-safe temp-then-rename as writeTextFile.
    const tmp = `${path}.paperstack-tmp`;
    await writeFile(tmp, bytes);
    try {
      await rename(tmp, path);
    } catch (e) {
      await remove(tmp).catch(() => {});
      throw e;
    }
  }

  async fileExists(path: string): Promise<boolean> {
    // exists() alone is true for directories too; without fs:allow-stat the
    // readDir probe is the cheapest way to keep the files-only contract
    // NodePlatform has (a directory must never count as a section file).
    if (!(await exists(path))) return false;
    return !(await this.dirExists(path));
  }

  async dirExists(path: string): Promise<boolean> {
    // The capability set has no fs:allow-stat — readDir doubles as the
    // directory probe (it errors on plain files and missing paths).
    try {
      await readDir(path);
      return true;
    } catch {
      return false;
    }
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

  async copyFile(sourcePath: string, destPath: string): Promise<void> {
    await copyFile(sourcePath, destPath);
  }

  async runBinary(
    binary: string,
    args: string[],
  ): Promise<{ exitCode: number; stdout: string; stderr: string }> {
    try {
      const output = await invoke<{
        exit_code: number;
        stdout: string;
        stderr: string;
      }>("run_sidecar", { binary, args });
      return {
        exitCode: output.exit_code,
        stdout: output.stdout,
        stderr: output.stderr,
      };
    } catch (e) {
      // spawn/validation failure — same shape as a
      // failed run so the engine's preflight reports it readably
      return { exitCode: -1, stdout: "", stderr: String(e) };
    }
  }
}

export const platform = new TauriPlatform();
