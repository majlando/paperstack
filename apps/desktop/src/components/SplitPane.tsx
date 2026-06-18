import { useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";

const RATIO_KEY = "paperstack.editorSplit";
const MIN = 0.2;
const MAX = 0.8;

function initialRatio(): number {
  const stored = Number(localStorage.getItem(RATIO_KEY));
  return Number.isFinite(stored) && stored >= MIN && stored <= MAX ? stored : 0.5;
}

/**
 * The editor/preview split with a draggable divider; double-click resets to
 * 50/50. Plain pointer events, no dependency. The ratio is app-private UI
 * state, so it lives in localStorage — never in the project folder, which
 * groups share over Git. Both panes drop pointer events while dragging: the
 * editor would otherwise select text, and the PDF iframe would swallow the
 * drag entirely.
 */
export function SplitPane(props: { left: ReactNode; right: ReactNode }) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const ratioRef = useRef(0);
  const [ratio, setRatio] = useState(initialRatio);
  const [dragging, setDragging] = useState(false);
  ratioRef.current = ratio;

  function onPointerDown(e: ReactPointerEvent<HTMLDivElement>) {
    e.currentTarget.setPointerCapture(e.pointerId);
    setDragging(true);
  }
  function onPointerMove(e: ReactPointerEvent<HTMLDivElement>) {
    if (!dragging || !containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    if (rect.width === 0) return;
    setRatio(Math.min(MAX, Math.max(MIN, (e.clientX - rect.left) / rect.width)));
  }
  // pointerup, but also pointercancel / lost capture (a touch interrupted, an
  // OS gesture): end the drag from every exit, or the panes would stay
  // pointer-events-none and become unclickable. Reset dragging first so a
  // later throw can't wedge it.
  function finishDrag(e: ReactPointerEvent<HTMLDivElement>) {
    if (!dragging) return;
    setDragging(false);
    // Releasing an already-released pointer throws; the drag is over either way.
    if (e.currentTarget.hasPointerCapture(e.pointerId))
      e.currentTarget.releasePointerCapture(e.pointerId);
    localStorage.setItem(RATIO_KEY, ratioRef.current.toFixed(3));
  }
  function reset() {
    setRatio(0.5);
    localStorage.setItem(RATIO_KEY, "0.5");
  }

  return (
    <div ref={containerRef} className="flex min-h-0 min-w-0 flex-1">
      <div
        style={{ width: `${ratio * 100}%` }}
        className={`flex min-w-0 shrink-0 ${dragging ? "pointer-events-none select-none" : ""}`}
      >
        {props.left}
      </div>
      {/* The visual line between the panes is the preview's own border-l;
          the divider is an invisible grab strip that tints while in use. */}
      <div
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize editor and preview"
        title="Drag to resize — double-click to reset"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={finishDrag}
        onPointerCancel={finishDrag}
        onLostPointerCapture={finishDrag}
        onDoubleClick={reset}
        className={`z-10 -mx-1 w-2 shrink-0 cursor-col-resize ${
          dragging ? "bg-sky-500/40" : "hover:bg-sky-500/30"
        }`}
      />
      <div
        className={`flex min-w-0 flex-1 ${dragging ? "pointer-events-none select-none" : ""}`}
      >
        {props.right}
      </div>
    </div>
  );
}
