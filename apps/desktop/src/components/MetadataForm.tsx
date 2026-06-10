import { useEffect, useState, type ReactNode } from "react";
import { documentSchema, type MetadataEdit } from "@paperstack/engine";
import { useStore } from "../store.ts";

/**
 * The report-details form: every field of document.yaml except the section
 * list, validated by the exact schema the project loader uses (so the form
 * can never produce a file the loader rejects, with the same messages).
 * Plain inputs in a full-pane view — no dialog plumbing needed, which is why
 * the first shadcn components are deferred to a real dialog need (M4).
 */
const formSchema = documentSchema.omit({ sections: true });

const inputCls =
  "w-full rounded border border-zinc-700 bg-zinc-900 px-2.5 py-1.5 text-sm text-zinc-100 outline-none placeholder:text-zinc-600 focus:border-zinc-500";

function Field(props: { label: string; error?: string; children: ReactNode }) {
  return (
    <label className="block">
      <div className="pb-1 text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
        {props.label}
      </div>
      {props.children}
      {props.error && <div className="pt-1 text-xs text-red-400">{props.error}</div>}
    </label>
  );
}

interface AuthorRow {
  name: string;
  student_id: string;
}

export function MetadataForm() {
  const saveMetadata = useStore((s) => s.saveMetadata);
  const closeMetadata = useStore((s) => s.closeMetadata);
  // Field values stay local; the store only learns *that* edits are pending,
  // so the window-close guard can refuse to silently drop them.
  const setMetadataDirty = useStore((s) => s.setMetadataDirty);
  const [values, setValues] = useState(() => {
    const meta = useStore.getState().project?.meta;
    return {
      title: meta?.title ?? "",
      subtitle: meta?.subtitle ?? "",
      course: meta?.course ?? "",
      institution: meta?.institution ?? "",
      logo: meta?.logo ?? "",
      date: meta?.date ?? "",
      language: meta?.language ?? "en",
      cap: String(meta?.body_cap_normalsider ?? 40),
      authors: (meta?.authors ?? []).map(
        (a): AuthorRow => ({ name: a.name, student_id: a.student_id ?? "" }),
      ),
    };
  });
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeMetadata();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [closeMetadata]);

  const edit = (mutate: (v: typeof values) => typeof values) => {
    setMetadataDirty(true);
    setValues(mutate);
  };
  const update = (patch: Partial<typeof values>) => edit((v) => ({ ...v, ...patch }));
  const updateAuthor = (index: number, patch: Partial<AuthorRow>) =>
    edit((v) => ({
      ...v,
      authors: v.authors.map((a, i) => (i === index ? { ...a, ...patch } : a)),
    }));

  async function save() {
    const cap = Number(values.cap);
    const candidate = {
      title: values.title.trim(),
      subtitle: values.subtitle.trim() || undefined,
      course: values.course.trim() || undefined,
      institution: values.institution.trim() || undefined,
      logo: values.logo.trim() || undefined,
      date: values.date.trim() || undefined,
      language: values.language,
      // a non-numeric input must still produce the schema's own message
      body_cap_normalsider: Number.isFinite(cap) ? cap : -1,
      authors: values.authors
        .map((a) => ({ name: a.name.trim(), student_id: a.student_id.trim() || undefined }))
        .filter((a) => a.name || a.student_id),
    };
    const parsed = formSchema.safeParse(candidate);
    if (!parsed.success) {
      const byField: Record<string, string> = {};
      for (const issue of parsed.error.issues) {
        const key = String(issue.path[0] ?? "form");
        byField[key] ??= issue.message;
      }
      setErrors(byField);
      return;
    }
    setErrors({});
    const edit: MetadataEdit = {
      title: candidate.title,
      subtitle: values.subtitle,
      course: values.course,
      institution: values.institution,
      // the parsed value is normalized (leading slash stripped) — write that
      logo: parsed.data.logo ?? "",
      date: values.date,
      language: parsed.data.language,
      body_cap_normalsider: parsed.data.body_cap_normalsider,
      authors: candidate.authors,
    };
    await saveMetadata(edit); // closes on success; error banner on failure
  }

  return (
    <div className="flex min-w-0 flex-1 justify-center overflow-y-auto px-6 py-8">
      <div className="w-full max-w-xl">
        <div className="mb-6 flex items-center justify-between border-b border-zinc-800 pb-3">
          <h2 className="text-lg font-semibold text-zinc-100">Report details</h2>
          <button
            onClick={closeMetadata}
            title="Close (Esc)"
            className="rounded px-1.5 py-0.5 text-zinc-500 hover:bg-zinc-800 hover:text-zinc-200"
          >
            ✕
          </button>
        </div>

        <div className="flex flex-col gap-4">
          <Field label="Title" error={errors.title}>
            <input
              autoFocus
              value={values.title}
              onChange={(e) => update({ title: e.target.value })}
              className={inputCls}
            />
          </Field>
          <Field label="Subtitle" error={errors.subtitle}>
            <input
              value={values.subtitle}
              onChange={(e) => update({ subtitle: e.target.value })}
              placeholder="Optional"
              className={inputCls}
            />
          </Field>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Course" error={errors.course}>
              <input
                value={values.course}
                onChange={(e) => update({ course: e.target.value })}
                placeholder="e.g. SEA"
                className={inputCls}
              />
            </Field>
            <Field label="Institution" error={errors.institution}>
              <input
                value={values.institution}
                onChange={(e) => update({ institution: e.target.value })}
                className={inputCls}
              />
            </Field>
          </div>
          <Field label="Cover logo" error={errors.logo}>
            <input
              value={values.logo}
              onChange={(e) => update({ logo: e.target.value })}
              placeholder="Image path inside the project, e.g. resources/logos/sea.png (optional)"
              className={inputCls}
            />
          </Field>
          <div className="grid grid-cols-3 gap-4">
            <Field label="Date" error={errors.date}>
              <input
                value={values.date}
                onChange={(e) => update({ date: e.target.value })}
                placeholder="e.g. 2026-06-10"
                className={inputCls}
              />
            </Field>
            <Field label="Language" error={errors.language}>
              <select
                value={values.language}
                onChange={(e) => update({ language: e.target.value as "en" | "da" })}
                className={inputCls}
              >
                <option value="en">English</option>
                <option value="da">Dansk</option>
              </select>
            </Field>
            <Field label="Length cap (normalsider)" error={errors.body_cap_normalsider}>
              <input
                value={values.cap}
                onChange={(e) => update({ cap: e.target.value })}
                inputMode="numeric"
                className={inputCls}
              />
            </Field>
          </div>

          <div>
            <div className="pb-1 text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
              Authors
            </div>
            <div className="flex flex-col gap-2">
              {values.authors.map((author, i) => (
                <div key={i} className="flex items-center gap-2">
                  <input
                    value={author.name}
                    onChange={(e) => updateAuthor(i, { name: e.target.value })}
                    placeholder="Full name"
                    className={inputCls}
                  />
                  <input
                    value={author.student_id}
                    onChange={(e) => updateAuthor(i, { student_id: e.target.value })}
                    placeholder="Student ID"
                    className={`${inputCls} w-36 shrink-0`}
                  />
                  <button
                    onClick={() =>
                      edit((v) => ({
                        ...v,
                        authors: v.authors.filter((_, j) => j !== i),
                      }))
                    }
                    title="Remove author"
                    className="shrink-0 rounded px-1.5 py-1 text-zinc-500 hover:bg-zinc-800 hover:text-zinc-200"
                  >
                    ✕
                  </button>
                </div>
              ))}
              {errors.authors && <div className="text-xs text-red-400">{errors.authors}</div>}
              <button
                onClick={() =>
                  edit((v) => ({
                    ...v,
                    authors: [...v.authors, { name: "", student_id: "" }],
                  }))
                }
                className="self-start rounded px-1 text-sm text-zinc-500 hover:text-zinc-200"
              >
                + Add author
              </button>
            </div>
          </div>

          <div className="flex gap-2 border-t border-zinc-800 pt-4">
            <button
              onClick={() => void save()}
              className="rounded bg-blue-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-blue-500"
            >
              Save
            </button>
            <button
              onClick={closeMetadata}
              className="rounded border border-zinc-700 px-4 py-1.5 text-sm text-zinc-300 hover:bg-zinc-900"
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
