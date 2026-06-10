# Paperstack — MVP development plan

The working plan for getting from empty repo to v1 (see [MVP.md](MVP.md) for scope, [STACK.md](STACK.md) for technology). Tasks are checkboxes so this doubles as a tracker. Sizes are rough: **S** = an evening, **M** = a few sessions, **L** = a week+ of spare-time work.

**Guiding rule:** engine first, UI second. Milestone 1 had zero UI and proved the only technically risky part — `folder → professional PDF`. Every later milestone is well-understood app work, with one exception left: running the bundled binaries from inside the app (M3 sidecars).

**Status (2026-06-11):** Phase 0 and Milestones 1–4 are complete (M4's clean-machine test is deferred until a clean Windows machine is available — it gates the `v0.1.0` tag, not development). The post-v1 plan is Milestones 5–7 below: writing features (math, tables, citations), cross-platform public releases, and group-report readiness — in that order, except M7 floats to whenever the group report starts.

---

## Phase 0 — Repo and tooling setup *(S — done)*

- [x] pnpm workspace monorepo:
  ```
  paperstack/
  ├─ packages/engine/        # pure TS library; src grouped by domain:
  │                          #   platform/ (fs/process abstraction + impls)
  │                          #   project/  (schema, loader, scaffold, edits, counters)
  │                          #   build/    (converter, template, assembler, builder, mermaid)
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

## Milestone 3 — Report workflow *(M/L — done)*

Goal: the full core loop — edit → save → **View Report** → **Export PDF** — plus the metadata form. Ordered risk-first: the sidecars (bundled typst/pandoc running from inside the app) are the last real integration risk in the project, so they come before any of the UI around them.

**Sidecars (the risk — done, and proven):**
- [x] Bundle `typst` + `pandoc` as Tauri sidecars (`bundle.externalBin`, target-triple-named binaries; `fetch-binaries.ps1` places dev copies under `src-tauri/binaries/`, git-ignored)
- [x] Shell-plugin capability scoped to exactly the two sidecars (no general process execution)
- [x] `TauriPlatform.runBinary` via the shell plugin. Pandoc input travels by temp file, not stdin — the shell plugin cannot close a child's stdin, and pandoc reads stdin until EOF
- [x] Engine preflight runs each binary with `--version` instead of checking paths — works identically for Node paths and sidecar names, and catches exists-but-broken binaries too
- [x] Smoke test: `VITE_SMOKE_EXPORT=1` dev hook exports the demo fixture from inside the running app — verified, 98 KB PDF written by the sidecars

**The loop:**
- [x] View Report: Preview/Report tabs in the right pane; compile via the engine, PDF in WebView2's built-in viewer (iframe; pdf.js is the documented upgrade path if scroll reset annoys); clicking the tab recompiles on demand; engine warnings (TODOs, over cap, locked-file fallback) shown in an amber strip
- [x] Export PDF button — same pipeline, writes `output/report.pdf`, green notice with the written path; locked-file fallback arrives as a warning, not an error
- [x] Stale-render sweep after successful export: hash-named `diagrams/rendered/*.svg` no longer referenced by any section are deleted (strictly 8-hex-digit names — user files untouched)

**Metadata form:**
- [x] Engine: comment-preserving metadata edits on `document.yaml` via the yaml Document API (`metadata-edit.ts`, unit-tested round-trips; existing scalars are mutated in place so quoting style survives, new keys insert at their canonical position, cleared optional fields remove their key)
- [x] Form: title/subtitle/course/institution/date/language/cap + authors list with student IDs; full-pane "Report details" view via the ⚙ button (no raw YAML required). shadcn/ui deferred deliberately: the form needs only plain inputs and a native select — no dialog/dropdown plumbing — so vendoring waits for the first real dialog need (M4 Insert Figure)
- [x] Validation is `documentSchema.omit({ sections })` — the loader's own schema, same messages; the engine re-validates the resulting document before writing, so the form can never produce a file the loader rejects

**Finish the workflow:**
- [x] Status bar TODO counter click-to-jump: cycles through `[TODO` markers in the active section, selecting and scrolling to each (engine `findTodoOffsets` shares the counter's regex — one definition of "a TODO"); when the active section is clean it opens the first section that still has one
- [x] Error surfacing polish: the banner headline stays human-readable; raw tool output (`PaperstackError.details`) is reachable behind a "Technical details" disclosure, never the headline
- [x] Webview hardening: real CSP (strict in production, Vite-compatible in dev) and **empty static fs/asset scopes** — project folders are granted at runtime by the `allow_project_scope` command when the user opens them, so the webview can only touch folders the user chose. Verified end to end: open → build → View Report all work under the hardened config (the production CSP gets its real exercise in the M4 clean-machine test)

## Milestone 4 — Helpers, polish, packaging *(M)*

Goal: another student can install it and produce a report unaided.

**Real-report dogfood (2026-06-10):** the migrated SEA report (23 sections, ~37 normalsider, 80+ images, flat layout with assets under `resources/`) opens, edits, and builds in the app — full compile ≈ 2 s, 6.2 MB PDF renders in the pane, counters match the old toolchain. It exposed that the section-add path hardcoded the scaffold layout (fixed: new files follow where same-role sections already live, numbering and appendix letters scan the project's actual files). Remaining lesson lives in the Insert Figure item below.

**Insert helpers:**
- [x] Insert Figure: file dialog → copied into the project's own images folder (first of `figures/`, `images/`, `assets/`, `resources/` that exists; filenames slugified so the Markdown link always parses; collision-safe numeric suffixes, never overwrites) → caption prompt (becomes the numbered figure caption) → root-absolute image Markdown inserted as its own paragraph via `MarkdownEditor.insertBlock`. The convention logic lives in the engine (`import-figure.ts`, `new-section-file.ts`) with unit tests
- [x] Insert Code Block (cursor lands on the language position) and Insert Diagram (Mermaid stub that renders in the preview immediately) — same editor API, buttons in the editor header

**Template polish (the M1 acceptance gaps, decided deliberately rather than patched ad hoc):**
- [x] Cover page: optional `logo` metadata field (validated project-relative path; metadata-form field; rendered centered above the title). `cover_image` and a details table deliberately skipped — the logo + title + authors cover reads clean; revisit only if a side-by-side against the old cover demands it
- [x] Large-figure placement: figures taller than ~a third of the text area float to the top/bottom of a page instead of leaving gaps; small figures stay exactly where they are written, and figures inside blockquotes/lists no longer error (floating everything did both). The float-all measurement on the real report (127 → 113 pages) came from the tall figures, which still float
- [x] Heading/link colors decided: navy headings (`#1f3864`, the old report's look) + navy links (`#1a4b8b`)

**First-run polish:**
- [x] Window size/position remembered (`tauri-plugin-window-state`); empty-state screens already shipped with M2/M3; real app icon (paper-stack motif, generated for all platforms via `tauri icon`); window title shows the report title
- [x] `[TODO]`-count warning before export: Export PDF asks "Export it anyway?" while placeholders remain, instead of warning after the file is written

**Packaging and acceptance:**
- [x] Windows installer (NSIS via Tauri bundler) with both sidecars included — `tauri build` produces `Paperstack_0.1.0_x64-setup.exe` (38 MB; MSI too). Built and verified on the dev machine (2026-06-10)
- [ ] Clean-machine test: install on a machine without Node/Rust/pandoc and walk the MVP.md Definition of Done end to end (create → metadata → sections → figure/code/diagram → counter → View Report → export → reopen). This is also the production CSP's first real exercise. *Deferred (2026-06-10): no clean Windows machine at hand — gates the v0.1.0 tag, not further development*
- [ ] The author's next real SEA report is written in Paperstack — the v1 bar from PROJECT.md
- [ ] Tag `v0.1.0`, GitHub release with the installer attached (after the clean-machine test passes)

---

# Beyond v0.1.0 — the v0.2 plan (2026-06-11)

Decided priorities: the next real report (a group report) needs math, tables, and citations; the project goes public open-source on all three desktop platforms; group workflow stays "polish what exists". Same guiding rule as v1: the riskiest pipeline work goes first, UI second.

## Milestone 5 — Writing features: math, tables, citations *(M/L)*

Goal: the three writing needs the first real report met by hand stop needing hand-work.

**Citations spike (the unknown — engine only, like M1):**
- [ ] Prove the pipeline: `references.bib` in the project + `[@key]` in Markdown → numbered citations and a references list in the PDF. Two candidate routes — pandoc `+citations` emitting Typst `#cite`, or handing the `.bib` to Typst's native bibliography — decide while both are still cheap to choose, testing against real references from the migrated SEA report. If this works, the rest of citations is UI
- [ ] Decide the v1-of-citations scope: numbered style only (SEA reports don't need citation-style choice)

**Math (proven tech, high value):**
- [ ] Engine: enable `tex_math_dollars` in the pandoc reader; verify the Typst writer emits Typst math for inline `$x$` and display `$$…$$` (fixture section with both; readable error when math is invalid)
- [ ] Preview: remark-math + KaTeX so the preview accepts the same `$` syntax as the pipeline (KaTeX already ships inside the Mermaid bundle — check whether it can be reused before adding a dependency)

**Tables (small):**
- [ ] Insert Table helper: rows × columns → GFM table skeleton at the cursor (pipeline and preview already render GFM tables)
- [ ] "Format table" editor command: re-align the pipes of the table under the cursor — a pure text transform, lives in the engine with unit tests

**Citations UX (after the spike has decided the route):**
- [ ] Insert Citation helper listing `references.bib` entries; inserted at the cursor
- [ ] Preview shows citations as readable placeholders (`[1]` / `[key]`) — the PDF stays the truth, same one-rendering-path rule

## Milestone 6 — Every platform, public release *(L)*

Goal: a stranger on Windows, macOS, or Linux installs a release build and trusts the repo.

- [ ] `fetch-binaries` becomes cross-platform (TS port run via tsx; per-target typst/pandoc triples for dev and CI)
- [ ] PDF pane via pdf.js everywhere (the documented upgrade path): webkitgtk on Linux does not render PDFs in iframes, so this is a prerequisite, not polish — and it fixes the accepted scroll-reset-on-recompile annoyance as a side effect
- [ ] `pnpm smoke` passes on macOS and Linux (needs a desktop session, so it stays a release-checklist step, not CI)
- [ ] CI release workflow: tag → matrix build (NSIS/MSI, dmg, AppImage + deb) → GitHub release with artifacts attached
- [ ] Auto-update: tauri-plugin-updater against GitHub releases (the updater's own signing keys are free; OS code signing stays deferred — document the SmartScreen/Gatekeeper first-run path in the README instead)
- [ ] Repo as product: README with screenshots and an install section, LICENSE decision, CONTRIBUTING.md, issue templates
- [ ] The clean-machine walkthrough (docs/CLEAN-MACHINE-TEST.md) runs per platform before each release

## Milestone 7 — Group-report readiness *(S/M — floats; schedule against the group report's start)*

Goal: the group report is written in Paperstack while some group members edit the same project in plain editors over Git.

- [ ] Auto-reload when the window regains focus and project files changed on disk (the conflict guard already protects unsaved edits; the manual Reload button stays)
- [ ] Per-section changed-on-disk indicators in the sidebar after an external change
- [ ] Recents: drop entries that fail to open (from the backlog)
- [ ] Editor: preserve undo history across section switches (from the backlog)
- [ ] Preview scroll: restore by anchor rather than raw `scrollTop` (from the backlog)
- [ ] Dogfood gate: the group report is written in Paperstack — the v1 bar from PROJECT.md carries over to v0.2

---

## Improvement backlog (valuable, never blocking)

Known-good improvements that don't gate any milestone — pick up when touching the area anyway:

- [x] Scripted smoke test for the app shell: `pnpm smoke` scaffolds a scratch project, launches the real app (`tauri dev` + `VITE_SMOKE_SCRIPT`), drives the store through open → edit → save → TODO confirm → export, and asserts the result the app writes to `output/smoke-result.json`. Local only (needs sidecars, port 1420, and a desktop session)
- [ ] `vite.config.ts`: replace the `@ts-expect-error` on `process` with `@types/node` in devDependencies

(The editor-undo, preview-scroll, and recents items moved into Milestone 7.)

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
| Tauri sidecar/permission friction | **Cleared (2026-06-10)** — sidecars run scoped via the shell plugin; in-app export verified on the demo fixture |
| WebView2 PDF viewer UX (scroll reset on recompile) | Verified working (2026-06-10): PDF renders in-pane and recompiles rewrite `report.pdf` in place — the viewer holds no file lock. Scroll reset accepted; pdf.js is the documented upgrade path |
| Pandoc's Typst output fights the template | Mitigated: proven against the real report in M1; converter stays behind an interface, remark-based emitter is the fallback |
| Mermaid → SVG → Typst rendering quality | Proven in M1 with real diagrams from the SEA report |
| Webview scope too broad (fs `**`, no CSP) | Resolved (2026-06-10): empty static scopes + per-project runtime grants, CSP set; preview refuses raw HTML by design. Production CSP gets exercised in the M4 clean-machine test |
| Scope creep | MVP.md cut list is the contract; this plan has no optional tasks on the milestone path |
| Citation pipeline (pandoc citeproc vs Typst bibliography) fights the template | M5 starts with an engine-only spike against real references from the SEA report — route decided before any UI exists |
| Linux webview cannot show PDFs in an iframe | Known going in: pdf.js replaces the built-in viewer in M6 *before* the first Linux release; it also fixes the scroll-reset annoyance |
