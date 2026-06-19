/**
 * Paperstack VS Code extension — a spike proving the v-next direction
 * (docs/DIRECTION.md): the report engine is the product and the shell is
 * replaceable. The extension host runs Node, so this reuses the engine's own
 * `NodePlatform` and its checks verbatim — the length count and the
 * submission-readiness problems are the *same* code the desktop app runs, now
 * surfaced in VS Code's native Problems panel and status bar instead of a
 * bespoke UI.
 *
 * Commands: "Paperstack: Check Report", "Paperstack: Export PDF".
 */
import * as vscode from "vscode";
import { existsSync } from "node:fs";
import { join } from "node:path";
import {
  loadProject,
  countProject,
  collectProblems,
  bibliographyKeys,
  findMathProblems,
  buildReport,
  PaperstackError,
  type Problem,
} from "@paperstack/engine";
import { NodePlatform } from "@paperstack/engine/node";

const platform = new NodePlatform();
let diagnostics: vscode.DiagnosticCollection;
let status: vscode.StatusBarItem;

export function activate(context: vscode.ExtensionContext): void {
  diagnostics = vscode.languages.createDiagnosticCollection("paperstack");
  status = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
  status.command = "paperstack.check";

  context.subscriptions.push(
    diagnostics,
    status,
    vscode.commands.registerCommand("paperstack.check", () => runCheck(true)),
    vscode.commands.registerCommand("paperstack.export", exportPdf),
    // A save to any section, the manifest, or the bibliography can change the
    // length or the problem set — re-check quietly so the panel stays live.
    vscode.workspace.onDidSaveTextDocument((doc) => {
      if (/\.md$|[/\\]document\.yaml$|[/\\]references\.bib$/.test(doc.fileName)) void runCheck(false);
    }),
  );

  void runCheck(false);
}

export function deactivate(): void {
  diagnostics?.dispose();
  status?.dispose();
}

/** First workspace folder that holds a document.yaml — the project root loadProject expects. */
function findProjectDir(): string | null {
  for (const folder of vscode.workspace.workspaceFolders ?? []) {
    const dir = folder.uri.fsPath;
    if (existsSync(join(dir, "document.yaml"))) return dir.replaceAll("\\", "/");
  }
  return null;
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
    const msg = e instanceof PaperstackError ? e.userMessage : `Paperstack check failed: ${String(e)}`;
    void vscode.window.showErrorMessage(msg);
  }
}

async function exportPdf(): Promise<void> {
  const dir = findProjectDir();
  if (!dir) {
    void vscode.window.showWarningMessage("No Paperstack project (document.yaml) found in this workspace.");
    return;
  }
  const typst = vscode.workspace.getConfiguration("paperstack").get<string>("typstPath") || "typst";

  await vscode.window.withProgress(
    { location: vscode.ProgressLocation.Notification, title: "Paperstack: exporting PDF…" },
    async () => {
      try {
        const result = await buildReport(platform, dir, { typst });
        const tail = result.warnings.length ? ` (${result.warnings.length} warning(s))` : "";
        const choice = await vscode.window.showInformationMessage(`Report exported${tail}.`, "Open PDF");
        if (choice === "Open PDF") {
          await vscode.commands.executeCommand("vscode.open", vscode.Uri.file(result.pdfPath));
        }
      } catch (e) {
        const msg = e instanceof PaperstackError ? e.userMessage : `Export failed: ${String(e)}`;
        void vscode.window.showErrorMessage(msg);
      }
    },
  );
}
