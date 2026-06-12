/**
 * Downloads pinned typst + pandoc binaries into bin/ (git-ignored) for
 * development and CI, and places target-triple-named sidecar copies under
 * apps/desktop/src-tauri/binaries/. These same versions ship as Tauri
 * sidecars in releases, so every downloaded archive is verified against a
 * pinned SHA-256 hash before use.
 *
 * Cross-platform port of the original fetch-binaries.ps1 (Milestone 6):
 * Windows x64, macOS x64/arm64, Linux x64/arm64.
 * Usage: pnpm fetch-binaries
 */
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { chmodSync, copyFileSync, existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

const TYPST_VERSION = "0.13.1";
const PANDOC_VERSION = "3.6.3";

interface ToolSpec {
  url: string;
  sha256: string;
  /** Path of the executable inside the extracted archive. */
  exeInArchive: string;
}

interface TargetSpec {
  /** Rust host triple — what Tauri expects sidecar files to be named after. */
  sidecarTriple: string;
  typst: ToolSpec;
  pandoc: ToolSpec;
}

const typstUrl = (triple: string, ext: string) =>
  `https://github.com/typst/typst/releases/download/v${TYPST_VERSION}/typst-${triple}.${ext}`;
const pandocUrl = (suffix: string) =>
  `https://github.com/jgm/pandoc/releases/download/${PANDOC_VERSION}/pandoc-${PANDOC_VERSION}-${suffix}`;

const TARGETS: Record<string, TargetSpec> = {
  "win32-x64": {
    sidecarTriple: "x86_64-pc-windows-msvc",
    typst: {
      url: typstUrl("x86_64-pc-windows-msvc", "zip"),
      sha256: "44170D0632298BA68CBABC43DBFB6908B17CA9236859E0767B0E5D54B2D19F48",
      exeInArchive: "typst-x86_64-pc-windows-msvc/typst.exe",
    },
    pandoc: {
      url: pandocUrl("windows-x86_64.zip"),
      sha256: "A31DC5B14A235EFA1F2CF103F71F656EEB76CE1B458D22D24F390C66DB7224F1",
      exeInArchive: `pandoc-${PANDOC_VERSION}/pandoc.exe`,
    },
  },
  "linux-x64": {
    sidecarTriple: "x86_64-unknown-linux-gnu",
    typst: {
      // musl build: static, runs on any distro — the sidecar copy is named
      // after the host's gnu triple, which is what Tauri resolves at runtime.
      url: typstUrl("x86_64-unknown-linux-musl", "tar.xz"),
      sha256: "7D214BFEFFC2E585DC422D1A09D2B144969421281E8C7F5D784B65FC69B5673F",
      exeInArchive: "typst-x86_64-unknown-linux-musl/typst",
    },
    pandoc: {
      url: pandocUrl("linux-amd64.tar.gz"),
      sha256: "D04C95C138202F87D6B00AC19AA3DD874C681F60A9FEB3B55C74F764D6D1A17D",
      exeInArchive: `pandoc-${PANDOC_VERSION}/bin/pandoc`,
    },
  },
  "linux-arm64": {
    sidecarTriple: "aarch64-unknown-linux-gnu",
    typst: {
      url: typstUrl("aarch64-unknown-linux-musl", "tar.xz"),
      sha256: "4F5B7EE6E57FB639019EE0F6BFFCF940EDAD228EDE6FF5269A9F05A1544CEED4",
      exeInArchive: "typst-aarch64-unknown-linux-musl/typst",
    },
    pandoc: {
      url: pandocUrl("linux-arm64.tar.gz"),
      sha256: "4E774CB1BDB6E56BC55B8EB79200BD9AA6A39905A04ECDA7267F5149116F0881",
      exeInArchive: `pandoc-${PANDOC_VERSION}/bin/pandoc`,
    },
  },
  "darwin-arm64": {
    sidecarTriple: "aarch64-apple-darwin",
    typst: {
      url: typstUrl("aarch64-apple-darwin", "tar.xz"),
      sha256: "541E4F9EACA3F34EE865F81FC663E4839CB84D6253F71A372CD855B0A7283213",
      exeInArchive: "typst-aarch64-apple-darwin/typst",
    },
    pandoc: {
      url: pandocUrl("arm64-macOS.zip"),
      sha256: "1D76CD76B703FF758F90F6929BD5F634BC50FC76AD375A9D19A5D365CD8233FC",
      exeInArchive: `pandoc-${PANDOC_VERSION}-arm64/bin/pandoc`,
    },
  },
  "darwin-x64": {
    sidecarTriple: "x86_64-apple-darwin",
    typst: {
      url: typstUrl("x86_64-apple-darwin", "tar.xz"),
      sha256: "4DABFE647F7F01ED9CC13AD8196A6C7F5E16F0732821B522D50740D3A9F5207B",
      exeInArchive: "typst-x86_64-apple-darwin/typst",
    },
    pandoc: {
      url: pandocUrl("x86_64-macOS.zip"),
      sha256: "CF6B8543D04F4162EBE4E3B1FF006018EA395EB3ED8FC97B880D760E3BE0A1A9",
      exeInArchive: `pandoc-${PANDOC_VERSION}-x86_64/bin/pandoc`,
    },
  },
};

const targetKey = `${process.platform}-${process.arch}`;
const target = TARGETS[targetKey];
if (!target) {
  console.error(`No pinned binaries for this platform (${targetKey}).`);
  console.error(`Supported: ${Object.keys(TARGETS).join(", ")}`);
  process.exit(1);
}

const exe = process.platform === "win32" ? ".exe" : "";
const root = resolve(import.meta.dirname, "..");
const bin = join(root, "bin");
const tmp = join(bin, "tmp");
mkdirSync(bin, { recursive: true });
// A crashed earlier run can leave stale extracted files here — extracting a
// new archive over them must never mix two versions' files.
rmSync(tmp, { recursive: true, force: true });

/**
 * Asks the binary itself which version it is: a plain existence check would
 * silently keep an old binary after a pinned-version bump. Anchored so pin
 * 0.13.1 never matches a stray 0.13.10 binary.
 */
function installedVersionMatches(path: string, version: string): boolean {
  if (!existsSync(path)) return false;
  let firstLine = "";
  try {
    const out = execFileSync(path, ["--version"], { encoding: "utf8" });
    firstLine = out.split("\n", 1)[0] ?? "";
  } catch {
    return false; // exists but broken — refresh it
  }
  const escaped = version.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(^|\\s)${escaped}(\\s|$|\\()`).test(firstLine);
}

async function fetchTool(name: string, version: string, spec: ToolSpec): Promise<string> {
  const targetPath = join(bin, `${name}${exe}`);
  if (installedVersionMatches(targetPath, version)) {
    console.log(`${name} ${version} already present: ${targetPath}`);
    return targetPath;
  }
  console.log(`Downloading ${name} from ${spec.url} ...`);
  mkdirSync(tmp, { recursive: true });
  const response = await fetch(spec.url);
  if (!response.ok) {
    throw new Error(`${name} download failed: HTTP ${response.status} for ${spec.url}`);
  }
  const bytes = Buffer.from(await response.arrayBuffer());
  // These binaries ship to end users inside the installer: never trust an
  // archive that does not match the pinned hash.
  const hash = createHash("sha256").update(bytes).digest("hex").toUpperCase();
  if (hash !== spec.sha256.toUpperCase()) {
    throw new Error(
      `${name} download failed SHA-256 verification - refusing to install.\n` +
        `  expected: ${spec.sha256}\n  got:      ${hash}`,
    );
  }
  const archive = join(tmp, spec.url.split("/").pop()!);
  writeFileSync(archive, bytes);
  // bsdtar (Windows 10+, macOS) and GNU tar (Linux) both extract every
  // archive format used here (.zip, .tar.gz, .tar.xz) with plain -xf.
  execFileSync("tar", ["-xf", archive, "-C", tmp]);
  copyFileSync(join(tmp, spec.exeInArchive), targetPath);
  if (process.platform !== "win32") chmodSync(targetPath, 0o755);
  console.log(`Installed ${targetPath}`);
  return targetPath;
}

const typstPath = await fetchTool("typst", TYPST_VERSION, target.typst);
const pandocPath = await fetchTool("pandoc", PANDOC_VERSION, target.pandoc);
rmSync(tmp, { recursive: true, force: true });

// Tauri sidecars: the app expects target-triple-named copies under
// apps/desktop/src-tauri/binaries/ (git-ignored). Same binaries, new names.
const sidecars = join(root, "apps/desktop/src-tauri/binaries");
mkdirSync(sidecars, { recursive: true });
for (const [name, source] of [
  ["typst", typstPath],
  ["pandoc", pandocPath],
] as const) {
  const dest = join(sidecars, `${name}-${target.sidecarTriple}${exe}`);
  copyFileSync(source, dest);
  if (process.platform !== "win32") chmodSync(dest, 0o755);
}
console.log(`Sidecar copies placed in ${sidecars}`);

console.log("");
console.log(execFileSync(typstPath, ["--version"], { encoding: "utf8" }).trim());
console.log(execFileSync(pandocPath, ["--version"], { encoding: "utf8" }).split("\n", 1)[0]);
