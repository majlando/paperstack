/**
 * Store tests — the save path above all. Every real data-loss bug found in
 * both review rounds lived here, so each one is pinned as a regression test,
 * driven against a GatedPlatform that can hold individual reads/writes open
 * to force the exact interleavings the reviews found.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { GatedPlatform } from "./test/gated-platform.ts";

// Swappable so a test can make the scope grant fail (folder gone / not a project).
const mocks = vi.hoisted(() => ({
  allowExisting: async (dir: string) => dir,
}));

vi.mock("./platform/tauri-platform.ts", async () => {
  const { GatedPlatform } = await import("./test/gated-platform.ts");
  return {
    platform: new GatedPlatform(),
    SIDECARS: { typst: "binaries/typst" },
    allowExistingProjectScope: (dir: string) => mocks.allowExisting(dir),
    allowNewProjectScope: async (dir: string) => dir,
  };
});
vi.mock("./preview/mermaid.ts", () => ({
  renderMermaidSvg: async () => "<svg/>",
}));

import { hashDiagram } from "@paperstack/engine";
import { platform } from "./platform/tauri-platform.ts";
import { getRecentProjects, useStore } from "./store.ts";

// The store touches document.title on project load; tests run in plain Node.
(globalThis as { document?: { title: string } }).document ??= { title: "" };

// Recents live in localStorage; tests run in plain Node, so stand one in.
const localStore = new Map<string, string>();
(globalThis as { localStorage?: unknown }).localStorage ??= {
  getItem: (k: string) => localStore.get(k) ?? null,
  setItem: (k: string, v: string) => void localStore.set(k, v),
};

const fake = platform as unknown as GatedPlatform;

const DOC_YAML = `# group-shared structure file
title: "Test Report"
sections:
  - { file: sections/a.md, role: body }
  - { file: sections/b.md, role: body }
  - { file: sections/c.md, role: body }
`;

const A = "/p/sections/a.md";

function projectFiles(): Record<string, string> {
  return {
    "/p/document.yaml": DOC_YAML,
    [A]: "# A\n\nalpha\n",
    "/p/sections/b.md": "# B\n\nbeta\n",
    "/p/sections/c.md": "# C\n\ngamma\n",
  };
}

async function openProject(): Promise<void> {
  await useStore.getState().openProject("/p");
  expect(useStore.getState().error).toBeNull();
}

function writesTo(path: string): number {
  return fake.writes.filter((w) => w === path).length;
}

beforeEach(() => {
  fake.reset(projectFiles());
  useStore.setState(useStore.getInitialState(), true);
  mocks.allowExisting = async (dir: string) => dir;
  localStore.clear();
});

describe("opening", () => {
  it("loads the project and opens the first body section", async () => {
    await openProject();
    const s = useStore.getState();
    expect(s.projectDir).toBe("/p");
    expect(s.project?.meta.title).toBe("Test Report");
    expect(s.activeFile).toBe("sections/a.md");
    expect(s.content).toBe("# A\n\nalpha\n");
    expect(s.baseline).toBe(s.content);
    expect(s.dirty).toBe(false);
  });

  it("drops a recents entry whose folder can no longer open; keeps fixable ones", async () => {
    await openProject();
    expect(getRecentProjects()).toContain("/p");

    // A fixable load failure (e.g. a bad merge in document.yaml) keeps the entry.
    useStore.setState(useStore.getInitialState(), true);
    fake.files.set("/p/document.yaml", "<<<<<<< HEAD\ntitle: x\n");
    await useStore.getState().openProject("/p");
    expect(useStore.getState().error).not.toBeNull();
    expect(getRecentProjects()).toContain("/p");

    // The folder being gone (scope grant rejects) drops it.
    mocks.allowExisting = async () => {
      throw new Error("No document.yaml was found in the selected folder.");
    };
    await useStore.getState().openProject("/p");
    expect(useStore.getState().error).not.toBeNull();
    expect(getRecentProjects()).not.toContain("/p");
  });
});

describe("closing the project (switch report)", () => {
  it("flushes pending edits to disk before leaving", async () => {
    await openProject();
    useStore.getState().setContent("# A\n\nedited before switch\n");
    await useStore.getState().closeProject();
    const s = useStore.getState();
    expect(s.project).toBeNull();
    expect(s.projectDir).toBeNull();
    expect(fake.files.get(A)).toBe("# A\n\nedited before switch\n");
  });

  it("a conflict-blocked save keeps the project open with the edits intact", async () => {
    await openProject();
    useStore.getState().setContent("# A\n\nmine\n");
    fake.files.set(A, "# A\n\ntheirs\n"); // a git pull lands while editing

    await useStore.getState().closeProject();
    const s = useStore.getState();
    expect(s.project).not.toBeNull(); // still on the project, banner showing
    expect(s.conflict).not.toBeNull();
    expect(s.content).toBe("# A\n\nmine\n"); // nothing discarded
    expect(fake.files.get(A)).toBe("# A\n\ntheirs\n"); // pull never overwritten
  });

  it("unsaved report details block leaving until saved or cancelled", async () => {
    await openProject();
    await useStore.getState().openMetadata();
    useStore.getState().setMetadataDirty(true);

    await useStore.getState().closeProject();
    expect(useStore.getState().project).not.toBeNull();
    expect(useStore.getState().error?.message).toMatch(/save or cancel the form/);

    useStore.getState().closeMetadata();
    await useStore.getState().closeProject();
    expect(useStore.getState().project).toBeNull();
  });
});

describe("metadata form", () => {
  it("blocks a form save when document.yaml changed on disk while it was open", async () => {
    await openProject();
    await useStore.getState().openMetadata();
    expect(useStore.getState().metadataOpen).toBe(true);

    // a git pull lands while the form is open
    const pulled = DOC_YAML.replace("Test Report", "Pulled Title");
    fake.files.set("/p/document.yaml", pulled);

    const ok = await useStore.getState().saveMetadata({ title: "Stale Form Title" });
    expect(ok).toBe(false);
    expect(useStore.getState().error?.message).toMatch(/changed on disk/);
    expect(useStore.getState().metadataOpen).toBe(true); // form stays open
    expect(fake.files.get("/p/document.yaml")).toBe(pulled); // pull never overwritten
  });

  it("a second ⚙ click while the form is open never disarms its guards", async () => {
    await openProject();
    await useStore.getState().openMetadata();
    useStore.getState().setMetadataDirty(true);

    // a git pull lands while the form is open …
    const pulled = DOC_YAML.replace("Test Report", "Pulled Title");
    fake.files.set("/p/document.yaml", pulled);

    // … then the user clicks ⚙ again. Nothing visible changes, so it must
    // not reset metadataDirty (close guard) or rebase onto the pulled file
    // (conflict guard).
    await useStore.getState().openMetadata();
    expect(useStore.getState().metadataDirty).toBe(true);

    const ok = await useStore.getState().saveMetadata({ title: "Stale Form Title" });
    expect(ok).toBe(false);
    expect(fake.files.get("/p/document.yaml")).toBe(pulled); // pull never overwritten
  });

  it("opening a section closes a clean form — the click must never be invisible", async () => {
    await openProject();
    await useStore.getState().openMetadata();

    await useStore.getState().openSection("sections/b.md");
    const s = useStore.getState();
    expect(s.metadataOpen).toBe(false);
    expect(s.activeFile).toBe("sections/b.md");
  });

  it("a dirty form blocks section switching instead of switching underneath it", async () => {
    await openProject();
    await useStore.getState().openMetadata();
    useStore.getState().setMetadataDirty(true);

    await useStore.getState().openSection("sections/b.md");
    const s = useStore.getState();
    expect(s.metadataOpen).toBe(true);
    expect(s.activeFile).toBe("sections/a.md"); // not switched
    expect(s.error?.message).toMatch(/save or cancel the form/);
  });

  it("saves normally when nothing changed underneath the form", async () => {
    await openProject();
    await useStore.getState().openMetadata();
    const ok = await useStore.getState().saveMetadata({ title: "New Title" });
    expect(ok).toBe(true);
    expect(fake.files.get("/p/document.yaml")).toContain("New Title");
    expect(useStore.getState().metadataOpen).toBe(false);
  });

  it("adding a section while a dirty form is open is blocked, not half-created", async () => {
    await openProject();
    const before = useStore.getState().project?.meta.sections.length;
    await useStore.getState().openMetadata();
    useStore.getState().setMetadataDirty(true);

    await useStore.getState().addSection("body", "New One");
    const s = useStore.getState();
    expect(s.metadataOpen).toBe(true); // form still up
    expect(s.error?.message).toMatch(/save or cancel the form/);
    expect(s.project?.meta.sections.length).toBe(before); // nothing added to the report
  });

  it("a build is blocked while the form is dirty, so it can't compile stale details", async () => {
    await openProject();
    await useStore.getState().openMetadata();
    useStore.getState().setMetadataDirty(true);

    await useStore.getState().viewReport();
    const s = useStore.getState();
    expect(s.metadataOpen).toBe(true);
    expect(s.report).toBeNull(); // never compiled
    expect(s.error?.message).toMatch(/save or cancel the form/);
  });
});

describe("section navigation (Ctrl+PageUp/PageDown)", () => {
  it("steps to the next and previous section, and stops at the ends", async () => {
    await openProject(); // opens sections/a.md
    await useStore.getState().gotoAdjacentSection("next");
    expect(useStore.getState().activeFile).toBe("sections/b.md");
    await useStore.getState().gotoAdjacentSection("prev");
    expect(useStore.getState().activeFile).toBe("sections/a.md");
    await useStore.getState().gotoAdjacentSection("prev"); // already first
    expect(useStore.getState().activeFile).toBe("sections/a.md");
  });

  it("with no active section, prev opens the last and next opens the first", async () => {
    await openProject();
    useStore.setState({ activeFile: null });
    await useStore.getState().gotoAdjacentSection("prev");
    expect(useStore.getState().activeFile).toBe("sections/c.md");
    useStore.setState({ activeFile: null });
    await useStore.getState().gotoAdjacentSection("next");
    expect(useStore.getState().activeFile).toBe("sections/a.md");
  });

  it("walks the role-grouped order the sidebar shows, not the raw document.yaml order", async () => {
    fake.reset({
      "/p/document.yaml":
        'title: "T"\nsections:\n  - { file: app.md, role: appendix }\n  - { file: intro.md, role: body }\n',
      "/p/app.md": "# App\n",
      "/p/intro.md": "# Intro\n",
    });
    await useStore.getState().openProject("/p");
    expect(useStore.getState().activeFile).toBe("intro.md"); // first body section
    // body comes before appendix on screen, even though app.md is listed first.
    await useStore.getState().gotoAdjacentSection("next");
    expect(useStore.getState().activeFile).toBe("app.md");
    await useStore.getState().gotoAdjacentSection("next"); // appendix is last
    expect(useStore.getState().activeFile).toBe("app.md");
  });
});

describe("template update offer", () => {
  // The outdated-stock classification itself is engine-tested
  // (template.test.ts); these cover the store's offer lifecycle.
  it("updates the layout template in place and clears the offer", async () => {
    await openProject();
    useStore.setState({ templateOffer: true });
    await useStore.getState().updateTemplate();
    const s = useStore.getState();
    expect(s.templateOffer).toBe(false);
    expect(s.notice?.message).toMatch(/layout was updated/);
    expect(fake.files.get("/p/paperstack-template.typ")).toContain("Paperstack SEA report template");
  });

  it("a declined offer stays declined across reloads this session", async () => {
    await openProject();
    useStore.setState({ templateOffer: true });
    useStore.getState().dismissTemplateOffer();
    expect(useStore.getState().templateOffer).toBe(false);
    await useStore.getState().reloadProject();
    expect(useStore.getState().templateOffer).toBe(false);
  });

  it("never offers for a customized template", async () => {
    fake.reset(projectFiles());
    fake.files.set("/p/paperstack-template.typ", "// my own template\n#let report(..a) = {}\n");
    await openProject();
    expect(useStore.getState().templateOffer).toBe(false);
  });
});

describe("replace all", () => {
  it("replaces in the active section via the editor path and saves it", async () => {
    await openProject(); // sections/a.md is active: "# A\n\nalpha\n"
    const before = useStore.getState().contentVersion;
    const r = await useStore.getState().replaceAll("ALPHA", "omega");
    expect(r).toEqual({ sections: 1, count: 1 });
    expect(useStore.getState().content).toBe("# A\n\nomega\n");
    expect(useStore.getState().contentVersion).toBeGreaterThan(before); // editor follows
    expect(useStore.getState().dirty).toBe(false); // saved
    expect(fake.files.get(A)).toBe("# A\n\nomega\n");
  });

  it("does not count the active section while its save is conflict-blocked", async () => {
    await openProject();
    fake.files.set(A, "# A\n\ntheirs\n"); // external edit while a.md is open

    const r = await useStore.getState().replaceAll("alpha", "omega");
    // the replacement sits in the editor pending the conflict banner — the
    // summary must not claim it reached the file
    expect(r).toEqual({ sections: 0, count: 0 });
    expect(useStore.getState().conflict).not.toBeNull();
    expect(fake.files.get(A)).toBe("# A\n\ntheirs\n"); // disk untouched
    expect(useStore.getState().content).toBe("# A\n\nomega\n"); // editor has it
  });

  it("replaces directly on disk in sections that are not open, without dots", async () => {
    await openProject();
    const r = await useStore.getState().replaceAll("gamma", "delta");
    expect(r).toEqual({ sections: 1, count: 1 });
    expect(fake.files.get("/p/sections/c.md")).toBe("# C\n\ndelta\n");
    // the hash moved because we wrote the file — never a changed-on-disk dot
    expect(useStore.getState().changedOnDisk).toEqual([]);
    expect(useStore.getState().error).toBeNull();
  });
});

describe("the save path", () => {
  it("writes edits, marks clean, and suppresses no-op saves", async () => {
    await openProject();
    useStore.getState().setContent("# A\n\nedited\n");
    expect(useStore.getState().dirty).toBe(true);

    expect(await useStore.getState().saveActive()).toBe(true);
    expect(fake.files.get(A)).toBe("# A\n\nedited\n");
    expect(useStore.getState().dirty).toBe(false);

    const before = writesTo(A);
    expect(await useStore.getState().saveActive()).toBe(true);
    expect(writesTo(A)).toBe(before); // nothing dirty — nothing written
  });

  it("a keystroke landing mid-save is not lost: the save chains", async () => {
    await openProject();
    useStore.getState().setContent("first edit");
    const gate = fake.gateNextWrite((p) => p === A);

    const save = useStore.getState().saveActive();
    await gate.reached; // the write for "first edit" is now mid-flight
    useStore.getState().setContent("second edit"); // keystroke during the save
    gate.release();

    expect(await save).toBe(true);
    expect(fake.files.get(A)).toBe("second edit"); // chained save wrote the newer text
    expect(useStore.getState().dirty).toBe(false);
    expect(useStore.getState().baseline).toBe("second edit");
  });

  it("concurrent save triggers join one flight — a single write", async () => {
    await openProject();
    useStore.getState().setContent("edit");
    const gate = fake.gateNextWrite((p) => p === A);

    const first = useStore.getState().saveActive();
    await gate.reached;
    const second = useStore.getState().saveActive(); // blur/Ctrl+S firing alongside
    gate.release();

    expect(await first).toBe(true);
    expect(await second).toBe(true);
    expect(writesTo(A)).toBe(1);
  });

  it("a failed write keeps the section dirty with the text intact", async () => {
    await openProject();
    fake.failWrites = (p) => p === A;
    useStore.getState().setContent("precious edits");

    expect(await useStore.getState().saveActive()).toBe(false);
    const s = useStore.getState();
    expect(s.dirty).toBe(true);
    expect(s.content).toBe("precious edits");
    expect(s.error).not.toBeNull();

    fake.failWrites = null; // problem fixed — the same edits now save
    expect(await useStore.getState().saveActive()).toBe(true);
    expect(fake.files.get(A)).toBe("precious edits");
  });

  it("settle never touches state after a mid-save section switch", async () => {
    await openProject();
    useStore.getState().setContent("a's edit");
    const gate = fake.gateNextWrite((p) => p === A);

    const save = useStore.getState().saveActive();
    await gate.reached;
    // The store now describes another section (whatever path got it there) —
    // section a's save must not plant its state onto section b.
    useStore.setState({
      activeFile: "sections/b.md",
      content: "# B\n\nbeta\n",
      baseline: "# B\n\nbeta\n",
      dirty: false,
    });
    gate.release();
    await save;

    const s = useStore.getState();
    expect(s.activeFile).toBe("sections/b.md");
    expect(s.content).toBe("# B\n\nbeta\n");
    expect(s.baseline).toBe("# B\n\nbeta\n");
    expect(s.dirty).toBe(false);
    expect(fake.files.get(A)).toBe("a's edit"); // the write itself still landed
  });

  it("switching sections mid-save joins the flight and lands cleanly", async () => {
    await openProject();
    useStore.getState().setContent("a's edit");
    const gate = fake.gateNextWrite((p) => p === A);

    const save = useStore.getState().saveActive();
    await gate.reached;
    const open = useStore.getState().openSection("sections/b.md");
    gate.release();
    await save;
    await open;

    const s = useStore.getState();
    expect(s.activeFile).toBe("sections/b.md");
    expect(s.content).toBe("# B\n\nbeta\n");
    expect(s.dirty).toBe(false);
    expect(fake.files.get(A)).toBe("a's edit");
  });

  it("skips the write when the disk already matches the editor", async () => {
    await openProject();
    useStore.getState().setContent("converged");
    fake.files.set(A, "converged"); // e.g. a git pull brought the same text
    const before = writesTo(A);

    expect(await useStore.getState().saveActive()).toBe(true);
    expect(writesTo(A)).toBe(before);
    expect(useStore.getState().dirty).toBe(false);
    expect(useStore.getState().baseline).toBe("converged");
  });
});

describe("the conflict guard", () => {
  it("an external edit blocks the save instead of being overwritten", async () => {
    await openProject();
    useStore.getState().setContent("mine");
    fake.files.set(A, "theirs"); // changed on disk (git pull) while dirty here

    expect(await useStore.getState().saveActive()).toBe(false);
    expect(useStore.getState().conflict).toEqual({
      file: "sections/a.md",
      diskContent: "theirs",
    });
    expect(fake.files.get(A)).toBe("theirs"); // not clobbered
  });

  it("keep-mine force-writes; use-disk adopts the disk text", async () => {
    await openProject();
    useStore.getState().setContent("mine");
    fake.files.set(A, "theirs");
    await useStore.getState().saveActive();

    await useStore.getState().resolveConflictKeepMine();
    expect(fake.files.get(A)).toBe("mine");
    expect(useStore.getState().conflict).toBeNull();
    expect(useStore.getState().dirty).toBe(false);

    // — and the other arm, from a fresh conflict
    useStore.getState().setContent("mine again");
    fake.files.set(A, "theirs again");
    await useStore.getState().saveActive();
    useStore.getState().resolveConflictUseDisk();
    const s = useStore.getState();
    expect(s.content).toBe("theirs again");
    expect(s.baseline).toBe("theirs again");
    expect(s.dirty).toBe(false);
    expect(fake.files.get(A)).toBe("theirs again"); // adopting never writes
  });
});

describe("navigation during trouble", () => {
  it("rapid section clicks settle on the last click, not the slowest read", async () => {
    await openProject();
    const gate = fake.gateNextRead((p) => p === "/p/sections/b.md");

    const openB = useStore.getState().openSection("sections/b.md");
    await gate.reached; // b's read is mid-flight …
    await useStore.getState().openSection("sections/c.md"); // … c completes first
    gate.release();
    await openB;

    const s = useStore.getState();
    expect(s.activeFile).toBe("sections/c.md"); // the user's last click wins
    expect(s.content).toBe("# C\n\ngamma\n");
  });

  it("typing with no section open is ignored, not stranded as unsaved", async () => {
    await openProject();
    await useStore.getState().removeSection("sections/a.md"); // active section gone
    expect(useStore.getState().activeFile).toBeNull();

    useStore.getState().setContent("ghost text with nowhere to go");
    expect(useStore.getState().dirty).toBe(false);
    expect(await useStore.getState().saveActive()).toBe(true);
  });

  it("openSection stays put when the flush save fails", async () => {
    await openProject();
    fake.failWrites = (p) => p === A;
    useStore.getState().setContent("unsaved");

    await useStore.getState().openSection("sections/b.md");
    const s = useStore.getState();
    expect(s.activeFile).toBe("sections/a.md"); // did not navigate
    expect(s.content).toBe("unsaved");
    expect(s.error).not.toBeNull();
  });

  it("a reload (focus regain) never dismisses an unresolved save error", async () => {
    await openProject();
    fake.failWrites = (p) => p === A;
    useStore.getState().setContent("precious");
    expect(await useStore.getState().saveActive()).toBe(false);
    expect(useStore.getState().error).not.toBeNull();
    fake.failWrites = null;

    // Alt-tab away and back triggers reloadProject; the banner explaining
    // the failed save must survive while the edits are still unsaved.
    await useStore.getState().reloadProject();
    const s = useStore.getState();
    expect(s.error).not.toBeNull();
    expect(s.dirty).toBe(true);
    expect(s.content).toBe("precious");
  });

  it("reload never clobbers keystrokes typed while the reload runs", async () => {
    await openProject();
    const gate = fake.gateNextRead((p) => p === "/p/document.yaml");

    const reload = useStore.getState().reloadProject();
    await gate.reached;
    useStore.getState().setContent("typed mid-reload");
    gate.release();
    await reload;

    expect(useStore.getState().content).toBe("typed mid-reload");
    expect(useStore.getState().dirty).toBe(true); // still awaiting its save
  });
});

describe("structure edits", () => {
  it("removing the active section flushes its edits and clears the editor", async () => {
    await openProject();
    useStore.getState().setContent("last words");

    await useStore.getState().removeSection("sections/a.md");
    const s = useStore.getState();
    expect(fake.files.get(A)).toBe("last words"); // file kept, edits flushed
    expect(s.activeFile).toBeNull();
    expect(s.project?.meta.sections.map((x) => x.file)).toEqual([
      "sections/b.md",
      "sections/c.md",
    ]);
    expect(fake.files.get("/p/document.yaml")).toContain("# group-shared structure file");
  });

  it("overlapping structure edits are serialized — neither is dropped", async () => {
    await openProject();
    const gate = fake.gateNextRead((p) => p === "/p/document.yaml");

    // Two rapid "Move up" clicks on section c: serialized they compose
    // ([a,b,c] → [a,c,b] → [c,a,b]); racing, both would read [a,b,c] and the
    // second write would silently drop the first move.
    const first = useStore.getState().moveSection("sections/c.md", "up");
    await gate.reached;
    const second = useStore.getState().moveSection("sections/c.md", "up");
    gate.release();
    await first;
    await second;

    expect(useStore.getState().project?.meta.sections.map((x) => x.file)).toEqual([
      "sections/c.md",
      "sections/a.md",
      "sections/b.md",
    ]);
  });

  it("a no-op move writes nothing", async () => {
    await openProject();
    const before = writesTo("/p/document.yaml");
    await useStore.getState().moveSection("sections/a.md", "up"); // already first
    expect(writesTo("/p/document.yaml")).toBe(before);
  });

  it("a rename overlapping another structure edit loses neither (yaml chain)", async () => {
    await openProject();
    // The rename input commits on blur, and the click that causes the blur
    // can fire "Move up" in the same instant. Hold the rename's yaml write
    // open while the move runs — serialized they compose; racing, one edit
    // silently vanishes (or yaml desyncs from the on-disk rename).
    const gate = fake.gateNextWrite((p) => p === "/p/document.yaml");

    const rename = useStore.getState().renameSection("sections/c.md", "03-results");
    await gate.reached;
    const move = useStore.getState().moveSection("sections/b.md", "up");
    // Let the move run as far as the serialization allows while the rename's
    // write is still open: chained, it parks; racing, it completes against
    // the pre-rename yaml and the rename's write then clobbers it.
    for (let i = 0; i < 3; i++) await new Promise((r) => setTimeout(r, 0));
    gate.release();
    await rename;
    await move;

    expect(useStore.getState().error).toBeNull();
    expect(useStore.getState().project?.meta.sections.map((x) => x.file)).toEqual([
      "sections/b.md",
      "sections/a.md",
      "sections/03-results.md",
    ]);
    expect(fake.files.has("/p/sections/03-results.md")).toBe(true);
    expect(fake.files.has("/p/sections/c.md")).toBe(false);
  });
});

describe("group workflow", () => {
  it("marks externally edited sections changed-on-disk; opening clears the dot", async () => {
    await openProject();
    fake.files.set("/p/sections/b.md", "# B\n\nchanged externally\n");

    await useStore.getState().reloadProject();
    expect(useStore.getState().changedOnDisk).toEqual(["sections/b.md"]);

    await useStore.getState().openSection("sections/b.md");
    expect(useStore.getState().changedOnDisk).toEqual([]);
  });

  it("no dot for the active section when the reload already shows the new text", async () => {
    await openProject();
    fake.files.set(A, "# A\n\npulled\n");

    await useStore.getState().reloadProject();
    expect(useStore.getState().content).toBe("# A\n\npulled\n");
    expect(useStore.getState().changedOnDisk).toEqual([]);
  });

  it("the app's own saves never produce a changed-on-disk dot", async () => {
    await openProject();
    useStore.getState().setContent("# A\n\nmine\n");
    await useStore.getState().saveActive();

    await useStore.getState().reloadProject();
    expect(useStore.getState().changedOnDisk).toEqual([]);
  });

  it("export renders missing diagrams from never-opened sections first", async () => {
    await openProject();
    // A group member added a diagram to section b in another editor.
    fake.files.set("/p/sections/b.md", "```mermaid\nA --> B\n```\n");

    await useStore.getState().exportPdf(true);
    // The build itself fails here (FakePlatform runs no binaries), but the
    // missing render must already be self-healed by then.
    const svg = fake.files.get(`/p/diagrams/rendered/${hashDiagram("A --> B")}.svg`);
    expect(svg).toBe("<svg/>");
    expect(useStore.getState().error).not.toBeNull();
  });

  it("re-renders a stale foreignObject render in place (same hash, pre-fix file)", async () => {
    await openProject();
    fake.files.set("/p/sections/b.md", "```mermaid\nA --> B\n```\n");
    // Rendered before htmlLabels was forced off: labels live in
    // <foreignObject>, which the PDF's SVG renderer skips. The hash covers
    // the diagram source, not the file, so only the content betrays it.
    const path = `/p/diagrams/rendered/${hashDiagram("A --> B")}.svg`;
    fake.files.set(path, '<svg><foreignObject><div>Input</div></foreignObject></svg>');

    await useStore.getState().exportPdf(true);
    expect(fake.files.get(path)).toBe("<svg/>");
  });

  it("leaves a usable render untouched — no churn on re-saves", async () => {
    await openProject();
    fake.files.set("/p/sections/b.md", "```mermaid\nA --> B\n```\n");
    const path = `/p/diagrams/rendered/${hashDiagram("A --> B")}.svg`;
    fake.files.set(path, "<svg><text>Input</text></svg>");

    await useStore.getState().exportPdf(true);
    expect(fake.files.get(path)).toBe("<svg><text>Input</text></svg>");
    expect(writesTo(path)).toBe(0);
  });
});

describe("project search", () => {
  it("searches every section, using the unsaved editor text for the active one", async () => {
    await openProject();
    useStore.getState().setContent("# A\n\nneedle in the editor\n"); // unsaved edit

    const hits = await useStore.getState().searchProject("needle");
    expect(hits).toHaveLength(1);
    expect(hits[0]).toMatchObject({ file: "sections/a.md", line: 3 });

    // a's disk text says "alpha", but the editor no longer does — the search
    // must reflect what the writer sees
    expect(await useStore.getState().searchProject("alpha")).toEqual([]);
    // other sections come from disk
    expect(await useStore.getState().searchProject("beta")).toHaveLength(1);
  });
});

describe("figures", () => {
  it("imports pasted image bytes through the pending-figure flow", async () => {
    await openProject();
    useStore.getState().requestFigure({
      kind: "bytes",
      bytes: new Uint8Array(5),
      name: "image.png",
    });
    expect(useStore.getState().pendingFigure?.suggestedCaption).toBe("Image");

    const rel = await useStore.getState().confirmFigure();
    expect(rel).toBe("figures/image.png");
    expect(fake.files.has("/p/figures/image.png")).toBe(true);
    expect(useStore.getState().pendingFigure).toBeNull();
  });
});

describe("metadata", () => {
  it("saves through the comment-preserving editor and reloads", async () => {
    await openProject();
    expect(await useStore.getState().saveMetadata({ title: "Renamed Report" })).toBe(true);

    const yaml = fake.files.get("/p/document.yaml")!;
    expect(yaml).toContain('title: "Renamed Report"'); // quoting style survives
    expect(yaml).toContain("# group-shared structure file"); // comments survive
    expect(useStore.getState().project?.meta.title).toBe("Renamed Report");
    expect(useStore.getState().metadataOpen).toBe(false);
  });

  it("an invalid edit surfaces readably and saves nothing", async () => {
    await openProject();
    const before = writesTo("/p/document.yaml");
    expect(await useStore.getState().saveMetadata({ title: "   " })).toBe(false);
    expect(writesTo("/p/document.yaml")).toBe(before);
    expect(useStore.getState().error?.message).toContain("title");
    expect(useStore.getState().error?.message).not.toMatch(/exit|code \d+/i);
  });
});
