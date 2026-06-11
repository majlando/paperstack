import { describe, expect, it } from "vitest";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { NodePlatform } from "./node-platform.ts";

const fixtureDir = join(
  fileURLToPath(new URL(".", import.meta.url)),
  "../../../../fixtures/demo-report",
);

describe("NodePlatform against the demo fixture", () => {
  const platform = new NodePlatform();

  it("reads document.yaml", async () => {
    const content = await platform.readTextFile(join(fixtureDir, "document.yaml"));
    expect(content).toContain("title:");
  });

  it("lists section files", async () => {
    const files = await platform.listDir(join(fixtureDir, "sections"));
    expect(files).toContain("01-introduction.md");
  });

  it("reports missing files as missing", async () => {
    const exists = await platform.fileExists(join(fixtureDir, "nope.md"));
    expect(exists).toBe(false);
  });
});

describe("NodePlatform.writeTextFile", () => {
  const platform = new NodePlatform();

  it("writes atomically: replaces existing content, leaves no temp file", async () => {
    const dir = await mkdtemp(join(tmpdir(), "paperstack-write-"));
    try {
      const target = join(dir, "section.md");
      await platform.writeTextFile(target, "first");
      await platform.writeTextFile(target, "second"); // overwrite path
      expect(await platform.readTextFile(target)).toBe("second");
      expect(await readdir(dir)).toEqual(["section.md"]); // temp gone
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
