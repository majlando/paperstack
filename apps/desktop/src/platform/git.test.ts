import { describe, expect, it, vi } from "vitest";

// git.ts imports the Tauri core at module load; the parser under test never
// calls it, so a stub keeps the module importable in plain Node.
vi.mock("@tauri-apps/api/core", () => ({ invoke: async () => ({}) }));

const { parseGitStatus } = await import("./git.ts");

describe("parseGitStatus", () => {
  it("reads branch, upstream, ahead/behind, and counts changed entries", () => {
    const out = [
      "# branch.oid 1a2b3c",
      "# branch.head main",
      "# branch.upstream origin/main",
      "# branch.ab +2 -1",
      "1 .M N... 100644 100644 100644 aaa bbb sections/intro.md",
      "? scratch.txt",
    ].join("\n");
    expect(parseGitStatus(out)).toEqual({
      branch: "main",
      upstream: "origin/main",
      ahead: 2,
      behind: 1,
      changed: 2,
    });
  });

  it("treats a detached HEAD as no branch and a missing upstream as null", () => {
    const out = "# branch.oid 1a2b3c\n# branch.head (detached)\n";
    expect(parseGitStatus(out)).toMatchObject({ branch: null, upstream: null, ahead: 0, behind: 0 });
  });

  it("reports a clean, up-to-date tree as zero changes", () => {
    const out = "# branch.head main\n# branch.upstream origin/main\n# branch.ab +0 -0\n";
    expect(parseGitStatus(out)).toEqual({
      branch: "main",
      upstream: "origin/main",
      ahead: 0,
      behind: 0,
      changed: 0,
    });
  });

  it("does not count the '# branch.*' headers as changed files", () => {
    expect(parseGitStatus("# branch.head main\n").changed).toBe(0);
  });
});
