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

  it("defaults to .png when the clipboard offers no extension", async () => {
    const platform = platformWith({});
    expect(await importFigureBytes(platform, PROJECT, "pasted", new Uint8Array(1))).toBe(
      "figures/pasted.png",
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
});
