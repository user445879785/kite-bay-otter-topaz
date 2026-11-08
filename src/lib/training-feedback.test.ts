import assert from "node:assert/strict";
import { test } from "node:test";
import {
  activitySessions,
  confoundedByDay,
  isEmptyWrap,
  jointFlags,
  loadsJoint,
  strapsLikely,
  wrapSummary,
} from "./training-feedback.ts";
import { lastTimeFor } from "./last-time.ts";
import { SomaIntelligenceEngine } from "./soma/engine.ts";
import type { HistorySession, WorkoutSet } from "./types.ts";

const set = (weight: number, reps: number, extra: Partial<WorkoutSet> = {}): WorkoutSet =>
  ({ weight, reps, done: true, type: "normal", ...extra }) as WorkoutSet;

const session = (ex: Record<string, unknown>[], timestamp = 0): HistorySession =>
  ({ split: "Push", timestamp, exercises: ex, muscles: {} }) as unknown as HistorySession;

test("an empty wrap is no wrap", () => {
  assert.equal(isEmptyWrap(undefined), true);
  assert.equal(isEmptyWrap({}), true);
  assert.equal(isEmptyWrap({ note: "   " }), true);
  assert.equal(isEmptyWrap({ feel: 2 }), false);
  assert.equal(isEmptyWrap({ note: "pinch" }), false);
});

test("a bad day held back by the joint or the climb before is confounded; the muscle giving out is not", () => {
  assert.equal(confoundedByDay({ feel: 1, held: ["joint"] }), true);
  assert.equal(confoundedByDay({ feel: 2, held: ["carried"] }), true);
  assert.equal(confoundedByDay({ feel: 1, held: ["muscle"] }), false);
  // Strong despite a niggle: it still measured the lift.
  assert.equal(confoundedByDay({ feel: 3, held: ["joint"] }), false);
  assert.equal(confoundedByDay(undefined), false);
});

test("summary reads as one line", () => {
  assert.equal(
    wrapSummary({ feel: 1, held: ["joint", "carried"], painAt: ["shoulder"] }, true),
    "Off · Joint pain (Shoulder) · Tired from before · straps",
  );
});

test("straps are asked on pulls and hinges, not on presses", () => {
  assert.equal(strapsLikely({ name: "Barbell Row", targetKeys: [] }), true);
  assert.equal(strapsLikely({ name: "Romanian Deadlift", targetKeys: [] }), true);
  assert.equal(strapsLikely({ name: "Bench Press", targetKeys: ["chest"] }), false);
});

test("a joint is loaded by what the lift is for, not by its passengers", () => {
  assert.equal(loadsJoint({ name: "Lateral Raise", targetKeys: ["deltoids"] }, "shoulder"), true);
  // Bench lists triceps; that does not make it an elbow-first lift by key,
  // but the name ("press") does, which is the honest answer.
  assert.equal(loadsJoint({ name: "Leg Curl", targetKeys: ["hamstring"] }, "shoulder"), false);
});

test("a climb becomes forearm and back stimulus for recovery, inside the lookback only", () => {
  const now = new Date(2026, 10, 8, 12).getTime();
  const out = activitySessions(
    {
      "2026-11-07": { activities: [{ id: "climbing", hours: 3, effort: 3 }] },
      "2026-10-20": { activities: [{ id: "climbing", hours: 3, effort: 3 }] },
    },
    now,
  );
  const keys = Object.keys(out);
  assert.deepEqual(keys, ["activity:2026-11-07:0"]);
  const m = out[keys[0]!]!.muscles;
  // 6 sets/h × 3h × (0.6 + 0.6) = 21.6 — a three-hour climb is a lot of forearm.
  assert.equal(m.forearm!.sets, 21.6);
  assert.equal(m.forearm!.avgFail, 5);
  assert.ok(m.upper_back!.sets > 0);
  assert.equal(m.quadriceps, undefined);
});

test("joint flags merge wraps, pain-ended sets and logged aches, worst first", () => {
  const history = {
    "2026-11-08": session([
      { name: "Bench Press", wrap: { feel: 1, held: ["joint"], painAt: ["shoulder"] }, sets: [] },
    ]),
    "2026-11-05": session([{ name: "Skullcrusher", sets: [set(30, 8, { limiter: "pain", painAt: ["elbow"] })] }]),
  };
  const flags = jointFlags(history, { "2026-11-08": { aches: [{ where: "forearm", level: 1 }] } }, "2026-11-08");
  assert.deepEqual(
    flags.map((f) => [f.joint, f.level, f.daysAgo]),
    [
      ["shoulder", 3, 0],
      ["elbow", 3, 3],
      ["forearm", 1, 0],
    ],
  );
  // Outside the window it is forgotten.
  assert.equal(jointFlags(history, {}, "2026-11-30").length, 0);
});

test("last time skips a day pain held back, and says it did", () => {
  const h = {
    "2026-11-01": session([{ name: "Bench Press", sets: [set(80, 8)] }]),
    "2026-11-08": session([
      { name: "Bench Press", wrap: { feel: 1, held: ["joint"], painAt: ["shoulder"] }, sets: [set(60, 5)] },
    ]),
  };
  const last = lastTimeFor(h, "Bench Press");
  assert.equal(last?.date, "2026-11-01");
  assert.equal(last?.skippedBadDay, "2026-11-08");
  // With nothing cleaner, the bad day is still better than nothing.
  const only = lastTimeFor({ "2026-11-08": h["2026-11-08"] }, "Bench Press");
  assert.equal(only?.date, "2026-11-08");
});

test("the strength trend ignores a pain day instead of calling it a stall", () => {
  const ex = (w: number, wrap?: object) => [{ name: "Bench Press", sets: [set(w, 8)], ...(wrap ? { wrap } : {}) }];
  const h = {
    a: session(ex(70), 1),
    b: session(ex(75), 2),
    c: session(ex(50, { feel: 1, held: ["joint"] }), 3),
  };
  const t = SomaIntelligenceEngine.computeVolumeTrend(h, "Bench Press");
  assert.equal(t.points.length, 2);
  assert.equal(t.stalled, false);
});
