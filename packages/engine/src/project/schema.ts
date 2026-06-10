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
 * Section paths must stay inside the project folder and be portable:
 * forward slashes, relative, no "..". This is both a safety boundary (a
 * shared document.yaml must never read files outside the project) and what
 * keeps projects working across Windows/macOS/Linux group members.
 */
export const sectionFileSchema = z
  .string()
  .min(1, "section file must not be empty")
  .refine((f) => !f.includes("\\"), "use forward slashes (/) in section paths")
  .refine(
    (f) => !f.startsWith("/") && !/^[A-Za-z]:/.test(f),
    "section paths must be relative to the project folder",
  )
  .refine(
    (f) => !f.split("/").includes(".."),
    "section paths must stay inside the project folder",
  );

const sectionSchema = z.object({
  file: sectionFileSchema,
  role: z.enum(SECTION_ROLES),
});

export const documentSchema = z.object({
  title: z.string().min(1, "title must not be empty"),
  subtitle: z.string().optional(),
  course: z.string().optional(),
  institution: z.string().optional(),
  authors: z.array(authorSchema).default([]),
  date: z.string().optional(),
  language: z.enum(["en", "da"]).default("en"),
  body_cap_normalsider: z.number().positive().default(40),
  sections: z.array(sectionSchema).min(1, "the report needs at least one section"),
});

export type DocumentMeta = z.infer<typeof documentSchema>;
export type Author = DocumentMeta["authors"][number];
export type Section = DocumentMeta["sections"][number];
