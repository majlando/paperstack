// Webview side of the report preview. Loaded as an ES module via asWebviewUri;
// renders the exported PDF to canvases with pdf.js. Plain JS on purpose — it runs
// in the webview (a browser context), not the extension host, so it is not part
// of the tsc / esbuild build. The extension injects window.__paperstack before
// this module loads.
import * as pdfjsLib from "./pdf.min.mjs";

const vscodeApi = acquireVsCodeApi();
const cfg = window.__paperstack;
pdfjsLib.GlobalWorkerOptions.workerSrc = cfg.worker;

const pages = document.getElementById("pages");
const statusEl = document.getElementById("status");

document.getElementById("rebuild")?.addEventListener("click", () => {
  statusEl.textContent = "Rebuilding…";
  vscodeApi.postMessage({ type: "rebuild" });
});

async function render() {
  try {
    statusEl.textContent = "Rendering…";
    const pdf = await pdfjsLib.getDocument(cfg.url).promise;
    pages.replaceChildren();
    const dpr = window.devicePixelRatio || 1;
    for (let n = 1; n <= pdf.numPages; n++) {
      const page = await pdf.getPage(n);
      const viewport = page.getViewport({ scale: 1.5 * dpr });
      const canvas = document.createElement("canvas");
      canvas.className = "page";
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      canvas.style.width = `${viewport.width / dpr}px`;
      pages.appendChild(canvas);
      await page.render({ canvasContext: canvas.getContext("2d"), viewport }).promise;
    }
    statusEl.textContent = `${pdf.numPages} page${pdf.numPages === 1 ? "" : "s"}`;
  } catch (e) {
    statusEl.textContent = `Could not render the PDF: ${e?.message ?? e}`;
  }
}

render();
