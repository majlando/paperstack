# Paperstack — VS Code extension

**This is the direction Paperstack is converging on** — the single form of the
product, replacing the standalone desktop app (see `docs/DIRECTION.md`). The
extension host runs Node, so it reuses the engine's `NodePlatform` and its checks
*verbatim* — the same length counter and submission-readiness checks the desktop
app runs, surfaced in VS Code's **native** Problems panel and status bar instead
of a bespoke UI.

At franchise-parity with the desktop app: live PDF preview, length, checks, and
export all work, and Typst is **zero-setup** — downloaded and cached
automatically on the first build. It is also a complete authoring loop on its
own — start a report, add sections, and insert figures/diagrams/tables/citations
from the Command Palette. Not wired into CI yet.

## What it does

- **Command: Paperstack: New Report** — scaffold a new report project in a folder
  you pick (English or Danish), then open it. Works on an empty window.
- **Command: Paperstack: Preview Report** — builds the report and shows the real
  PDF in a pane beside the editor (pdf.js), with a Rebuild button. The
  extension's "View Report". With the pane open, saving a section / `document.yaml`
  / `references.bib` rebuilds it automatically (debounced).
- **Status bar** — live body length vs the cap (e.g. `📖 11.1/40 ns`); turns
  amber when over. Click it to re-check.
- **Problems panel** — TODOs, missing images, unknown citations/references, and
  unsupported math as native diagnostics with `file:line`, refreshed on every
  save of a section / `document.yaml` / `references.bib`.
- **Command: Paperstack: Check Report** — run the checks on demand.
- **Command: Paperstack: Export PDF** — build the report via the engine and
  save the PDF. Errors surface as readable messages, never raw exit codes.
- **Authoring commands** — *New Section* (writes the file and registers it in
  `document.yaml`), *Insert Figure* (copies the image in, collision-safe, and
  writes the figure Markdown), *Insert Diagram* (Mermaid starter blocks),
  *Insert Table*, and *Insert Citation* (author-date from `references.bib`).
  Each insert lands at the cursor in the active section.
- **Zero-setup Typst** — the first preview/export downloads and caches the
  pinned, checksum-verified Typst automatically; `paperstack.typstPath`
  overrides it with your own binary.

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
**Paperstack: Preview Report** / **Paperstack: Check Report** from the command
palette. (The first build downloads Typst automatically — no setup; set
`paperstack.typstPath` to use your own instead.)

To try it on your own report, open any folder containing a `document.yaml`.

## Build

`pnpm build` bundles `src/extension.ts` (plus the engine and its deps) into
`dist/extension.js` with esbuild. `pnpm typecheck` runs `tsc --noEmit`.

## Status / roadmap to replacing the desktop app

The extension now covers the franchise (length, checks, preview, export, and
zero-setup Typst) *and* a standalone authoring loop. Remaining to become the sole
product (see `docs/DIRECTION.md`):

1. ✅ **Live PDF preview** — pdf.js webview pane with Rebuild (`media/preview.js`),
   plus auto-rebuild on save while the pane is open.
2. ✅ **Zero-setup Typst** — downloads + caches the pinned, checksum-verified
   Typst on first build (`src/typst.ts`); `paperstack.typstPath` overrides.
3. ✅ **Authoring loop** — New Report, New Section, and the Insert commands
   (`src/authoring.ts`), so a report can be started and written with the
   extension alone.
4. **Retire `apps/desktop`** — **next.**
5. **Package the `.vsix` / publish** — marketplace distribution (sidesteps the
   desktop app's code-signing pain). Publisher account is the user's call.
