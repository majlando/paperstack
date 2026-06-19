# Paperstack — VS Code extension

**This is the direction Paperstack is converging on** — the single form of the
product, replacing the standalone desktop app (see `docs/DIRECTION.md`). The
extension host runs Node, so it reuses the engine's `NodePlatform` and its checks
*verbatim* — the same length counter and submission-readiness checks the desktop
app runs, surfaced in VS Code's **native** Problems panel and status bar instead
of a bespoke UI.

Still maturing toward franchise-parity with the desktop app (the gaps are a live
PDF preview and zero-setup Typst — see *Status* below); length, checks, and
export already work. Not wired into CI yet.

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

## Status / roadmap to replacing the desktop app

Working today: status-bar length, the Problems-panel checks, and Export. To reach
parity and become the sole product (see `docs/DIRECTION.md`):

1. **Live PDF preview** — a pdf.js webview (the same pdf.js the desktop viewer
   wanted), the one franchise feature still missing here.
2. **Zero-setup Typst** — auto-provision the pinned sidecar (as `pnpm
   fetch-binaries` does) so Export needs nothing on PATH.
3. **Retire `apps/desktop`** — once 1–2 land.
4. **Package the `.vsix` / publish** — marketplace distribution (sidesteps the
   desktop app's code-signing pain). Publisher account is the user's call.
