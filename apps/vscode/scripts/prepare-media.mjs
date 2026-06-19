// Copies the pdf.js runtime into media/ so the preview webview can load it via
// asWebviewUri. These two files are build artifacts (git-ignored); media/preview.js
// is ours. Run from the extension's `build` / `vscode:prepublish` scripts.
import { createRequire } from "node:module";
import { copyFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const here = dirname(fileURLToPath(import.meta.url));
const media = join(here, "..", "media");
mkdirSync(media, { recursive: true });

// require.resolve("pdfjs-dist") → .../pdfjs-dist/build/pdf.mjs; its dir is the build dir.
const buildDir = dirname(require.resolve("pdfjs-dist"));
for (const file of ["pdf.min.mjs", "pdf.worker.min.mjs"]) {
  copyFileSync(join(buildDir, file), join(media, file));
  console.log(`prepare-media: copied ${file}`);
}
