# Paperstack — instructions for AI-assisted development

Paperstack is a Tauri 2 desktop app for writing structured technical reports in Markdown and exporting professional PDFs via bundled Typst. Read `docs/MVP.md` for scope, `docs/STACK.md` for the stack, `docs/DEVELOPMENT.md` for the plan.

## Architecture rules (do not violate)

- **`packages/engine` is pure TypeScript with zero framework imports** — no React, no Tauri APIs. All fs/process access goes through the injected `Platform` interface (`NodePlatform` in tests/CLI, `TauriPlatform` in the app).
- **React is used thin.** CodeMirror, Mermaid, and the PDF embed are vanilla TS classes wrapped once in small React mount components via refs. Do not add third-party React wrapper packages (`@uiw/react-codemirror` etc.).
- **Chrome uses React + Tailwind + shadcn/ui.** shadcn components are vendored source in the repo — edit them directly when needed.
- **One rendering path for the full report:** "View Report" compiles and shows the real PDF. Never build an assembled-HTML report view.
- User-facing wording uses report concepts (View Report, Export PDF, Insert Figure) — never build-system concepts (compile, pandoc, pipeline). Errors must be human-readable; never surface raw exit codes.
- **Report projects are shared over Git by groups.** Write project files deterministically (stable YAML key order, trailing newline, no churn on no-op saves); never write app-private state into the project folder; tolerate external edits (e.g. `git pull`) without data loss.

## Conventions

- TypeScript strict mode everywhere; pnpm workspaces; Vitest for engine tests.
- State: Zustand. Markdown parsing: unified/remark. Schema validation: zod (the `document.yaml` zod schema drives both validation and the metadata form).
- Engine logic requires unit tests; UI chrome does not.
- Small commits, imperative messages, scoped prefix: `engine:`, `app:`, `docs:`.
- `report/` is the author's real exam report — git-ignored, local quality reference only. Never commit it or quote its contents into the repo. Committed tests use `fixtures/demo-report/`.
- `bin/` holds dev downloads of `typst`/`pandoc` (git-ignored); they ship as Tauri sidecars in releases.

## Domain terms

- **Normalside** — Danish academic page unit: 2400 characters, HTML comments stripped. Body chapters only count toward the cap (default 40).
- **Section roles** — `front-matter | body | back-matter | appendix`; only `body` counts toward the cap.
- **SEA report** — the target report format for v1 (Danish academy CS exam report).
