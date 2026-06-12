import { z } from "zod";

export const SECTION_ROLES = [
  "front-matter",
  "body",
  "back-matter",
  "appendix",
] as const;

export type SectionRole = (typeof SECTION_ROLES)[number];

const authorSchema = z.object({
  name: z.string().min(1, "author name must not be empty"),
  student_id: z
    .union([z.string(), z.number()])
    .optional()
    .transform((v) => (v === undefined ? undefined : String(v))),
});

/**
 * Paths in document.yaml must stay inside the project folder and be portable:
 * forward slashes, relative, no "..". This is both a safety boundary (a
 * shared document.yaml must never read files outside the project) and what
 * keeps projects working across Windows/macOS/Linux group members.
 */
function projectRelativePath(what: string) {
  return z
    .string()
    .min(1, `${what} must not be empty`)
    .refine((f) => !f.includes("\\"), `use forward slashes (/) in ${what}s`)
    .refine(
      (f) => !f.startsWith("/") && !/^[A-Za-z]:/.test(f),
      `${what}s must be relative to the project folder`,
    )
    .refine(
      (f) => !f.split("/").includes(".."),
      `${what}s must stay inside the project folder`,
    )
    // "./a", "a//b", "a/./b" alias other entries: they would defeat the
    // duplicate-section guard and count the same file twice toward the cap.
    .refine(
      (f) => f.split("/").every((segment) => segment !== "" && segment !== "."),
      `write ${what}s as plain relative paths (no "./" or "//")`,
    );
}

export const sectionFileSchema = projectRelativePath("section path");

const sectionSchema = z.object({
  file: sectionFileSchema,
  role: z.enum(SECTION_ROLES),
});

export const documentSchema = z.object({
  title: z.string().min(1, "title must not be empty"),
  subtitle: z.string().optional(),
  course: z.string().optional(),
  institution: z.string().optional(),
  /**
   * Project-relative image path shown at the top of the cover page.
   * Tolerant of hand-edited values (the file is shared over Git): a leading
   * slash and backslashes are normalized away, and an empty/null value means
   * "no logo" — a logo must never make an existing project fail to open.
   * Genuinely unusable values (absolute paths, "..") are still rejected.
   */
  logo: z
    .union([z.string(), z.null()])
    .optional()
    .transform((v) => {
      if (v == null) return undefined;
      const slashes = v.trim().replaceAll("\\", "/");
      // A UNC path (\\server\share\…) is absolute: keep its double slash so
      // the relative-path check below rejects it readably — stripping it
      // would fabricate a bogus project-relative path that fails much later
      // as a missing image.
      if (slashes.startsWith("//")) return slashes;
      const cleaned = slashes
        .split("/")
        .filter((segment) => segment !== "" && segment !== ".")
        .join("/");
      return cleaned === "" ? undefined : cleaned;
    })
    .pipe(projectRelativePath("logo path").optional()),
  authors: z.array(authorSchema).default([]),
  date: z.string().optional(),
  language: z.enum(["en", "da"]).default("en"),
  body_cap_normalsider: z
    .number({ invalid_type_error: "the body cap must be a number" })
    .positive("the body cap must be a positive number")
    .default(40),
  sections: z
    .array(sectionSchema)
    .min(1, "the report needs at least one section")
    .refine(
      (sections) => new Set(sections.map((s) => s.file)).size === sections.length,
      "the same section file is listed more than once",
    ),
});

export type DocumentMeta = z.infer<typeof documentSchema>;
export type Author = DocumentMeta["authors"][number];
export type Section = DocumentMeta["sections"][number];
