import { describe, expect, it } from "vitest";
import { FakePlatform } from "./test-utils.ts";
import { buildReport } from "./builder.ts";
import { PaperstackError } from "./errors.ts";

describe("buildReport preflight", () => {
  it("reports missing typst/pandoc binaries in plain language", async () => {
    const platform = new FakePlatform(
      new Map([
        ["/proj/document.yaml", "title: T\nsections:\n  - { file: a.md, role: body }\n"],
        ["/proj/a.md", "# A\n"],
      ]),
    );
    const error = await buildReport(platform, "/proj", {
      typstPath: "/bin/typst.exe",
      pandocPath: "/bin/pandoc.exe",
    }).catch((e) => e);

    expect(error).toBeInstanceOf(PaperstackError);
    expect(error.code).toBe("dependency-missing");
    expect(error.userMessage).toContain("PDF engine");
    expect(error.userMessage).not.toMatch(/exit|code \d+/i);
  });
});
