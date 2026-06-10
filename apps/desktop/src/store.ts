import { create } from "zustand";
import {
  loadProject,
  createProject as scaffoldProject,
  countProject,
  applySectionContent,
  extractMermaidBlocks,
  buildReport,
  addSectionToYaml,
  removeSectionFromYaml,
  moveSectionInYaml,
  renameSectionInYaml,
  editMetadataInYaml,
  PaperstackError,
  type MetadataEdit,
  type Project,
  type ProjectCounts,
  type Section,
  type SectionRole,
} from "@paperstack/engine";
import { platform, SIDECARS } from "./platform/tauri-platform.ts";
import { renderMermaidSvg } from "./preview/mermaid.ts";

interface AppState {
  projectDir: string | null;
  project: Project | null;
  counts: ProjectCounts | null;
  /** Project-relative path of the section open in the editor. */
  activeFile: string | null;
  content: string;
  /**
   * The active section's content as last read from / written to disk. Saves
   * compare the file on disk against this to detect edits made outside the
   * app (e.g. a git pull) before overwriting them.
   */
  baseline: string;
  /**
   * Set when a save was blocked because the file changed on disk while it had
   * unsaved edits here. Resolved explicitly by the user via the actions below.
   */
  conflict: { file: string; diskContent: string } | null;
  /**
   * Bumped whenever `content` is replaced from outside the editor (section
   * switch, project reload) — the editor component watches this to know when
   * to push the store content into CodeMirror. Keystrokes do not bump it.
   */
  contentVersion: number;
  dirty: boolean;
  /** `message` is the readable headline; `details` is raw tool output for diagnostics. */
  error: { message: string; details?: string } | null;
  /** Success message (e.g. after export) — the friendly counterpart of `error`. */
  notice: string | null;
  /** A report compile is running (View Report / Export PDF). */
  building: boolean;
  /** Snapshot of the last compiled report, shown in the right pane's Report tab. */
  report: { pdfPath: string; warnings: string[]; builtAt: number } | null;
  /** What the right pane shows: the live section preview or the report PDF. */
  pane: "preview" | "report";
  /** The report-details form is open (replaces the editor + preview area). */
  metadataOpen: boolean;

  openProject(dir: string): Promise<void>;
  /** Scaffolds a new SEA report in `dir` (or just opens it if it already is one). */
  createProject(dir: string): Promise<void>;
  reloadProject(): Promise<void>;
  openSection(file: string): Promise<void>;
  /** Creates the section file (heading stub) and adds it to document.yaml. */
  addSection(role: SectionRole, name: string): Promise<void>;
  /** Takes the section out of the report structure; the file stays on disk. */
  removeSection(file: string): Promise<void>;
  moveSection(file: string, direction: "up" | "down"): Promise<void>;
  /** Renames the file on disk (same folder) and updates document.yaml. */
  renameSection(file: string, newStem: string): Promise<void>;
  setContent(content: string): void;
  /**
   * Returns false when the content was not written (write failed, or the file
   * changed on disk and the save was blocked) — the section stays dirty.
   * `force` skips the conflict guard (used by "keep my version").
   */
  saveActive(force?: boolean): Promise<boolean>;
  resolveConflictKeepMine(): Promise<void>;
  resolveConflictUseDisk(): void;
  /** Compile the report and show the PDF in the right pane. */
  viewReport(): Promise<void>;
  /** Compile the report and write output/report.pdf (or the locked-file fallback). */
  exportPdf(): Promise<void>;
  showPreview(): void;
  openMetadata(): Promise<void>;
  closeMetadata(): void;
  /** Returns false when the save failed — the form stays open with the error visible. */
  saveMetadata(edit: MetadataEdit): Promise<boolean>;
  clearError(): void;
  clearNotice(): void;
}

function toError(e: unknown): { message: string; details?: string } {
  return e instanceof PaperstackError
    ? { message: e.userMessage, details: e.details }
    : { message: String(e) };
}

/** Filename-safe slug: "Løsning & Design" → "loesning-design". */
function slugify(name: string): string {
  const danish: Record<string, string> = { æ: "ae", ø: "oe", å: "aa" };
  const slug = name
    .trim()
    .toLowerCase()
    .replace(/[æøå]/g, (c) => danish[c]!)
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "") // strip combining diacritics (é → e)
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug || "section";
}

/**
 * Picks a file path for a new section, following the project's filename
 * conventions (purely cosmetic — order lives in document.yaml): numbered
 * prefixes under sections/, letters for appendices/.
 */
function newSectionFile(sections: Section[], role: SectionRole, name: string): string {
  const slug = slugify(name);
  if (role === "appendix") {
    // Next letter after the highest in use — counting would repeat letters
    // after a removal (remove appendix-a, add → "a" again beside appendix-b).
    let used = 0;
    for (const s of sections) {
      const m = s.file.match(/^appendices\/appendix-([a-z])[-_.]/);
      if (m) used = Math.max(used, m[1]!.charCodeAt(0) - 96);
    }
    const letter = String.fromCharCode(97 + Math.min(used, 25));
    return `appendices/appendix-${letter}-${slug}.md`;
  }
  let max = 0;
  for (const s of sections) {
    const m = s.file.match(/^sections\/(\d+)/);
    if (m) max = Math.max(max, Number(m[1]));
  }
  return `sections/${String(max + 1).padStart(2, "0")}-${slug}.md`;
}

/**
 * Recently opened projects, newest first. Stored in the webview's
 * localStorage — app-private state never goes into the project folder.
 */
const RECENTS_KEY = "paperstack.recentProjects";

/** Set after the first successful build this session — recompiles skip the binary probe. */
let binariesVerified = false;

export function getRecentProjects(): string[] {
  try {
    const list: unknown = JSON.parse(localStorage.getItem(RECENTS_KEY) ?? "[]");
    return Array.isArray(list) ? list.filter((p): p is string => typeof p === "string") : [];
  } catch {
    return [];
  }
}

function rememberProject(dir: string): void {
  try {
    const list = [dir, ...getRecentProjects().filter((p) => p !== dir)].slice(0, 8);
    localStorage.setItem(RECENTS_KEY, JSON.stringify(list));
  } catch {
    // recents are a convenience — never fail an open over them
  }
}

/** "C:/repos/smart-home-hub" → "Smart home hub". */
function titleFromDir(dir: string): string {
  const base = dir
    .slice(dir.lastIndexOf("/") + 1)
    .replace(/[-_]+/g, " ")
    .trim();
  return base ? base.charAt(0).toUpperCase() + base.slice(1) : "Report";
}

/** Read–edit–write document.yaml; skips the write when nothing changed. */
async function editDocumentYaml(
  projectDir: string,
  edit: (yamlText: string) => string,
): Promise<void> {
  const path = `${projectDir}/document.yaml`;
  const text = await platform.readTextFile(path);
  const next = edit(text);
  if (next !== text) await platform.writeTextFile(path, next);
}

/**
 * Render any not-yet-rendered ```mermaid blocks to diagrams/rendered/<hash>.svg
 * (the files PDF export embeds). Hash-named, so unchanged diagrams are free
 * and edited ones render fresh. Invalid diagrams are skipped — the preview
 * shows the error inline, and export reports it readably.
 */
async function renderDiagramsToDisk(projectDir: string, content: string): Promise<void> {
  try {
    const { blocks } = extractMermaidBlocks(content);
    if (blocks.length === 0) return;
    await platform.mkdir(`${projectDir}/diagrams/rendered`);
    for (const block of blocks) {
      const path = `${projectDir}/${block.renderedPath}`;
      if (await platform.fileExists(path)) continue;
      try {
        const svg = await renderMermaidSvg(`save-${block.hash}`, block.code);
        await platform.writeTextFile(path, svg);
      } catch {
        // invalid diagram source — handled visibly in preview and at export
      }
    }
  } catch {
    // best-effort: rendering must never block a save; export reports missing renders readably
  }
}

export const useStore = create<AppState>((set, get) => {
  /** Shared build path for View Report and Export PDF: save, compile, sync counters. */
  async function runBuild(): Promise<{ pdfPath: string; warnings: string[] } | null> {
    const { projectDir, building } = get();
    // Re-entrancy guard — two compiles would race in the same output/.build.
    // (The UI also disables its buttons, but the store must not rely on that.)
    if (!projectDir || building) return null;
    // A blocked save (write failure or conflict) keeps its own error visible.
    if (!(await get().saveActive())) return null;
    set({ building: true });
    try {
      const result = await buildReport(platform, projectDir, {
        typst: SIDECARS.typst,
        pandoc: SIDECARS.pandoc,
        // After one successful build the binaries are known-good; skip the
        // startup probe on recompiles (it costs two process spawns).
        skipPreflight: binariesVerified,
      });
      binariesVerified = true;
      // The build re-reads every section — its counts are authoritative.
      set({ counts: result.counts, error: null });
      return result;
    } catch (e) {
      set({ error: toError(e) });
      return null;
    } finally {
      set({ building: false });
    }
  }

  return {
  projectDir: null,
  project: null,
  counts: null,
  activeFile: null,
  content: "",
  baseline: "",
  conflict: null,
  contentVersion: 0,
  dirty: false,
  error: null,
  notice: null,
  building: false,
  report: null,
  pane: "preview",
  metadataOpen: false,

  async openProject(dir: string) {
    try {
      const normalized = dir.replaceAll("\\", "/");
      const project = await loadProject(platform, normalized);
      const counts = await countProject(platform, project);
      set({
        projectDir: normalized,
        project,
        counts,
        activeFile: null,
        content: "",
        baseline: "",
        conflict: null,
        dirty: false,
        error: null,
        notice: null,
        report: null,
        pane: "preview",
        metadataOpen: false,
      });
      rememberProject(normalized);
      const first = project.meta.sections.find((s) => s.role === "body") ?? project.meta.sections[0];
      if (first) await get().openSection(first.file);
    } catch (e) {
      set({ error: toError(e) });
    }
  },

  async createProject(dir: string) {
    const normalized = dir.replaceAll("\\", "/").replace(/\/+$/, "");
    try {
      // Picking a folder that already is a report just opens it.
      if (!(await platform.fileExists(`${normalized}/document.yaml`))) {
        const now = new Date();
        const pad = (n: number) => String(n).padStart(2, "0");
        await scaffoldProject(platform, normalized, {
          title: titleFromDir(normalized),
          date: `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`,
        });
      }
      await get().openProject(normalized);
    } catch (e) {
      set({ error: toError(e) });
    }
  },

  async reloadProject() {
    const { projectDir, activeFile, dirty } = get();
    if (!projectDir) return;
    try {
      const project = await loadProject(platform, projectDir);
      const counts = await countProject(platform, project);
      set({ project, counts, error: null });
      // re-read the open section unless the user has unsaved changes
      if (activeFile && !dirty && project.meta.sections.some((s) => s.file === activeFile)) {
        const content = await platform.readTextFile(`${projectDir}/${activeFile}`);
        set({ content, baseline: content, contentVersion: get().contentVersion + 1 });
      }
    } catch (e) {
      set({ error: toError(e) });
    }
  },

  async openSection(file: string) {
    const { projectDir, dirty, saveActive } = get();
    if (!projectDir) return;
    // A failed save must not be papered over: stay on the current section so
    // the unsaved edits and the error stay visible.
    if (dirty && !(await saveActive())) return;
    try {
      const content = await platform.readTextFile(`${projectDir}/${file}`);
      set({
        activeFile: file,
        content,
        baseline: content,
        conflict: null,
        contentVersion: get().contentVersion + 1,
        dirty: false,
        error: null,
      });
      // Sections edited outside the app may contain never-rendered diagrams.
      void renderDiagramsToDisk(projectDir, content);
    } catch (e) {
      set({ error: toError(e) });
    }
  },

  async addSection(role: SectionRole, name: string) {
    const { projectDir, project } = get();
    if (!projectDir || !project) return;
    try {
      const file = newSectionFile(project.meta.sections, role, name);
      const path = `${projectDir}/${file}`;
      if (!(await platform.fileExists(path))) {
        await platform.mkdir(`${projectDir}/${file.slice(0, file.lastIndexOf("/"))}`);
        await platform.writeTextFile(path, `# ${name.trim()}\n`);
      }
      await editDocumentYaml(projectDir, (t) => addSectionToYaml(t, file, role));
      await get().reloadProject();
      await get().openSection(file);
    } catch (e) {
      set({ error: toError(e) });
    }
  },

  async removeSection(file: string) {
    const { projectDir, activeFile, saveActive } = get();
    if (!projectDir) return;
    // Removal only takes the section out of the report — the file stays on
    // disk, so flush pending edits to it first.
    if (file === activeFile && !(await saveActive())) return;
    try {
      await editDocumentYaml(projectDir, (t) => removeSectionFromYaml(t, file));
      if (get().activeFile === file) {
        set({
          activeFile: null,
          content: "",
          baseline: "",
          dirty: false,
          contentVersion: get().contentVersion + 1,
        });
      }
      await get().reloadProject();
    } catch (e) {
      set({ error: toError(e) });
    }
  },

  async moveSection(file: string, direction: "up" | "down") {
    const { projectDir } = get();
    if (!projectDir) return;
    try {
      await editDocumentYaml(projectDir, (t) => moveSectionInYaml(t, file, direction));
      await get().reloadProject();
    } catch (e) {
      set({ error: toError(e) });
    }
  },

  async renameSection(file: string, newStem: string) {
    const { projectDir, activeFile, saveActive } = get();
    if (!projectDir) return;
    // Tolerate a typed ".md" — the input shows stems, but users type filenames.
    const stem = newStem.trim().replace(/\.md$/i, "");
    const dir = file.slice(0, file.lastIndexOf("/") + 1);
    const newFile = `${dir}${stem}.md`;
    if (newFile === file || !stem) return;
    // Flush pending edits to the old path so nothing is in flight mid-rename.
    if (file === activeFile && !(await saveActive())) return;
    try {
      if (await platform.fileExists(`${projectDir}/${newFile}`)) {
        set({ error: { message: `A file named "${newFile}" already exists in the project.` } });
        return;
      }
      // Validate against document.yaml before touching the file system.
      const yamlPath = `${projectDir}/document.yaml`;
      const yamlText = await platform.readTextFile(yamlPath);
      const nextYaml = renameSectionInYaml(yamlText, file, newFile);
      await platform.rename(`${projectDir}/${file}`, `${projectDir}/${newFile}`);
      try {
        await platform.writeTextFile(yamlPath, nextYaml);
      } catch (e) {
        // keep file and structure in sync: undo the rename if yaml failed
        await platform
          .rename(`${projectDir}/${newFile}`, `${projectDir}/${file}`)
          .catch(() => {});
        throw e;
      }
      if (get().activeFile === file) set({ activeFile: newFile });
      await get().reloadProject();
    } catch (e) {
      set({ error: toError(e) });
    }
  },

  setContent(content: string) {
    const { activeFile, counts } = get();
    set({
      content,
      dirty: true,
      // live counters on every keystroke — pure engine math, no disk reads
      counts: counts && activeFile ? applySectionContent(counts, activeFile, content) : counts,
    });
  },

  async saveActive(force = false) {
    const { projectDir, activeFile, content, baseline, dirty } = get();
    if (!projectDir || !activeFile) return true;
    // Never write when there is nothing to save: a no-op write would churn
    // mtimes and could clobber a file refreshed outside the app (git pull).
    if (!dirty) return true;
    try {
      if (!force) {
        // Conflict guard: the file changed on disk while it had unsaved
        // edits here — let the user choose instead of silently overwriting.
        // A read failure means the file is gone; the write below recreates it.
        const disk = await platform
          .readTextFile(`${projectDir}/${activeFile}`)
          .catch(() => null);
        if (disk === content) {
          // the disk copy already matches the editor — nothing to write
          set({ dirty: false, baseline: content, conflict: null });
          return true;
        }
        if (disk !== null && disk !== baseline) {
          set({ conflict: { file: activeFile, diskContent: disk } });
          return false;
        }
      }
      await platform.writeTextFile(`${projectDir}/${activeFile}`, content);
      set({ dirty: false, baseline: content, conflict: null });
      void renderDiagramsToDisk(projectDir, content);
      return true;
    } catch (e) {
      set({ error: toError(e) });
      return false;
    }
  },

  async resolveConflictKeepMine() {
    await get().saveActive(true);
  },

  resolveConflictUseDisk() {
    const { conflict, counts } = get();
    if (!conflict) return;
    set({
      content: conflict.diskContent,
      baseline: conflict.diskContent,
      conflict: null,
      contentVersion: get().contentVersion + 1,
      dirty: false,
      counts: counts
        ? applySectionContent(counts, conflict.file, conflict.diskContent)
        : counts,
    });
  },

  async viewReport() {
    const result = await runBuild();
    if (!result) return;
    set({
      report: { pdfPath: result.pdfPath, warnings: result.warnings, builtAt: Date.now() },
      pane: "report",
    });
  },

  async exportPdf() {
    const result = await runBuild();
    const { projectDir } = get();
    if (!result || !projectDir) return;
    const relPath = result.pdfPath.replace(`${projectDir}/`, "");
    const warningText = result.warnings.length > 0 ? ` ${result.warnings.join(" ")}` : "";
    set({ notice: `Report exported to ${relPath}.${warningText}` });
  },

  showPreview() {
    set({ pane: "preview" });
  },

  async openMetadata() {
    // Flush pending section edits first — the editor unmounts while the
    // form is open, so nothing should be left waiting on an autosave timer.
    await get().saveActive();
    set({ metadataOpen: true });
  },

  closeMetadata() {
    set({ metadataOpen: false });
  },

  async saveMetadata(edit: MetadataEdit) {
    const { projectDir } = get();
    if (!projectDir) return false;
    try {
      await editDocumentYaml(projectDir, (t) => editMetadataInYaml(t, edit));
      await get().reloadProject();
      set({ metadataOpen: false });
      return true;
    } catch (e) {
      set({ error: toError(e) });
      return false;
    }
  },

  clearError() {
    set({ error: null });
  },

  clearNotice() {
    set({ notice: null });
  },
  };
});
