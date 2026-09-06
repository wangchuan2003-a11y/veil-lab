import test from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT,
  RULES,
  allocate,
  evaluate,
  gini,
  drawRole,
  validate,
  encode,
  decode,
  toJSON,
  fromJSON,
} from "../.test-build/model.js";
const close = (a, b) => assert.ok(Math.abs(a - b) < 1e-8, `${a} != ${b}`);
const total = (a) => a.reduce((x, y) => x + y, 0);
test("all rules conserve the budget and allocate nonnegative resources across boundary models", () => {
  for (let k = 0; k < 240; k++)
    for (const rule of RULES) {
      const m = {
        budget: k % 3 === 0 ? 0 : k % 3 === 1 ? 600 : k,
        needs: Array.from({ length: 6 }, (_, i) => 1 + ((k * 7 + i * 11) % 60)),
        returns: Array.from(
          { length: 6 },
          (_, i) => 0.2 + ((k + i * 7) % 29) / 10,
        ),
        rule,
        seed: k,
      };
      const a = allocate(m);
      assert.equal(a.length, 6);
      assert.ok(a.every((x) => x >= 0 && Number.isFinite(x)));
      close(total(a), m.budget);
    }
});
test("symmetric assumptions give equal allocations under every rule", () => {
  for (const rule of RULES) {
    const a = allocate({
      ...DEFAULT,
      rule,
      needs: Array(6).fill(20),
      returns: Array(6).fill(1),
    });
    a.forEach((x) => close(x, 30));
  }
});
test("basic needs are satisfied before equal surplus when the budget is sufficient", () => {
  const a = allocate({ ...DEFAULT, rule: "needs" });
  const surplus = a.map((x, i) => x - DEFAULT.needs[i]);
  assert.ok(surplus.every((x) => x >= 0));
  surplus.forEach((x) => close(x, surplus[0]));
  const r = evaluate({ ...DEFAULT, budget: 60, rule: "needs" });
  assert.ok(r.coverage.every((x) => x < 1));
  close(r.minCoverage, 60 / 140);
});
test("minimum coverage reaches the conservation upper bound", () => {
  const r = evaluate({ ...DEFAULT, rule: "floor" });
  close(r.minCoverage, DEFAULT.budget / total(DEFAULT.needs));
  r.coverage.forEach((x) => close(x, r.minCoverage));
});
test("total-return rule matches exhaustive integer allocations on a small budget", () => {
  const m = { ...DEFAULT, budget: 7, rule: "total" };
  let best = -Infinity;
  function enumerate(left, items) {
    if (items.length === 5) {
      const candidate = [...items, left];
      best = Math.max(best, total(candidate.map((x, i) => x * m.returns[i])));
      return;
    }
    for (let x = 0; x <= left; x++) enumerate(left - x, [...items, x]);
  }
  enumerate(7, []);
  close(evaluate(m).totalOutcome, best);
  const a = allocate({ ...m, returns: [2, 1, 2, 1, 1, 1] });
  close(a[0], 3.5);
  close(a[2], 3.5);
  assert.equal(a[1], 0);
});
test("zero resources do not imply a defined Gini or fulfilled needs", () => {
  for (const rule of RULES) {
    const r = evaluate({ ...DEFAULT, budget: 0, rule });
    assert.deepEqual(r.allocations, Array(6).fill(0));
    assert.equal(r.gini, null);
    assert.equal(r.minCoverage, 0);
    assert.equal(r.totalOutcome, 0);
    assert.equal(r.unmet, total(DEFAULT.needs));
  }
  close(gini([3, 3, 3, 3, 3, 3]), 0);
  close(gini([6, 0, 0, 0, 0, 0]), 5 / 6);
  assert.throws(() => gini([-1, 1]));
});
test("model functions do not mutate input", () => {
  const m = structuredClone(DEFAULT);
  Object.freeze(m.needs);
  Object.freeze(m.returns);
  Object.freeze(m);
  const before = JSON.stringify(m);
  for (const rule of RULES) allocate({ ...m, rule });
  evaluate(m);
  encode(m);
  assert.equal(JSON.stringify(m), before);
});
test("seeded roles are reproducible, bounded, and reach each position", () => {
  const counts = Array(6).fill(0);
  for (let seed = 0; seed < 6000; seed++) {
    const role = drawRole(seed);
    assert.equal(role, drawRole(seed));
    assert.ok(Number.isInteger(role) && role >= 0 && role < 6);
    counts[role]++;
  }
  counts.forEach((n) => assert.ok(n > 800 && n < 1200));
  assert.throws(() => drawRole(-1));
  assert.throws(() => drawRole(2 ** 32));
  assert.throws(() => drawRole(NaN));
});
test("full model settings round-trip through canonical URL and JSON", () => {
  for (const rule of RULES) {
    const m = { ...DEFAULT, rule, seed: 4294967295 };
    assert.deepEqual(decode(encode(m)), m);
    assert.deepEqual(fromJSON(toJSON(m)), m);
  }
  assert.equal(decode("#v1.%%%%"), null);
  assert.equal(decode(encode(DEFAULT) + "="), null);
  assert.equal(decode("x".repeat(5000)), null);
  assert.equal(fromJSON("not json"), null);
});
test("invalid and extended models are rejected without falling back silently", () => {
  for (const m of [
    { ...DEFAULT, budget: -1 },
    { ...DEFAULT, budget: 1.5 },
    { ...DEFAULT, budget: 601 },
    { ...DEFAULT, seed: -1 },
    { ...DEFAULT, needs: [0, 1, 2, 3, 4, 5] },
    { ...DEFAULT, returns: [1, 1, 1, 1, 1, Infinity] },
    { ...DEFAULT, rule: "rawls" },
    { ...DEFAULT, extra: true },
    { ...DEFAULT, needs: [10] },
  ]) {
    assert.equal(validate(m), false);
    assert.equal(fromJSON(JSON.stringify({ version: 1, model: m })), null);
    assert.throws(() => allocate(m));
  }
  assert.equal(fromJSON(JSON.stringify({ version: 2, model: DEFAULT })), null);
  assert.equal(
    fromJSON(JSON.stringify({ version: 1, model: DEFAULT, extra: 1 })),
    null,
  );
});
