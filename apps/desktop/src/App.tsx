import { useEffect, type ReactNode } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { useStore } from "./store.ts";
import { Welcome } from "./components/Welcome.tsx";
import { Sidebar } from "./components/Sidebar.tsx";
import { Editor } from "./components/Editor.tsx";
import { Preview } from "./components/Preview.tsx";
import { MetadataForm } from "./components/MetadataForm.tsx";
import { StatusBar } from "./components/StatusBar.tsx";

// Dev convenience: VITE_OPEN_PROJECT=<path> auto-opens a project on launch,
// VITE_OPEN_SECTION=<file> jumps to a section, VITE_SMOKE_EXPORT=1 runs
// Export PDF right after opening, VITE_SMOKE_VIEW=1 runs View Report
// (=2 recompiles once more while the PDF pane is showing — exercises the
// file-locked-by-viewer path). VITE_SMOKE_SCRIPT=1 runs the full scripted
// scenario instead and writes output/smoke-result.json (`pnpm smoke` drives
// it end to end). Smoke tests; the folder dialog and buttons can't be
// driven from scripts.
const devProject = import.meta.env.VITE_OPEN_PROJECT as string | undefined;
const devSection = import.meta.env.VITE_OPEN_SECTION as string | undefined;
const devSmokeExport = import.meta.env.VITE_SMOKE_EXPORT as string | undefined;
const devSmokeView = import.meta.env.VITE_SMOKE_VIEW as string | undefined;
const devSmokeMetadata = import.meta.env.VITE_SMOKE_METADATA as string | undefined;
const devSmokeScript = import.meta.env.VITE_SMOKE_SCRIPT as string | undefined;
// Module-level guard: StrictMode runs effects twice, and two concurrent
// openProject calls race — the loser would override the devSection jump.
let devAutoOpened = false;

/** Amber warning banner asking for a decision (export with TODOs, edit conflict). */
function WarningBanner(props: {
  message: ReactNode;
  primaryLabel: string;
  onPrimary: () => void;
  secondaryLabel: string;
  onSecondary: () => void;
}) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-amber-900 bg-amber-950 px-4 py-2 text-sm text-amber-200">
      <span>{props.message}</span>
      <span className="flex shrink-0 gap-2">
        <button
          onClick={props.onPrimary}
          className="rounded border border-amber-700 px-2.5 py-0.5 font-medium hover:bg-amber-900"
        >
          {props.primaryLabel}
        </button>
        <button
          onClick={props.onSecondary}
          className="rounded border border-amber-700 px-2.5 py-0.5 hover:bg-amber-900"
        >
          {props.secondaryLabel}
        </button>
      </span>
    </div>
  );
}

export default function App() {
  const project = useStore((s) => s.project);
  const metadataOpen = useStore((s) => s.metadataOpen);
  const error = useStore((s) => s.error);
  const notice = useStore((s) => s.notice);
  const conflict = useStore((s) => s.conflict);
  const clearError = useStore((s) => s.clearError);
  const clearNotice = useStore((s) => s.clearNotice);
  const openProject = useStore((s) => s.openProject);
  const keepMine = useStore((s) => s.resolveConflictKeepMine);
  const useDisk = useStore((s) => s.resolveConflictUseDisk);
  const confirmExport = useStore((s) => s.confirmExport);
  const exportPdf = useStore((s) => s.exportPdf);
  const cancelExport = useStore((s) => s.cancelExport);
  const templateOffer = useStore((s) => s.templateOffer);
  const updateTemplate = useStore((s) => s.updateTemplate);
  const dismissTemplateOffer = useStore((s) => s.dismissTemplateOffer);

  // The autosave debounce dies with the webview: flush pending edits before
  // the window closes. A failed or conflicted save keeps the window open so
  // the banner can be resolved — closing then would silently drop writing.
  useEffect(() => {
    // A write failure (read-only file, dead network share) may not be
    // resolvable in-app, and the window must never be permanently
    // unclosable: the first failed close blocks with an explanation, the
    // next one is allowed to discard. Conflicts always block — their banner
    // resolves them. Every close attempt still tries the save first.
    let closeDiscardArmed = false;
    // A successful save (autosave, Ctrl+S, section switch) means the failure
    // the user was told about is gone — a later, different failure must block
    // and explain again rather than silently discard on the first close.
    const disarmOnSave = useStore.subscribe((s, prev) => {
      if (closeDiscardArmed && prev.dirty && !s.dirty) closeDiscardArmed = false;
    });
    const unlisten = getCurrentWindow().onCloseRequested(async (event) => {
      const state = useStore.getState();
      if (state.metadataOpen && state.metadataDirty) {
        event.preventDefault();
        useStore.setState({
          error: {
            message:
              "Report details have unsaved changes — save or cancel the form before closing.",
          },
        });
        return;
      }
      const saved = await state.saveActive();
      if (saved) return;
      if (useStore.getState().conflict) {
        event.preventDefault();
        return;
      }
      if (!closeDiscardArmed) {
        closeDiscardArmed = true;
        event.preventDefault();
        const current = useStore.getState().error;
        useStore.setState({
          error: {
            message: `${current?.message ?? "Your last edits could not be saved."} Fix the problem and close again — or close again now to discard the unsaved changes.`,
            details: current?.details,
          },
        });
      }
      // armed and still failing: the close proceeds, discarding the edits
    });
    return () => {
      disarmOnSave();
      void unlisten.then((fn) => fn());
    };
  }, []);

  // Group workflow: a git pull usually happens in a terminal while Paperstack
  // is unfocused. Reload on focus-regain so the sidebar, counters, and the
  // changed-on-disk dots catch up without the manual ⟳ — reloadProject never
  // touches unsaved edits (covered by store tests), so this is always safe.
  useEffect(() => {
    let last = 0;
    const unlisten = getCurrentWindow().onFocusChanged(({ payload: focused }) => {
      if (!focused) return;
      const now = Date.now();
      if (now - last < 2000) return; // focus events can bounce; reads are cheap but not free
      last = now;
      const s = useStore.getState();
      if (!s.projectDir || s.building || s.metadataOpen) return;
      void s.reloadProject();
    });
    return () => void unlisten.then((fn) => fn());
  }, []);

  // Writers press Ctrl+S no matter what autosave promises — honor it instead
  // of letting the webview's "save page" default swallow it.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        void useStore.getState().saveActive();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  useEffect(() => {
    if (devProject && !devAutoOpened) {
      devAutoOpened = true;
      if (devSmokeScript) {
        void import("./dev/smoke.ts").then((m) => m.runScriptedSmoke(devProject));
        return;
      }
      void openProject(devProject).then(() => {
        if (devSection) void useStore.getState().openSection(devSection);
        if (devSmokeExport) void useStore.getState().exportPdf(true);
        if (devSmokeMetadata) void useStore.getState().openMetadata();
        if (devSmokeView) {
          void useStore.getState().viewReport().then(() => {
            if (devSmokeView === "2") {
              setTimeout(() => void useStore.getState().viewReport(), 4000);
            }
          });
        }
      });
    }
  }, [openProject]);

  return (
    <div className="flex h-screen flex-col bg-zinc-950 text-zinc-200">
      {error && (
        <div className="flex items-start justify-between gap-4 border-b border-red-900 bg-red-950 px-4 py-2 text-sm text-red-200">
          <div className="min-w-0">
            <pre className="whitespace-pre-wrap font-sans">{error.message}</pre>
            {error.details && (
              <details className="pt-1 text-xs text-red-400/80">
                <summary className="cursor-pointer select-none">Technical details</summary>
                <pre className="max-h-40 overflow-y-auto whitespace-pre-wrap pt-1">
                  {error.details}
                </pre>
              </details>
            )}
          </div>
          <button onClick={clearError} className="shrink-0 text-red-400 hover:text-red-200">
            dismiss
          </button>
        </div>
      )}
      {notice && (
        <div className="flex items-start justify-between gap-4 border-b border-emerald-900 bg-emerald-950 px-4 py-2 text-sm text-emerald-200">
          <span>{notice}</span>
          <button onClick={clearNotice} className="shrink-0 text-emerald-400 hover:text-emerald-200">
            dismiss
          </button>
        </div>
      )}
      {confirmExport !== null && (
        <WarningBanner
          message={
            <>
              The report still contains {confirmExport} [TODO] placeholder
              {confirmExport === 1 ? "" : "s"}. Export it anyway?
            </>
          }
          primaryLabel="Export anyway"
          onPrimary={() => void exportPdf(true)}
          secondaryLabel="Cancel"
          onSecondary={cancelExport}
        />
      )}
      {templateOffer && (
        <WarningBanner
          message={
            <>
              This report's layout template came from an older Paperstack. Update it to the
              current layout? The report's look may change slightly — your writing is untouched
              either way.
            </>
          }
          primaryLabel="Update layout"
          onPrimary={() => void updateTemplate()}
          secondaryLabel="Keep current look"
          onSecondary={dismissTemplateOffer}
        />
      )}
      {conflict && (
        <WarningBanner
          message={
            <>
              “{conflict.file}” changed on disk while you were editing — probably a git pull
              or another editor. Which version do you want to keep?
            </>
          }
          primaryLabel="Keep my version"
          onPrimary={() => void keepMine()}
          secondaryLabel="Use the version on disk"
          onSecondary={useDisk}
        />
      )}
      {project ? (
        <>
          <div className="flex min-h-0 flex-1">
            <Sidebar />
            {metadataOpen && <MetadataForm />}
            {/* Editor and Preview stay mounted (hidden) under the form: the
                CodeMirror instance owns every section's parked undo history,
                and unmounting it made a Report-details visit erase undo for
                the whole project. */}
            <div className={metadataOpen ? "hidden" : "flex min-h-0 flex-1"}>
              <Editor />
              <Preview />
            </div>
          </div>
          <StatusBar />
        </>
      ) : (
        <Welcome />
      )}
    </div>
  );
}
