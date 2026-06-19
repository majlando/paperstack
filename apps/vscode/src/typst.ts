/**
 * Zero-setup Typst: download and cache the pinned Typst binary on first use so
 * preview/export need nothing on PATH. Plain Node (no vscode import) so it can
 * be unit-run outside the extension host. Mirrors scripts/fetch-binaries.ts.
 *
 * NOTE: keep TYPST_VERSION and the checksums in sync with
 * scripts/fetch-binaries.ts — a Typst bump must update both (grep TYPST_VERSION).
 */
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { chmodSync, copyFileSync, existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const TYPST_VERSION = "0.13.1";

interface Asset {
  url: string;
  sha256: string;
  /** Path of the executable inside the extracted archive. */
  exeInArchive: string;
}

const rel = (triple: string, ext: string) =>
  `https://github.com/typst/typst/releases/download/v${TYPST_VERSION}/typst-${triple}.${ext}`;

// Keyed by `${process.platform}-${process.arch}`. Linux uses the static musl
// build so it runs on any distro.
const ASSETS: Record<string, Asset> = {
  "win32-x64": {
    url: rel("x86_64-pc-windows-msvc", "zip"),
    sha256: "44170D0632298BA68CBABC43DBFB6908B17CA9236859E0767B0E5D54B2D19F48",
    exeInArchive: "typst-x86_64-pc-windows-msvc/typst.exe",
  },
  "linux-x64": {
    url: rel("x86_64-unknown-linux-musl", "tar.xz"),
    sha256: "7D214BFEFFC2E585DC422D1A09D2B144969421281E8C7F5D784B65FC69B5673F",
    exeInArchive: "typst-x86_64-unknown-linux-musl/typst",
  },
  "linux-arm64": {
    url: rel("aarch64-unknown-linux-musl", "tar.xz"),
    sha256: "4F5B7EE6E57FB639019EE0F6BFFCF940EDAD228EDE6FF5269A9F05A1544CEED4",
    exeInArchive: "typst-aarch64-unknown-linux-musl/typst",
  },
  "darwin-arm64": {
    url: rel("aarch64-apple-darwin", "tar.xz"),
    sha256: "541E4F9EACA3F34EE865F81FC663E4839CB84D6253F71A372CD855B0A7283213",
    exeInArchive: "typst-aarch64-apple-darwin/typst",
  },
  "darwin-x64": {
    url: rel("x86_64-apple-darwin", "tar.xz"),
    sha256: "4DABFE647F7F01ED9CC13AD8196A6C7F5E16F0732821B522D50740D3A9F5207B",
    exeInArchive: "typst-x86_64-apple-darwin/typst",
  },
};

/**
 * Path to a runnable pinned Typst, downloading + caching it under `storageDir`
 * on first use. SHA-256 verified before use — these binaries run on the user's
 * machine, so a mismatched download is refused.
 */
export async function ensureTypst(
  storageDir: string,
  onProgress?: (message: string) => void,
): Promise<string> {
  const key = `${process.platform}-${process.arch}`;
  const asset = ASSETS[key];
  if (!asset) {
    throw new Error(
      `Paperstack has no pinned Typst for this platform (${key}). Set "paperstack.typstPath" to a Typst binary.`,
    );
  }

  const exe = process.platform === "win32" ? ".exe" : "";
  const dir = join(storageDir, `typst-${TYPST_VERSION}`);
  const target = join(dir, `typst${exe}`);
  if (versionMatches(target, TYPST_VERSION)) return target;

  mkdirSync(dir, { recursive: true });
  const tmp = join(dir, "tmp");
  rmSync(tmp, { recursive: true, force: true });
  mkdirSync(tmp, { recursive: true });

  onProgress?.(`downloading Typst ${TYPST_VERSION}…`);
  const res = await fetch(asset.url);
  if (!res.ok) throw new Error(`Could not download Typst: HTTP ${res.status} for ${asset.url}`);
  const bytes = Buffer.from(await res.arrayBuffer());
  const hash = createHash("sha256").update(bytes).digest("hex").toUpperCase();
  if (hash !== asset.sha256.toUpperCase()) {
    throw new Error("The downloaded Typst failed its checksum — refusing to use it.");
  }

  const archiveName = asset.url.split("/").pop()!;
  writeFileSync(join(tmp, archiveName), bytes);
  onProgress?.("unpacking Typst…");
  // Call bsdtar explicitly on Windows (System32) — it reads .zip, whereas a PATH
  // `tar` may be Git's GNU tar, which cannot. Extract with cwd + a bare filename
  // so a drive-letter path's colon is never misread as a remote host (rsh form).
  const tar =
    process.platform === "win32"
      ? join(process.env.SystemRoot ?? "C:\\Windows", "System32", "tar.exe")
      : "tar";
  execFileSync(tar, ["-xf", archiveName], { cwd: tmp });
  copyFileSync(join(tmp, asset.exeInArchive), target);
  if (process.platform !== "win32") chmodSync(target, 0o755);
  rmSync(tmp, { recursive: true, force: true });
  return target;
}

/** Anchored so 0.13.1 never matches a stray 0.13.10 binary. */
function versionMatches(path: string, version: string): boolean {
  if (!existsSync(path)) return false;
  try {
    const out = execFileSync(path, ["--version"], { encoding: "utf8" });
    const first = out.split("\n", 1)[0] ?? "";
    const esc = version.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return new RegExp(`(^|\\s)${esc}(\\s|$|\\()`).test(first);
  } catch {
    return false; // exists but broken — re-fetch
  }
}
