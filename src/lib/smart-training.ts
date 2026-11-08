/**
 * Smart training: what the week has covered, what it has missed, and what is
 * not ready yet.
 *
 * Training by feel is fine for picking the day's session. What it is bad at
 * is the week: the muscle nobody feels like training is the one that quietly
 * gets skipped, and the variation that is a little awkward (overhead
 * triceps, a stretched hamstring, a rear delt) is the one that drops out of
 * the session that did happen. Neither shows up until weeks later, as a
 * muscle that stopped growing.
 *
 * So three answers, all from what was actually logged:
 *
 *  - **coverage** — hard sets per muscle group this week against a floor,
 *    so a group still at zero on Thursday says so while there is time;
 *  - **variant gaps** — a group that IS being trained but always the same
 *    way, with the missing head and an exercise for it, preferring one you
 *    have done before;
 *  - **warnings** — about to train something that has not recovered, or that
 *    loads a joint that hurt in the last few days.
 *
 * Pure: no store, no React.
 */
import { computeBiologicalReadiness, type MuscleReadiness } from "./recovery.ts";
import { subTargetOf } from "./micro-muscle.ts";
import { activitySessions, jointFlags, jointLabel, loadsJoint, type DayWithBody, type JointFlag } from "./training-feedback.ts";
import type { HistorySession, SessionExercise } from "./types.ts";

// ------------------------------------------------------------------ groups --

export interface Variant {
  id: string;
  label: string;
  /** Why it matters, in one line. */
  why: string;
  /** Tested against "<subTarget> <name>". */
  match: RegExp;
  /** Exercises that hit it, best first. Names from the exercise library. */
  suggest: string[];
  /** A week without it is a gap. Optional ones are only reported when asked. */
  core: boolean;
}

export interface MuscleGroup {
  id: string;
  label: string;
  /** Recovery-map keys; the group is as ready as its least-ready key. */
  keys: string[];
  /** Hard sets a week below which the group is under-trained. */
  weeklyMin: number;
  variants: Variant[];
}

export const GROUPS: MuscleGroup[] = [
  {
    id: "chest",
    label: "Chest",
    keys: ["chest"],
    weeklyMin: 8,
    variants: [
      {
        id: "upper",
        label: "Upper chest",
        why: "incline work is what fills the top of the chest; flat pressing barely reaches it",
        match: /upper pec|clavicular|incline|low-to-high/i,
        suggest: ["Incline Dumbbell Press", "Smith Machine Incline Press", "Low-to-High Cable Fly"],
        core: true,
      },
      {
        id: "mid",
        label: "Mid chest",
        why: "the bulk of the pec",
        match: /sternal|flat|bench press|chest press|pec deck|press-around|push-?up/i,
        suggest: ["Flat Dumbbell Press", "Machine Chest Press", "Pec Deck Fly (Machine)"],
        core: true,
      },
      {
        id: "lower",
        label: "Lower chest",
        why: "dips and high-to-low flies",
        match: /costal|dip|high-to-low|decline/i,
        suggest: ["High-to-Low Cable Fly", "Weighted Chest Dips"],
        core: false,
      },
    ],
  },
  {
    id: "shoulders",
    label: "Shoulders",
    keys: ["deltoids", "deltoids_back"],
    weeklyMin: 8,
    variants: [
      {
        id: "side",
        label: "Side delts",
        why: "the width of the shoulder; no press trains it much",
        match: /side delt|lateral raise|y-raise|upright row/i,
        suggest: ["Cable Lateral Raise", "Lean-Away Dumbbell Lateral Raise", "Machine Lateral Raise"],
        core: true,
      },
      {
        id: "rear",
        label: "Rear delts",
        why: "the back of the shoulder, and what keeps a pressing-heavy week balanced",
        match: /rear delt|posterior|face pull|reverse pec|reverse fly|rear fly/i,
        suggest: ["Reverse Pec Deck", "Bent-Over Cable Flye", "Face Pulls"],
        core: true,
      },
      {
        id: "front",
        label: "Front delts",
        why: "chest pressing already covers most of it",
        match: /front delt|anterior|shoulder press|overhead press|ohp|arnold|front raise/i,
        suggest: ["Machine Shoulder Press", "Seated Dumbbell Shoulder Press"],
        core: false,
      },
    ],
  },
  {
    id: "triceps",
    label: "Triceps",
    keys: ["triceps", "triceps_back"],
    weeklyMin: 6,
    variants: [
      {
        id: "long",
        label: "Long head",
        why: "the biggest head, and it only works fully with the arm overhead or stretched; pushdowns leave it short",
        match: /long head|long &|overhead|skull|cross-body|french|jm press/i,
        suggest: ["Standing Low Pulley Overhead Tricep Extension", "Floor-Reset Skullcrusher", "Cross-Body Triceps Extension"],
        core: true,
      },
      {
        id: "lateral",
        label: "Lateral / medial head",
        why: "the horseshoe; pushdowns and close pressing",
        match: /lateral &|lateral head|medial|pushdown|push-down|dip|diamond|close-?grip/i,
        suggest: ["Cable Triceps Pushdown (Straight/V)", "Diamond Push-Ups"],
        core: true,
      },
    ],
  },
  {
    id: "biceps",
    label: "Biceps",
    keys: ["biceps"],
    weeklyMin: 6,
    variants: [
      {
        id: "long",
        label: "Long head",
        why: "the peak; curls with the arm behind the body",
        match: /long head|incline (dumbbell )?curl|bayesian/i,
        suggest: ["Incline Dumbbell Curl", "Bayesian Cable Curl"],
        core: true,
      },
      {
        id: "short",
        label: "Short head",
        why: "the inner bicep; arm in front, as on a preacher",
        match: /short head|preacher|concentration|spider/i,
        suggest: ["Dumbbell Preacher Curl", "Standing Cable Preacher Curl"],
        core: true,
      },
      {
        id: "brachialis",
        label: "Brachialis",
        why: "the muscle under the bicep that pushes it up; neutral or reverse grip",
        match: /brachialis|hammer|reverse.grip|reverse curl/i,
        suggest: ["Hammer Curl (Dumbbell/Cable)", "Reverse Grip Cable Curl"],
        core: false,
      },
    ],
  },
  {
    id: "back",
    label: "Back",
    keys: ["upper_back", "trapezius_back"],
    weeklyMin: 10,
    variants: [
      {
        id: "vertical",
        label: "Lats (vertical pull)",
        why: "width",
        match: /\blats?\b|vertical|pulldown|pull-?up|chin-?up|pullover/i,
        suggest: ["Lat Pulldown (Wide/Neutral)", "Weighted Pull-ups / Chin-ups", "Kneeling Single-Arm Lat Pulldown"],
        core: true,
      },
      {
        id: "horizontal",
        label: "Mid-back (rows)",
        why: "thickness, and the posture half of a push-heavy week",
        match: /mid-back|horizontal|rhomboid|upper back|\brow\b/i,
        suggest: ["Chest-Supported T-Bar Row", "Chest-Supported Cable Row", "Seal Row"],
        core: true,
      },
    ],
  },
  {
    id: "quads",
    label: "Quads",
    keys: ["quadriceps"],
    weeklyMin: 8,
    variants: [
      {
        id: "squat",
        label: "Squat pattern",
        why: "the main quad builder",
        match: /quad|squat|leg press|hack|lunge|step-up/i,
        suggest: ["Hack Squat", "Pendulum Squat", "Leg Press"],
        core: true,
      },
      {
        id: "rectus",
        label: "Rectus femoris",
        why: "the one quad head squats under-train; only knee extension reaches it fully",
        match: /rectus|leg extension/i,
        suggest: ["Leg Extensions"],
        core: false,
      },
    ],
  },
  {
    id: "hamstrings",
    label: "Hamstrings",
    keys: ["hamstring"],
    weeklyMin: 6,
    variants: [
      {
        id: "hinge",
        label: "Hip hinge (stretched)",
        why: "hamstrings loaded long, at the hip",
        match: /hamstrings \(lengthened\)|romanian|rdl|stiff.?leg|good morning|deadlift/i,
        suggest: ["Romanian Deadlift (DB/Barbell)"],
        core: true,
      },
      {
        id: "curl",
        label: "Knee flexion (curls)",
        why: "the other job of the hamstring; hinges barely train it",
        match: /knee flexion|hamstrings \(shortened\)|leg curl/i,
        suggest: ["Seated Leg Curl", "Lying Leg Curl"],
        core: true,
      },
    ],
  },
  {
    id: "calves",
    label: "Calves",
    keys: ["calves", "calves_back"],
    weeklyMin: 4,
    variants: [
      {
        id: "gastroc",
        label: "Gastrocnemius",
        why: "straight-leg calf raise",
        match: /gastroc|standing.*calf|leg press calf|^(?!.*(soleus|seated)).*calf raise/i,
        suggest: ["Standing Machine Calf Raise"],
        core: true,
      },
      {
        id: "soleus",
        label: "Soleus",
        why: "bent-knee calf raise",
        match: /soleus|seated calf/i,
        suggest: ["Seated Calf Raise Machine"],
        core: false,
      },
    ],
  },
  {
    id: "abs",
    label: "Abs",
    keys: ["abs", "obliques"],
    weeklyMin: 4,
    variants: [
      {
        id: "abs",
        label: "Abs",
        why: "a trunk that holds the heavy lifts",
        match: /\babs?\b|crunch|leg raise|knee raise|ab wheel|rollout|plank|oblique/i,
        suggest: ["Hanging Knee Raises"],
        core: true,
      },
    ],
  },
];

/** What a lift needs to be placed: its name, and where it is filed when known. */
export interface LiftRef {
  name: string;
  subTarget?: string;
  targetKeys?: string[];
}

/** Groups a muscle key belongs to, for exercises no variant names. */
const GROUP_BY_KEY = new Map<string, string>();
for (const g of GROUPS) for (const k of g.keys) if (!GROUP_BY_KEY.has(k)) GROUP_BY_KEY.set(k, g.id);
GROUP_BY_KEY.set("forearm", "biceps");

const labelOf = (ex: LiftRef) =>
  `${ex.subTarget || subTargetOf(ex.name)?.subTarget || ""} ${ex.name}`;

/** Which group variants an exercise hits. */
export function variantsOf(
  ex: LiftRef,
): { group: string; variant: string }[] {
  const text = labelOf(ex);
  const out: { group: string; variant: string }[] = [];
  const first = ex.targetKeys?.[0];
  for (const g of GROUPS) {
    for (const v of g.variants) {
      if (!v.match.test(text)) continue;
      // Credit goes to the group the lift is FOR. An overhead press lists
      // the triceps and says "overhead", and is still not long-head work; a
      // skullcrusher's "long head" is not the biceps'. When the first key
      // belongs to no group (glutes, traps), any listed key will do: that is
      // how a split squat still counts as quads.
      if (first) {
        const owner = GROUP_BY_KEY.get(first);
        if (owner ? owner !== g.id : !(ex.targetKeys ?? []).some((k) => g.keys.includes(k))) continue;
      }
      out.push({ group: g.id, variant: v.id });
    }
  }
  return out;
}

/** The groups an exercise trains, for set counting: its variants plus what it is filed under first. */
export function groupsOf(ex: LiftRef): string[] {
  const set = new Set(variantsOf(ex).map((x) => x.group));
  const first = ex.targetKeys?.[0];
  if (first && GROUP_BY_KEY.has(first)) set.add(GROUP_BY_KEY.get(first)!);
  return [...set];
}

/** Working sets that were done, the only ones that count. */
const hardSets = (ex: SessionExercise) =>
  (ex.sets ?? []).filter((s) => s.done && s.type !== "warmup" && s.type !== "feeder").length;

// ---------------------------------------------------------------- dates --

const toUTC = (k: string) => {
  const [y, m, d] = k.split("-").map(Number);
  return Date.UTC(y!, (m ?? 1) - 1, d ?? 1);
};
const keyOf = (t: number) => new Date(t).toISOString().slice(0, 10);
export const addDaysKey = (k: string, n: number) => keyOf(toUTC(k) + n * 86400000);
const daysBetween = (a: string, b: string) => Math.round((toUTC(b) - toUTC(a)) / 86400000);

/** Monday of the week a date key falls in. */
export function mondayOf(k: string): string {
  const dow = new Date(toUTC(k)).getUTCDay(); // 0 Sunday
  return addDaysKey(k, -((dow + 6) % 7));
}

// --------------------------------------------------------------- coverage --

export interface GroupCoverage {
  group: string;
  label: string;
  sets: number;
  weeklyMin: number;
  /** Date keys trained, oldest first. */
  days: string[];
  /** Core variants hit in the window. */
  hit: string[];
  /** Core variants not hit in the window. */
  missing: string[];
}

export function coverage(history: Record<string, HistorySession>, from: string, to: string): GroupCoverage[] {
  const by = new Map<string, GroupCoverage>(
    GROUPS.map((g) => [g.id, { group: g.id, label: g.label, sets: 0, weeklyMin: g.weeklyMin, days: [], hit: [], missing: [] }]),
  );
  for (const [date, s] of Object.entries(history ?? {})) {
    if (date < from || date > to) continue;
    for (const ex of s?.exercises ?? []) {
      const n = hardSets(ex);
      if (!n) continue;
      for (const g of groupsOf(ex)) {
        const c = by.get(g)!;
        c.sets += n;
        if (!c.days.includes(date)) c.days.push(date);
      }
      for (const { group, variant } of variantsOf(ex)) {
        const c = by.get(group)!;
        if (!c.hit.includes(variant)) c.hit.push(variant);
      }
    }
  }
  for (const g of GROUPS) {
    const c = by.get(g.id)!;
    c.days.sort();
    c.missing = g.variants.filter((v) => v.core && !c.hit.includes(v.id)).map((v) => v.id);
  }
  return [...by.values()];
}

// ------------------------------------------------------------ the brief --

export interface Gap {
  group: string;
  label: string;
  /** "missed" — not trained at all; "short" — under its weekly floor. */
  kind: "missed" | "short";
  sets: number;
  weeklyMin: number;
}

export interface VariantGap {
  group: string;
  groupLabel: string;
  variant: string;
  label: string;
  why: string;
  /** What to do, best first: one you have done before leads. */
  suggest: string[];
  /** Exercises of this group in the window, all the other way. */
  doneInstead: string[];
  /** Last time this variant was trained, if ever in the lookback. */
  lastHit?: string;
}

export interface Warning {
  kind: "recovery" | "joint";
  /** The exercise or group it is about. */
  about: string;
  text: string;
  /** 1 mild, 2 worth acting on. */
  level: 1 | 2;
}

export interface SmartBrief {
  /** Monday of the week being read. */
  weekStart: string;
  /** Days of the week left including today (7 on Monday, 1 on Sunday). */
  daysLeft: number;
  week: GroupCoverage[];
  gaps: Gap[];
  /** Last week's misses, shown early in the week as the review. */
  lastWeekMissed: string[];
  variantGaps: VariantGap[];
  /** Ready and behind: what to train next. */
  next: { group: string; label: string; recovery: number; sets: number; weeklyMin: number }[];
  readiness: Record<string, MuscleReadiness>;
  joints: JointFlag[];
}

export interface BriefInput {
  history: Record<string, HistorySession>;
  nutrition: Record<string, DayWithBody | undefined>;
  today: string;
  now?: number;
}

/** Recovery with outside activity folded in: a climb loads the forearms whether or not the gym saw it. */
export function readinessWithActivity(
  history: Record<string, HistorySession>,
  nutrition: Record<string, DayWithBody | undefined>,
  now = Date.now(),
): Record<string, MuscleReadiness> {
  return computeBiologicalReadiness({ ...history, ...activitySessions(nutrition, now) }, now);
}

export const groupReadiness = (g: MuscleGroup, r: Record<string, MuscleReadiness>) =>
  Math.min(...g.keys.map((k) => r[k]?.recovery ?? 100));

export function smartBrief({ history, nutrition, today, now = Date.now() }: BriefInput): SmartBrief {
  const weekStart = mondayOf(today);
  const daysLeft = 7 - daysBetween(weekStart, today);
  const week = coverage(history, weekStart, today);
  const readiness = readinessWithActivity(history, nutrition, now);

  // How much of the floor is reasonable to expect by today. Early in the week
  // nothing is "short"; by the weekend a group at zero is a miss.
  const elapsed = (7 - daysLeft + 1) / 7;
  const gaps: Gap[] = [];
  for (const c of week) {
    if (c.sets === 0 && daysLeft <= 4) gaps.push({ group: c.group, label: c.label, kind: "missed", sets: 0, weeklyMin: c.weeklyMin });
    else if (c.sets > 0 && c.sets < c.weeklyMin * Math.min(1, elapsed + 0.15) && daysLeft <= 2)
      gaps.push({ group: c.group, label: c.label, kind: "short", sets: c.sets, weeklyMin: c.weeklyMin });
  }

  const prevStart = addDaysKey(weekStart, -7);
  const last = coverage(history, prevStart, addDaysKey(weekStart, -1));
  const trainedLastWeek = last.some((c) => c.sets > 0);
  const lastWeekMissed = trainedLastWeek && daysLeft >= 5 ? last.filter((c) => c.sets === 0).map((c) => c.label) : [];

  // Variant gaps look back further than the week: a head is missed when the
  // last ~10 days trained the group and never that way.
  const lookFrom = addDaysKey(today, -10);
  const recent = coverage(history, lookFrom, today);
  const doneBefore = new Map<string, string>(); // lowercased name -> name as logged, most recent wins
  const byGroupNames = new Map<string, Set<string>>();
  const lastHit = new Map<string, string>(); // group:variant -> date
  for (const [date, s] of Object.entries(history ?? {}).sort(([a], [b]) => a.localeCompare(b))) {
    for (const ex of s?.exercises ?? []) {
      if (!hardSets(ex)) continue;
      doneBefore.set(ex.name.trim().toLowerCase(), ex.name);
      for (const { group, variant } of variantsOf(ex)) {
        lastHit.set(`${group}:${variant}`, date);
        if (date >= lookFrom) {
          if (!byGroupNames.has(group)) byGroupNames.set(group, new Set());
          byGroupNames.get(group)!.add(ex.name);
        }
      }
    }
  }
  const variantGaps: VariantGap[] = [];
  for (const c of recent) {
    if (c.sets === 0) continue;
    const g = GROUPS.find((x) => x.id === c.group)!;
    for (const vid of c.missing) {
      const v = g.variants.find((x) => x.id === vid)!;
      // Exercises you already know first: the best suggestion is the one you
      // will actually do, and it has a last-time to load from.
      const known = [...doneBefore.entries()]
        .filter(([, name]) => variantsOf({ name, targetKeys: [g.keys[0]!] }).some((x) => x.group === g.id && x.variant === v.id))
        .map(([, name]) => name);
      const suggest = [...new Set([...known.reverse(), ...v.suggest])].slice(0, 3);
      variantGaps.push({
        group: g.id,
        groupLabel: g.label,
        variant: v.id,
        label: v.label,
        why: v.why,
        suggest,
        doneInstead: [...(byGroupNames.get(g.id) ?? [])],
        lastHit: lastHit.get(`${g.id}:${v.id}`),
      });
    }
  }

  const next = GROUPS.map((g) => {
    const c = week.find((x) => x.group === g.id)!;
    return { group: g.id, label: g.label, recovery: groupReadiness(g, readiness), sets: c.sets, weeklyMin: g.weeklyMin };
  })
    .filter((x) => x.recovery >= 85 && x.sets < x.weeklyMin)
    .sort((a, b) => a.sets / a.weeklyMin - b.sets / b.weeklyMin || b.recovery - a.recovery)
    .slice(0, 4);

  return {
    weekStart,
    daysLeft,
    week,
    gaps,
    lastWeekMissed,
    variantGaps,
    next,
    readiness,
    joints: jointFlags(history, nutrition, today),
  };
}

// --------------------------------------------------------------- warnings --

/**
 * Warnings for the session in front of you: one per exercise at most, the
 * worse one first. Recovery under 70% is worth knowing; under 50% is worth
 * acting on. A joint that hurt in the last three days and that the lift
 * loads is always worth acting on.
 */
export function sessionWarnings(
  exercises: Pick<SessionExercise, "name" | "targetKeys">[],
  readiness: Record<string, MuscleReadiness>,
  joints: JointFlag[],
): Warning[] {
  const out: Warning[] = [];
  const seen = new Set<string>();
  for (const ex of exercises) {
    if (seen.has(ex.name)) continue;
    seen.add(ex.name);
    const j = joints.find((f) => f.daysAgo <= 3 && f.level >= 2 && loadsJoint(ex, f.joint));
    if (j) {
      out.push({
        kind: "joint",
        about: ex.name,
        level: 2,
        text: `${jointLabel(j.joint)} hurt ${j.daysAgo === 0 ? "today" : j.daysAgo === 1 ? "yesterday" : `${j.daysAgo} days ago`} (${j.source}). Go lighter, shorten the range, or swap it.`,
      });
      continue;
    }
    const k = ex.targetKeys?.[0];
    const r = k ? readiness[k] : undefined;
    if (r && r.lastWorkedHours != null && r.recovery < 70) {
      out.push({
        kind: "recovery",
        about: ex.name,
        level: r.recovery < 50 ? 2 : 1,
        text: `${r.label} is at ${r.recovery}% — worked ${r.lastWorkedHours}h ago, about ${r.hoursLeft}h to go.`,
      });
    }
  }
  return out.sort((a, b) => b.level - a.level);
}
