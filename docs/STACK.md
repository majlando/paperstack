# Paperstack — technology stack

Decided stack and the reasoning behind it. Optimized for a solo developer building with heavy AI assistance, shipping a polished Windows-first desktop app.

## Summary

| Layer | Choice | Notes / fallback |
|---|---|---|
| Desktop shell | Tauri 2 | WebView2 on Windows; small installers. Fallback: Electron |
| Language | TypeScript | Everywhere. Rust stays at config + official Tauri plugins (fs, dialog, shell) |
| Build | Vite | Tauri default, instant HMR |
| UI framework | React, **used thin** (see below) | Runner-up: Svelte 5 |
| Components/styling | Tailwind + shadcn/ui | shadcn components are vendored source in-repo — owned code, not a dependency |
| Editor | CodeMirror 6 | Vanilla TS class, hand-written React bridge (no wrapper packages) |
| Markdown parsing (preview) | unified/remark | AST is reusable for a future Typst emitter |
| Diagrams | Mermaid | Rendered live in preview; pre-rendered to SVG on save for export |
| Markdown→Typst | Bundled Pandoc sidecar (`-t typst`) | Behind a converter interface; replaceable by a remark-based emitter later |
| PDF compile | Bundled Typst sidecar | Fast enough that "View Report" = real PDF |
| PDF view | WebView2 built-in viewer | Upgrade path: pdf.js if scroll reset on recompile gets annoying |
| State | Zustand | |
| Testing | Vitest | Focused on the engine, where the real logic lives |

## "React, used thin"

The framework owns much less of the codebase than usual:

- **Report engine: pure vanilla TS package, zero framework imports.** Project loading, section roles, normalsider/TODO counting, validation, the Pandoc→Typst pipeline, error mapping. This is most of the real logic.
- **Imperative components (CodeMirror, Mermaid, PDF embed): vanilla TS classes**, each wrapped once in a small React mount component via a ref. No third-party wrapper packages — a ~30-line hand-written bridge gives full control of the instance.
- **Chrome (sidebar, metadata form, dialogs, layout): idiomatic React + Tailwind + shadcn/ui.** This is where the framework and the component shelf genuinely pay rent.

Hand-rolling policy: hand-roll where it buys control or understanding (the engine, the wrappers, anything report-domain-specific like the length counter); take the shelf where the problem is solved plumbing (dialog focus traps, dropdown keyboard nav). shadcn makes this a per-component choice — its components are copied as plain TSX into the repo and owned from there.

## Why these choices

- **Tauri 2 over Electron** — same web frontend, ~10× smaller installer, first-class sidecar support for bundling `typst.exe`/`pandoc.exe`. Electron remains the documented fallback if Tauri's Rust/config boundary becomes friction (the engine and components are framework-free, so switching costs little).
- **Typst over LaTeX/Pandoc-PDF** — single ~15 MB binary, sub-second compiles (which is what makes "View Report = the real PDF" viable), native ToC/numbering/code highlighting, modern errors. Bundling MiKTeX is not realistic; escaping it is the point of this project.
- **Mermaid over PlantUML** — renders client-side in the webview (no Java, no Graphviz), biggest ecosystem. Pre-rendering to SVG on save keeps PDF export deterministic with no headless browser. PlantUML can slot in later as a second pre-rendered format.
- **Pandoc for Markdown→Typst** — proven, handles every Markdown edge case, gets Milestone 1 done fast. Hidden behind a `convert()` interface so a remark-based emitter can replace it if finer control over the generated Typst is ever needed.
- **React over Svelte 5** — a near-tie on merits. Svelte 5 is the nicer language and the author knows it; React won on AI-assist corpus depth and ecosystem popularity (the stated tiebreaker). Because the engine and the imperative components are framework-free, the React chrome is small and could be ported later cheaply.
- **CodeMirror 6 over Monaco** — lighter, better at prose-with-code, designed for embedding; the same choice Obsidian made.
- **unified/remark over markdown-it** — produces a real AST, so the preview parser and a future Typst emitter share one understanding of the Markdown.
