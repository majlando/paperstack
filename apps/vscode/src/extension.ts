/**
 * Paperstack VS Code extension — the v-next direction made real
 * (docs/DIRECTION.md): the report engine is the product and the shell is
 * replaceable. The extension host runs Node, so this reuses the engine's own
 * `NodePlatform` and its checks verbatim — the length count and the
 * submission-readiness problems are the *same* code the desktop app runs, now
 * surfaced in VS Code's native Problems panel and status bar instead of a
 * bespoke UI.
 *
 * This file owns the franchise commands (Preview, Check, Export) and keeps the
 * status bar and Problems panel live; the authoring commands (New Report, the
 * Insert helpers, New Section) live in ./authoring.ts.
 */
import * as vscode from "vscode";
import { join } from "node:path";
import {
  loadProject,
  countProject,
  collectProblems,
  bibliographyKeys,
  findMathProblems,
  buildReport,
} from "@paperstack/engine";
import { ensureTypst } from "./typst.ts";
import { platform, findProjectDir, errorMessage } from "./project.ts";
import { registerAuthoringCommands } from "./authoring.ts";

let diagnostics: vscode.DiagnosticCollection;
let status: vscode.StatusBarItem;
let previewPanel: vscode.WebviewPanel | undefined;

export function activate(context: vscode.ExtensionContext): void {
  diagnostics = vscode.languages.createDiagnosticCollection("paperstack");
  status = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
  status.command = "paperstack.check";

  context.subscriptions.push(
    diagnostics,
    status,
    vscode.commands.registerCommand("paperstack.preview", () => preview(context)),
    vscode.commands.registerCommand("paperstack.check", () => runCheck(true)),
    vscode.commands.registerCommand("paperstack.export", () => exportPdf(context)),
    // A save to any section, the manifest, or the bibliography can change the
    // length or the problem set — re-check quietly so the panel stays live, and
    // rebuild the report preview if it is open so it tracks the source.
    vscode.workspace.onDidSaveTextDocument((doc) => {
      if (/\.md$|[/\\]document\.yaml$|[/\\]references\.bib$/.test(doc.fileName)) {
        void runCheck(false);
        if (previewPanel) scheduleRebuild(context);
      }
    }),
  );
  registerAuthoringCommands(context, () => void runCheck(false));

  void runCheck(false);
}

let rebuildTimer: ReturnType<typeof setTimeout> | undefined;

/**
 * Rebuild the open preview after a short quiet period — a burst of saves (e.g.
 * "Save All") coalesces into one Typst compile instead of one per file.
 */
function scheduleRebuild(context: vscode.ExtensionContext): void {
  if (rebuildTimer) clearTimeout(rebuildTimer);
  rebuildTimer = setTimeout(() => {
    rebuildTimer = undefined;
    const dir = findProjectDir();
    if (dir && previewPanel) void buildAndRender(dir, previewPanel, context, true);
  }, 400);
}

export function deactivate(): void {
  diagnostics?.dispose();
  status?.dispose();
}

/** Character offset → editor position, for diagnostics that line up with the cursor. */
function posAt(text: string, offset: number): vscode.Position {
  let line = 0;
  let lineStart = 0;
  const end = Math.min(offset, text.length);
  for (let i = 0; i < end; i++) {
    if (text[i] === "\n") {
      line++;
      lineStart = i + 1;
    }
  }
  return new vscode.Position(line, end - lineStart);
}

async function runCheck(interactive: boolean): Promise<void> {
  const dir = findProjectDir();
  if (!dir) {
    if (interactive) {
      void vscode.window.showWarningMessage("No Paperstack project (document.yaml) found in this workspace.");
    }
    return;
  }

  try {
    const project = await loadProject(platform, dir);
    const counts = await countProject(platform, project);

    // Same rule as the builder/desktop store: a non-empty references.bib
    // activates citation validation; without one, citations are inactive.
    let bibKeys = new Set<string>();
    try {
      bibKeys = bibliographyKeys(await platform.readTextFile(`${dir}/references.bib`));
    } catch {
      // no references.bib
    }

    const problems = await collectProblems(platform, project, counts, bibKeys, findMathProblems);

    // --- Status bar: length vs the cap ---
    const used = counts.bodyNormalsider;
    const cap = counts.cap;
    status.text = `$(book) ${used.toFixed(1)}/${cap} ns`;
    status.tooltip = counts.overCap
      ? `Paperstack: over the length cap by ${(used - cap).toFixed(2)} normalsider`
      : `Paperstack: ${(cap - used).toFixed(2)} normalsider to spare — click to re-check`;
    status.backgroundColor = counts.overCap
      ? new vscode.ThemeColor("statusBarItem.warningBackground")
      : undefined;
    status.show();

    // --- Problems → VS Code's native Problems panel ---
    const byFile = new Map<string, vscode.Diagnostic[]>();
    const textCache = new Map<string, string>();
    const fileText = async (rel: string): Promise<string> => {
      let t = textCache.get(rel);
      if (t === undefined) {
        t = await platform.readTextFile(`${dir}/${rel}`).catch(() => "");
        textCache.set(rel, t);
      }
      return t;
    };

    for (const p of problems) {
      // Project-level problems (e.g. over-cap) have no file — pin them to the manifest.
      const rel = p.file ?? "document.yaml";
      const start = p.offset !== undefined ? posAt(await fileText(rel), p.offset) : new vscode.Position(0, 0);
      const range = new vscode.Range(start, new vscode.Position(start.line, start.character + 1));
      const d = new vscode.Diagnostic(
        range,
        p.message,
        p.severity === "error" ? vscode.DiagnosticSeverity.Error : vscode.DiagnosticSeverity.Warning,
      );
      d.source = "Paperstack";
      const list = byFile.get(rel) ?? [];
      list.push(d);
      byFile.set(rel, list);
    }

    diagnostics.clear();
    for (const [rel, list] of byFile) {
      diagnostics.set(vscode.Uri.file(join(dir, rel)), list);
    }

    if (interactive) {
      const errors = problems.filter((p) => p.severity === "error").length;
      const warnings = problems.length - errors;
      if (errors === 0 && warnings === 0) {
        void vscode.window.showInformationMessage("Paperstack: ready to submit — no problems found.");
      } else {
        void vscode.window.showInformationMessage(
          `Paperstack: ${errors} error(s), ${warnings} warning(s) — see the Problems panel.`,
        );
      }
    }
  } catch (e) {
    void vscode.window.showErrorMessage(errorMessage(e, "Paperstack check failed"));
  }
}

async function exportPdf(context: vscode.ExtensionContext): Promise<void> {
  const dir = findProjectDir();
  if (!dir) {
    void vscode.window.showWarningMessage("No Paperstack project (document.yaml) found in this workspace.");
    return;
  }

  await vscode.window.withProgress(
    { location: vscode.ProgressLocation.Notification, title: "Paperstack: exporting PDF…" },
    async (progress) => {
      try {
        const typst = await resolveTypst(context, (m) => progress.report({ message: m }));
        const result = await buildReport(platform, dir, { typst });
        const tail = result.warnings.length ? ` (${result.warnings.length} warning(s))` : "";
        const choice = await vscode.window.showInformationMessage(`Report exported${tail}.`, "Open PDF");
        if (choice === "Open PDF") {
          await vscode.commands.executeCommand("vscode.open", vscode.Uri.file(result.pdfPath));
        }
      } catch (e) {
        void vscode.window.showErrorMessage(errorMessage(e, "Export failed"));
      }
    },
  );
}

/**
 * The PDF engine path: an explicit `paperstack.typstPath` if the user set one,
 * otherwise the pinned Typst the extension downloads and caches itself (zero
 * setup — see ./typst.ts).
 */
async function resolveTypst(
  context: vscode.ExtensionContext,
  onProgress?: (message: string) => void,
): Promise<string> {
  const configured = vscode.workspace.getConfiguration("paperstack").get<string>("typstPath")?.trim();
  if (configured) return configured;
  return ensureTypst(context.globalStorageUri.fsPath, onProgress);
}

/**
 * Build the report and show it in a live PDF preview beside the editor — the
 * extension's "View Report". One reusable panel; the in-webview Rebuild button
 * recompiles. Rendering is pdf.js in the webview (media/preview.js).
 */
async function preview(context: vscode.ExtensionContext): Promise<void> {
  const dir = findProjectDir();
  if (!dir) {
    void vscode.window.showWarningMessage("No Paperstack project (document.yaml) found in this workspace.");
    return;
  }

  if (!previewPanel) {
    previewPanel = vscode.window.createWebviewPanel(
      "paperstackPreview",
      "Report Preview",
      { viewColumn: vscode.ViewColumn.Beside, preserveFocus: true },
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [
          vscode.Uri.joinPath(context.extensionUri, "media"),
          ...(vscode.workspace.workspaceFolders ?? []).map((f) => f.uri),
        ],
      },
    );
    previewPanel.onDidDispose(() => {
      previewPanel = undefined;
    });
    previewPanel.webview.onDidReceiveMessage((m: { type?: string }) => {
      if (m?.type === "rebuild") void preview(context);
    });
  }
  await buildAndRender(dir, previewPanel, context);
}

async function buildAndRender(
  dir: string,
  panel: vscode.WebviewPanel,
  context: vscode.ExtensionContext,
  // Auto-rebuilds (on save) report in the status bar, not a notification per save.
  quiet = false,
): Promise<void> {
  const { webview } = panel;
  try {
    const result = await vscode.window.withProgress(
      {
        location: quiet ? vscode.ProgressLocation.Window : vscode.ProgressLocation.Notification,
        title: "Paperstack: building report…",
      },
      async (progress) => {
        const typst = await resolveTypst(context, (m) => progress.report({ message: m }));
        return buildReport(platform, dir, { typst });
      },
    );
    const asset = (...p: string[]) =>
      webview.asWebviewUri(vscode.Uri.joinPath(context.extensionUri, "media", ...p)).toString();
    // Cache-bust the PDF so a rebuild re-fetches it rather than re-showing the old one.
    const pdfUrl = `${webview.asWebviewUri(vscode.Uri.file(result.pdfPath))}?t=${Date.now()}`;
    webview.html = previewHtml(webview, asset("preview.js"), pdfUrl, asset("pdf.worker.min.mjs"), result.warnings);
  } catch (e) {
    webview.html = messageHtml(webview, errorMessage(e, "Build failed"));
  }
}

function nonce(): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let s = "";
  for (let i = 0; i < 24; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return s;
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) =>
    c === "&" ? "&amp;" : c === "<" ? "&lt;" : c === ">" ? "&gt;" : c === '"' ? "&quot;" : "&#39;",
  );
}

function pageShell(webview: vscode.Webview, n: string, body: string, headExtra = ""): string {
  const csp = [
    `default-src 'none'`,
    `img-src ${webview.cspSource} data:`,
    `style-src ${webview.cspSource} 'unsafe-inline'`,
    `script-src 'nonce-${n}' ${webview.cspSource}`,
    `worker-src ${webview.cspSource} blob:`,
    `connect-src ${webview.cspSource}`,
  ].join("; ");
  return `<!doctype html><html><head><meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="${csp}">
<style>
  body { margin: 0; font: 13px var(--vscode-font-family); color: var(--vscode-foreground); }
  #bar { position: sticky; top: 0; display: flex; gap: 12px; align-items: center;
         padding: 6px 12px; background: var(--vscode-editor-background);
         border-bottom: 1px solid var(--vscode-panel-border); }
  #bar button { font: inherit; color: var(--vscode-button-foreground);
                background: var(--vscode-button-background); border: none;
                padding: 3px 10px; border-radius: 3px; cursor: pointer; }
  #status { color: var(--vscode-descriptionForeground); }
  .warn { padding: 6px 12px; color: var(--vscode-editorWarning-foreground); }
  #pages { display: flex; flex-direction: column; align-items: center; gap: 12px; padding: 16px; }
  canvas.page { box-shadow: 0 0 0 1px var(--vscode-panel-border); background: #fff; max-width: 100%; }
  .msg { padding: 24px; line-height: 1.5; }
</style>${headExtra}</head><body>${body}</body></html>`;
}

function previewHtml(
  webview: vscode.Webview,
  scriptUrl: string,
  pdfUrl: string,
  workerUrl: string,
  warnings: string[],
): string {
  const n = nonce();
  const warn = warnings.length
    ? `<div class="warn">${warnings.map(escapeHtml).join("<br>")}</div>`
    : "";
  const body = `
<div id="bar"><button id="rebuild">Rebuild</button><span id="status">Rendering…</span></div>
${warn}
<div id="pages"></div>
<script nonce="${n}">window.__paperstack = ${JSON.stringify({ url: pdfUrl, worker: workerUrl })};</script>
<script nonce="${n}" type="module" src="${scriptUrl}"></script>`;
  return pageShell(webview, n, body);
}

function messageHtml(webview: vscode.Webview, message: string): string {
  const n = nonce();
  return pageShell(webview, n, `<div class="msg">${escapeHtml(message)}</div>`);
}
