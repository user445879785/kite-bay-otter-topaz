/**
 * How an exercise actually went, and what the body brought in with it.
 *
 * The set sheet answers "what ended this set". That is the right question for
 * a good day and the wrong one for a bad day: when every lift fails because a
 * shoulder hurts, or because the forearms are still cooked from climbing the
 * day before, the honest answer is not "target muscle" or "form", and the log
 * reads as a strength drop that never happened.
 *
 * So three things are recorded here, all optional and all one tap:
 *
 *  - an exercise's **wrap**: how it went, what held it back, a note, straps;
 *  - **pain** at a joint, from a set, an exercise or the day itself;
 *  - **outside activity** (a climb, a hike, a match) that loaded muscles the
 *    gym never saw, so recovery stops treating them as fresh.
 *
 * Pure: no store, no React. The UI and the smart-training brief both read it.
 */
import type { HistorySession, SessionExercise } from "./types";

// -------------------------------------------------------------------- joints --

export type JointId =
  | "shoulder"
  | "elbow"
  | "wrist"
  | "forearm"
  | "lower_back"
  | "hip"
  | "knee"
  | "neck";

export interface JointDef {
  id: JointId;
  label: string;
  /** Muscle keys whose lifts put this joint under load. */
  keys: string[];
  /** Lifts that load it whatever muscle they are filed under. */
  names?: RegExp;
}

export const JOINTS: JointDef[] = [
  {
    id: "shoulder",
    label: "Shoulder",
    keys: ["deltoids", "deltoids_back", "chest"],
    names: /press|dip|fly|raise|pull ?up|chin ?up|pulldown|push ?up|bench|overhead|skull|pullover/i,
  },
  {
    id: "elbow",
    label: "Elbow",
    keys: ["triceps", "triceps_back", "biceps"],
    names: /curl|extension|skull|pushdown|press|dip|chin ?up|pull ?up/i,
  },
  { id: "wrist", label: "Wrist", keys: ["forearm", "forearm_back"], names: /curl|press|push ?up|front squat/i },
  {
    id: "forearm",
    label: "Forearms",
    keys: ["forearm", "forearm_back", "biceps"],
    names: /row|pull ?up|chin ?up|pulldown|deadlift|shrug|curl|carry|hang/i,
  },
  { id: "lower_back", label: "Lower back", keys: ["lower_back"], names: /deadlift|squat|row|good ?morning|rdl|hinge/i },
  { id: "hip", label: "Hip", keys: ["gluteal", "adductors", "adductors_back"], names: /squat|lunge|deadlift|thrust|split/i },
  { id: "knee", label: "Knee", keys: ["quadriceps"], names: /squat|lunge|leg press|extension|split|step ?up/i },
  { id: "neck", label: "Neck", keys: ["neck", "trapezius", "trapezius_back"], names: /neck|shrug/i },
];

export const jointLabel = (id: string) => JOINTS.find((j) => j.id === id)?.label ?? id;

/** Whether a lift puts a joint under load. Name first, then the muscles it is filed under. */
export function loadsJoint(ex: Pick<SessionExercise, "name" | "targetKeys">, joint: JointId): boolean {
  const def = JOINTS.find((j) => j.id === joint);
  if (!def) return false;
  if (def.names?.test(ex.name)) return true;
  const keys = ex.targetKeys ?? [];
  // Only the first key is what the lift is FOR; the rest are passengers. A
  // bench press lists triceps, which is not a reason to call it an elbow lift.
  return keys.length > 0 && def.keys.includes(keys[0]!);
}

// ---------------------------------------------------------------- the wrap --

/** How an exercise went, in one tap. */
export type Feel = 1 | 2 | 3; // off, ok, strong

export const FEELS: { id: Feel; label: string; emoji: string }[] = [
  { id: 1, label: "Off", emoji: "😣" },
  { id: 2, label: "OK", emoji: "😐" },
  { id: 3, label: "Strong", emoji: "💪" },
];

/** What held the exercise back. Several can be true at once. */
export type HeldBy =
  | "muscle" // the target gave out: a good day, not a problem
  | "joint" // pain somewhere: see painAt
  | "grip" // forearms or grip went before the muscle
  | "carried" // tired from something before (a climb, yesterday's session)
  | "energy" // sleep, food, stress
  | "form"; // technique broke

export const HELD_BY: { id: HeldBy; label: string }[] = [
  { id: "muscle", label: "Target muscle" },
  { id: "joint", label: "Joint pain" },
  { id: "grip", label: "Grip / forearms" },
  { id: "carried", label: "Tired from before" },
  { id: "energy", label: "Low energy" },
  { id: "form", label: "Form" },
];

export interface ExerciseWrap {
  feel?: Feel;
  held?: HeldBy[];
  /** Where it hurt, when `held` includes "joint". */
  painAt?: JointId[];
  note?: string;
  /** When it was answered (epoch ms). */
  at?: number;
}

/** True when nothing has been answered: an empty wrap is no wrap. */
export function isEmptyWrap(w: ExerciseWrap | undefined): boolean {
  if (!w) return true;
  return !w.feel && !(w.held?.length) && !(w.painAt?.length) && !w.note?.trim();
}

/**
 * Whether a bad exercise should count against the strength trend.
 *
 * An exercise that went badly because of pain, carried fatigue or energy did
 * not measure the muscle; it measured the day. Progression should not read it
 * as a stall or a regression.
 */
export function confoundedByDay(w: ExerciseWrap | undefined): boolean {
  if (!w || w.feel === 3) return false;
  return (w.held ?? []).some((h) => h === "joint" || h === "carried" || h === "energy");
}

/** One line for the card once a wrap is filled in: "Off · Joint pain (Shoulder) · straps". */
export function wrapSummary(w: ExerciseWrap | undefined, straps?: boolean): string {
  const parts: string[] = [];
  if (w?.feel) parts.push(FEELS.find((f) => f.id === w.feel)!.label);
  for (const h of w?.held ?? []) {
    const label = HELD_BY.find((x) => x.id === h)?.label ?? h;
    if (h === "joint" && w?.painAt?.length) parts.push(`${label} (${w.painAt.map(jointLabel).join(", ")})`);
    else parts.push(label);
  }
  if (straps) parts.push("straps");
  return parts.join(" · ");
}

/** Lifts where straps are the common question: pulls, hinges, shrugs. */
export function strapsLikely(ex: Pick<SessionExercise, "name" | "targetKeys">): boolean {
  if (/row|pull ?up|chin ?up|pulldown|deadlift|rdl|shrug|rack pull|pullover|face pull/i.test(ex.name)) return true;
  const k = ex.targetKeys?.[0];
  return k === "upper_back" || k === "trapezius_back" || k === "lower_back";
}

// -------------------------------------------------------- outside activity --

export type ActivityId = "climbing" | "hiking" | "running" | "football" | "swimming" | "cycling" | "combat";

export interface ActivityDef {
  id: ActivityId;
  label: string;
  emoji: string;
  /** Muscles it taxes, and roughly how many hard working sets an hour is worth. */
  load: Record<string, number>;
  /** Joints it is hard on, for the warning after. */
  joints?: JointId[];
}

/**
 * Set-equivalents per hour. Rough by nature: the point is that a three-hour
 * climb is not zero sets of forearm and back work, which is what the recovery
 * map believed until now.
 */
export const ACTIVITIES: ActivityDef[] = [
  {
    id: "climbing",
    label: "Climbing",
    emoji: "🧗",
    load: { forearm: 6, forearm_back: 6, upper_back: 4, biceps: 3, deltoids_back: 2, trapezius_back: 2, deltoids: 1 },
    joints: ["shoulder", "elbow", "forearm"],
  },
  {
    id: "hiking",
    label: "Hike",
    emoji: "🥾",
    load: { quadriceps: 3, calves: 3, calves_back: 3, gluteal: 2, hamstring: 1 },
    joints: ["knee"],
  },
  { id: "running", label: "Run", emoji: "🏃", load: { quadriceps: 2, calves: 3, calves_back: 3, hamstring: 2 }, joints: ["knee"] },
  { id: "football", label: "Football", emoji: "⚽", load: { quadriceps: 3, hamstring: 3, calves: 2, calves_back: 2, adductors: 2 }, joints: ["knee", "hip"] },
  { id: "swimming", label: "Swim", emoji: "🏊", load: { upper_back: 3, deltoids: 2, deltoids_back: 2, triceps_back: 1 }, joints: ["shoulder"] },
  { id: "cycling", label: "Ride", emoji: "🚴", load: { quadriceps: 3, gluteal: 1, calves: 1 } },
  { id: "combat", label: "Combat", emoji: "🥊", load: { deltoids: 2, abs: 2, obliques: 2, calves: 1, forearm: 1 }, joints: ["wrist", "shoulder"] },
];

export interface OutsideActivity {
  id: ActivityId;
  /** Hours, 0.5 steps. */
  hours: number;
  /** 1 easy, 2 normal, 3 hard. */
  effort: 1 | 2 | 3;
  /** When it ended (epoch ms). Defaults to the evening of its day. */
  at?: number;
}

export interface Ache {
  where: JointId;
  /** 1 niggle, 2 sore, 3 hurts. */
  level: 1 | 2 | 3;
  note?: string;
}

/** Day fields this file reads. Optional on NutritionDay; see types.ts. */
export interface DayWithBody {
  activities?: OutsideActivity[];
  aches?: Ache[];
}

/** Evening of a date key, local time: when an activity with no time is assumed to have ended. */
function eveningOf(dateKey: string): number {
  const [y, m, d] = dateKey.split("-").map(Number);
  return new Date(y!, (m ?? 1) - 1, d ?? 1, 18, 0, 0).getTime();
}

/**
 * Outside activities as session-shaped stimulus, for the recovery model.
 *
 * The recovery map reads `HistorySession.muscles`, so an activity becomes a
 * pseudo-session there. It is never written into `history` — the volume
 * report, the burn and the PR detector must not see a climb as a gym session.
 */
export function activitySessions(
  nutrition: Record<string, DayWithBody | undefined>,
  now = Date.now(),
  lookbackDays = 5,
): Record<string, HistorySession> {
  const out: Record<string, HistorySession> = {};
  const from = now - lookbackDays * 86400000;
  for (const [date, day] of Object.entries(nutrition ?? {})) {
    for (const [i, a] of (day?.activities ?? []).entries()) {
      const def = ACTIVITIES.find((x) => x.id === a.id);
      if (!def) continue;
      const at = a.at ?? eveningOf(date);
      if (at < from || at > now) continue;
      const muscles: HistorySession["muscles"] = {};
      for (const [k, perHour] of Object.entries(def.load)) {
        muscles[k] = {
          sets: Math.round(perHour * Math.max(0.5, a.hours) * (0.6 + 0.2 * a.effort) * 10) / 10,
          // Effort maps onto the 1-5 failure scale the recovery model expects.
          avgFail: 2 + a.effort,
        };
      }
      out[`activity:${date}:${i}`] = {
        timestamp: at,
        split: def.label,
        durationFormatted: `${a.hours}h`,
        caloriesBurned: 0,
        totalVol: 0,
        totalSets: 0,
        axialVol: 0,
        exercises: [],
        muscles,
      };
    }
  }
  return out;
}

// --------------------------------------------------------------- pain flags --

export interface JointFlag {
  joint: JointId;
  /** Days since it was last reported, 0 = today. */
  daysAgo: number;
  /** What reported it: "Bench Press", "Climbing", "Logged ache". */
  source: string;
  /** 1-3, the worst reported in the window. */
  level: 1 | 2 | 3;
}

const dayDiff = (a: string, b: string) => {
  const [ay, am, ad] = a.split("-").map(Number);
  const [by, bm, bd] = b.split("-").map(Number);
  return Math.round((Date.UTC(by!, bm! - 1, bd!) - Date.UTC(ay!, am! - 1, ad!)) / 86400000);
};

/**
 * Joints that hurt recently, worst and most recent first.
 *
 * Read from three places: a set ended by pain, an exercise wrap that named a
 * joint, and an ache logged on the day. Activities add a level-1 flag on the
 * joints they are hard on only when an ache was ALSO logged there — a climb
 * alone is not pain, it is load, and the recovery map already carries load.
 */
export function jointFlags(
  history: Record<string, HistorySession>,
  nutrition: Record<string, DayWithBody | undefined>,
  today: string,
  windowDays = 7,
): JointFlag[] {
  const best = new Map<JointId, JointFlag>();
  const note = (joint: JointId, date: string, source: string, level: 1 | 2 | 3) => {
    const daysAgo = dayDiff(date, today);
    if (daysAgo < 0 || daysAgo > windowDays) return;
    const prev = best.get(joint);
    if (!prev || daysAgo < prev.daysAgo || (daysAgo === prev.daysAgo && level > prev.level)) {
      best.set(joint, { joint, daysAgo, source, level: prev ? (Math.max(prev.level, level) as 1 | 2 | 3) : level });
    } else if (level > prev.level) {
      prev.level = level;
    }
  };

  for (const [date, s] of Object.entries(history ?? {})) {
    for (const ex of s.exercises ?? []) {
      for (const j of ex.wrap?.painAt ?? []) note(j, date, ex.name, ex.wrap?.feel === 1 ? 3 : 2);
      for (const set of ex.sets ?? []) {
        if (set.limiter === "pain") for (const j of set.painAt ?? []) note(j as JointId, date, ex.name, 3);
      }
    }
  }
  for (const [date, d] of Object.entries(nutrition ?? {})) {
    for (const a of d?.aches ?? []) note(a.where, date, "Logged ache", a.level);
  }

  return [...best.values()].sort((a, b) => b.level - a.level || a.daysAgo - b.daysAgo);
}
