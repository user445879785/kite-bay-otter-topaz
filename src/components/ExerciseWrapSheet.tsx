import { useState } from "react";
import {
  FEELS, HELD_BY, JOINTS, strapsLikely,
  type ExerciseWrap, type Feel, type HeldBy, type JointId,
} from "@/lib/training-feedback";
import type { SessionExercise } from "@/lib/types";
import { tapLight, tapSuccess } from "@/lib/haptics";
import { useSheet } from "@/lib/use-sheet";
import { cn } from "@/lib/utils";

/**
 * "How was it?" — asked once, when an exercise's last set is ticked.
 *
 * The set sheet asks what ended one set. This asks about the exercise as a
 * whole, because on a bad day the answer is the same for every set and
 * nobody rates eight sets to say "my shoulder hurt". One tap for the feel,
 * one for what held it back, a note if there is something to remember.
 *
 * Everything is optional and the sheet is dismissable: an unanswered wrap
 * stays absent, never a made-up "OK".
 */
export function ExerciseWrapSheet({
  exercise,
  onSave,
  onClose,
}: {
  exercise: SessionExercise;
  onSave: (patch: { wrap: ExerciseWrap; straps?: boolean }) => void;
  onClose: () => void;
}) {
  const sheetRef = useSheet(onClose);
  const [wrap, setWrap] = useState<ExerciseWrap>(exercise.wrap ?? {});
  const [straps, setStraps] = useState<boolean>(exercise.straps ?? false);
  const showStraps = strapsLikely(exercise) || exercise.straps;

  const toggleHeld = (h: HeldBy) => {
    tapLight();
    const held = wrap.held ?? [];
    const on = held.includes(h);
    setWrap({
      ...wrap,
      held: on ? held.filter((x) => x !== h) : [...held, h],
      painAt: h === "joint" && on ? undefined : wrap.painAt,
    });
  };
  const toggleJoint = (j: JointId) => {
    tapLight();
    const at = wrap.painAt ?? [];
    setWrap({ ...wrap, painAt: at.includes(j) ? at.filter((x) => x !== j) : [...at, j] });
  };
  const save = () => {
    tapSuccess();
    onSave({ wrap: { ...wrap, note: wrap.note?.trim() || undefined, at: Date.now() }, straps: showStraps ? straps : exercise.straps });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[60] flex flex-col justify-end bg-black/50" onClick={onClose}>
      <div
        ref={sheetRef}
        role="dialog"
        aria-modal="true"
        aria-label={`How was ${exercise.name}?`}
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
        className="soma-sheet max-h-[88vh] overflow-y-auto rounded-t-[1.75rem] px-4 pb-[max(20px,var(--safe-bottom,env(safe-area-inset-bottom)))] pt-2"
      >
        <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-surface-3" />
        <div className="mb-4 flex items-baseline justify-between gap-2">
          <div className="min-w-0">
            <div className="text-[0.62rem] font-bold uppercase tracking-wide text-faint">How was it?</div>
            <div className="truncate font-display text-[1.05rem] font-extrabold tracking-tight">{exercise.name}</div>
          </div>
          <button type="button" onClick={onClose} className="text-xs font-bold text-muted">
            Skip
          </button>
        </div>

        <div className="mb-4 grid grid-cols-3 gap-2">
          {FEELS.map((f) => (
            <button
              key={f.id}
              type="button"
              aria-pressed={wrap.feel === f.id}
              onClick={() => {
                tapLight();
                setWrap({ ...wrap, feel: wrap.feel === f.id ? undefined : (f.id as Feel) });
              }}
              className={cn(
                "flex flex-col items-center gap-1 rounded-2xl border py-3",
                wrap.feel === f.id ? "border-accent bg-accent/15" : "border-border bg-surface-2",
              )}
            >
              <span className="text-2xl leading-none" aria-hidden>{f.emoji}</span>
              <span className={cn("text-xs font-bold", wrap.feel === f.id ? "text-accent-text" : "text-fg")}>{f.label}</span>
            </button>
          ))}
        </div>

        <Label>What held it back?</Label>
        <div className="mb-3 flex flex-wrap gap-1.5">
          {HELD_BY.map((h) => (
            <Chip key={h.id} on={wrap.held?.includes(h.id) ?? false} onClick={() => toggleHeld(h.id)}>
              {h.label}
            </Chip>
          ))}
        </div>

        {wrap.held?.includes("joint") && (
          <>
            <Label>Where?</Label>
            <div className="mb-3 flex flex-wrap gap-1.5">
              {JOINTS.map((j) => (
                <Chip key={j.id} on={wrap.painAt?.includes(j.id) ?? false} onClick={() => toggleJoint(j.id)} tone="danger">
                  {j.label}
                </Chip>
              ))}
            </div>
          </>
        )}

        {showStraps && (
          <button
            type="button"
            role="switch"
            aria-checked={straps}
            onClick={() => {
              tapLight();
              setStraps(!straps);
            }}
            className="mb-3 flex w-full items-center justify-between rounded-2xl border border-border bg-surface-2 px-3 py-2.5"
          >
            <span className="text-left">
              <span className="block text-sm font-bold">Used straps</span>
              <span className="block text-[0.62rem] text-faint">Loads with straps are compared with each other, not with bare-handed sets</span>
            </span>
            <span className={cn("relative h-7 w-12 shrink-0 rounded-full transition-colors", straps ? "bg-accent" : "bg-surface-3")}>
              <span className={cn("absolute transition-[left] duration-150 top-0.5 size-6 rounded-full bg-white shadow", straps ? "left-[1.4rem]" : "left-0.5")} />
            </span>
          </button>
        )}

        <Label>Note</Label>
        <textarea
          value={wrap.note ?? ""}
          onChange={(e) => setWrap({ ...wrap, note: e.target.value })}
          rows={2}
          placeholder="Shoulder pinched at the bottom, forearms still gone from the climb…"
          className="mb-4 w-full resize-none rounded-2xl border border-border bg-surface-2 px-3 py-2 text-sm placeholder:text-faint"
        />

        <button
          type="button"
          onClick={save}
          className="h-12 w-full rounded-2xl bg-accent text-sm font-extrabold text-accent-ink"
        >
          Save
        </button>
      </div>
    </div>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return <div className="mb-1.5 text-[0.65rem] font-bold uppercase tracking-wide text-faint">{children}</div>;
}

function Chip({
  on, onClick, children, tone,
}: { on: boolean; onClick: () => void; children: React.ReactNode; tone?: "danger" }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onClick}
      className={cn(
        "rounded-full border px-3 py-1.5 text-[0.72rem] font-bold",
        on
          ? tone === "danger"
            ? "border-danger bg-danger/15 text-danger"
            : "border-accent bg-accent text-accent-ink"
          : "border-border bg-surface-2 text-muted",
      )}
    >
      {children}
    </button>
  );
}
