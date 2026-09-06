export const SIZE = 6;
export const RULES = ["equal", "needs", "floor", "total"] as const;
export type Rule = (typeof RULES)[number];
export type Model = {
  budget: number;
  needs: number[];
  returns: number[];
  rule: Rule;
  seed: number;
};
export const DEFAULT: Model = {
  budget: 180,
  needs: [10, 15, 20, 25, 30, 40],
  returns: [0.8, 1.6, 1.2, 2, 0.6, 1],
  rule: "equal",
  seed: 42,
};
const sum = (values: number[]) => values.reduce((a, b) => a + b, 0);
const validNumber = (x: unknown, min: number, max: number) =>
  typeof x === "number" && Number.isFinite(x) && x >= min && x <= max;
function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
export function validate(value: unknown): value is Model {
  if (
    !record(value) ||
    Object.keys(value).sort().join(",") !== "budget,needs,returns,rule,seed"
  )
    return false;
  return (
    validNumber(value.budget, 0, 600) &&
    Number.isInteger(value.budget) &&
    validNumber(value.seed, 0, 0xffffffff) &&
    Number.isInteger(value.seed) &&
    RULES.includes(value.rule as Rule) &&
    Array.isArray(value.needs) &&
    value.needs.length === SIZE &&
    value.needs.every((n) => validNumber(n, 1, 60) && Number.isInteger(n)) &&
    Array.isArray(value.returns) &&
    value.returns.length === SIZE &&
    value.returns.every((n) => validNumber(n, 0.2, 3))
  );
}
export function allocate(model: Model): number[] {
  if (!validate(model)) throw new TypeError("Invalid experiment model");
  const { budget, needs, returns, rule } = model;
  const totalNeed = sum(needs);
  let result: number[];
  switch (rule) {
    case "equal":
      result = needs.map(() => budget / SIZE);
      break;
    case "needs":
      result =
        budget <= totalNeed
          ? needs.map((n) => (budget * n) / totalNeed)
          : needs.map((n) => n + (budget - totalNeed) / SIZE);
      break;
    case "floor":
      result = needs.map((n) => (budget * n) / totalNeed);
      break;
    case "total": {
      const best = Math.max(...returns);
      const winners = returns.filter((r) => r === best).length;
      result = returns.map((r) => (r === best ? budget / winners : 0));
      break;
    }
  }
  // Correct only floating-point residue on an allocated cell, never on a loser.
  const recipient = result.findIndex((x) => x > 0);
  if (recipient >= 0) result[recipient] += budget - sum(result);
  return result;
}
export function gini(values: number[]): number | null {
  if (!values.length || values.some((x) => !Number.isFinite(x) || x < 0))
    throw new TypeError("Nonnegative values required");
  const total = sum(values);
  if (total === 0) return null;
  let distance = 0;
  for (const a of values) for (const b of values) distance += Math.abs(a - b);
  return distance / (2 * values.length * total);
}
export function evaluate(model: Model) {
  const allocations = allocate(model);
  const coverage = allocations.map((a, i) => a / model.needs[i]);
  const outcomes = allocations.map((a, i) => a * model.returns[i]);
  return {
    allocations,
    coverage,
    outcomes,
    total: sum(allocations),
    minCoverage: Math.min(...coverage),
    gap: Math.max(...allocations) - Math.min(...allocations),
    gini: gini(allocations),
    totalOutcome: sum(outcomes),
    unmet: sum(model.needs.map((n, i) => Math.max(0, n - allocations[i]))),
  };
}
/** One deterministic pseudo-random draw; seed is experiment data, not identity. */
export function drawRole(seed: number): number {
  if (!Number.isInteger(seed) || seed < 0 || seed > 0xffffffff)
    throw new TypeError("Invalid seed");
  let t = (seed + 0x6d2b79f5) >>> 0;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return Math.floor((((t ^ (t >>> 14)) >>> 0) / 4294967296) * SIZE);
}
export function toJSON(model: Model): string {
  if (!validate(model)) throw new TypeError("Invalid experiment model");
  return JSON.stringify({ version: 1, model }, null, 2);
}
export function fromJSON(text: string): Model | null {
  if (typeof text !== "string" || text.length > 4000) return null;
  try {
    const value: unknown = JSON.parse(text);
    if (
      !record(value) ||
      Object.keys(value).sort().join(",") !== "model,version" ||
      value.version !== 1 ||
      !validate(value.model)
    )
      return null;
    return structuredClone(value.model);
  } catch {
    return null;
  }
}
export function encode(model: Model): string {
  return (
    "#v1." +
    btoa(JSON.stringify(JSON.parse(toJSON(model))))
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "")
  );
}
export function decode(hash: string): Model | null {
  if (
    typeof hash !== "string" ||
    hash.length > 4000 ||
    !/^#v1\.[A-Za-z0-9_-]+$/.test(hash)
  )
    return null;
  try {
    const body = hash.slice(4).replace(/-/g, "+").replace(/_/g, "/");
    const model = fromJSON(atob(body));
    return model && encode(model) === hash ? model : null;
  } catch {
    return null;
  }
}
