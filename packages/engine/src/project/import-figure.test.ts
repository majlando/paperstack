import { describe, expect, it } from "vitest";
import { FakePlatform } from "../platform/fake-platform.ts";
import {
  figureMarkdown,
  importFigure,
  importFigureBytes,
  suggestedCaption,
} from "./import-figure.ts";

const PROJECT = "/proj";

function platformWith(files: Record<string, string>): FakePlatform {
  return new FakePlatform(new Map(Object.entries(files)));
}

describe("importFigure", () => {
  it("slugifies the filename so the Markdown link needs no escaping", async () => {
    // the source is copied under its original OS path — only the name is normalized
    const platform = platformWith({ "C:\\pics\\Screen Shot 2026.PNG": "img" });
    const dest = await importFigure(platform, PROJECT, "C:\\pics\\Screen Shot 2026.PNG");
    expect(dest).toBe("figures/screen-shot-2026.png");
    expect(platform.files.get(`${PROJECT}/figures/screen-shot-2026.png`)).toBe("img");
  });

  it("follows the project's own images folder instead of forcing figures/", async () => {
    const platform = platformWith({
      "/pics/chart.png": "img",
      [`${PROJECT}/resources/logo.png`]: "existing",
    });
    expect(await importFigure(platform, PROJECT, "/pics/chart.png")).toBe(
      "resources/chart.png",
    );
  });

  it("prefers figures/ when several conventional folders exist", async () => {
    const platform = platformWith({
      "/pics/chart.png": "img",
      [`${PROJECT}/figures/old.png`]: "a",
      [`${PROJECT}/resources/logo.png`]: "b",
    });
    expect(await importFigure(platform, PROJECT, "/pics/chart.png")).toBe(
      "figures/chart.png",
    );
  });

  it("suffixes instead of overwriting an existing asset", async () => {
    const platform = platformWith({
      "/pics/chart.png": "new",
      [`${PROJECT}/figures/chart.png`]: "committed",
    });
    expect(await importFigure(platform, PROJECT, "/pics/chart.png")).toBe(
      "figures/chart-2.png",
    );
    expect(platform.files.get(`${PROJECT}/figures/chart.png`)).toBe("committed");
  });

  it("never produces an empty filename", async () => {
    const platform = platformWith({ "/pics/ø.png": "img" });
    expect(await importFigure(platform, PROJECT, "/pics/ø.png")).toBe(
      "figures/oe.png",
    );
  });
});

describe("importFigureBytes (pasted images)", () => {
  it("writes the bytes under the same naming and collision rules", async () => {
    const platform = platformWith({ [`${PROJECT}/figures/image.png`]: "committed" });
    const dest = await importFigureBytes(platform, PROJECT, "image.png", new Uint8Array(3));
    expect(dest).toBe("figures/image-2.png");
    expect(platform.files.has(`${PROJECT}/figures/image-2.png`)).toBe(true);
    expect(platform.files.get(`${PROJECT}/figures/image.png`)).toBe("committed");
  });

  it("sniffs the image type from the bytes when the name has no extension", async () => {
    const platform = platformWith({});
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    expect(await importFigureBytes(platform, PROJECT, "pasted", png)).toBe(
      "figures/pasted.png",
    );
    const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0]);
    expect(await importFigureBytes(platform, PROJECT, "shot", jpeg)).toBe(
      "figures/shot.jpg",
    );
    const svg = new TextEncoder().encode(`<svg xmlns="http://www.w3.org/2000/svg"/>`);
    expect(await importFigureBytes(platform, PROJECT, "diagram", svg)).toBe(
      "figures/diagram.svg",
    );
  });

  it("refuses unrecognizable extensionless bytes instead of mislabeling them .png", async () => {
    // Typst decodes by extension — a mislabeled file breaks the export with
    // no hint back at the paste that caused it.
    const platform = platformWith({});
    await expect(
      importFigureBytes(platform, PROJECT, "pasted", new Uint8Array([1, 2, 3])),
    ).rejects.toThrow(/PNG, JPEG, GIF, or SVG/);
  });
});

describe("importFigure with an extensionless source file", () => {
  it("asks for an extension instead of guessing .png", async () => {
    const platform = platformWith({ "/pics/photo": "img" });
    await expect(importFigure(platform, PROJECT, "/pics/photo")).rejects.toThrow(
      /no file extension/,
    );
  });
});

describe("suggestedCaption", () => {
  it("humanizes the filename stem", () => {
    expect(suggestedCaption("C:\\pics\\screen-shot_2026.png")).toBe("Screen shot 2026");
  });
});

describe("figureMarkdown", () => {
  it("emits a standalone root-absolute image", () => {
    expect(figureMarkdown("figures/chart.png", "System overview")).toBe(
      "![System overview](/figures/chart.png)",
    );
  });

  it("escapes brackets that would end the alt text early", () => {
    expect(figureMarkdown("figures/chart.png", "Flow [draft]")).toBe(
      "![Flow \\[draft\\]](/figures/chart.png)",
    );
  });

  it("emits an optional width attribute, quoting it only when it has spaces", () => {
    expect(figureMarkdown("figures/chart.png", "Overview", "60%")).toBe(
      "![Overview](/figures/chart.png){width=60%}",
    );
    expect(figureMarkdown("figures/chart.png", "Overview", "  ")).toBe(
      "![Overview](/figures/chart.png)",
    );
  });

  it("emits width and align together, omitting the default center alignment", () => {
    expect(figureMarkdown("figures/chart.png", "Overview", "60%", "left")).toBe(
      "![Overview](/figures/chart.png){width=60% align=left}",
    );
    expect(figureMarkdown("figures/chart.png", "Overview", undefined, "center")).toBe(
      "![Overview](/figures/chart.png)",
    );
  });

  it("prefixes a cross-reference label with fig: when needed", () => {
    expect(figureMarkdown("figures/c.png", "Cap", undefined, "center", "arch")).toBe(
      "![Cap](/figures/c.png){#fig:arch}",
    );
    expect(figureMarkdown("figures/c.png", "Cap", "50%", "center", "fig:sys")).toBe(
      "![Cap](/figures/c.png){#fig:sys width=50%}",
    );
  });
});
