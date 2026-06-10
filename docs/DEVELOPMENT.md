# Paperstack — MVP development plan

The working plan for getting from empty repo to v1 (see [MVP.md](MVP.md) for scope, [STACK.md](STACK.md) for technology). Tasks are checkboxes so this doubles as a tracker. Sizes are rough: **S** = an evening, **M** = a few sessions, **L** = a week+ of spare-time work.

**Guiding rule:** engine first, UI second. Milestone 1 had zero UI and proved the only technically risky part — `folder → professional PDF`. Every later milestone is well-understood app work, with one exception left: running the bundled binaries from inside the app (M3 sidecars).

**Status (2026-06-10):** Phase 0, Milestone 1, and Milestone 2 are complete — the engine builds real reports to PDF, and the app shell covers create/open project, structure editing, autosaved editing with live preview, counters, and a conflict guard for externally changed files. Milestone 3 (the core report loop) is next; the first task in it is the last genuinely risky integration in the project.

---

## Phase 0 — Repo and tooling setup *(S — done)*

- [x] pnpm workspace monorepo:
  ```
  paperstack/
  ├─ packages/engine/        # pure TS library (Milestone 1)
  ├─ apps/desktop/           # Tauri + React app (Milestone 2+)
  ├─ fixtures/
  │  └─ demo-report/         # committed, synthetic SEA-style fixture
  ├─ docs/
  └─ scripts/                # dev-binary download, etc.
  ```
- [x] `packages/engine`: strict `tsconfig`, Vitest, no runtime dependencies beyond `yaml` and `zod` (unified/remark moved to the app, where the preview lives — they return to the engine if the remark-based Typst emitter ever happens)
- [x] `scripts/fetch-binaries.ps1` — downloads pinned versions of `typst` (0.13.1) and `pandoc` (3.6.3) into a git-ignored `bin/` for development (these ship as Tauri sidecars later; never committed)
- [x] GitHub Actions workflow: install + run engine tests on every push (cheap, and keeps the public repo trustworthy from day one)
- [x] Two fixtures: `fixtures/demo-report/` (small, synthetic, committed — used by tests) and the real SEA report in `report/` (local only, git-ignored — used to judge output quality)

## Milestone 1 — Engine: folder → PDF *(L — done)*

Goal: `pnpm build:demo` produces `output/report.pdf` that looks at least as good as the old `build.ps1` output.

**Architecture task first:**
- [x] Define a `Platform` interface (readFile, writeFile, listDir, fileExists, mkdir, rename, runBinary) that the engine receives via injection. `NodePlatform` for tests/CLI; `TauriPlatform` in the app. This is what keeps the engine runnable in tests, a future CLI, and inside the Tauri webview without changes.

**Project model:**
- [x] `document.yaml` schema as a zod schema (title, course, institution, authors, date, language, body cap, sections with roles) — one source of truth for validation *and* the metadata form (M3)
- [x] Project loader: parse metadata, resolve section files and roles (front-matter / body / back-matter / appendix), produce a typed `Project` model with readable errors for missing files and invalid YAML
- [x] Section paths validated (relative, forward slashes, no `..`) — a shared document.yaml can never read outside the project folder

**Counters (ported from the old `build.ps1`):**
- [x] Normalsider counter: strip HTML comments, count chars, ÷ 2400; per section + body total vs. cap; CR-insensitive so CRLF/LF checkouts count the same
- [x] TODO counter: count `[TODO` occurrences not preceded by a backtick
- [x] Unit tests for both against fixture sections with known counts

**Conversion and compile:**
- [x] `Converter` interface: `toTypst(markdown, sectionDir)`. First implementation: Pandoc sidecar (`-f gfm+implicit_figures+attributes -t typst`, image paths rewritten to root-absolute)
- [x] SEA Typst template: cover page (title, authors + student IDs, course, institution, date, length line), table of contents, numbered headings, styled code blocks, numbered figure captions from image alt text, page numbers, appendix handling (lettered, after references)
- [x] Template details that define the look: fonts fall back Cambria/Consolas → Typst's bundled Libertinus/DejaVu (so CI and non-Windows machines still build); labels (`Contents`/`Figure` vs. `Indholdsfortegnelse`/`Figur`) localize via Typst's `text(lang:)`; the cover length line is localized in the engine
- [x] Assembler: metadata + converted sections → `main.typ` (template call + includes, heading numbering switched by section role) → `typst compile` → `output/report.pdf`
- [x] Error mapper: `PaperstackError` with user-facing messages for missing/invalid metadata, missing sections, unrendered diagrams, missing images, locked report.pdf (→ timestamped fallback, local time), and export failures
- [x] Mermaid handling: ```mermaid blocks are content-hashed (CRLF-normalized) and replaced with `diagrams/rendered/<hash>.svg` images at build time; fence detection is line-anchored and matches the preview parser's semantics; a missing render is a readable error

**Acceptance:**
- [x] Demo fixture builds green in the test run (integration test, auto-skipped where binaries are absent, e.g. CI)
- [x] The real SEA report (local) builds and the PDF is judged side-by-side against the original `report.pdf`. Migrated copy (git-ignored `report-migrated/`): manual heading numbers stripped, LaTeX figure blocks → Markdown images, `\newpage` hints removed. All 23 sections built first try (~37 normalsider); ToC structure matches the original exactly, tables/code/figures/appendix lettering all render. Known gaps → template polish, scheduled in M4.

## Milestone 2 — App shell *(L — done)*

Goal: create or open a project, edit sections with autosave, see a live per-section preview, edit the report structure — all safe to use on a Git-shared project.

- [x] Scaffold `apps/desktop`: Tauri 2 + React + Vite + Tailwind (shadcn/ui arrives with the first form/dialog need — the M3 metadata form)
- [x] `TauriPlatform` implementation of the engine's `Platform` interface (fs plugin; `runBinary` lands with the M3 sidecars). The engine package's `./node` subpath export keeps `NodePlatform` (node:fs) out of the webview bundle
- [x] App layout: sidebar | editor | preview, error banner, status bar
- [x] Open project via folder picker (+ `VITE_OPEN_PROJECT` / `VITE_OPEN_SECTION` dev auto-open, used by scripted smoke tests)
- [x] Create project from the SEA template (localized en/da starter sections; project `.gitignore` for `output/` and `diagrams/rendered/` — appended, never overwritten, when the folder already has one); recent-projects list (localStorage — app-private state stays out of the project folder)
- [x] Reload project button — picks up files changed outside the app (e.g. after a `git pull`); skips re-reading the open section while it has unsaved edits; doesn't steal focus
- [x] Sidebar driven by the engine's `Project` model, grouped by role, with per-section TODO badges
- [x] Section actions in the sidebar: add / rename / remove / move up/down (all edit the `sections` list in `document.yaml`, the single source of truth for order, via the comment-preserving yaml Document API; remove takes the section out of the report but keeps the file on disk; move swaps within the role group)
- [x] `MarkdownEditor` vanilla-TS class wrapping CodeMirror 6 (markdown mode + fenced-code highlighting, zinc theme, list-continuation keymap) + the small React mount bridge (`contentVersion` distinguishes external content changes from keystrokes); autosave 800 ms after the last keystroke and on blur
- [x] Save-path safety: saves are skipped when nothing changed (no mtime churn, no clobbering a freshly pulled file); a failed save keeps the section open and dirty with the error visible instead of dropping the edits
- [x] Conflict guard: saves compare the file on disk against the last-synced baseline; a banner offers "keep my version" / "use the disk version" instead of silently overwriting external edits
- [x] Preview pane: vanilla-TS `MarkdownPreview` (remark/rehype + rehype-highlight, Tailwind typography) + thin React bridge; images via the Tauri asset protocol; live Mermaid with inline error boxes, render results cached by content hash; 300 ms debounce. Raw HTML in Markdown is deliberately not rendered (`remark-rehype` default) — keep it that way, it is what makes `innerHTML` safe here
- [x] Mermaid render hook: on open and on save, render not-yet-rendered ```mermaid blocks to `diagrams/rendered/<hash>.svg` (the files PDF export embeds); invalid diagrams skipped (visible in preview, readable error at export)

## Milestone 3 — Report workflow *(M/L — next)*

Goal: the full core loop — edit → save → **View Report** → **Export PDF** — plus the metadata form. Ordered risk-first: the sidecars (bundled typst/pandoc running from inside the app) are the last real integration risk in the project, so they come before any of the UI around them.

**Sidecars (the risk — do first):**
- [ ] Bundle `typst` + `pandoc` as Tauri sidecars (`bundle.externalBin`, target-triple-named binaries; extend `fetch-binaries.ps1` to place dev copies where `tauri dev` finds them)
- [ ] Shell-plugin capability scoped to exactly the two sidecars (no general process execution)
- [ ] `TauriPlatform.runBinary` via the shell plugin: spawn sidecar, write stdin (Pandoc converts via stdin/stdout), capture stdout/stderr/exit code
- [ ] Adapt the engine's dependency preflight: "does this binary exist" is a `Platform` question, and a sidecar is referenced by name, not by an absolute path the fs plugin can `exists()` — adjust `BuildOptions`/preflight so both Node (paths) and Tauri (sidecar names) answer it honestly
- [ ] Smoke test: build the demo fixture to PDF from inside the running app

**The loop:**
- [ ] View Report: compile via the engine, show the real PDF in a pane (WebView2 built-in viewer first; upgrade path is pdf.js if scroll reset on recompile gets annoying — decision documented in STACK.md); recompile on demand; surface engine warnings (TODO count, over cap, locked-file fallback) in report wording
- [ ] Export PDF button — same pipeline, writes `output/report.pdf`, confirms with the written path; locked-file fallback surfaced as a warning, not an error
- [ ] Stale-render sweep at export: delete `diagrams/rendered/*.svg` whose hash no longer appears in any section (needs `Platform.removeFile`; engine logic + unit test)

**Metadata form:**
- [ ] Engine: comment-preserving metadata edits on `document.yaml` via the yaml Document API (same approach as `section-edit.ts`; one function per field group, unit-tested round-trips)
- [ ] Form generated against the zod schema (first shadcn/ui components get vendored here): title/subtitle/course/institution/date/language/cap + authors list with student IDs; no raw YAML required
- [ ] Validation messages come from the same zod schema the loader uses (one source of truth, no drift)

**Finish the workflow:**
- [ ] Status bar TODO counter click-to-jump: cycle through `[TODO` locations in the active section (the live counters themselves shipped in M2)
- [ ] Error surfacing polish: every engine error renders readably with the affected file where known; `details` (raw tool output) reachable but never the headline
- [ ] Webview hardening: set a real CSP in `tauri.conf.json` (currently `null`); revisit the `fs`/asset-protocol scope — the capability text says "user-chosen project folders" but grants `**`; at minimum document the decision, ideally scope it

## Milestone 4 — Helpers, polish, packaging *(M)*

Goal: another student can install it and produce a report unaided.

**Insert helpers:**
- [ ] Insert Figure: file dialog → copy into `figures/` (needs `Platform.copyFile`) → prompt for the caption → insert `![caption](/figures/...)` at the cursor (alt text becomes the numbered caption; `MarkdownEditor` gains an insert-at-cursor API)
- [ ] Insert Code Block and Insert Diagram (Mermaid stub) — snippet insertion via the same editor API

**Template polish (the M1 acceptance gaps, decided deliberately rather than patched ad hoc):**
- [ ] Cover page: optional `logo` / `cover_image` metadata fields and a details table — judged against the real SEA report's hand-built LaTeX cover
- [ ] Large-figure placement: figures that leave a page gap (the old report managed this with manual `\newpage`) — try `set figure(placement: auto)` or smarter spacing
- [ ] Heading/link colors: old report used navy headings + teal links; current template is black + navy — pick the default look

**First-run polish:**
- [ ] Sensible window state (size/position remembered), empty-state screens, real app icon (replace the default Tauri icon)
- [ ] A `[TODO]`-count warning moment before export (the engine warning exists; give it UI)

**Packaging and acceptance:**
- [ ] Windows installer (NSIS via Tauri bundler) with sidecar binaries included
- [ ] Clean-machine test: install on a machine without Node/Rust/pandoc and walk the MVP.md Definition of Done end to end (create → metadata → sections → figure/code/diagram → counter → View Report → export → reopen)
- [ ] The author's next real SEA report is written in Paperstack — the v1 bar from PROJECT.md
- [ ] Tag `v0.1.0`, GitHub release with the installer attached

---

## Improvement backlog (valuable, never blocking)

Known-good improvements that don't gate any milestone — pick up when touching the area anyway:

- [ ] Scripted smoke test for the app shell: drive `VITE_OPEN_PROJECT` against a scratch project and assert the store reaches the expected state (today the UI is verified by use; engine paths are unit-tested)
- [ ] Editor: preserve undo history across section switches (currently each switch resets CodeMirror state — acceptable, but surprising for heavy switchers)
- [ ] Preview scroll: restore by anchor rather than raw `scrollTop` (image loads shift layout slightly)
- [ ] Recent-projects list: drop entries that fail to open (currently they just error)
- [ ] `vite.config.ts`: replace the `@ts-expect-error` on `process` with `@types/node` in devDependencies

## Working practices

- **Engine logic gets tests; chrome mostly doesn't.** Vitest on counters, loader, converter output, structure edits, scaffolding, error mapping. UI is verified by using it (and by the smoke-test hook above once it exists).
- **The real SEA report is the quality bar.** Every template/pipeline change is judged against it locally; the committed demo fixture keeps tests reproducible for everyone else.
- **Group-safety is a feature.** Deterministic writes (stable key order, trailing newline, no churn on no-op saves), comment-preserving YAML edits, conflict guard, app-private state out of the project folder. Anything that would surprise a git-using group is a bug.
- **Small commits, imperative messages** (`engine: add normalsider counter`). Commit at every green state.
- **CLAUDE.md at the repo root** pins the architecture rules for AI-assisted sessions (engine stays framework-free, no wrapper packages, React used thin). Update it when a convention changes.
- **Scope guard:** anything not in MVP.md goes to the improvement backlog above or a GitHub issue, not into the code.

## Risks and mitigations

| Risk | Status / mitigation |
|---|---|
| Tauri sidecar/permission friction | **The open risk** — first task of M3, isolated in `TauriPlatform.runBinary`; Electron remains the documented fallback |
| WebView2 PDF viewer UX (scroll reset on recompile) | Accept first; pdf.js is the documented upgrade path |
| Pandoc's Typst output fights the template | Mitigated: proven against the real report in M1; converter stays behind an interface, remark-based emitter is the fallback |
| Mermaid → SVG → Typst rendering quality | Proven in M1 with real diagrams from the SEA report |
| Webview scope too broad (fs `**`, no CSP) | Scheduled in M3 hardening; preview already refuses raw HTML by design |
| Scope creep | MVP.md cut list is the contract; this plan has no optional tasks on the milestone path |
