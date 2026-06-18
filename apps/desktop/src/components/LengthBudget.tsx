import { useStore } from "../store.ts";

function stem(file: string): string {
  return file.replace(/.*\//, "").replace(/\.md$/i, "");
}

/**
 * The normalside budget at a glance: total body length against the cap, what's
 * left, and how each body section contributes — so the cap is planned for, not
 * discovered at the end. Only body sections count (front/back matter and
 * appendices are excluded by the same rule the cap uses).
 */
export function LengthBudget(props: { onClose: () => void }) {
  const counts = useStore((s) => s.counts);
  const openSection = useStore((s) => s.openSection);
  if (!counts) return null;

  const body = counts.sections
    .filter((s) => s.role === "body")
    .sort((a, b) => b.normalsider - a.normalsider);
  const { bodyNormalsider: total, cap } = counts;
  const pct = cap > 0 ? (total / cap) * 100 : 0;
  const remaining = cap - total;
  const barColor = counts.overCap ? "bg-red-500" : pct >= 90 ? "bg-amber-500" : "bg-sky-500";

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
      onClick={props.onClose}
      onKeyDown={(e) => {
        if (e.key === "Escape") props.onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Length budget"
        className="flex max-h-[80vh] w-full max-w-lg flex-col rounded-lg border border-zinc-700 bg-zinc-900 p-4 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="pb-1 text-sm font-semibold text-zinc-100">Length budget</div>
        <div className="flex items-baseline gap-2 pb-2">
          <span className={`text-2xl font-semibold ${counts.overCap ? "text-red-400" : "text-zinc-100"}`}>
            {total.toFixed(1)}
          </span>
          <span className="text-sm text-zinc-500">/ {cap} normalsider</span>
          <span className={`ml-auto text-xs ${remaining < 0 ? "text-red-400" : "text-zinc-500"}`}>
            {remaining < 0
              ? `${Math.abs(remaining).toFixed(1)} over`
              : `${remaining.toFixed(1)} left`}
          </span>
        </div>
        <div className="h-2 w-full overflow-hidden rounded bg-zinc-800">
          <div className={`h-full ${barColor}`} style={{ width: `${Math.min(100, pct)}%` }} />
        </div>

        <div className="mt-4 min-h-0 flex-1 overflow-y-auto">
          {body.length === 0 ? (
            <div className="py-2 text-sm text-zinc-500">No body sections yet.</div>
          ) : (
            body.map((s) => {
              const sharePct = cap > 0 ? Math.min(100, (s.normalsider / cap) * 100) : 0;
              return (
                <button
                  key={s.file}
                  onClick={() => {
                    props.onClose();
                    void openSection(s.file);
                  }}
                  className="block w-full rounded px-2 py-1.5 text-left hover:bg-zinc-800"
                >
                  <div className="flex items-baseline justify-between gap-2 text-sm">
                    <span className="min-w-0 truncate text-zinc-300">{s.title ?? stem(s.file)}</span>
                    <span className="shrink-0 tabular-nums text-zinc-500">
                      {s.normalsider.toFixed(1)} ns
                    </span>
                  </div>
                  <div className="mt-1 h-1 w-full overflow-hidden rounded bg-zinc-800">
                    <div className="h-full bg-zinc-500" style={{ width: `${sharePct}%` }} />
                  </div>
                </button>
              );
            })
          )}
        </div>

        <div className="flex justify-end pt-3">
          <button
            onClick={props.onClose}
            className="rounded border border-zinc-700 px-3 py-1 text-sm text-zinc-300 hover:bg-zinc-800"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
