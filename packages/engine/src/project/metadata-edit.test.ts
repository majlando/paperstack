import { describe, expect, it } from "vitest";
import { editMetadataInYaml } from "./metadata-edit.ts";
import { PaperstackError } from "../errors.ts";

const YAML = `# Shared group report — see the project README
title: "Demo Project Report"
course: "SEA"
institution: "Example Academy"
authors:
  - name: "Ada Demo"
    student_id: "100001"
date: 2026-06-10
language: en
body_cap_normalsider: 40
sections:
  - { file: sections/01-intro.md, role: body } # keep first
`;

describe("editMetadataInYaml", () => {
  it("updates fields while preserving comments, sections, and quoting style", () => {
    const out = editMetadataInYaml(YAML, {
      title: "Final Report",
      course: "SEA-2",
      body_cap_normalsider: 35,
    });
    expect(out).toContain("# Shared group report — see the project README");
    expect(out).toContain("# keep first");
    expect(out).toContain('title: "Final Report"'); // double quotes kept
    expect(out).toContain('course: "SEA-2"');
    expect(out).toContain("body_cap_normalsider: 35");
    expect(out).toContain("sections:");
    expect(out.endsWith("\n")).toBe(true);
  });

  it("inserts new keys at their canonical position, not at the end", () => {
    const out = editMetadataInYaml(YAML, { subtitle: "A study" });
    const lines = out.split("\n");
    const titleAt = lines.findIndex((l) => l.startsWith("title:"));
    expect(lines[titleAt + 1]).toBe("subtitle: A study");
  });

  it("round-trips the cover logo, validating it as a project path", () => {
    const out = editMetadataInYaml(YAML, { logo: "resources/logos/sea.png" });
    const lines = out.split("\n");
    const institutionAt = lines.findIndex((l) => l.startsWith("institution:"));
    expect(lines[institutionAt + 1]).toBe("logo: resources/logos/sea.png");
    expect(editMetadataInYaml(out, { logo: "" })).not.toContain("logo:");
    expect(() => editMetadataInYaml(YAML, { logo: "../logo.png" })).toThrow(
      "stay inside the project folder",
    );
  });

  it("removes optional keys when cleared", () => {
    const out = editMetadataInYaml(YAML, { course: "  ", date: "" });
    expect(out).not.toContain("course:");
    expect(out).not.toContain("date:");
    expect(out).toContain("institution:"); // untouched fields stay
  });

  it("replaces the author list, omitting empty student ids and empty rows", () => {
    const out = editMetadataInYaml(YAML, {
      authors: [
        { name: "Bob Builder", student_id: "200002" },
        { name: "No Id" },
        { name: "   " },
      ],
    });
    expect(out).toContain("name: Bob Builder");
    expect(out).toContain('student_id: "200002"'); // stays a string in YAML
    expect(out).toContain("name: No Id");
    expect(out).not.toContain("Ada Demo");
    expect((out.match(/- name:/g) ?? []).length).toBe(2);
  });

  it("refuses an edit that would make the document unloadable", () => {
    const error = (() => {
      try {
        editMetadataInYaml(YAML, { title: "   " });
        return null;
      } catch (e) {
        return e;
      }
    })();
    expect(error).toBeInstanceOf(PaperstackError);
    expect((error as PaperstackError).code).toBe("metadata-invalid");
    expect((error as PaperstackError).userMessage).toContain("title");
  });

  it("is a no-op when nothing is edited", () => {
    expect(editMetadataInYaml(YAML, {})).toBe(YAML);
  });
});
