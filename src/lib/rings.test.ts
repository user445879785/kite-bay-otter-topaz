import assert from "node:assert/strict";
import { test } from "node:test";
import { closed, ringValues, share, targetShare } from "./rings.ts";
import type { NutritionDay } from "./types.ts";

const day = (cals: number, p: number) =>
  ({ items: [{ cals, p }], goals: { cals: 2400, protein: 160, water: 3500 } }) as unknown as NutritionDay;

test("the ring closes on the minimum, not the target", () => {
  // 130 g against a 160 g target with the default 80% floor (128 g): closed.
  const v = ringValues(day(2200, 130), null, 80);
  assert.equal(v.protein.min, 128);
  assert.equal(closed(v.protein), true);
  assert.ok(share(v.protein) >= 1);
  // 2200 kcal against a 2160 floor: closed too, although short of 2400.
  assert.equal(closed(v.cals), true);
  // Nothing drunk: open.
  assert.equal(closed(v.water), false);
});

test("the target sits past the closed ring, on lap two", () => {
  const v = ringValues(day(0, 0), null, 80);
  assert.equal(targetShare(v.protein), 1.25);
  // Burn has no gap: its floor is its target.
  assert.equal(targetShare(v.burnt), 1);
});

test("minimums are clamped to 50-100% of the target", () => {
  const v = ringValues(day(0, 0), null, 80, {}, { protein: 0.1, cals: 2 });
  assert.equal(v.protein.min, 80);
  assert.equal(v.cals.min, 2400);
});

test("an old value with no minimum still draws against its goal", () => {
  assert.equal(share({ value: 80, goal: 160, min: 0 }), 0.5);
});
