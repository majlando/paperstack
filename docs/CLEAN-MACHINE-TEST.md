# Clean-machine test — v0.1.0 release gate

The walkthrough for [MVP.md's definition of done](MVP.md#definition-of-done-for-v1), run
on a Windows machine **without** Node, Rust, or pandoc installed (a fresh VM or
Windows Sandbox works). This is also the production CSP's first real exercise —
M3's hardening was only ever verified under the dev config.

Each step states what to do and what *must* be true. Any deviation is a release
blocker unless noted.

## Setup

- [ ] Machine has no Node, Rust, pandoc, or typst on PATH (`where node` etc. find nothing)
- [ ] Copy `Paperstack_0.1.0_x64-setup.exe` onto the machine; note SmartScreen behavior
      (an "unknown publisher" warning is expected for an unsigned build — record the
      exact flow a student would see)
- [ ] Install with default options; Paperstack appears in the Start menu with the app icon

## Walkthrough

1. **Create** — launch Paperstack → Welcome screen → create a new report in an empty
   folder. The window title shows the report title; sidebar shows the starter sections.
2. **Metadata** — open Report details (⚙), fill title/course/institution/date, add two
   authors with student IDs, save. The form closes; the window title updates.
3. **Edit + preview** — add a body section; type Markdown including a heading, list, and
   a fenced code block. The preview follows within ~a second; the section autosaves
   (reopen the file in Notepad to confirm content on disk).
4. **Insert helpers** — Insert Code Block (cursor lands on the language slot), Insert
   Diagram (Mermaid renders in the preview), Insert Figure with an image whose filename
   contains spaces (file is copied into `figures/` slugified; the preview shows the
   image; the caption appears under it in the exported PDF as "Figure 1: …").
5. **Counters** — the status bar shows normalsider against the cap; clicking the TODO
   counter jumps to a `[TODO` marker.
6. **View + export** — View Report compiles and shows the PDF in-pane (cover, ToC, navy
   headings, numbered figure caption). Export PDF writes `output/report.pdf`; the green
   notice names the path; with a `[TODO]` left in, the export first asks
   "Export it anyway?".
7. **Reopen** — close Paperstack, relaunch, open the project from Recent. Window
   size/position are remembered; the report opens to a body section and builds again.

## After the walkthrough

- [ ] No step needed a terminal, a tool install, or knowledge of pandoc/typst
- [ ] No raw exit codes or tool output appeared outside the "Technical details" disclosure
- [ ] Uninstall removes the app cleanly; the report project folder is untouched

When everything passes: check the box in [DEVELOPMENT.md](DEVELOPMENT.md), tag `v0.1.0`,
and attach the installer to the GitHub release.
