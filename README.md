# Paperstack

**Professional reports from Markdown sections.**

Paperstack is an open-source desktop app for writing structured technical reports in Markdown and exporting them as clean, professional PDFs — without Word, and without the complexity of LaTeX.

> **Status: early development.** Paperstack is being designed and built in the open. There is no usable release yet. See [docs/MVP.md](docs/MVP.md) for what v1 will contain.

## Why

CS students write code-heavy reports: project reports, assignment write-ups, exam reports with architecture diagrams, code listings, screenshots, and testing sections.

The existing tools all have a catch:

- **Word / Google Docs** — familiar, but painful for code blocks, diagrams, and consistent structure.
- **LaTeX / Overleaf** — professional output, steep learning curve.
- **Pandoc + scripts** — powerful, but you end up maintaining a build system instead of writing.

Paperstack packages the Markdown-to-PDF workflow into a focused app. You write the report's sections in Markdown, fill in report metadata in a form, insert figures and diagrams with a click, watch a live length counter, and export a polished PDF. Everything needed ships inside the installer — no LaTeX, no terminal, no PATH setup.

The first target is the **SEA exam report** (Danish academy CS project report), done extremely well — including a live *normalsider* counter against the page cap. If it works for that, it generalizes.

## Features (v1 scope, built — plus what landed alongside it)

- Report projects as plain folders — Markdown, YAML, and images you can edit with any tool
- Structure-aware sidebar: front matter, sections, appendices
- Markdown editor (CodeMirror) with live per-section preview
- Metadata form — no raw YAML required
- Mermaid diagrams, rendered live in preview and embedded as SVG in the PDF
- Insert helpers for code blocks, figures (incl. paste-a-screenshot), diagrams, and tables
- Math: inline `$x$` and display `$$…$$` — KaTeX in the preview, real Typst math in the PDF
- Citations: drop a `references.bib` in the project and `[@key]` becomes an APA (author, year) reference with a generated bibliography
- Project-wide search and replace
- Live length counter (normalsider vs. cap) and `[TODO]` tracker
- **View Report** — the assembled, real PDF, shown in-app
- One-click PDF export via a bundled [Typst](https://typst.app/) engine
- Human-readable errors (never `pandoc exited with code 43`)
- Group-ready by design: deterministic file writes, conflict guards for `git pull`, changed-on-disk indicators

## How it works

A Paperstack project is just a folder:

```
my-report/
├─ document.yaml      # title, authors, course, section order
├─ references.bib     # optional — its presence activates [@key] citations
├─ sections/          # 01-introduction.md, 02-background.md, ...
├─ appendices/
├─ figures/
├─ diagrams/          # rendered SVGs of the report's ```mermaid blocks (content-hashed)
└─ output/report.pdf
```

The app automates the workflow; it never owns your document. Everything stays portable, diffable, and Git-friendly.

## Tech

Tauri 2 · TypeScript · React + Vite · CodeMirror 6 · Mermaid · own Markdown→Typst emitter · Typst (bundled, no system dependencies). Details and rationale in [docs/STACK.md](docs/STACK.md).

## Development

Prerequisites:

- [Node.js](https://nodejs.org/) 22+ and [pnpm](https://pnpm.io/) (the repo pins the exact version via the `packageManager` field — `corepack enable` is enough)
- Only for the desktop app: the [Rust toolchain](https://rustup.rs/) (Tauri 2). Engine work needs no Rust.

### Setup (once)

```powershell
pnpm install                          # install workspace dependencies
pnpm fetch-binaries                   # download pinned typst + pandoc
```

The fetch script places the binaries twice, both locations git-ignored: `bin/` (used by tests and the terminal build) and `apps/desktop/src-tauri/binaries/` (the Tauri sidecars the app runs). These same pinned versions ship inside the installer in releases.

### Test and typecheck

```powershell
pnpm test          # all engine tests (the PDF integration test auto-skips if bin/ is empty)
pnpm typecheck     # strict TypeScript check across the workspace

pnpm --filter @paperstack/engine test:watch   # watch mode while working on the engine
```

Run both before committing — CI (`.github/workflows/ci.yml`) runs these plus `pnpm --filter @paperstack/desktop build` and a Rust job (`cargo test` over the app's sidecar validators) on every push. CI fetches the pinned Linux binaries (cached between runs), so the full Markdown → PDF integration test runs on every push too.

`pnpm smoke` drives the real app end to end (scaffold a scratch project → open → edit → save → export, asserted from the app's own result file). Local only — it needs the sidecars, port 1420, and a desktop session.

### Build reports from the terminal (engine only, no app)

```powershell
pnpm build:demo                                  # fixtures/demo-report → output/report.pdf + length table
pnpm tsx scripts/build-report.ts <project-dir>   # build any report project folder
```

Set `$env:DEBUG=1` before a build command to see the raw converter/Typst output when an error message isn't enough. Conversion uses Paperstack's own remark→Typst emitter; `--converter=pandoc` selects the bundled fallback, and `pnpm tsx scripts/converter-parity.ts <project-dir>` diffs the two over a project.

### Run the desktop app

```powershell
pnpm --filter @paperstack/desktop tauri dev
```

The first run compiles the Rust shell and takes a few minutes; afterwards the web side hot-reloads. Two things to know:

- The sidecar binaries must be in place first (the fetch script above) — the app runs typst/pandoc as bundled sidecars.
- Always launch through `tauri dev`. Running the Vite dev server alone (`pnpm --filter @paperstack/desktop dev`) serves the UI without Tauri's APIs, so opening a project fails immediately.

Dev hooks for scripted smoke tests (the folder dialog and buttons can't be driven from scripts):

```powershell
$env:VITE_OPEN_PROJECT = "E:/path/to/report-project"    # auto-open a project at launch
$env:VITE_OPEN_SECTION = "sections/01-introduction.md"  # then jump to a section
$env:VITE_SMOKE_EXPORT = "1"                            # then run Export PDF immediately
$env:VITE_SMOKE_VIEW = "1"                              # then run View Report ("2": recompile once more while the PDF pane is open)
$env:VITE_SMOKE_METADATA = "1"                          # then open the Report details form
pnpm --filter @paperstack/desktop tauri dev
```

### Build the installer

```powershell
pnpm --filter @paperstack/desktop tauri build   # release build + NSIS installer, sidecars bundled
```

The installer builds and runs (verified on the dev machine); the `v0.1.0` release waits on the clean-machine walkthrough in [docs/CLEAN-MACHINE-TEST.md](docs/CLEAN-MACHINE-TEST.md).

See [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md) for the full plan and progress.

## Documentation

- [docs/PROJECT.md](docs/PROJECT.md) — vision, design decisions, architecture
- [docs/MVP.md](docs/MVP.md) — v1 scope, milestones, definition of done
- [docs/STACK.md](docs/STACK.md) — technology choices and why
- [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md) — the MVP development plan and task tracker

## License

[MIT](LICENSE)
