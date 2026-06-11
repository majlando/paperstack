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

  it("a full-field save with no changes is byte-identical on a scaffold-shaped file", () => {
    // What the form actually sends on first save: every field, most empty.
    const scaffold = [
      `title: "Demo"`,
      `course: ""`,
      `institution: ""`,
      `authors: [] # - { name: "Full Name", student_id: "12345" }`,
      `language: en`,
      `body_cap_normalsider: 40`,
      `sections:`,
      `  - { file: sections/01-introduction.md, role: body }`,
      ``,
    ].join("\n");
    const out = editMetadataInYaml(scaffold, {
      title: "Demo",
      subtitle: "",
      course: "",
      institution: "",
      logo: "",
      date: "",
      language: "en",
      body_cap_normalsider: 40,
      authors: [],
    });
    expect(out).toBe(scaffold);
  });

  it("leaves an unchanged author list (and its comments) untouched", () => {
    const flow = [
      `title: Demo`,
      `authors: [{ name: Ada, student_id: "1" }] # hand-written`,
      `sections:`,
      `  - { file: sections/01.md, role: body }`,
      ``,
    ].join("\n");
    const out = editMetadataInYaml(flow, {
      authors: [{ name: "Ada", student_id: "1" }],
      course: "SEA",
    });
    // The node is not replaced: the comment riding on it and the flow style
    // survive (the emitter normalizes flow spacing; that churn is the yaml
    // library's, not a node replacement).
    expect(out).toContain(`authors: [ { name: Ada, student_id: "1" } ] # hand-written`);
    expect(out).toContain("course: SEA");
  });

  it("never rewraps hand-written long lines (Git no-churn rule)", () => {
    const long = [
      "title: Demo",
      `subtitle: ${"A hand-written subtitle that runs well past eighty columns ".repeat(2).trim()}`,
      "sections:",
      "  - { file: sections/a-section-with-a-rather-long-descriptive-filename.md, role: body }",
      "",
    ].join("\n");
    expect(editMetadataInYaml(long, {})).toBe(long);
    const edited = editMetadataInYaml(long, { course: "SEA" });
    expect(edited).toContain(long.split("\n")[1]); // subtitle line intact
    expect(edited).toContain(long.split("\n")[3]); // flow entry intact
  });
});
