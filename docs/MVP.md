# Paperstack MVP (v1)

This is the main focus. Nothing outside this document blocks a v1 release.

**The bar:** a SEA student can install Paperstack and produce a polished exam-report PDF without a terminal, without installing anything else, and without help.

## Features

1. **Create / open a project** — one SEA template; all changes saved to plain files on disk. New projects include a ready-made `.gitignore` (build output; rendered diagrams are deliberately committed so every group member can build) and a `.gitattributes` (consistent line endings across the group's machines), and reopening/reloading a project picks up changes made outside the app (e.g. after a `git pull`).
2. **Structure sidebar** — sections grouped by role (front matter / sections / appendices), with add, rename, delete, and move up/down. Section order lives in the `sections` list in `document.yaml` (the single source of truth — filename number prefixes are just a human-friendly convention), so reordering is a simple list edit. Drag-and-drop later.
3. **Markdown editor** — CodeMirror 6: syntax highlighting, fenced code blocks, autosave.
4. **Per-section live preview** — headings, lists, tables, code with highlighting, images, Mermaid.
5. **Metadata form** — edits `document.yaml`; no raw YAML required.
6. **Insert helpers** — Insert Code Block, Insert Figure (copies the image into `figures/` and inserts the Markdown), Insert Diagram (Mermaid stub). No bold/italic/table toolbar buttons in v1 — Markdown handles those.
7. **Length counter** — normalsider per section + body total vs. cap, always visible. **TODO counter** — `[TODO]` placeholders per section, warning before export.
8. **View Report** — compile and show the real PDF in-app.
9. **Export PDF** — to `output/report.pdf`.
10. **Human-readable errors** for the known failure cases:
    - missing image file
    - invalid Mermaid diagram
    - invalid metadata
    - output PDF locked because it is open in a viewer (the most common Windows failure — offer a timestamped filename instead)
    - export failure with a readable message, never `pandoc exited with code 43`

## Explicitly cut from v1 (deferred, not abandoned)

- Math/equations
- Table editing helpers
- Citations / BibTeX (a hand-written references section is the v1 answer)
- Multiple templates, template customization
- Drag-and-drop reordering
- Full-report HTML view (the PDF pane *is* the full-report view)
- DOCX export, CLI, Git integration, collaboration, comments
- Cloud anything

## Milestones

### 1. Engine spike (no UI)

`project folder → report.pdf` via the SEA Typst template, run from a test script. Includes:

- project loading, `document.yaml` parsing, section roles
- Markdown→Typst conversion (bundled Pandoc, behind a converter interface)
- the SEA `.typ` template: cover page, ToC, numbered headings, code styling, figure captions, appendix handling
- normalsider + TODO counting
- fixtures: a small committed demo report for tests, plus a real SEA report kept local (git-ignored) as the quality bar

This de-risks everything. If the PDF looks right here, the rest is UI work.

### 2. App shell

Tauri app: create/open project, sidebar, CodeMirror editor with autosave, per-section preview with Mermaid.

### 3. Report workflow

Metadata form, length/TODO counters in the UI, View Report (PDF pane), Export PDF, readable errors.

### 4. Helpers and packaging

Insert figure/code/diagram. Windows installer with bundled `typst`/`pandoc` binaries. Acceptance test: a fellow student installs it and produces a PDF with no help and no terminal.

## Definition of done for v1

A student can, without a terminal and without installing anything else:

1. Install Paperstack and create a new SEA report project
2. Fill in metadata via the form
3. Add and edit sections; see the live preview
4. Insert a code block, a figure, and a Mermaid diagram
5. See the normalsider count against the cap
6. View the assembled PDF in-app and export it
7. Reopen the project later and continue
