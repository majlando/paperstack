/**
 * Authoring commands — the Command Palette equivalents of the desktop app's
 * Insert controls and "New Report", wired straight to the engine helpers so the
 * extension is a complete authoring loop on its own (docs/DIRECTION.md). Nothing
 * here owns an editor surface: inserts land at the cursor in the active section,
 * because VS Code is the editor.
 */
import * as vscode from "vscode";
import {
  createProject,
  loadProject,
  newSectionFile,
  addSectionToYaml,
  importFigure,
  suggestedCaption,
  figureMarkdown,
  tableMarkdown,
  parseBibliography,
  dirOf,
  SECTION_ROLES,
  type SectionRole,
} from "@paperstack/engine";
import { platform, findProjectDir, errorMessage } from "./project.ts";

/**
 * Starter Mermaid diagrams, one per kind. Mirrors the desktop's InsertControls:
 * the fence is added at insert time so an optional caption can ride in the info
 * string. Kept to kinds that render to plain SVG and survive the print pipeline.
 */
const DIAGRAM_TEMPLATES: { label: string; hint: string; body: string }[] = [
  { label: "Flowchart", hint: "Steps and decisions", body: "flowchart TD\n    A[Start] --> B{Decision?}\n    B -->|Yes| C[Do this]\n    B -->|No| D[Do that]" },
  { label: "Sequence", hint: "Messages between participants over time", body: "sequenceDiagram\n    participant A as Client\n    participant B as Server\n    A->>B: Request\n    B-->>A: Response" },
  { label: "Class", hint: "Classes, fields, and relationships", body: "classDiagram\n    class Animal {\n        +String name\n        +eat()\n    }\n    Animal <|-- Dog" },
  { label: "State", hint: "States and transitions", body: "stateDiagram-v2\n    [*] --> Idle\n    Idle --> Running: start\n    Running --> Idle: stop\n    Running --> [*]" },
  { label: "Entity relationship", hint: "Tables and how they relate", body: "erDiagram\n    CUSTOMER ||--o{ ORDER : places\n    ORDER ||--|{ LINE_ITEM : contains" },
  { label: "Gantt", hint: "Tasks on a timeline", body: "gantt\n    title Project plan\n    dateFormat YYYY-MM-DD\n    section Phase 1\n    Analysis :a1, 2026-01-01, 7d\n    Design   :after a1, 5d" },
  { label: "Pie", hint: "Proportions of a whole", body: 'pie title Time spent\n    "Coding" : 45\n    "Testing" : 30\n    "Docs" : 25' },
];

/**
 * A fenced mermaid block. A non-empty caption rides in the info string as a
 * quoted string (```mermaid "caption"```), which the build turns into a numbered
 * figure; quotes and backticks are dropped so they can't break the fence.
 */
function diagramSnippet(body: string, caption: string): string {
  const clean = caption.replace(/["`]/g, "").trim();
  const fence = clean ? `\`\`\`mermaid "${clean}"` : "```mermaid";
  return `${fence}\n${body}\n\`\`\``;
}

/** Parses a "rows×cols" answer ("2x3", "2 × 3", "2*3"); null when unrecognizable. */
function parseTableShape(input: string): { rows: number; cols: number } | null {
  const m = input.trim().match(/^(\d+)\s*[x×*]\s*(\d+)$/i);
  if (!m) return null;
  return { rows: Number(m[1]), cols: Number(m[2]) };
}

/** Friendly labels for the section-role picker; order follows SECTION_ROLES. */
const ROLE_HINTS: Record<SectionRole, string> = {
  "front-matter": "Before the body (abstract, preface) — not counted toward the cap",
  body: "Counts toward the length cap",
  "back-matter": "After the body (conclusion, glossary)",
  appendix: "Lettered appendix",
};

/** The active editor, but only when it is a report section (a Markdown file). */
function sectionEditor(): vscode.TextEditor | null {
  const editor = vscode.window.activeTextEditor;
  if (!editor || editor.document.languageId !== "markdown") {
    void vscode.window.showWarningMessage(
      "Open the report section you want to edit, then place the cursor where the content should go.",
    );
    return null;
  }
  return editor;
}

/** Insert `body` as its own paragraph at the cursor, padding blank lines as needed. */
async function insertBlock(editor: vscode.TextEditor, body: string): Promise<void> {
  const pos = editor.selection.active;
  const line = editor.document.lineAt(pos.line);
  const lead = line.text.slice(0, pos.character).trim() === "" ? "" : "\n\n";
  const trail = line.text.slice(pos.character).trim() === "" ? "\n" : "\n\n";
  await editor.edit((e) => e.insert(pos, `${lead}${body}${trail}`));
}

/** Replace the selection (or insert at the cursor) with inline `text`. */
async function insertInline(editor: vscode.TextEditor, text: string): Promise<void> {
  await editor.edit((e) => e.replace(editor.selection, text));
}

async function newReport(): Promise<void> {
  const picked = await vscode.window.showOpenDialog({
    canSelectFiles: false,
    canSelectFolders: true,
    canSelectMany: false,
    openLabel: "Create report here",
    title: "Choose a folder for the new report",
  });
  if (!picked || !picked[0]) return;
  const dir = picked[0].fsPath.replaceAll("\\", "/");

  const title = await vscode.window.showInputBox({
    prompt: "Report title",
    placeHolder: "e.g. Exam report — Group 7",
    validateInput: (v) => (v.trim() ? null : "A title is required."),
  });
  if (title === undefined) return;

  const language = await vscode.window.showQuickPick(
    [
      { label: "English", value: "en" as const },
      { label: "Danish", value: "da" as const },
    ],
    { placeHolder: "Report language" },
  );
  if (!language) return;

  try {
    // Node host: a real date is fine, and createProject writes it deterministically.
    const date = new Date().toISOString().slice(0, 10);
    await createProject(platform, dir, { title: title.trim(), language: language.value, date });
  } catch (e) {
    void vscode.window.showErrorMessage(errorMessage(e, "Could not create the report"));
    return;
  }
  // Reopen the workspace on the new project so the extension activates on it.
  await vscode.commands.executeCommand("vscode.openFolder", vscode.Uri.file(dir), {
    forceNewWindow: false,
  });
}

async function insertFigure(): Promise<void> {
  const dir = findProjectDir();
  if (!dir) return void noProject();
  const editor = sectionEditor();
  if (!editor) return;

  const picked = await vscode.window.showOpenDialog({
    canSelectMany: false,
    openLabel: "Insert Figure",
    filters: { Images: ["png", "jpg", "jpeg", "svg", "gif", "webp"] },
    title: "Insert Figure — choose an image",
  });
  if (!picked || !picked[0]) return;
  const source = picked[0].fsPath;

  const caption = await vscode.window.showInputBox({
    prompt: "Figure caption (becomes “Figure N: …” in the PDF)",
    value: suggestedCaption(source),
  });
  if (caption === undefined) return;

  const width = await vscode.window.showInputBox({
    prompt: "Figure width (optional)",
    placeHolder: "e.g. 60% or 8cm — leave blank for full width",
  });
  if (width === undefined) return;

  try {
    // Copies the image into the project's images folder (collision-safe) and
    // returns its project-relative path.
    const rel = await importFigure(platform, dir, source);
    await insertBlock(editor, figureMarkdown(rel, caption.trim(), width.trim() || undefined));
  } catch (e) {
    void vscode.window.showErrorMessage(errorMessage(e, "Could not insert the figure"));
  }
}

async function insertDiagram(): Promise<void> {
  if (!findProjectDir()) return void noProject();
  const editor = sectionEditor();
  if (!editor) return;

  const kind = await vscode.window.showQuickPick(
    DIAGRAM_TEMPLATES.map((d) => ({ label: d.label, detail: d.hint, body: d.body })),
    { placeHolder: "Choose a diagram kind — you then edit the starter block" },
  );
  if (!kind) return;

  const caption = await vscode.window.showInputBox({
    prompt: "Caption (optional) — a caption makes it a numbered figure",
    placeHolder: "e.g. System architecture",
  });
  if (caption === undefined) return;

  await insertBlock(editor, diagramSnippet(kind.body, caption));
}

async function insertTable(): Promise<void> {
  if (!findProjectDir()) return void noProject();
  const editor = sectionEditor();
  if (!editor) return;

  const answer = await vscode.window.showInputBox({
    prompt: "Table size as rows×columns (rows are body rows; a header row is added)",
    value: "2x3",
    validateInput: (v) => (parseTableShape(v) ? null : "Enter a size like 2x3."),
  });
  if (answer === undefined) return;
  const shape = parseTableShape(answer);
  if (!shape) return;

  await insertBlock(editor, tableMarkdown(shape.rows, shape.cols));
}

async function insertCitation(): Promise<void> {
  const dir = findProjectDir();
  if (!dir) return void noProject();
  const editor = sectionEditor();
  if (!editor) return;

  let text = "";
  try {
    text = await platform.readTextFile(`${dir}/references.bib`);
  } catch {
    // no references.bib — handled by the empty check below
  }
  const entries = parseBibliography(text);
  if (entries.length === 0) {
    void vscode.window.showInformationMessage(
      "No references yet — add entries to references.bib first, then cite them.",
    );
    return;
  }

  const entry = await vscode.window.showQuickPick(
    entries.map((e) => ({
      label: e.key,
      description: e.year ?? "",
      detail: [e.author, e.title].filter(Boolean).join(" — "),
      key: e.key,
    })),
    { placeHolder: "Choose a reference to cite", matchOnDetail: true },
  );
  if (!entry) return;

  const form = await vscode.window.showQuickPick(
    [
      { label: "Parenthetical", detail: "(Author, year)", narrative: false },
      { label: "Narrative", detail: "Author (year)", narrative: true },
    ],
    { placeHolder: "Citation style" },
  );
  if (!form) return;

  // Parenthetical via [@key]; narrative via the bare @key form — both render APA.
  await insertInline(editor, form.narrative ? `@${entry.key}` : `[@${entry.key}]`);
}

async function newSection(refresh: () => void): Promise<void> {
  const dir = findProjectDir();
  if (!dir) return void noProject();

  const name = await vscode.window.showInputBox({
    prompt: "New section name",
    placeHolder: "e.g. Implementation",
    validateInput: (v) => (v.trim() ? null : "A name is required."),
  });
  if (name === undefined) return;

  // Lead with "body" — the overwhelmingly common case for a new section.
  const roleOrder: SectionRole[] = ["body", ...SECTION_ROLES.filter((r) => r !== "body")];
  const rolePick = await vscode.window.showQuickPick(
    roleOrder.map((role) => ({ label: role, detail: ROLE_HINTS[role], role })),
    { placeHolder: "Section role" },
  );
  if (!rolePick) return;

  try {
    const project = await loadProject(platform, dir);
    const file = newSectionFile(project.meta.sections, rolePick.role, name);
    const path = `${dir}/${file}`;
    if (!(await platform.fileExists(path))) {
      const sub = dirOf(file);
      if (sub) await platform.mkdir(`${dir}/${sub}`);
      await platform.writeTextFile(path, `# ${name.trim()}\n`);
    }
    // document.yaml is the source of truth for order — register the new file
    // there, going through the engine so comments and formatting survive.
    const yamlPath = `${dir}/document.yaml`;
    const yaml = await platform.readTextFile(yamlPath);
    const next = addSectionToYaml(yaml, file, rolePick.role);
    if (next !== yaml) await platform.writeTextFile(yamlPath, next);

    // Uri.file accepts forward slashes on every OS — don't hand-swap separators.
    await vscode.window.showTextDocument(vscode.Uri.file(path));
    refresh();
  } catch (e) {
    void vscode.window.showErrorMessage(errorMessage(e, "Could not add the section"));
  }
}

function noProject(): void {
  void vscode.window.showWarningMessage(
    "No Paperstack project (document.yaml) found in this workspace.",
  );
}

/**
 * Registers every authoring command. `refresh` re-runs the check so the length
 * and Problems stay live after a change that does not go through an editor save
 * (e.g. a new section written straight to disk).
 */
export function registerAuthoringCommands(
  context: vscode.ExtensionContext,
  refresh: () => void,
): void {
  context.subscriptions.push(
    vscode.commands.registerCommand("paperstack.new", () => newReport()),
    vscode.commands.registerCommand("paperstack.insertFigure", () => insertFigure()),
    vscode.commands.registerCommand("paperstack.insertDiagram", () => insertDiagram()),
    vscode.commands.registerCommand("paperstack.insertTable", () => insertTable()),
    vscode.commands.registerCommand("paperstack.insertCitation", () => insertCitation()),
    vscode.commands.registerCommand("paperstack.newSection", () => newSection(refresh)),
  );
}
