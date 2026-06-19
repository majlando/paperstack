# Paperstack — VS Code extension (spike)

A proof-of-concept that the Paperstack **engine is the product and the shell is
replaceable** (see `docs/DIRECTION.md`). The extension host runs Node, so this
reuses the engine's `NodePlatform` and its checks *verbatim* — the same length
counter and submission-readiness checks the desktop app runs, surfaced in VS
Code's **native** Problems panel and status bar instead of a bespoke UI.

This is deliberately thin: it exists to put the v-next direction in front of a
real CS-student user and see whether "check + length + export, inside the editor
I already use" beats the standalone app. It is **not** wired into CI yet.

## What it does

- **Status bar** — live body length vs the cap (e.g. `📖 11.1/40 ns`); turns
  amber when over. Click it to re-check.
- **Problems panel** — TODOs, missing images, unknown citations/references, and
  unsupported math as native diagnostics with `file:line`, refreshed on every
  save of a section / `document.yaml` / `references.bib`.
- **Command: Paperstack: Check Report** — run the checks on demand.
- **Command: Paperstack: Export PDF** — build the report via the engine.
  Needs a Typst binary; set `paperstack.typstPath` (defaults to `typst` on
  PATH). Errors surface as readable messages, never raw exit codes.

## Run it (Extension Development Host)

From the repo root:

```sh
pnpm install
pnpm --filter paperstack-vscode build
```

Then open the `apps/vscode` folder in VS Code and press **F5** — the launch
config builds the bundle and opens an Extension Development Host with
`fixtures/demo-report` as the workspace. The status bar shows the length
immediately; open the Problems panel to see the two demo TODOs, or run
**Paperstack: Check Report** from the command palette.

To try it on your own report, open any folder containing a `document.yaml`.

## Build

`pnpm build` bundles `src/extension.ts` (plus the engine and its deps) into
`dist/extension.js` with esbuild. `pnpm typecheck` runs `tsc --noEmit`.

## Status / next steps

Spike only. Obvious follow-ups if the direction is validated: a live **PDF
preview** webview (pdf.js — also the desktop viewer fix), bundling the
Typst/Pandoc sidecars so Export works with zero setup, and marketplace
packaging (which sidesteps the desktop app's code-signing pain).
