import assert from "node:assert/strict";
import { test } from "node:test";
import { coverage, groupsOf, mondayOf, sessionWarnings, smartBrief, variantsOf } from "./smart-training.ts";
import type { HistorySession } from "./types.ts";

const sets = (n: number) => Array.from({ length: n }, () => ({ weight: 20, reps: 10, done: true, type: "normal" }));
const ex = (name: string, targetKeys: string[], n = 3, extra: Record<string, unknown> = {}) => ({
  name,
  targetKeys,
  sets: sets(n),
  ...extra,
});
const session = (exercises: unknown[], timestamp: number, muscles: Record<string, { sets: number; avgFail: number }> = {}) =>
  ({ split: "x", timestamp, exercises, muscles }) as unknown as HistorySession;

test("variants are credited to the group the lift is for", () => {
  assert.deepEqual(variantsOf({ name: "Cable Triceps Pushdown (Straight/V)", targetKeys: ["triceps", "triceps_back"] }), [
    { group: "triceps", variant: "lateral" },
  ]);
  // Says "overhead" and lists triceps, but it is a shoulder press.
  assert.deepEqual(
    variantsOf({ name: "Standing Overhead Press (OHP)", targetKeys: ["deltoids", "triceps", "triceps_back"] }).map((v) => v.group),
    ["shoulders"],
  );
  // A skullcrusher's "long head" is not the biceps' long head.
  assert.ok(!variantsOf({ name: "Floor-Reset Skullcrusher", targetKeys: ["triceps"] }).some((v) => v.group === "biceps"));
  // A split squat is filed under glutes first, which owns no group: still quads.
  assert.ok(groupsOf({ name: "Bulgarian Split Squat", targetKeys: ["gluteal", "quadriceps"] }).includes("quads"));
  // Seated calf raise is soleus, not gastrocnemius.
  assert.deepEqual(
    variantsOf({ name: "Seated Calf Raise Machine", targetKeys: ["calves"] }).map((v) => v.variant),
    ["soleus"],
  );
});

test("Monday is the start of the week", () => {
  assert.equal(mondayOf("2026-11-08"), "2026-11-02"); // a Sunday
  assert.equal(mondayOf("2026-11-02"), "2026-11-02");
});

test("coverage counts done working sets, not warm-ups", () => {
  const h = {
    "2026-11-03": session(
      [
        ex("Flat Dumbbell Press", ["chest"], 3),
        { name: "Flat Dumbbell Press", targetKeys: ["chest"], sets: [{ done: true, type: "warmup" }, { done: false, type: "normal" }] },
      ],
      0,
    ),
  };
  const c = coverage(h, "2026-11-02", "2026-11-08").find((x) => x.group === "chest")!;
  assert.equal(c.sets, 3);
  assert.deepEqual(c.missing, ["upper"]);
});

test("pushdowns only: the brief asks for the long head next time", () => {
  const now = new Date(2026, 10, 6, 12).getTime(); // Friday
  const h = {
    "2026-11-03": session([ex("Cable Triceps Pushdown (Straight/V)", ["triceps", "triceps_back"], 4)], now - 3 * 86400000),
    "2026-10-20": session([ex("Standing Low Pulley Overhead Tricep Extension", ["triceps", "triceps_back"], 3)], now - 17 * 86400000),
  };
  const b = smartBrief({ history: h, nutrition: {}, today: "2026-11-06", now });
  const gap = b.variantGaps.find((g) => g.group === "triceps" && g.variant === "long")!;
  assert.ok(gap, "long head gap");
  // The one you have done before comes first.
  assert.equal(gap.suggest[0], "Standing Low Pulley Overhead Tricep Extension");
  assert.equal(gap.lastHit, "2026-10-20");
  assert.deepEqual(gap.doneInstead, ["Cable Triceps Pushdown (Straight/V)"]);
});

test("late in the week, an untrained group is a miss; early in the week it is not yet", () => {
  const h = { "2026-11-03": session([ex("Flat Dumbbell Press", ["chest"], 4)], 0) };
  const fri = smartBrief({ history: h, nutrition: {}, today: "2026-11-06", now: new Date(2026, 10, 6).getTime() });
  assert.ok(fri.gaps.some((g) => g.group === "hamstrings" && g.kind === "missed"));
  assert.ok(!fri.gaps.some((g) => g.group === "chest"));
  const tue = smartBrief({ history: h, nutrition: {}, today: "2026-11-03", now: new Date(2026, 10, 3).getTime() });
  assert.equal(tue.gaps.length, 0);
});

test("last week's misses are the review on Monday", () => {
  const h = { "2026-10-28": session([ex("Flat Dumbbell Press", ["chest"], 4)], 0) };
  const b = smartBrief({ history: h, nutrition: {}, today: "2026-11-02", now: new Date(2026, 10, 2).getTime() });
  assert.ok(b.lastWeekMissed.includes("Back"));
  assert.ok(!b.lastWeekMissed.includes("Chest"));
});

test("a climb yesterday makes a pull lift a recovery warning; a sore shoulder flags the press", () => {
  const now = new Date(2026, 10, 8, 10).getTime();
  const nutrition = {
    "2026-11-07": { activities: [{ id: "climbing" as const, hours: 4, effort: 3 as const }], aches: [{ where: "shoulder" as const, level: 2 as const }] },
  };
  const b = smartBrief({ history: {}, nutrition, today: "2026-11-08", now });
  assert.ok(b.readiness.forearm!.recovery < 70);
  const w = sessionWarnings(
    [
      { name: "Machine Shoulder Press", targetKeys: ["deltoids"] },
      { name: "Hammer Curl (Dumbbell/Cable)", targetKeys: ["forearm"] },
      { name: "Leg Extensions", targetKeys: ["quadriceps"] },
    ],
    b.readiness,
    b.joints,
  );
  assert.equal(w[0]!.kind, "joint");
  assert.equal(w[0]!.about, "Machine Shoulder Press");
  assert.ok(w.some((x) => x.kind === "recovery" && x.about.startsWith("Hammer")));
  assert.ok(!w.some((x) => x.about === "Leg Extensions"));
});

test("next: ready and behind first", () => {
  const now = new Date(2026, 10, 5, 12).getTime();
  const h = {
    "2026-11-04": session([ex("Flat Dumbbell Press", ["chest"], 4)], now - 86400000, { chest: { sets: 4, avgFail: 4 } }),
  };
  const b = smartBrief({ history: h, nutrition: {}, today: "2026-11-05", now });
  assert.ok(!b.next.some((n) => n.group === "chest"), "chest is not recovered");
  assert.ok(b.next.length > 0 && b.next.every((n) => n.sets === 0));
});
