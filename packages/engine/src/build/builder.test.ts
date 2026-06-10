import { describe, expect, it } from "vitest";
import { FakePlatform } from "../platform/fake-platform.ts";
import { buildReport } from "./builder.ts";
import { PaperstackError } from "../errors.ts";

describe("buildReport preflight", () => {
  it("reports missing typst/pandoc binaries in plain language", async () => {
    const platform = new FakePlatform(
      new Map([
        ["/proj/document.yaml", "title: T\nsections:\n  - { file: a.md, role: body }\n"],
        ["/proj/a.md", "# A\n"],
      ]),
    );
    const error = await buildReport(platform, "/proj", {
      typst: "/bin/typst.exe",
      pandoc: "/bin/pandoc.exe",
    }).catch((e) => e);

    expect(error).toBeInstanceOf(PaperstackError);
    expect(error.code).toBe("dependency-missing");
    expect(error.userMessage).toContain("PDF engine");
    expect(error.userMessage).not.toMatch(/exit|code \d+/i);
  });

  it("skips the startup probe when the caller already verified the binaries", async () => {
    const platform = new FakePlatform(
      new Map([
        ["/proj/document.yaml", "title: T\nsections:\n  - { file: a.md, role: body }\n"],
        ["/proj/a.md", "# A\n"],
      ]),
    );
    const error = await buildReport(platform, "/proj", {
      typst: "/bin/typst.exe",
      pandoc: "/bin/pandoc.exe",
      skipPreflight: true,
    }).catch((e) => e);

    // It gets past the dependency check and fails where FakePlatform
    // genuinely cannot go: actually running a binary.
    expect(error.code).not.toBe("dependency-missing");
    expect(String(error)).toContain("not supported in FakePlatform");
  });
});
