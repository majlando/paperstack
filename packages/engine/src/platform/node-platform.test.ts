import { describe, expect, it } from "vitest";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
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
