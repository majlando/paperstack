import { create } from "zustand";
import {
  loadProject,
  countProject,
  applySectionContent,
  extractMermaidBlocks,
  PaperstackError,
  type Project,
  type ProjectCounts,
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
   * Bumped whenever `content` is replaced from outside the editor (section
   * switch, project reload) — the editor component watches this to know when
   * to push the store content into CodeMirror. Keystrokes do not bump it.
   */
  contentVersion: number;
  dirty: boolean;
  error: string | null;

  openProject(dir: string): Promise<void>;
  reloadProject(): Promise<void>;
  openSection(file: string): Promise<void>;
  setContent(content: string): void;
  saveActive(): Promise<void>;
  clearError(): void;
}

function message(e: unknown): string {
  return e instanceof PaperstackError ? e.userMessage : String(e);
}

/**
 * Render any not-yet-rendered ```mermaid blocks to diagrams/rendered/<hash>.svg
 * (the files PDF export embeds). Hash-named, so unchanged diagrams are free
 * and edited ones render fresh. Invalid diagrams are skipped — the preview
 * shows the error inline, and export reports it readably.
 */
async function renderDiagramsToDisk(projectDir: string, content: string): Promise<void> {
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
}

export const useStore = create<AppState>((set, get) => ({
  projectDir: null,
  project: null,
  counts: null,
  activeFile: null,
  content: "",
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
        dirty: false,
        error: null,
      });
      const first = project.meta.sections.find((s) => s.role === "body") ?? project.meta.sections[0];
      if (first) await get().openSection(first.file);
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
        set({ content, contentVersion: get().contentVersion + 1 });
      }
    } catch (e) {
      set({ error: message(e) });
    }
  },

  async openSection(file: string) {
    const { projectDir, dirty, saveActive } = get();
    if (!projectDir) return;
    try {
      if (dirty) await saveActive();
      const content = await platform.readTextFile(`${projectDir}/${file}`);
      set({
        activeFile: file,
        content,
        contentVersion: get().contentVersion + 1,
        dirty: false,
        error: null,
      });
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

  async saveActive() {
    const { projectDir, activeFile, content } = get();
    if (!projectDir || !activeFile) return;
    try {
      await platform.writeTextFile(`${projectDir}/${activeFile}`, content);
      set({ dirty: false });
      void renderDiagramsToDisk(projectDir, content);
    } catch (e) {
      set({ error: message(e) });
    }
  },

  clearError() {
    set({ error: null });
  },
}));
