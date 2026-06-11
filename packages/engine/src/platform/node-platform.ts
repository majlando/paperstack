import {
  readFile,
  writeFile,
  readdir,
  access,
  mkdir,
  rename,
  rm,
  copyFile,
  stat,
} from "node:fs/promises";
import { execFile } from "node:child_process";
import type { Platform } from "./platform.ts";

/** Platform implementation for Node — used by tests and the future CLI. */
export class NodePlatform implements Platform {
  async readTextFile(path: string): Promise<string> {
    return readFile(path, "utf8");
  }

  async writeTextFile(path: string, content: string): Promise<void> {
    // Crash-safe: write a sibling temp file, then rename over the target —
    // a crash mid-write must never leave a truncated document.yaml or
    // section file (often the only copy of the user's writing).
    const tmp = `${path}.paperstack-tmp`;
    await writeFile(tmp, content, "utf8");
    try {
      await rename(tmp, path);
    } catch (e) {
      await rm(tmp, { force: true }).catch(() => {});
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
      await rm(tmp, { force: true }).catch(() => {});
      throw e;
    }
  }

  async fileExists(path: string): Promise<boolean> {
    try {
      await access(path);
      return true;
    } catch {
      return false;
    }
  }

  async dirExists(path: string): Promise<boolean> {
    try {
      return (await stat(path)).isDirectory();
    } catch {
      return false;
    }
  }

  async listDir(path: string): Promise<string[]> {
    return readdir(path);
  }

  async mkdir(path: string): Promise<void> {
    await mkdir(path, { recursive: true });
  }

  async rename(oldPath: string, newPath: string): Promise<void> {
    await rename(oldPath, newPath);
  }

  async removeFile(path: string): Promise<void> {
    await rm(path);
  }

  async copyFile(sourcePath: string, destPath: string): Promise<void> {
    await copyFile(sourcePath, destPath);
  }

  runBinary(
    binary: string,
    args: string[],
  ): Promise<{ exitCode: number; stdout: string; stderr: string }> {
    return new Promise((resolve) => {
      execFile(
        binary,
        args,
        { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 },
        (error, stdout, stderr) => {
          const exitCode =
            error && typeof error.code === "number" ? error.code : error ? 1 : 0;
          // A spawn failure (e.g. missing executable) produces no stderr of
          // its own — surface the error message so it isn't silently lost.
          const detail =
            error && !stderr ? `${stderr}\n${error.message}`.trim() : stderr;
          resolve({ exitCode, stdout, stderr: detail });
        },
      );
    });
  }
}
