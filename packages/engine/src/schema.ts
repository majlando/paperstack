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

const sectionSchema = z.object({
  file: z.string().min(1, "section file must not be empty"),
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
