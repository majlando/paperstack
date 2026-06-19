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

Two paths, bold and conservative — validate before committing to either:

- **Bold — a VS Code extension.** Preview pane, length in the status bar, checks
  in VS Code's native Problems tab, an Export command — inside the editor they
  already use, with their own git/files/search. Deletes huge surface area
  (CodeMirror bridge, file panel, git panel, window chrome), reuses the engine
  via a thin `VsCodePlatform` (the extension host is Node, so `NodePlatform`
  largely already fits). Bonus: marketplace distribution **sidesteps the
  code-signing/Gatekeeper/SmartScreen pain** that unsigned desktop installers
  hit.
- **Conservative — narrow the desktop app to a dashboard over a folder.** Open a
  report folder → live PDF + length gauge + problems list + Export. Editing
  happens in your own editor; Paperstack watches and re-renders. Far less to
  build and learn.

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

## How to decide (don't pivot on theory)

Cheapest test first: ship the **narrow-dashboard framing** and watch whether real
users edit in their own tools and ignore the built-in editor/git panels. If they
do, the VS Code extension is justified. If they lean on the built-in editor, the
IDE ambition was right and this rethink is wrong — a cheap thing to learn before
a rewrite. Validate with ~3 target users (one each on Windows/macOS/Linux from a
real group) before choosing.

## First step taken

`scripts/check-report.ts` (`pnpm check <dir>`): the franchise — length + the
pre-submission checks — distilled to one headless, CI-friendly command with no
Typst binary required, reusing `countProject` + `collectProblems` so the
terminal and the app can't disagree. A small, additive proof that the engine is
the product and the shell is replaceable.
