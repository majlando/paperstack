/**
 * All file-system and process access in the engine goes through this
 * interface. The engine itself never imports `node:fs` or Tauri APIs —
 * it receives a Platform, which is what lets the same code run in Node
 * (tests, CLI) and inside the Tauri webview (TauriPlatform, Milestone 2).
 */
export interface Platform {
  readTextFile(path: string): Promise<string>;
  writeTextFile(path: string, content: string): Promise<void>;
  fileExists(path: string): Promise<boolean>;
  listDir(path: string): Promise<string[]>;
  /** Create a directory, including missing parents. No error if it exists. */
  mkdir(path: string): Promise<void>;
  /** Rename/move a file. Fails if the source is missing. */
  rename(oldPath: string, newPath: string): Promise<void>;
  /**
   * Run a bundled binary (typst, pandoc) and capture its output. `binary` is
   * whatever identifies the executable to this platform: an absolute path in
   * Node, a sidecar name in the Tauri app. No stdin — Tauri's shell plugin
   * cannot close a child's stdin, so input always travels via files.
   */
  runBinary(
    binary: string,
    args: string[],
  ): Promise<{ exitCode: number; stdout: string; stderr: string }>;
}
