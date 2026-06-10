# Paperstack — MVP development plan

The working plan for getting from empty repo to v1 (see [MVP.md](MVP.md) for scope, [STACK.md](STACK.md) for technology). Tasks are checkboxes so this doubles as a tracker. Sizes are rough: **S** = an evening, **M** = a few sessions, **L** = a week+ of spare-time work.

**Guiding rule:** engine first, UI second. Milestone 1 has zero UI and proves the only technically risky part — `folder → professional PDF`. Every later milestone is well-understood app work.

---

## Phase 0 — Repo and tooling setup *(S)*

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
- [x] `packages/engine`: strict `tsconfig`, Vitest, no runtime dependencies beyond `yaml`, `zod`, `unified/remark`
- [x] `scripts/fetch-binaries.ps1` — downloads pinned versions of `typst` (0.13.1) and `pandoc` (3.6.3) into a git-ignored `bin/` for development (these ship as Tauri sidecars later; never committed)
- [x] GitHub Actions workflow: install + run engine tests on every push (cheap, and keeps the public repo trustworthy from day one)
- [x] Two fixtures: `fixtures/demo-report/` (small, synthetic, committed — used by tests) and the real SEA report in `report/` (local only, git-ignored — used to judge output quality)

## Milestone 1 — Engine: folder → PDF *(L — the core of the project)*

Goal: `node scripts/build.ts fixtures/demo-report` produces `output/report.pdf` that looks at least as good as the old `build.ps1` output.

**Architecture task first:**
- [x] Define a `Platform` interface (readFile, writeFile, listDir, fileExists, runBinary) that the engine receives via injection. Implement `NodePlatform` now; `TauriPlatform` comes in Milestone 2. This is what keeps the engine runnable in tests, a future CLI, and inside the Tauri webview without changes.

**Project model:**
- [x] `document.yaml` schema as a zod schema (title, course, institution, authors, date, language, body cap, sections with roles) — one source of truth for validation *and* the future metadata form
- [x] Project loader: parse metadata, resolve section files and roles (front-matter / body / back-matter / appendix), produce a typed `Project` model with readable errors for missing files and invalid YAML

**Counters (port the logic from the old `build.ps1`):**
- [x] Normalsider counter: strip HTML comments, count chars, ÷ 2400; per section + body total vs. cap
- [x] TODO counter: count `[TODO` occurrences not preceded by a backtick
- [x] Unit tests for both against fixture sections with known counts

**Conversion and compile:**
- [x] `Converter` interface: `toTypst(markdown, sectionDir)`. First implementation: Pandoc sidecar (`-f gfm+implicit_figures -t typst`, image paths rewritten to root-absolute)
- [x] SEA Typst template: cover page (title, authors + student IDs, course, institution, date, length line), table of contents, numbered headings, styled code blocks, numbered figure captions from image alt text, page numbers, appendix handling (lettered, after references)
- [x] Template details that define the look: fonts fall back Cambria/Consolas → Typst's bundled Libertinus/DejaVu (so CI and non-Windows machines still build); labels (`Contents`/`Figure` vs. `Indholdsfortegnelse`/`Figur`) localize via Typst's `text(lang:)`; the cover length line is localized in the engine
- [x] Assembler: metadata + converted sections → `main.typ` (template call + includes, heading numbering switched by section role) → `typst compile` → `output/report.pdf`
- [x] Error mapper: `PaperstackError` with user-facing messages for missing/invalid metadata, missing sections, unrendered diagrams, missing images, locked report.pdf (→ timestamped fallback), and export failures

**Acceptance:**
- [x] Demo fixture builds green in the test run (integration test, auto-skipped where binaries are absent, e.g. CI)
- [ ] The real SEA report (local) builds and the PDF is judged side-by-side against the original `report.pdf` — typography, ToC, code blocks, figures
- [x] Mermaid handling implemented: ```mermaid blocks are content-hashed and replaced with `diagrams/rendered/<hash>.svg` images at build time; a missing render is a readable error (the app renders on save in M2; for M1 a placeholder SVG stands in)

## Milestone 2 — App shell *(L)*

Goal: open a project, edit sections with autosave, see a live per-section preview.

- [ ] Scaffold `apps/desktop`: Tauri 2 + React + Vite + Tailwind + shadcn/ui
- [ ] Sidecar config for `typst` + `pandoc`; `TauriPlatform` implementation of the engine's `Platform` interface (fs/shell plugins)
- [ ] App layout: sidebar | editor | preview panes
- [ ] Create project (from SEA template, including a project `.gitignore` for `output/` and `diagrams/rendered/`) and open project (folder picker); recent-projects list
- [ ] Reload project action — picks up files changed outside the app (e.g. after a `git pull`); warn instead of silently overwriting if a file changed on disk while open in the editor
- [ ] Sidebar driven by the engine's `Project` model, grouped by role; add / rename / delete / move up/down (reordering edits the `sections` list in `document.yaml` — the single source of truth for order)
- [ ] `EditorView` vanilla-TS class wrapping CodeMirror 6 (markdown mode, highlighting) + the small React mount bridge; autosave on idle
- [ ] Preview pane: remark → HTML, syntax-highlighted code, images resolved from the project folder, live Mermaid rendering
- [ ] Mermaid save hook: on save, render diagrams to `diagrams/rendered/*.svg`

## Milestone 3 — Report workflow *(M)*

Goal: the full loop — metadata, counters, View Report, export.

- [ ] Metadata form generated against the zod schema (shadcn form components); writes `document.yaml`, preserving comments where feasible
- [ ] Status bar: body normalsider vs. cap (live), per-section count, TODO count with click-to-jump
- [ ] View Report: compile via engine + sidecars, show PDF in WebView2 built-in viewer pane; recompile on demand
- [ ] Export PDF button (same pipeline, writes `output/report.pdf`), with TODO warning and locked-file fallback
- [ ] Error surfacing: every engine error renders as a readable message with the affected file/line where known

## Milestone 4 — Helpers and packaging *(M)*

Goal: another student can install it and produce a report unaided.

- [ ] Insert Figure: file dialog → copy into `figures/` → insert Markdown image with alt-text prompt (alt text becomes the numbered caption)
- [ ] Insert Code Block and Insert Diagram (Mermaid stub) actions
- [ ] First-run polish: sensible window state, empty-state screens, app icon
- [ ] Windows installer (NSIS via Tauri bundler) with sidecar binaries included; install on a clean machine and verify the Definition of Done in [MVP.md](MVP.md)
- [ ] Tag `v0.1.0`, GitHub release with the installer attached

---

## Working practices

- **Engine logic gets tests; chrome mostly doesn't.** Vitest on counters, loader, converter output, error mapping. UI is verified by using it.
- **The real SEA report is the quality bar.** Every template/pipeline change is judged against it locally; the committed demo fixture keeps tests reproducible for everyone else.
- **Small commits, imperative messages** (`engine: add normalsider counter`). Commit at every green state.
- **CLAUDE.md at the repo root** pins the architecture rules for AI-assisted sessions (engine stays framework-free, no wrapper packages, React used thin). Update it when a convention changes.
- **Scope guard:** anything not in MVP.md goes to a `later.md` note or a GitHub issue, not into the code.

## Risks and mitigations

| Risk | Mitigation |
|---|---|
| Pandoc's Typst output fights the template (captions, code styling) | Converter is behind an interface; fallback is a remark-based emitter we control |
| Mermaid → SVG → Typst rendering quality | Proven in M1 with real diagrams from the SEA report before any UI exists |
| Tauri sidecar/permission friction | Isolated in `TauriPlatform`; Electron remains a documented fallback |
| Scope creep | MVP.md cut list is the contract; this plan has no optional tasks |
