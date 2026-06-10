import { create } from "zustand";
import {
  loadProject,
  createProject as scaffoldProject,
  countProject,
  applySectionContent,
  extractMermaidBlocks,
  addSectionToYaml,
  removeSectionFromYaml,
  moveSectionInYaml,
  renameSectionInYaml,
  PaperstackError,
  type Project,
  type ProjectCounts,
  type Section,
  type SectionRole,
} from "@paperstack/engine";
import { platform } from "./platform/tauri-platform.ts";
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
  error: string | null;

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
  clearError(): void;
}

function message(e: unknown): string {
  return e instanceof PaperstackError ? e.userMessage : String(e);
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
    const letter = String.fromCharCode(
      97 + sections.filter((s) => s.role === "appendix").length,
    );
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

export const useStore = create<AppState>((set, get) => ({
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
      });
      rememberProject(normalized);
      const first = project.meta.sections.find((s) => s.role === "body") ?? project.meta.sections[0];
      if (first) await get().openSection(first.file);
    } catch (e) {
      set({ error: message(e) });
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
      set({ error: message(e) });
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
      set({ error: message(e) });
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
      set({ error: message(e) });
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
      set({ error: message(e) });
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
      set({ error: message(e) });
    }
  },

  async moveSection(file: string, direction: "up" | "down") {
    const { projectDir } = get();
    if (!projectDir) return;
    try {
      await editDocumentYaml(projectDir, (t) => moveSectionInYaml(t, file, direction));
      await get().reloadProject();
    } catch (e) {
      set({ error: message(e) });
    }
  },

  async renameSection(file: string, newStem: string) {
    const { projectDir, activeFile, saveActive } = get();
    if (!projectDir) return;
    const dir = file.slice(0, file.lastIndexOf("/") + 1);
    const newFile = `${dir}${newStem.trim()}.md`;
    if (newFile === file || !newStem.trim()) return;
    // Flush pending edits to the old path so nothing is in flight mid-rename.
    if (file === activeFile && !(await saveActive())) return;
    try {
      if (await platform.fileExists(`${projectDir}/${newFile}`)) {
        set({ error: `A file named "${newFile}" already exists in the project.` });
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
      set({ error: message(e) });
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
      set({ error: message(e) });
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

  clearError() {
    set({ error: null });
  },
}));
