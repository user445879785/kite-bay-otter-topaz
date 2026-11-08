/**
 * The day's four rings, for any date: calories and protein eaten, water
 * drunk, calories burnt training — each against its goal.
 *
 * Pulled out of the Home card so the week strip and the calendar can draw
 * the same rings for other days. Confirmed food only, as everywhere else: a
 * planned meal is not food yet.
 */
import { DEFAULT_GOALS } from "./soma/data.ts";
import { totalWaterMl } from "./hydration.ts";
import { sessionBurn } from "./training-burn.ts";
import type { HistorySession, NutritionDay } from "./types.ts";

export type RingId = "cals" | "protein" | "water" | "burnt";

export interface RingDef {
  id: RingId;
  label: string;
  unit: string;
  /** Start and end of the ring's gradient, as the watch draws it. */
  from: string;
  to: string;
}

/** Outer to inner. */
export const RING_DEFS: RingDef[] = [
  // Vivid, as the watch draws them: a deep start running to a bright end.
  { id: "cals", label: "Calories", unit: "CAL", from: "#fa114f", to: "#ff4fa0" },
  { id: "protein", label: "Protein", unit: "G", from: "#7dff00", to: "#d8ff2e" },
  { id: "water", label: "Water", unit: "ML", from: "#00d8ff", to: "#3dffe8" },
  { id: "burnt", label: "Burned", unit: "CAL", from: "#ff6a00", to: "#ffc000" },
];

/** What a day of training is meant to cost, when nothing else says. */
export const BURN_TARGET = 500;

/**
 * Each ring's minimum, as a share of its target.
 *
 * The full circle is the MINIMUM, not the target. A week of rings stuck at
 * 90% because the target sits a little above what a decent day reaches reads
 * as seven failures, and that is what made the rings demotivating rather than
 * useful: the floor was met every day and nothing said so. So the ring
 * closes, and glows, on the floor; the target is a tick further round, on the
 * second lap, for the days there is room to push.
 *
 * Burn stays at 1: its "target" is already a modest floor, and a rest day is
 * meant to leave it open.
 */
export type RingMins = Partial<Record<RingId, number>>;

export const DEFAULT_RING_MINS: Record<RingId, number> = { cals: 0.9, protein: 0.8, water: 0.75, burnt: 1 };

/** A minimum share outside 50-100% of the target is not a minimum. */
const clampMin = (f: number | undefined, d: number) =>
  typeof f === "number" && Number.isFinite(f) ? Math.min(1, Math.max(0.5, f)) : d;

export interface RingValue {
  value: number;
  /** The target. */
  goal: number;
  /** The floor that closes the ring. Equal to `goal` when no minimum applies. */
  min: number;
}

export function ringValues(
  day: NutritionDay | undefined,
  session: HistorySession | undefined | null,
  bodyweight: number,
  fallback: Partial<Record<"cals" | "protein" | "water", number>> = {},
  mins: RingMins = {},
): Record<RingId, RingValue> {
  const eaten = day?.items ?? [];
  const goals = { ...DEFAULT_GOALS, ...fallback, ...(day?.goals ?? {}) } as Record<string, number>;
  const ring = (id: RingId, value: number, goal: number): RingValue => ({
    value,
    goal,
    min: Math.round(goal * clampMin(mins[id], DEFAULT_RING_MINS[id])),
  });
  return {
    cals: ring("cals", eaten.reduce((a, i) => a + (i.cals || 0), 0), goals.cals || 2400),
    protein: ring("protein", eaten.reduce((a, i) => a + (i.p || 0), 0), goals.protein || 160),
    water: ring("water", totalWaterMl(day), goals.water || 3500),
    burnt: ring("burnt", sessionBurn(session, bodyweight || undefined).gross, BURN_TARGET),
  };
}

/** The floor a ring closes on; the target when an old value carries no minimum. */
const floorOf = (v: RingValue) => (v.min > 0 ? v.min : v.goal);

/** Share of the MINIMUM reached, 0 upwards: 1 is a closed ring, past 1 laps. */
export function share(v: RingValue): number {
  const f = floorOf(v);
  return f > 0 ? Math.max(0, v.value / f) : 0;
}

/** Whether the floor was met: the ring is closed and glows. */
export function closed(v: RingValue): boolean {
  return floorOf(v) > 0 && v.value >= floorOf(v);
}

/** Where the target sits on the ring, in the same units as `share`: 1.25 is a quarter into lap two. */
export function targetShare(v: RingValue): number {
  const f = floorOf(v);
  return f > 0 ? v.goal / f : 1;
}

/** Latest weighed bodyweight, for the burn model. */
export function latestWeight(nutrition: Record<string, { bodyWeight?: number } | undefined>): number {
  const dated = Object.keys(nutrition ?? {}).filter((k) => nutrition[k]?.bodyWeight).sort();
  return dated.length ? nutrition[dated[dated.length - 1]!]!.bodyWeight ?? 0 : 0;
}
