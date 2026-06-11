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
    SIDECARS: { typst: "binaries/typst", pandoc: "binaries/pandoc" },
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

  it("saves normally when nothing changed underneath the form", async () => {
    await openProject();
    await useStore.getState().openMetadata();
    const ok = await useStore.getState().saveMetadata({ title: "New Title" });
    expect(ok).toBe(true);
    expect(fake.files.get("/p/document.yaml")).toContain("New Title");
    expect(useStore.getState().metadataOpen).toBe(false);
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
