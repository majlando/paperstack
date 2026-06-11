# Paperstack — instructions for AI-assisted development

Paperstack is a Tauri 2 desktop app for writing structured technical reports in Markdown and exporting professional PDFs via bundled Typst. Read `docs/MVP.md` for scope, `docs/STACK.md` for the stack, `docs/DEVELOPMENT.md` for the plan.

## Commands

- `pnpm test` and `pnpm typecheck` — run both before every commit; CI runs these plus the desktop Vite build (`pnpm --filter @paperstack/desktop build`). The PDF integration test needs `bin/` (populate via `pnpm fetch-binaries`, cross-platform) and auto-skips without it; CI fetches the pinned Linux binaries so the full PDF pipeline runs on every push.
- `pnpm build:demo` — build `fixtures/demo-report` to PDF from the terminal; `pnpm tsx scripts/build-report.ts <dir>` for any project. `$env:DEBUG=1` reveals raw converter/Typst output. The in-house remark→Typst emitter is the default converter (`--converter=pandoc` is the fallback); `pnpm tsx scripts/converter-parity.ts <dir>` diffs both converters over a project.
- `pnpm --filter @paperstack/desktop tauri dev` — run the app (never plain Vite; the UI needs Tauri APIs). Requires sidecars in `src-tauri/binaries/` (same fetch script). Smoke-test hooks: `VITE_OPEN_PROJECT=<dir>`, `VITE_OPEN_SECTION=<file>`, `VITE_SMOKE_EXPORT=1`, `VITE_SMOKE_VIEW=1|2`, `VITE_SMOKE_METADATA=1` (auto-open / jump to section / export PDF / View Report / open Report details on launch; VIEW `2` recompiles while the PDF pane is open). Stale dev servers poison these hooks — their env is baked in at Vite startup, so kill anything on port 1420 before a smoke run.
- `pnpm smoke` — scripted end-to-end smoke test: scaffolds a scratch project, launches the app with `VITE_SMOKE_SCRIPT=1`, drives open → edit → save → TODO confirm → export through the store, and asserts the app-written `output/smoke-result.json`. Local only (sidecars + desktop session + free port 1420); run it after changes to the store, platform, or build pipeline.

## Architecture rules

Deliberate defaults, not dogma — deviate when something is clearly better, and update this file when you do.

- **`packages/engine` is pure TypeScript with zero framework imports** — no React, no Tauri APIs. All fs/process access goes through the injected `Platform` interface (`NodePlatform` in tests/CLI, `TauriPlatform` in the app).
- **React is used thin.** CodeMirror, Mermaid, and the PDF embed are vanilla TS classes wrapped once in small React mount components via refs. Do not add third-party React wrapper packages (`@uiw/react-codemirror` etc.).
- **Chrome uses React + Tailwind + shadcn/ui.** shadcn components are vendored as source when added (none vendored yet — deferred until the first dialog need); once in the repo, edit them directly when needed.
- **One rendering path for the full report:** "View Report" compiles and shows the real PDF. Never build an assembled-HTML report view.
- User-facing wording uses report concepts (View Report, Export PDF, Insert Figure) — never build-system concepts (compile, pandoc, pipeline). Errors must be human-readable; never surface raw exit codes.
- **Report projects are shared over Git by groups.** Write project files deterministically (stable YAML key order, trailing newline, no churn on no-op saves); never write app-private state into the project folder; tolerate external edits (e.g. `git pull`) without data loss.

## Conventions

- TypeScript strict mode everywhere; pnpm workspaces; Vitest for engine tests.
- State: Zustand. Markdown parsing: unified/remark. Schema validation: zod (the `document.yaml` zod schema drives both validation and the metadata form).
- Engine logic requires unit tests; UI chrome does not. The Zustand store's save path is logic, not chrome — every real data-loss bug found in review lived there. The store has its own vitest suite (`apps/desktop/src/store.test.ts`, with a `GatedPlatform` that holds individual reads/writes open to force exact interleavings): changes to the save path must come with a regression test there, and the test must be shown to fail without the fix.
- Small commits, imperative messages, scoped prefix: `engine:`, `app:`, `docs:`.
- `report/` is the author's real exam report — git-ignored, local quality reference only. Never commit it or quote its contents into the repo. Committed tests use `fixtures/demo-report/`.
- `bin/` holds dev downloads of `typst`/`pandoc` (git-ignored); they ship as Tauri sidecars in releases.

## Domain terms

- **Normalside** — Danish academic page unit: 2400 characters, HTML comments stripped. Body sections only count toward the cap (default 40).
- **Sections** — the report's top-level divisions (academic-report terminology; not "chapters"). Use "section" in code, docs, and UI wording.
- **Section roles** — `front-matter | body | back-matter | appendix`; only `body` counts toward the cap.
- **SEA report** — the target report format for v1 (Danish academy CS exam report).
- **Citations** — a `references.bib` at the project root activates them (convention, no document.yaml field): `[@key]` → Typst `#cite`, bibliography generated before the appendices. No references.bib → `[@key]` stays prose.
