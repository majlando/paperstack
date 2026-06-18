import { create } from "zustand";
import {
  loadProject,
  createProject as scaffoldProject,
  SEA_TEMPLATE,
  templateStatus,
  countProject,
  applySectionContent,
  extractMermaidBlocks,
  buildReport,
  addSectionToYaml,
  removeSectionFromYaml,
  moveSectionInYaml,
  renameSectionInYaml,
  editMetadataInYaml,
  newSectionFile,
  importFigure as importFigureFile,
  importFigureBytes,
  suggestedCaption,
  searchContent,
  replaceContent,
  parseBibliography,
  hashContent,
  dirOf,
  baseOf,
  humanize,
  SECTION_ROLES,
  PaperstackError,
  type BibEntry,
  type MetadataEdit,
  type Project,
  type ProjectCounts,
  type SectionRole,
  type SearchMatch,
} from "@paperstack/engine";
import { getCurrentWindow } from "@tauri-apps/api/window";
import {
  platform,
  SIDECARS,
  allowExistingProjectScope,
  allowNewProjectScope,
} from "./platform/tauri-platform.ts";
import { renderMermaidSvg } from "./preview/mermaid.ts";

/** One project-wide search hit: an engine match plus which section it lives in. */
export type ProjectSearchMatch = SearchMatch & { file: string };

/** Where a figure being inserted comes from: a picked file, or pasted bytes. */
export type FigureSource =
  | { kind: "path"; path: string }
  | { kind: "bytes"; bytes: Uint8Array; name: string };

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
  /**
   * Sections whose disk content changed since they were last loaded or opened
   * here (detected by content hash on reload — e.g. after a git pull).
   * Drives the sidebar's changed-on-disk dots; opening a section clears its
   * entry.
   */
  changedOnDisk: string[];
  /** `message` is the readable headline; `details` is raw tool output for diagnostics. */
  error: { message: string; details?: string } | null;
  /**
   * Success message (e.g. after export) — the friendly counterpart of `error`.
   * `revealPath` is a file the message mentions; when set, the banner offers
   * a "Show in folder" action for it.
   */
  notice: { message: string; revealPath?: string } | null;
  /** A report compile is running (View Report / Export PDF). */
  building: boolean;
  /**
   * The project's references.bib has at least one real entry — citations
   * are active: [@key] spans become (author, year) references in the PDF, the
   * preview shows placeholders, and the editor offers Insert Citation.
   * (The scaffolded file ships commented-out examples only and stays inert.)
   */
  hasReferences: boolean;
  /**
   * Hash of document.yaml as it stood when the report-details form opened.
   * The save compares against it so a git pull / teammate edit that landed
   * while the form was open is never silently overwritten by stale values.
   */
  metadataBaselineHash: string | null;
  /**
   * The project's vendored layout template is an unmodified copy from an
   * older Paperstack — a banner offers to update it. Never set for
   * user-customized templates (those are the user's, untouchable).
   */
  templateOffer: boolean;
  /** Projects whose template offer was declined this session ("Keep current look"). */
  templateOfferMuted: string[];
  /** Snapshot of the last compiled report, shown in the right pane's Report tab. */
  report: { pdfPath: string; warnings: string[]; builtAt: number } | null;
  /** Export was requested while [TODO]s remain — waiting for the user's call. */
  confirmExport: number | null;
  /** What the right pane shows: the live section preview or the report PDF. */
  pane: "preview" | "report";
  /** The report-details form is open (replaces the editor + preview area). */
  metadataOpen: boolean;
  /**
   * The form holds edits not yet saved to document.yaml. Tracked here (the
   * field values stay local to the form) so the window-close guard can refuse
   * to silently drop them.
   */
  metadataDirty: boolean;

  openProject(dir: string): Promise<void>;
  /** Scaffolds a new SEA report in `dir` (or just opens it if it already is one). */
  createProject(dir: string): Promise<void>;
  /**
   * Saves pending edits and returns to the start screen (create / open /
   * recents — the only place projects open from). A blocked save or unsaved
   * report-details form keeps the project open with its banner visible.
   */
  closeProject(): Promise<void>;
  reloadProject(): Promise<void>;
  openSection(file: string): Promise<void>;
  /**
   * Opens the section before/after the active one in the order the sidebar
   * shows them (grouped by role), for the Ctrl+PageUp/PageDown shortcuts.
   */
  gotoAdjacentSection(direction: "next" | "prev"): Promise<void>;
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
  /**
   * Compile the report and write output/report.pdf (or the locked-file
   * fallback). When [TODO]s remain, asks for confirmation first unless `force`.
   */
  exportPdf(force?: boolean): Promise<void>;
  cancelExport(): void;
  showPreview(): void;
  /**
   * A figure waiting for its caption (the dialog is open). Fed by both the
   * Insert Figure button and an image pasted into the editor.
   */
  pendingFigure: { source: FigureSource; suggestedCaption: string } | null;
  requestFigure(source: FigureSource): void;
  cancelFigure(): void;
  /**
   * Imports the pending figure into the project's images folder
   * (collision-safe) and returns its project-relative path, or null on
   * failure — the caller inserts the Markdown.
   */
  confirmFigure(): Promise<string | null>;
  /**
   * Case-insensitive text search across every section. The active section is
   * searched as it stands in the editor (unsaved edits included); the rest
   * read from disk. Capped at 500 matches.
   */
  searchProject(query: string): Promise<ProjectSearchMatch[]>;
  /** Entries of references.bib for the Insert Citation list ([] without one). */
  listReferences(): Promise<BibEntry[]>;
  /**
   * Replaces every match of `query` (case-insensitive, same rules as
   * searchProject) across all sections — the active one through the editor
   * (and saved), the rest directly on disk. Returns what was changed.
   */
  replaceAll(query: string, replacement: string): Promise<{ sections: number; count: number }>;
  /** Overwrites the project's outdated stock template with the current one. */
  updateTemplate(): Promise<void>;
  /** Declines the template offer for the rest of this session. */
  dismissTemplateOffer(): void;
  openMetadata(): Promise<void>;
  closeMetadata(): void;
  /**
   * Gate for any action that leaves the report-details form. Returns true when
   * the caller may proceed: a clean form is closed silently, while a dirty one
   * blocks (returns false, surfaces an error) so its edits are never dropped
   * underneath an invisible switch.
   */
  leaveMetadata(): boolean;
  setMetadataDirty(dirty: boolean): void;
  /** Returns false when the save failed — the form stays open with the error visible. */
  saveMetadata(edit: MetadataEdit): Promise<boolean>;
  clearError(): void;
  clearNotice(): void;
}

function toError(e: unknown): { message: string; details?: string } {
  if (e instanceof PaperstackError) return { message: e.userMessage, details: e.details };
  if (e instanceof Error) return { message: e.message };
  // A thrown plain object would render as "[object Object]" via String().
  try {
    return { message: typeof e === "string" ? e : JSON.stringify(e) ?? String(e) };
  } catch {
    return { message: String(e) };
  }
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

/** Drops a recents entry that can no longer open (folder deleted or moved). */
export function forgetProject(dir: string): void {
  try {
    const list = getRecentProjects().filter((p) => p !== dir);
    localStorage.setItem(RECENTS_KEY, JSON.stringify(list));
  } catch {
    // same convenience rule as rememberProject
  }
}

/** "C:/repos/smart-home-hub" → "Smart home hub". */
function titleFromDir(dir: string): string {
  return humanize(baseOf(dir)) || "Report";
}

/** The window chrome shows the report title wherever the project (re)loads. */
function setWindowTitle(reportTitle: string | null): void {
  const title = reportTitle === null ? "Paperstack" : `${reportTitle} — Paperstack`;
  document.title = title;
  // document.title only renames the webview document — the native title bar
  // needs an explicit setTitle. Best-effort: window chrome must never fail a
  // project load (and unit tests run outside a Tauri webview).
  try {
    void getCurrentWindow().setTitle(title).catch(() => {});
  } catch {
    // not running inside Tauri
  }
}

/** Citations are active only when references.bib holds at least one real entry. */
async function projectHasReferences(projectDir: string): Promise<boolean> {
  try {
    const text = await platform.readTextFile(`${projectDir}/references.bib`);
    return parseBibliography(text).length > 0;
  } catch {
    return false;
  }
}

/** True when the vendored template is unmodified stock from an older Paperstack. */
async function projectTemplateOutdated(projectDir: string): Promise<boolean> {
  try {
    const text = await platform.readTextFile(`${projectDir}/paperstack-template.typ`);
    return templateStatus(text) === "outdated";
  } catch {
    return false; // not vendored yet — the next build writes the current one
  }
}

/**
 * Read–edit–write document.yaml; skips the write when nothing changed.
 * Serialized through a promise chain: two overlapping structure edits (e.g.
 * rapid "Move up" clicks) would otherwise both read the same base text and
 * the second write would silently drop the first edit.
 */
let yamlEditChain: Promise<unknown> = Promise.resolve();
/** Queues work touching document.yaml — EVERY writer must go through here. */
function chainDocumentEdit<T>(work: () => Promise<T>): Promise<T> {
  const run = yamlEditChain
    .catch(() => {}) // a failed edit must not jam the chain
    .then(work);
  yamlEditChain = run;
  return run;
}
function editDocumentYaml(
  projectDir: string,
  edit: (yamlText: string) => string,
): Promise<void> {
  return chainDocumentEdit(async () => {
    const path = `${projectDir}/document.yaml`;
    const text = await platform.readTextFile(path);
    const next = edit(text);
    if (next !== text) await platform.writeTextFile(path, next);
  });
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
      if (await isUsableRender(path)) continue;
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

/**
 * An existing render is reused only if the PDF can actually show it. Renders
 * from before htmlLabels was forced off wrap their labels in <foreignObject>,
 * which Typst's SVG renderer skips — node boxes without words — and the
 * file's hash name covers the diagram source, not the file, so only the
 * content betrays a stale one. Those re-render in place under the same name.
 */
async function isUsableRender(path: string): Promise<boolean> {
  try {
    const svg = await platform.readTextFile(path);
    return !svg.includes("<foreignObject");
  } catch {
    return false; // missing or unreadable — render fresh
  }
}

export const useStore = create<AppState>((set, get) => {
  /** The in-flight save chain — concurrent save triggers join it (see saveActive). */
  let saveInFlight: Promise<boolean> | null = null;
  /** Bumped per openSection call — a slower read for an earlier click loses. */
  let openSectionSeq = 0;

  /**
   * The actual save. Callers go through saveActive (single-flight); only the
   * settle chain below calls this directly, while the flight is still open.
   */
  async function doSave(force: boolean): Promise<boolean> {
    const { projectDir, activeFile, content, baseline, dirty } = get();
    if (!projectDir || !activeFile) return true;
    // Never write when there is nothing to save: a no-op write would churn
    // mtimes and could clobber a file refreshed outside the app (git pull).
    if (!dirty) return true;
    // Keystrokes can land while this save awaits disk I/O. They set `dirty`
    // again, and this save must not clear it — the newer text is not on disk.
    // Advance the baseline to what was just synced and chain a save for the
    // newer text instead of marking it saved.
    const settle = (): Promise<boolean> | true => {
      // The user switched sections while this save was in flight: the
      // captured file is fully written, and the store now describes a
      // different section — its state is not this save's to touch.
      if (get().activeFile !== activeFile) return true;
      if (get().content !== content) {
        set({ baseline: content, conflict: null });
        return doSave(false);
      }
      set({ dirty: false, baseline: content, conflict: null });
      return true;
    };
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
          return settle();
        }
        if (disk !== null && disk !== baseline) {
          set({ conflict: { file: activeFile, diskContent: disk } });
          return false;
        }
      }
      await platform.writeTextFile(`${projectDir}/${activeFile}`, content);
      void renderDiagramsToDisk(projectDir, content);
      return settle();
    } catch (e) {
      set({ error: toError(e) });
      return false;
    }
  }

  /** Shared build path for View Report and Export PDF: save, compile, sync counters. */
  async function runBuild(): Promise<{ pdfPath: string; warnings: string[] } | null> {
    const { projectDir, building } = get();
    // Re-entrancy guard — two compiles would race in the same output/.build.
    // (The UI also disables its buttons, but the store must not rely on that.)
    if (!projectDir || building) return null;
    // The report-details form's edits live only in the form until saved, so a
    // build while it is dirty would compile the stale document.yaml. Settle it
    // first (clean closes, dirty blocks) — the store owns this, not the hidden
    // export button.
    if (!get().leaveMetadata()) return null;
    // A blocked save (write failure or conflict) keeps its own error visible.
    if (!(await get().saveActive())) return null;
    set({ building: true });
    try {
      // A group member may have added a diagram in another editor — render
      // any missing SVGs first instead of failing the build with "open that
      // section in Paperstack". Best-effort: invalid diagrams still surface
      // as the engine's readable export error.
      for (const s of get().project?.meta.sections ?? []) {
        const content = await platform
          .readTextFile(`${projectDir}/${s.file}`)
          .catch(() => null);
        if (content !== null) await renderDiagramsToDisk(projectDir, content);
      }
      const result = await buildReport(platform, projectDir, {
        typst: SIDECARS.typst,
        // After one successful build the binary is known-good; skip the
        // startup probe on recompiles (it costs a process spawn).
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
  changedOnDisk: [],
  error: null,
  notice: null,
  building: false,
  hasReferences: false,
  metadataBaselineHash: null,
  templateOffer: false,
  templateOfferMuted: [],
  report: null,
  confirmExport: null,
  pane: "preview",
  metadataOpen: false,
  metadataDirty: false,
  pendingFigure: null,

  async openProject(dir: string) {
    let normalized: string;
    try {
      normalized = await allowExistingProjectScope(dir);
    } catch (e) {
      // The folder is gone or is no longer a report project — a recents
      // entry pointing here can never open again, so stop offering it.
      // (Fixable failures, e.g. a bad merge in document.yaml, happen in
      // loadProject below and keep their entry.)
      forgetProject(dir);
      set({ error: toError(e) });
      return;
    }
    try {
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
        changedOnDisk: [],
        error: null,
        notice: null,
        report: null,
        confirmExport: null,
        pane: "preview",
        metadataOpen: false,
        hasReferences: await projectHasReferences(normalized),
        templateOffer:
          !get().templateOfferMuted.includes(normalized) &&
          (await projectTemplateOutdated(normalized)),
      });
      rememberProject(normalized);
      setWindowTitle(project.meta.title);
      const first = project.meta.sections.find((s) => s.role === "body") ?? project.meta.sections[0];
      if (first) await get().openSection(first.file);
    } catch (e) {
      set({ error: toError(e) });
    }
  },

  async createProject(dir: string) {
    try {
      const normalized = await allowNewProjectScope(dir);
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

  async closeProject() {
    // Closing mid-build would let the finishing build write its counts and
    // report into the start screen's state.
    if (!get().projectDir || get().building) return;
    // The form's values live only in the form — leaving the project now
    // would silently drop them (same guard as the window-close handler).
    if (get().metadataOpen && get().metadataDirty) {
      set({
        error: {
          message:
            "Report details have unsaved changes — save or cancel the form before switching reports.",
        },
      });
      return;
    }
    // A failed or conflicted save keeps the project open so its banner can
    // be resolved — leaving would discard the unsaved writing.
    if (!(await get().saveActive())) return;
    set({
      projectDir: null,
      project: null,
      counts: null,
      activeFile: null,
      content: "",
      baseline: "",
      conflict: null,
      contentVersion: get().contentVersion + 1,
      dirty: false,
      changedOnDisk: [],
      error: null,
      notice: null,
      hasReferences: false,
      metadataBaselineHash: null,
      templateOffer: false,
      report: null,
      confirmExport: null,
      pane: "preview",
      metadataOpen: false,
      metadataDirty: false,
      pendingFigure: null,
    });
    setWindowTitle(null);
  },

  async reloadProject() {
    const { projectDir, activeFile, dirty } = get();
    if (!projectDir) return;
    try {
      const project = await loadProject(platform, projectDir);
      const counts = await countProject(platform, project);
      // Changed-on-disk dots: a section whose content hash moved between the
      // previous counts and this re-read was edited outside the app (git
      // pull, another editor). Earlier dots survive until the section is
      // opened; dots for sections no longer in the report are dropped.
      const previous = new Map(get().counts?.sections.map((s) => [s.file, s.hash]) ?? []);
      const inProject = new Set(counts.sections.map((s) => s.file));
      const changedOnDisk = [
        ...new Set([
          ...get().changedOnDisk.filter((f) => inProject.has(f)),
          ...counts.sections
            .filter((s) => previous.has(s.file) && previous.get(s.file) !== s.hash)
            .map((s) => s.file),
        ]),
      ];
      set({
        project,
        counts,
        changedOnDisk,
        // A successful reload clears a stale load error — but never an
        // unresolved save/conflict explanation while edits are unsaved:
        // the focus handler reloads on every alt-tab back, and that must
        // not dismiss a banner the user still has to act on.
        error: get().dirty || get().conflict ? get().error : null,
        // references.bib entries may have arrived or left with the external change
        hasReferences: await projectHasReferences(projectDir),
        // a git pull may have brought an older group member's stock template
        templateOffer:
          !get().templateOfferMuted.includes(projectDir) &&
          (await projectTemplateOutdated(projectDir)),
      });
      setWindowTitle(project.meta.title);
      // re-read the open section unless the user has unsaved changes
      if (activeFile && !dirty && project.meta.sections.some((s) => s.file === activeFile)) {
        const content = await platform.readTextFile(`${projectDir}/${activeFile}`);
        // Keystrokes (or a section switch) may have landed during the reads
        // above — never let the disk copy clobber newer unsaved edits.
        if (!get().dirty && get().activeFile === activeFile) {
          set({
            content,
            baseline: content,
            contentVersion: get().contentVersion + 1,
            // the fresh disk content is now on screen — no dot needed
            changedOnDisk: get().changedOnDisk.filter((f) => f !== activeFile),
          });
        }
      }
    } catch (e) {
      set({ error: toError(e) });
    }
  },

  async openSection(file: string) {
    const { projectDir, dirty, saveActive } = get();
    if (!projectDir) return;
    // The report-details form replaces the editor area, so switching sections
    // under it would be invisible — the sidebar click would appear dead. A
    // clean form just closes; a dirty one blocks so its edits are never
    // silently dropped.
    if (!get().leaveMetadata()) return;
    // A failed save must not be papered over: stay on the current section so
    // the unsaved edits and the error stay visible.
    if (dirty && !(await saveActive())) return;
    const seq = ++openSectionSeq;
    try {
      const content = await platform.readTextFile(`${projectDir}/${file}`);
      // Latest click wins: two rapid sidebar clicks race their reads, and
      // the slower read for the earlier click must not land on top of the
      // section the user actually chose.
      if (seq !== openSectionSeq) return;
      set({
        activeFile: file,
        content,
        baseline: content,
        conflict: null,
        contentVersion: get().contentVersion + 1,
        dirty: false,
        changedOnDisk: get().changedOnDisk.filter((f) => f !== file),
        error: null,
      });
      // Sections edited outside the app may contain never-rendered diagrams.
      void renderDiagramsToDisk(projectDir, content);
    } catch (e) {
      if (seq === openSectionSeq) set({ error: toError(e) });
    }
  },

  async gotoAdjacentSection(direction: "next" | "prev") {
    const { project, activeFile } = get();
    if (!project) return;
    // Walk the sections in the same role-grouped order the sidebar shows, so
    // the keyboard step matches what the eye sees even if document.yaml is not
    // already grouped (e.g. after a hand-edit or merge). openSection owns the
    // dirty-form gate, so a clean report-details form just closes here too.
    const files = [...project.meta.sections]
      .sort((a, b) => SECTION_ROLES.indexOf(a.role) - SECTION_ROLES.indexOf(b.role))
      .map((s) => s.file);
    if (files.length === 0) return;
    const at = files.indexOf(activeFile ?? "");
    // No active section yet: step in from the matching end (next → first,
    // prev → last) rather than always landing on the first.
    const to =
      at === -1
        ? direction === "next"
          ? 0
          : files.length - 1
        : at + (direction === "next" ? 1 : -1);
    if (to < 0 || to >= files.length || to === at) return;
    await get().openSection(files[to]!);
  },

  async addSection(role: SectionRole, name: string) {
    const { projectDir, project } = get();
    if (!projectDir || !project) return;
    // A pending report-details form would swallow the open below; settle it
    // first (clean closes, dirty blocks) so the add can't half-complete.
    if (!get().leaveMetadata()) return;
    try {
      const file = newSectionFile(project.meta.sections, role, name);
      const path = `${projectDir}/${file}`;
      if (!(await platform.fileExists(path))) {
        // Flat-layout projects put sections at the root — nothing to create.
        const dir = dirOf(file);
        if (dir) await platform.mkdir(`${projectDir}/${dir}`);
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
    const dir = dirOf(file);
    const newFile = `${dir ? `${dir}/` : ""}${stem}.md`;
    if (newFile === file || !stem) return;
    // Flush pending edits to the old path so nothing is in flight mid-rename.
    if (file === activeFile && !(await saveActive())) return;
    try {
      if (await platform.fileExists(`${projectDir}/${newFile}`)) {
        set({ error: { message: `A file named "${newFile}" already exists in the project.` } });
        return;
      }
      // The yaml read–validate–write joins the serialized chain like every
      // other structure edit: the rename input commits on blur, and the very
      // click that causes the blur can fire another structure edit in the
      // same instant — racing them silently drops one edit.
      await chainDocumentEdit(async () => {
        const yamlPath = `${projectDir}/document.yaml`;
        const yamlText = await platform.readTextFile(yamlPath);
        // Validate against document.yaml before touching the file system.
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
      });
      if (get().activeFile === file) set({ activeFile: newFile });
      await get().reloadProject();
    } catch (e) {
      set({ error: toError(e) });
    }
  },

  setContent(content: string) {
    const { activeFile, counts } = get();
    // No section on screen → nothing to attribute the text to. Accepting it
    // would strand dirty:true with nowhere to save, which the close flush
    // then discards while claiming everything was saved.
    if (!activeFile) return;
    set({
      content,
      dirty: true,
      // live counters on every keystroke — pure engine math, no disk reads
      counts: counts ? applySectionContent(counts, activeFile, content) : counts,
    });
  },

  async saveActive(force = false) {
    // Single-flight: blur, the autosave debounce, Ctrl+S, and the close
    // handler can all fire around the same moment. Concurrent triggers join
    // the running save chain (which already covers keystrokes landing
    // mid-save) instead of racing it with overlapping writes and conflict
    // reads against the same file.
    if (saveInFlight) {
      const ok = await saveInFlight;
      // A forced save ("keep my version") must still write when the joined
      // save was blocked — returning the blocked result would drop the force.
      if (ok || !force) return ok;
    }
    const run = doSave(force);
    saveInFlight = run.finally(() => {
      saveInFlight = null;
    });
    return run;
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

  async exportPdf(force = false) {
    // The warning moment belongs *before* the hand-in file is written.
    const todos = get().counts?.todosTotal ?? 0;
    if (!force && todos > 0) {
      set({ confirmExport: todos });
      return;
    }
    set({ confirmExport: null });
    const result = await runBuild();
    const { projectDir } = get();
    if (!result || !projectDir) return;
    const relPath = result.pdfPath.replace(`${projectDir}/`, "");
    // The Report pane is the warnings' home while it is showing — repeating
    // them in the notice would say the same thing twice on one screen.
    const warningText =
      get().pane !== "report" && result.warnings.length > 0
        ? ` ${result.warnings.join(" ")}`
        : "";
    set({
      notice: {
        message: `Report exported to ${relPath}.${warningText}`,
        revealPath: result.pdfPath,
      },
      // The Report pane — open now or opened later — must show what was just
      // exported (the path may also be the locked-file fallback), never an
      // older PDF next to a notice claiming the export happened.
      report: { pdfPath: result.pdfPath, warnings: result.warnings, builtAt: Date.now() },
    });
  },

  cancelExport() {
    set({ confirmExport: null });
  },

  showPreview() {
    set({ pane: "preview" });
  },

  requestFigure(source: FigureSource) {
    set({
      pendingFigure: {
        source,
        suggestedCaption: suggestedCaption(source.kind === "path" ? source.path : source.name),
      },
    });
  },

  cancelFigure() {
    set({ pendingFigure: null });
  },

  async confirmFigure() {
    const { projectDir, pendingFigure } = get();
    set({ pendingFigure: null });
    if (!projectDir || !pendingFigure) return null;
    try {
      const source = pendingFigure.source;
      return source.kind === "path"
        ? await importFigureFile(platform, projectDir, source.path)
        : await importFigureBytes(platform, projectDir, source.name, source.bytes);
    } catch (e) {
      set({ error: toError(e) });
      return null;
    }
  },

  async searchProject(query: string) {
    const { projectDir, project, activeFile, content } = get();
    if (!projectDir || !project || !query.trim()) return [];
    const out: ProjectSearchMatch[] = [];
    for (const s of project.meta.sections) {
      const text =
        s.file === activeFile
          ? content
          : await platform.readTextFile(`${projectDir}/${s.file}`).catch(() => null);
      if (text === null) continue;
      for (const m of searchContent(text, query)) {
        out.push({ file: s.file, ...m });
        if (out.length >= 500) return out;
      }
    }
    return out;
  },

  async listReferences() {
    const { projectDir } = get();
    if (!projectDir) return [];
    try {
      return parseBibliography(await platform.readTextFile(`${projectDir}/references.bib`));
    } catch {
      return []; // no file or unreadable — the Cite button simply lists nothing
    }
  },

  async replaceAll(query: string, replacement: string) {
    const { projectDir, project } = get();
    if (!projectDir || !project || !query) return { sections: 0, count: 0 };
    let sections = 0;
    let count = 0;
    const replaced: string[] = [];
    try {
      for (const s of project.meta.sections) {
        if (s.file === get().activeFile) {
          // The open section is replaced through the editor state and saved,
          // so the change is visible immediately and undo-safe to inspect.
          const r = replaceContent(get().content, query, replacement);
          if (r.count === 0) continue;
          set({
            content: r.text,
            dirty: true,
            contentVersion: get().contentVersion + 1,
            counts: get().counts
              ? applySectionContent(get().counts!, s.file, r.text)
              : get().counts,
          });
          // A blocked save (conflict, write failure) leaves the disk copy
          // untouched — the replacement sits in the editor pending the
          // banner, and the summary must not claim it reached the file.
          if (!(await get().saveActive())) continue;
          sections++;
          count += r.count;
          replaced.push(s.file);
        } else {
          const text = await platform
            .readTextFile(`${projectDir}/${s.file}`)
            .catch(() => null);
          if (text === null) continue;
          const r = replaceContent(text, query, replacement);
          if (r.count === 0) continue;
          sections++;
          count += r.count;
          replaced.push(s.file);
          await platform.writeTextFile(`${projectDir}/${s.file}`, r.text);
        }
      }
      if (count > 0) {
        await get().reloadProject();
        // The hashes moved because *we* wrote the files — these are not
        // external changes, so no changed-on-disk dots for them.
        set({ changedOnDisk: get().changedOnDisk.filter((f) => !replaced.includes(f)) });
      }
    } catch (e) {
      set({ error: toError(e) });
    }
    return { sections, count };
  },

  async openMetadata() {
    const { projectDir } = get();
    if (!projectDir) return;
    // Already open: a second ⚙ click must not reset metadataDirty or adopt
    // a freshly pulled document.yaml as the baseline — that would disarm
    // both the close guard and the form's conflict guard.
    if (get().metadataOpen) return;
    // Flush pending section edits first — the editor unmounts while the
    // form is open, so nothing should be left waiting on an autosave timer.
    // A failed or conflicted save keeps the section visible instead of
    // hiding it behind the form while a banner asks about it.
    if (!(await get().saveActive())) return;
    // Snapshot what the form is editing: the save refuses to overwrite a
    // document.yaml that changed on disk while the form was open.
    const baseline = await platform
      .readTextFile(`${projectDir}/document.yaml`)
      .then(hashContent)
      .catch(() => null);
    set({ metadataOpen: true, metadataDirty: false, metadataBaselineHash: baseline });
  },

  closeMetadata() {
    set({ metadataOpen: false, metadataDirty: false, metadataBaselineHash: null });
  },

  leaveMetadata() {
    if (!get().metadataOpen) return true;
    if (get().metadataDirty) {
      set({
        error: {
          message:
            "Report details have unsaved changes — save or cancel the form first.",
        },
      });
      return false;
    }
    get().closeMetadata();
    return true;
  },

  setMetadataDirty(dirty: boolean) {
    if (get().metadataDirty !== dirty) set({ metadataDirty: dirty });
  },

  async saveMetadata(edit: MetadataEdit) {
    const { projectDir, metadataBaselineHash } = get();
    if (!projectDir) return false;
    try {
      await editDocumentYaml(projectDir, (t) => {
        // Conflict guard, like the section save path: the file changed on
        // disk while the form was open (git pull, a teammate's edit) — the
        // stale form values must not silently overwrite it.
        if (metadataBaselineHash !== null && hashContent(t) !== metadataBaselineHash) {
          throw new Error(
            "The report details changed on disk while this form was open — probably a git pull. " +
              "Close the form and reopen it to load the new values, then redo your edits.",
          );
        }
        return editMetadataInYaml(t, edit);
      });
      await get().reloadProject();
      set({ metadataOpen: false, metadataDirty: false, metadataBaselineHash: null });
      return true;
    } catch (e) {
      set({ error: toError(e) });
      return false;
    }
  },

  async updateTemplate() {
    const { projectDir } = get();
    if (!projectDir) return;
    try {
      await platform.writeTextFile(`${projectDir}/paperstack-template.typ`, SEA_TEMPLATE);
      set({
        templateOffer: false,
        notice: {
          message:
            "The report layout was updated to this Paperstack version. The next View Report or Export shows the new look.",
        },
      });
    } catch (e) {
      set({ error: toError(e) });
    }
  },

  dismissTemplateOffer() {
    const { projectDir, templateOfferMuted } = get();
    set({
      templateOffer: false,
      templateOfferMuted: projectDir ? [...templateOfferMuted, projectDir] : templateOfferMuted,
    });
  },

  clearError() {
    set({ error: null });
  },

  clearNotice() {
    set({ notice: null });
  },
  };
});
