import { useMemo, useState } from "react";
import { AlertTriangle, Brain, ChevronDown, Minus, Plus, X } from "lucide-react";
import { Card, CardTitle } from "@/components/ui/card";
import { useSoma } from "@/lib/store";
import { getLocalDateKey } from "@/lib/soma";
import { GROUPS, addDaysKey, groupReadiness, sessionWarnings, type SmartBrief } from "@/lib/smart-training";
import { ACTIVITIES, JOINTS, type Ache, type ActivityId, type JointId, type OutsideActivity } from "@/lib/training-feedback";
import { tapLight, tapSuccess } from "@/lib/haptics";
import { cn } from "@/lib/utils";

/**
 * The week, read for you: what is covered, what is missing, what is not
 * ready, and the one variation the last sessions left out.
 *
 * Built for training by feel. It does not tell you what today is; it tells
 * you what today should not forget. The order is the order of urgency:
 * warnings about the session in front of you, then the week's misses, then
 * the heads being skipped, then the plain coverage grid.
 */
export function SmartTrainingCard({ brief }: { brief: SmartBrief }) {
  const live = useSoma((s) => s.live);
  const addExercise = useSoma((s) => s.addExercise);
  const today = getLocalDateKey(new Date());
  const [showBody, setShowBody] = useState(false);

  const warnings = useMemo(
    () => sessionWarnings(live.exercises ?? [], brief.readiness, brief.joints),
    [live.exercises, brief],
  );
  const inSession = new Set((live.exercises ?? []).map((e) => e.name.toLowerCase()));
  const ended = brief.daysLeft <= 1;

  return (
    <Card>
      <CardTitle>
        <span className="flex items-center gap-2">
          <Brain className="size-4 text-accent-text" aria-hidden />
          Smart training
        </span>
        <span className="text-[0.65rem] font-bold text-faint">
          {ended ? "last day of the week" : `${brief.daysLeft} days left this week`}
        </span>
      </CardTitle>

      {warnings.length > 0 && (
        <div className="mb-3 space-y-1.5">
          {warnings.map((w) => (
            <div
              key={w.about}
              className={cn(
                "flex gap-2 rounded-xl border px-2.5 py-2 text-xs",
                w.level === 2 ? "border-danger/40 bg-danger/10" : "border-warn/40 bg-warn/10",
              )}
            >
              <AlertTriangle className={cn("mt-0.5 size-3.5 shrink-0", w.level === 2 ? "text-danger" : "text-warn")} aria-hidden />
              <span>
                <b>{w.about}</b> — {w.text}
              </span>
            </div>
          ))}
        </div>
      )}

      {brief.lastWeekMissed.length > 0 && (
        <p className="mb-2 rounded-xl bg-surface-2 px-2.5 py-2 text-xs">
          <b>Last week skipped:</b> {brief.lastWeekMissed.join(", ")}. Put them early this week.
        </p>
      )}

      {brief.gaps.length > 0 && (
        <div className="mb-3 rounded-xl border border-warn/40 bg-warn/10 px-2.5 py-2 text-xs">
          <div className="mb-1 font-bold">{ended ? "Missed this week" : "Not covered yet"}</div>
          {brief.gaps.map((g) => (
            <div key={g.group}>
              {g.label}: {g.kind === "missed" ? "nothing yet" : `${g.sets} of ${g.weeklyMin} sets`}
            </div>
          ))}
        </div>
      )}

      {brief.variantGaps.length > 0 && (
        <div className="mb-3 space-y-2">
          {brief.variantGaps.slice(0, 3).map((g) => (
            <div key={`${g.group}:${g.variant}`} className="rounded-xl bg-surface-2 px-2.5 py-2">
              <div className="text-xs">
                <b>
                  {g.groupLabel}: {g.label}
                </b>{" "}
                <span className="text-muted">
                  {g.lastHit ? `— not since ${g.lastHit.slice(5)}` : "— not in the last 10 days"}
                  {g.doneInstead.length > 0 && `; only ${g.doneInstead.slice(0, 2).join(", ")}`}
                </span>
              </div>
              <div className="mt-0.5 text-[0.65rem] text-faint">Why: {g.why}.</div>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {g.suggest.map((name) => {
                  const added = inSession.has(name.toLowerCase());
                  return (
                    <button
                      key={name}
                      type="button"
                      disabled={added}
                      onClick={() => {
                        tapSuccess();
                        addExercise(name);
                      }}
                      className={cn(
                        "flex items-center gap-1 rounded-full border px-2.5 py-1 text-[0.68rem] font-bold",
                        added ? "border-accent/40 text-accent-text" : "border-border bg-surface text-fg",
                      )}
                    >
                      {added ? "✓" : <Plus className="size-3" aria-hidden />}
                      {name}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      {brief.next.length > 0 && (
        <p className="mb-3 text-xs">
          <b>Ready and behind:</b>{" "}
          <span className="text-muted">{brief.next.map((n) => n.label).join(", ")}</span>
        </p>
      )}

      {/* The week as a grid: sets against the floor, one bar per group. */}
      <div className="grid grid-cols-3 gap-x-3 gap-y-2">
        {brief.week.map((c) => {
          const pct = Math.min(1, c.sets / c.weeklyMin);
          const g = GROUPS.find((x) => x.id === c.group);
          const rec = g ? Math.round(groupReadiness(g, brief.readiness)) : 100;
          return (
            <div key={c.group} className="min-w-0">
              <div className="flex items-baseline justify-between gap-1">
                <span className="truncate text-[0.68rem] font-bold">{c.label}</span>
                <span className={cn("text-[0.6rem] font-bold tabular", c.sets >= c.weeklyMin ? "text-accent-text" : "text-faint")}>
                  {c.sets}/{c.weeklyMin}
                </span>
              </div>
              <div className="mt-0.5 h-1.5 overflow-hidden rounded-full bg-surface-3">
                <div
                  className={cn("h-full rounded-full", c.sets >= c.weeklyMin ? "bg-accent" : c.sets > 0 ? "bg-accent/55" : "")}
                  style={{ width: `${pct * 100}%` }}
                />
              </div>
              {rec < 85 && <div className="mt-0.5 text-[0.55rem] text-faint">recovering · {rec}%</div>}
            </div>
          );
        })}
      </div>

      <button
        type="button"
        onClick={() => {
          tapLight();
          setShowBody(!showBody);
        }}
        className="mt-3 flex w-full items-center justify-between rounded-xl border border-border bg-surface-2 px-2.5 py-2 text-xs font-bold"
        aria-expanded={showBody}
      >
        <span>Outside activity &amp; aches</span>
        <ChevronDown className={cn("size-4 text-muted transition-transform", showBody && "rotate-180")} aria-hidden />
      </button>
      {showBody && <BodyLog today={today} />}
    </Card>
  );
}

/**
 * What the gym never saw: a climb, a hike, a match — and what hurts.
 *
 * Logged on the day, today or yesterday, because the climb is usually
 * remembered the morning after, when the forearms bring it up.
 */
export function BodyLog({ today }: { today: string }) {
  const nutrition = useSoma((s) => s.nutrition);
  const patchDay = useSoma((s) => s.patchDay);
  const [which, setWhich] = useState<"today" | "yesterday">("today");
  const date = which === "today" ? today : addDaysKey(today, -1);
  const day = nutrition[date];
  const activities = day?.activities ?? [];
  const aches = day?.aches ?? [];

  const [act, setAct] = useState<ActivityId | null>(null);
  const [hours, setHours] = useState(2);
  const [effort, setEffort] = useState<1 | 2 | 3>(2);

  const addActivity = () => {
    if (!act) return;
    tapSuccess();
    const next: OutsideActivity = { id: act, hours, effort };
    patchDay(date, { activities: [...activities, next] });
    setAct(null);
  };
  const cycleAche = (where: JointId) => {
    tapLight();
    const cur = aches.find((a) => a.where === where);
    const level = ((cur?.level ?? 0) + 1) % 4;
    const rest = aches.filter((a) => a.where !== where);
    patchDay(date, { aches: level === 0 ? rest : [...rest, { where, level: level as Ache["level"] }] });
  };

  return (
    <div className="mt-2 space-y-3 rounded-xl border border-border px-2.5 py-2.5">
      <div className="grid grid-cols-2 gap-1 rounded-lg bg-surface-2 p-0.5" role="tablist">
        {(["today", "yesterday"] as const).map((w) => (
          <button
            key={w}
            type="button"
            role="tab"
            aria-selected={which === w}
            onClick={() => setWhich(w)}
            className={cn("rounded-md py-1 text-[0.7rem] font-bold capitalize", which === w ? "bg-surface text-fg shadow" : "text-muted")}
          >
            {w}
          </button>
        ))}
      </div>

      <div>
        <div className="mb-1.5 text-[0.62rem] font-bold uppercase tracking-wide text-faint">Activity</div>
        {activities.length > 0 && (
          <div className="mb-2 flex flex-wrap gap-1.5">
            {activities.map((a, i) => {
              const def = ACTIVITIES.find((x) => x.id === a.id);
              return (
                <span key={i} className="flex items-center gap-1 rounded-full bg-accent/15 px-2.5 py-1 text-[0.68rem] font-bold text-accent-text">
                  {def?.emoji} {def?.label} · {a.hours}h · {["easy", "normal", "hard"][a.effort - 1]}
                  <button
                    type="button"
                    aria-label={`Remove ${def?.label}`}
                    onClick={() => patchDay(date, { activities: activities.filter((_, j) => j !== i) })}
                  >
                    <X className="size-3" />
                  </button>
                </span>
              );
            })}
          </div>
        )}
        <div className="flex flex-wrap gap-1.5">
          {ACTIVITIES.map((a) => (
            <button
              key={a.id}
              type="button"
              aria-pressed={act === a.id}
              onClick={() => {
                tapLight();
                setAct(act === a.id ? null : a.id);
              }}
              className={cn(
                "rounded-full border px-2.5 py-1 text-[0.7rem] font-bold",
                act === a.id ? "border-accent bg-accent text-accent-ink" : "border-border bg-surface-2 text-muted",
              )}
            >
              {a.emoji} {a.label}
            </button>
          ))}
        </div>
        {act && (
          <div className="mt-2 flex items-center gap-2">
            <div className="flex items-center gap-1 rounded-lg border border-border bg-surface-2">
              <button type="button" className="p-1.5" aria-label="Less time" onClick={() => setHours(Math.max(0.5, hours - 0.5))}>
                <Minus className="size-3.5" />
              </button>
              <span className="w-9 text-center text-xs font-extrabold tabular">{hours}h</span>
              <button type="button" className="p-1.5" aria-label="More time" onClick={() => setHours(Math.min(12, hours + 0.5))}>
                <Plus className="size-3.5" />
              </button>
            </div>
            <div className="grid flex-1 grid-cols-3 gap-1">
              {(["easy", "normal", "hard"] as const).map((l, i) => (
                <button
                  key={l}
                  type="button"
                  aria-pressed={effort === i + 1}
                  onClick={() => setEffort((i + 1) as 1 | 2 | 3)}
                  className={cn(
                    "rounded-lg border py-1.5 text-[0.65rem] font-bold capitalize",
                    effort === i + 1 ? "border-accent bg-accent/15 text-accent-text" : "border-border bg-surface-2 text-faint",
                  )}
                >
                  {l}
                </button>
              ))}
            </div>
            <button type="button" onClick={addActivity} className="rounded-lg bg-accent px-3 py-1.5 text-xs font-extrabold text-accent-ink">
              Add
            </button>
          </div>
        )}
      </div>

      <div>
        <div className="mb-1.5 text-[0.62rem] font-bold uppercase tracking-wide text-faint">
          What hurts <span className="normal-case tracking-normal">· tap again for worse</span>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {JOINTS.map((j) => {
            const lvl = aches.find((a) => a.where === j.id)?.level ?? 0;
            return (
              <button
                key={j.id}
                type="button"
                onClick={() => cycleAche(j.id)}
                aria-label={`${j.label}: ${["fine", "niggle", "sore", "hurts"][lvl]}`}
                className={cn(
                  "rounded-full border px-2.5 py-1 text-[0.7rem] font-bold",
                  lvl === 0 && "border-border bg-surface-2 text-muted",
                  lvl === 1 && "border-warn/50 bg-warn/10 text-warn",
                  lvl >= 2 && "border-danger/50 bg-danger/15 text-danger",
                )}
              >
                {j.label}
                {lvl > 0 && ` · ${["", "niggle", "sore", "hurts"][lvl]}`}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
