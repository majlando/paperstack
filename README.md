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

## Planned v1 features

- Report projects as plain folders — Markdown, YAML, and images you can edit with any tool
- Structure-aware sidebar: front matter, sections, appendices
- Markdown editor (CodeMirror) with live per-section preview
- Metadata form — no raw YAML required
- Mermaid diagrams, rendered live in preview and embedded as SVG in the PDF
- Insert helpers for code blocks, figures, and diagrams
- Live length counter (normalsider vs. cap) and `[TODO]` tracker
- **View Report** — the assembled, real PDF, shown in-app
- One-click PDF export via a bundled [Typst](https://typst.app/) engine
- Human-readable errors (never `pandoc exited with code 43`)

## How it works

A Paperstack project is just a folder:

```
my-report/
├─ document.yaml      # title, authors, course, section order
├─ sections/          # 01-introduction.md, 02-background.md, ...
├─ appendices/
├─ figures/
├─ diagrams/          # Mermaid sources + rendered SVGs
└─ output/report.pdf
```

The app automates the workflow; it never owns your document. Everything stays portable, diffable, and Git-friendly.

## Tech

Tauri 2 · TypeScript · React + Vite · CodeMirror 6 · Mermaid · Pandoc → Typst (bundled, no system dependencies). Details and rationale in [docs/STACK.md](docs/STACK.md).

## Development

Prerequisites: [Node.js](https://nodejs.org/) 22+, [pnpm](https://pnpm.io/), and PowerShell 7 (`pwsh`).

```powershell
# Setup (once)
pnpm install                          # install workspace dependencies
pwsh ./scripts/fetch-binaries.ps1     # download pinned typst + pandoc into bin/ (git-ignored)

# Daily commands
pnpm test          # engine tests (the PDF integration test auto-skips if bin/ is empty)
pnpm typecheck     # strict TypeScript check across the workspace
pnpm build:demo    # build fixtures/demo-report to a PDF and print the length table

# Build any report project folder
pnpm tsx scripts/build-report.ts <path-to-project>

# Watch mode while working on the engine
pnpm --filter @paperstack/engine test:watch
```

Set `$env:DEBUG=1` before a build command to see the underlying Pandoc/Typst output when an error message isn't enough.

The desktop app (Milestone 2, `apps/desktop`) doesn't exist yet — once it does, `pnpm tauri dev` will run it, and the Rust toolchain becomes a prerequisite. See [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md) for the full plan and progress.

## Documentation

- [docs/PROJECT.md](docs/PROJECT.md) — vision, design decisions, architecture
- [docs/MVP.md](docs/MVP.md) — v1 scope, milestones, definition of done
- [docs/STACK.md](docs/STACK.md) — technology choices and why
- [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md) — the MVP development plan and task tracker

## License

[MIT](LICENSE)
