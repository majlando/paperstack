import { describe, expect, it } from "vitest";
import { hashContent } from "../project/counters.ts";
import { SEA_TEMPLATE, templateStatus } from "./template.ts";

describe("templateStatus", () => {
  it("recognizes the current stock template, CRLF or not", () => {
    expect(templateStatus(SEA_TEMPLATE)).toBe("current");
    expect(templateStatus(SEA_TEMPLATE.replaceAll("\n", "\r\n"))).toBe("current");
  });

  it("classifies an unmodified older stock template as outdated", () => {
    const oldStock = "// some previous Paperstack template\n";
    expect(templateStatus(oldStock, new Set([hashContent(oldStock)]))).toBe("outdated");
  });

  it("never classifies a user-edited template as anything but customized", () => {
    const customized = `${SEA_TEMPLATE}\n// my tweak\n`;
    expect(templateStatus(customized)).toBe("customized");
    expect(templateStatus("")).toBe("customized");
  });

  it("pins the current template hash — changing SEA_TEMPLATE has a checklist", () => {
    // This failing means SEA_TEMPLATE changed: (1) make sure the OLD hash is
    // in STOCK_TEMPLATE_HASHES (so existing unmodified projects get the
    // update offer), then (2) update this pin to the new hash.
    expect(hashContent(SEA_TEMPLATE)).toBe("13684a0e");
  });
});
