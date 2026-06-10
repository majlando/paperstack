# Paperstack — MVP development plan

The working plan for getting from empty repo to v1 (see [MVP.md](MVP.md) for scope, [STACK.md](STACK.md) for technology). Tasks are checkboxes so this doubles as a tracker. Sizes are rough: **S** = an evening, **M** = a few sessions, **L** = a week+ of spare-time work.

**Guiding rule:** engine first, UI second. Milestone 1 had zero UI and proved the only technically risky part — `folder → professional PDF`. Every later milestone is well-understood app work, with one exception left: running the bundled binaries from inside the app (M3 sidecars).

**Status (2026-06-11):** Phase 0 and Milestones 1–4 are complete. A second, code-level review (2026-06-11) found two data-loss paths in the editing loop and a few silent-wrong-output risks — those are now Milestone 4.5, which gates the `v0.1.0` tag together with the clean-machine test (un-deferred: Windows Sandbox is the clean machine). The post-v1 plan is Milestones 5–7 below: writing features (math, tables, citations), cross-platform public releases, and group-report readiness — in that order, except M7 floats to whenever the group report starts.

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
- [ ] Clean-machine test: install on a machine without Node/Rust/pandoc and walk the MVP.md Definition of Done end to end (create → metadata → sections → figure/code/diagram → counter → View Report → export → reopen). This is also the production CSP's first real exercise. *Un-deferred (2026-06-11): Windows Sandbox (built into the dev machine's Pro SKU) is the clean machine — no longer blocked on hardware; runs as the last step of M4.5*
- [ ] The author's next real SEA report is written in Paperstack — the v1 bar from PROJECT.md
- [ ] Tag `v0.1.0`, GitHub release with the installer attached (after the clean-machine test *and* the M4.5 data-integrity fixes pass)

## Milestone 4.5 — Data integrity and the v0.1.0 gate *(S/M — added after the 2026-06-11 code review)*

Goal: nothing in the core loop can lose writing or silently produce a wrong report. A writing app's first job is to never lose writing — these gate the `v0.1.0` tag ahead of every v0.2 feature.

**Data-loss fixes (the review's headline findings):**
- [x] `saveActive` race: a keystroke landing during the save's awaited read/write got its `dirty: true` clobbered by the save's unconditional `set({ dirty: false, baseline: content })` with the stale captured content — newer text then existed only in the editor while the status bar said "saved". Fixed (2026-06-11): the save advances the baseline only to what it actually synced and chains a save for anything newer
- [x] Flush on window close: `onCloseRequested` awaits `saveActive()` before allowing close, and keeps the window open when the save fails or conflicts so the banner can be resolved (2026-06-11; needed `core:window:allow-destroy` — registering a close-requested listener makes the JS wrapper responsible for destroying the window)
- [x] `openMetadata` honors a failed save: bails like `openSection` instead of unmounting the editor over an unresolved conflict (2026-06-11)
- [x] Sidebar actions stop wiping editor undo: the `setDoc` rebuild is skipped when the same section carries identical text; a different section always rebuilds — undo history must never cross section files (2026-06-11)

**Silent-wrong-output fixes:**
- [x] Unit-test the build string layer: assembler (escaping, localized length lines, numbering switches), converter path helpers, and `buildReport` orchestration through the `options.converter` seam with a fake compile — including the Windows locked-report.pdf fallback, previously all uncovered in CI (2026-06-11)
- [x] Interleaved roles silently renumbered: the heading counter now resets only on the *first* entry into each numbered mode, so a schema-legal `body, front-matter, body` order continues numbering instead of restarting at 1 (2026-06-11; loader warning judged unnecessary — the output is now simply correct)
- [x] Anslag definition pinned: Unicode code points, documented at the counter and tested — an emoji is one anslag, not two UTF-16 units (2026-06-11)

**Supply chain (ships inside the installer, so it belongs in the gate):**
- [x] `fetch-binaries.ps1`: SHA-256 pins for both downloaded archives, verified before extraction — a mismatch refuses to install (2026-06-11)
- [x] Stale-pin trap fixed: the skip-if-present check asks the binary for its version instead of only `Test-Path`, so a pin bump re-fetches on machines holding an old binary (2026-06-11)

**The gate:**
- [ ] Run the clean-machine test (docs/CLEAN-MACHINE-TEST.md) in Windows Sandbox, then tag `v0.1.0` per the M4 items above

---

# Beyond v0.1.0 — the v0.2 plan (2026-06-11)

Decided priorities: the next real report (a group report) needs math, tables, and citations; the project goes public open-source on all three desktop platforms; group workflow stays "polish what exists". Same guiding rule as v1: the riskiest pipeline work goes first, UI second.

Revised after the 2026-06-11 full review and the side-by-side against the original report: the remark→Typst emitter moves from "fallback" to M5's first task (math, citations, and table styling all build on it), M6 gains a "deterministic output everywhere" group (bundled fonts, vendored template) and ships the CLI, and M7 gains export self-healing and group-repo CI.

The same day's code-level review added: M4.5 above (data integrity, gates v0.1.0), CI coverage of the real PDF pipeline plus webview privilege hardening in M6, and the rendered-diagrams and line-endings decisions in M7 — the two holes in the group-via-Git story.

## Milestone 5 — Own the converter, then the writing features *(L)*

Goal: the three writing needs the first real report met by hand (tables, math, citations) stop needing hand-work — built on a Markdown→Typst emitter we own, not layered on the converter we always planned to replace (2026-06-11 review decision: emitter first, because math, citations, and the table-styling fix all want control pandoc doesn't give).

**Remark→Typst emitter (the keystone):**
- [ ] Golden-file safety net first: snapshot pandoc's `.typ` output for the demo fixture (committed) and the migrated real report (local), so emitter parity is measurable — and pandoc upgrades stop being invisible in the meantime
- [ ] Emitter behind the existing `Converter` interface: headings, paragraphs, emphasis, links, lists, code fences, images (incl. `{width=…}` attributes), tables, blockquotes — driven to parity against the golden files; pandoc stays as the fallback converter until the real report renders identically
- [ ] Table output: booktabs-style (horizontal rules, padded) instead of pandoc's full-grid boxes — the biggest body-content gap from the report side-by-side
- [ ] Banked payoffs once parity lands: conversion becomes a function call (no per-section process spawn), converter errors name the actual line instead of "unusual Markdown", and the pandoc sidecar can eventually be dropped from the bundle

**Math:**
- [ ] Emit Typst math for inline `$x$` and display `$$…$$` (remark-math in the emitter); invalid math fails with a readable error
- [ ] Preview: KaTeX for the same `$` syntax (check whether the Mermaid bundle's KaTeX can be reused before adding a dependency)

**Tables (authoring):**
- [ ] Insert Table helper: rows × columns → GFM table skeleton at the cursor
- [ ] "Format table" editor command: re-align the pipes of the table under the cursor — a pure text transform, lives in the engine with unit tests

**Citations:**
- [ ] Engine spike: `references.bib` handed to Typst's native bibliography, `[@key]` emitted as `#cite` — tested against real references from the migrated report. (The emitter makes Typst-native the only sensible route; the pandoc-citeproc alternative dies with the converter.) Numbered style only — SEA reports don't need citation-style choice
- [ ] Insert Citation helper listing `references.bib` entries; preview shows readable placeholders (`[key]`) — the PDF stays the truth, same one-rendering-path rule

## Milestone 6 — Every platform, public release *(L)*

Goal: a stranger on Windows, macOS, or Linux installs a release build and trusts the repo — and the same Git commit produces the same PDF for every group member, on any OS, after any app update.

**Deterministic output everywhere (do these before the group report starts, even if the rest of M6 waits):**
- [ ] Bundle open fonts and compile with `--font-path`, making them the template default — today Cambria/Consolas silently fall back to Libertinus/DejaVu off-Windows, so the same project would compile visually different PDFs per group member's OS (the Windows look becomes the opt-in, not the default)
- [ ] Vendor the template into the project: the first build writes the `.typ` template as a Git-tracked, user-editable project file instead of rewriting it into `output/.build/` on every build — app updates *offer* the new template instead of silently changing a finished report's layout (the figure-float regression caught in review was exactly this failure mode). This is also the honest answer to template customization, currently "explicitly cut"

**Platforms and release machinery:**
- [ ] `fetch-binaries` becomes cross-platform (TS port run via tsx; per-target typst/pandoc triples for dev and CI; carries the M4.5 SHA-256 pins forward)
- [ ] CI runs the real pipeline: fetch the pinned Linux binaries in CI and run the currently-skipped PDF integration test on every push — today the entire Markdown→Pandoc→Typst→PDF path, the product's one technically risky part, has zero CI coverage (unlocked by the TS port above; pull both forward if the rest of M6 waits). Add a `da`-language fixture build to the matrix so label localization is covered end to end
- [ ] PDF pane via pdf.js everywhere (the documented upgrade path): webkitgtk on Linux does not render PDFs in iframes, so this is a prerequisite, not polish — and it fixes the accepted scroll-reset-on-recompile annoyance as a side effect
- [ ] `pnpm smoke` passes on macOS and Linux (needs a desktop session, so it stays a release-checklist step, not CI)
- [ ] CI release workflow: tag → matrix build (NSIS/MSI, dmg, AppImage + deb) → GitHub release with artifacts attached
- [ ] Auto-update: tauri-plugin-updater against GitHub releases (the updater's own signing keys are free; OS code signing stays deferred — document the SmartScreen/Gatekeeper first-run path in the README instead)
- [ ] CLI packaging: `paperstack build <dir>` as an installable artifact — the engine + NodePlatform + `scripts/build-report.ts` already *are* the CLI; this is packaging, not a feature. Enables report builds in a group repo's CI (see M7)
- [ ] CI: add a `tauri build` job so packaging breakage is caught on push, not at release time (engine tests already run on every push)
- [ ] Webview privilege hardening (before strangers run release builds): `allow_project_scope` currently grants recursive read/write fs + asset scope to *any* path the webview asks for — reject filesystem roots and the home directory itself, require the directory to exist; and narrow the sidecar permissions from `args: true` toward an argument allowlist. Today one successful script injection converts to whole-disk access plus arbitrary pandoc/typst invocation; the CSP is the only gate
- [ ] Repo as product: README with screenshots and an install section, LICENSE decision, CONTRIBUTING.md, issue templates
- [ ] The clean-machine walkthrough (docs/CLEAN-MACHINE-TEST.md) runs per platform before each release

## Milestone 7 — Group-report readiness *(S/M — floats; schedule against the group report's start)*

Goal: the group report is written in Paperstack while some group members edit the same project in plain editors over Git.

- [ ] Auto-reload when the window regains focus and project files changed on disk (the conflict guard already protects unsaved edits; the manual Reload button stays)
- [ ] Per-section changed-on-disk indicators in the sidebar after an external change
- [x] **Rendered-diagrams default decided (2026-06-11): committed, not ignored.** Scaffolded projects no longer git-ignore `diagrams/rendered/` — the renders are content-hashed and deterministic, so committing them is conflict-free, and group members/CLI/CI can build sections containing diagrams they never opened in Paperstack. Self-healing (next item) is now convenience, not the fix. (Projects scaffolded before this keep their old `.gitignore` — removing the line by hand re-enables committing)
- [ ] Export self-heals diagrams: render missing Mermaid SVGs in-app before building, instead of telling the user to go open the section — a group member adding a diagram in another editor is exactly this case (the readable error stays for the CLI path, which has no renderer)
- [x] Scaffold a `.gitattributes` (`* text=auto`) into new projects alongside the `.gitignore` — mixed Windows/macOS groups hit CRLF diff churn in week one; counters are already CR-insensitive, diffs weren't (2026-06-11; never overwrites an existing one)
- [x] Readable error when `document.yaml` contains Git conflict markers (`<<<<<<<`) — the likeliest broken state after a bad merge of the shared ordering file (2026-06-11; pulled forward from M7, it was a 10-line fix with a test)
- [ ] Group repo CI: the report builds and the normalsider count is checked on every push, via the packaged CLI from M6 — members who don't run Paperstack still see the PDF and the count on their changes
- [ ] Recents: drop entries that fail to open (from the backlog)
- [ ] Editor: preserve undo history across section switches (from the backlog)
- [ ] Preview scroll: restore by anchor rather than raw `scrollTop` (from the backlog)
- [ ] Dogfood gate: the group report is written in Paperstack — the v1 bar from PROJECT.md carries over to v0.2

---

## Improvement backlog (valuable, never blocking)

Known-good improvements that don't gate any milestone — pick up when touching the area anyway:

- [x] Scripted smoke test for the app shell: `pnpm smoke` scaffolds a scratch project, launches the real app (`tauri dev` + `VITE_SMOKE_SCRIPT`), drives the store through open → edit → save → TODO confirm → export, and asserts the result the app writes to `output/smoke-result.json`. Local only (needs sidecars, port 1420, and a desktop session)
- [ ] `vite.config.ts`: replace the `@ts-expect-error` on `process` with `@types/node` in devDependencies
- [x] Ctrl+S bound to `saveActive` — autosave makes it redundant, but writers will press it; the binding is pure reassurance (2026-06-11)
- [ ] "Show in folder" button on the export notice (`tauri-plugin-opener`) instead of only printing the relative path
- [ ] Sidebar inline rename/add: commit on blur instead of silently discarding (Enter is the only commit path today, and nothing says so)
- [ ] Section-remove confirm copy tells the user the file stays on disk and how to re-add it (the data is safe; the copy doesn't say so)
- [x] `toError`: render non-`Error` throws readably (2026-06-11)
- [x] Sweep stale `.typ` files from `output/.build/converted/` after a successful export, with the diagram sweep's only-our-naming-scheme rule (2026-06-11)
- [x] `ENGINE_VERSION`: deleted — hand-maintained, never imported, already drifting (2026-06-11)

(The editor-undo, preview-scroll, and recents items moved into Milestone 7; the reload-triggered undo wipe — the worse half of the editor-undo item — moved into Milestone 4.5.)

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
| Remark emitter falls short of pandoc's Markdown edge cases | Golden-file corpus (demo fixture + real report) measures parity before any cutover; pandoc stays behind the Converter interface as the fallback until the real report renders identically |
| Typst's native bibliography can't express the report's references | M5 engine-only spike against real references from the SEA report — before any citation UI exists (pandoc-citeproc is not a fallback here; it dies with the converter) |
| Linux webview cannot show PDFs in an iframe | Known going in: pdf.js replaces the built-in viewer in M6 *before* the first Linux release; it also fixes the scroll-reset annoyance |
| Autosave can lose writing (save race, no flush on close) | Found 2026-06-11 — both fixes are M4.5 items and gate v0.1.0; the smoke test should assert the close-flush once it exists |
| Unverified binary downloads ship to end users as sidecars | M4.5 adds SHA-256 pins to `fetch-binaries.ps1`; the M6 TS port carries them to every platform and CI |
| Build string layer (assembler/converter) untested in CI | M4.5 unit-tests the pure functions; M6 runs the full PDF integration test in CI on Linux |
| Group member adds a diagram outside the app → export breaks for everyone | M7 decision item: commit content-hashed renders (recommended) and/or in-app self-healing; until then, the readable error is the only mitigation |
