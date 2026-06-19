# Paperstack — direction (v-next)

A living note on where the product should head after v0.2.0. Not a contract;
the milestones in DEVELOPMENT.md describe what was built, this describes what to
build *toward* and — just as important — what to stop investing in. Written for
the actual user: a CS student (usually in a group) writing the SEA exam report,
sharing it over Git, under a hard length cap and a deadline.

## The job-to-be-done

Not "edit Markdown." It's **"get a correct, in-spec, professional PDF submitted
without fighting a toolchain."** Every feature is worth exactly what it
contributes to that.

## The franchise (what is actually the product)

These are why someone picks Paperstack over Word/Docs/LaTeX. Protect and deepen
them; everything else is replaceable.

1. **View Report = the real PDF, instantly.** Answers "what will my hand-in look
   like?" with the true artifact, not an HTML approximation.
2. **Live length-vs-cap tracking** (normalsider: 2400 chars, comments stripped,
   body-only). Existential for a Danish academic report; Word can't do it.
3. **Pre-submission correctness checks** (TODOs, missing images, unknown
   citations/references, unsupported math). Kills the "did I forget something?"
   fear. Now also runnable headless — see `scripts/check-report.ts`.
4. **Git-safe, deterministic file writes.** Load-bearing for group-over-Git;
   invisible until it corrupts a `git pull`.

The keystone that makes all of this cheap to re-shape: **the engine is pure TS
behind an injected `Platform`** (`NodePlatform` / `TauriPlatform`). The shell is
a detail; the engine is the asset.

## The core rethink: stop competing with the editor

For a CS audience that already lives in VS Code + a terminal + git, investing in
*being* an editor / git client / file manager is the misallocation — each
competes with a tool they already prefer and loses. The defensible value above
does **not** require owning the editor.

## Decided (2026-06-19): the VS Code extension is the product

After confirming the user base — CS-student report groups where **VS Code is
universal**, all comfortable with git/YAML, and the near-term goal is real groups
using it soon with the least friction — Paperstack converges on **a single form:
the VS Code extension** (`apps/vscode`). The standalone Tauri desktop app is to
be **retired**.

Why this wins on every axis we care about:

- **Reach** — everyone already runs VS Code, so an extension reaches all users
  with nothing new to install-and-trust.
- **Friction** — marketplace / `.vsix` distribution is one-click with
  auto-update and **no code-signing**, which directly removes the unsigned-
  installer Gatekeeper/SmartScreen pain the desktop app hits.
- **Less is more** — one shell, not two; the pure-TS engine is already proven
  portable (the spike bundles it in 791 KB); the entire Tauri/Rust/CodeMirror/
  window-chrome surface eventually goes away.
- **Native UI** — length in the status bar, checks in VS Code's own Problems
  tab, the user's own files/search/git — instead of bespoke chrome we maintain.

The discarded alternative (narrow the desktop app to a dashboard) loses only
because the desktop shell buys nothing once the editor is VS Code: it still needs
signing, still ships a second app, still maintains a window.

## Simplify / remove / keep

| Thing | Action | Why |
|---|---|---|
| In-app Git panel | **Remove** (keep git-*safe* writes) | Users do git themselves; UI is maintenance + worse UX. |
| `document.yaml` sections manifest | **Consider replacing with filename convention** | An ordered list is a group **merge-conflict hotspot**; order by `01-`/`02-` prefixes, infer role by folder/frontmatter. |
| Metadata form | **Consider: edit `document.yaml` directly** | This audience is fine with YAML; validate via the existing zod schema + Problems. Deletes a UI surface. |
| Bundled editor | **Demote / drop** | Commodity for this audience; don't chase IDE features. |
| Template customization / multi-template | **Don't invest** | "It just looks right" *is* the value; choice dilutes it. |
| Extra diagram engines, DOCX, CLI-as-product | **Don't build** | Mermaid covers CS needs; rest are audience-narrow or invisible plumbing. |
| PDF viewer (WebView2 built-in) | **Swap to pdf.js** | Fixes scroll-reset-on-recompile *and* unblocks Linux (WebKitGTK has no built-in PDF viewer). Same task, double payoff. |

## Phased plan toward the extension as the product

Retire the desktop app *after* the extension covers the franchise, so users are
never left without a working tool.

1. **Engine portability — done.** `scripts/check-report.ts` (`pnpm check`) and
   the `apps/vscode` spike both drive the franchise (length + pre-submission
   checks) with no desktop app, proving the engine is the product.
2. **Git panel removed — done.** First reduction banked (see git log); the
   engine's git-*safe* writes stay.
3. **Extension to franchise-parity — done.** Live **PDF preview** (pdf.js webview
   pane with Rebuild) and **zero-setup Typst** (the extension downloads + caches
   the pinned, checksum-verified Typst on first build — `apps/vscode/src/typst.ts`)
   both landed, alongside length, checks, and export. The extension now covers the
   franchise.
4. **Retire the desktop app.** Delete `apps/desktop` (Tauri/React/CodeMirror),
   the `src-tauri` Rust crate, the desktop release workflow, and the desktop
   smoke test. Keep `packages/engine` and `apps/vscode`. This is the big
   `less is more` payoff and a deliberate, separately-reviewed deletion.
5. **Distribute.** Package the `.vsix` / publish to the marketplace (a publisher
   account is the user's call).

The `apps/desktop` Tauri app is now **frozen** — no new feature work; it stays
shippable (v0.2.0) only until step 4.
