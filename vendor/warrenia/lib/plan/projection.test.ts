import { describe, expect, it } from "vitest";

import { defaultChoices, normaliseChoices } from "./catalog";
import { planMix, portfolioStats, project } from "./projection";

describe("wealth projection", () => {
  it("maps targets and chosen products to asset classes", () => {
    const mix = planMix({ core: 0.75, gold: 0.1, momentum: 0.15, cash: 0 }, defaultChoices());
    const w = Object.fromEntries(mix.map((m) => [m.cls, m.weight]));
    expect(w).toEqual({ world: 0.75, gold: 0.1, momentum: 0.15 });
    const c = normaliseChoices({ gold: [{ isin: "IE00B4ND3602", weight: 1 }, { isin: "LU1650487413", weight: 1 }] });
    const w2 = Object.fromEntries(planMix({ core: 0.7, gold: 0.1, momentum: 0.1, cash: 0.1 }, c).map((m) => [m.cls, m.weight]));
    expect(w2.gold).toBeCloseTo(0.05);
    expect(w2.bonds).toBeCloseTo(0.05);
    expect(w2.cash).toBeCloseTo(0.1);
  });

  it("an all-stock world mix keeps its assumptions; diversifiers lower the swings", () => {
    const one = portfolioStats([{ cls: "world", weight: 1 }]);
    expect(one.real).toBeCloseTo(0.045, 6);
    expect(one.vol).toBeCloseTo(0.16, 6);
    const plan = portfolioStats(planMix({ core: 0.75, gold: 0.1, momentum: 0.15, cash: 0 }, defaultChoices()));
    expect(plan.vol).toBeLessThan(0.16);
    expect(plan.real).toBeGreaterThan(0.035);
    expect(plan.real).toBeLessThan(0.045);
  });

  it("with no volatility the median is the plain compound sum", () => {
    const p = project({ start: 1000, monthly: 100, years: 10, real: 0.03, vol: 0, paths: 50 });
    let v = 1000;
    const g = Math.pow(1.03, 1 / 12);
    for (let i = 0; i < 120; i++) v = (v + 100) * g;
    expect(p.p50[10]).toBeCloseTo(v, 6);
    expect(p.p10[10]).toBeCloseTo(v, 6);
    expect(p.contributed[10]).toBe(1000 + 12_000);
    expect(p.lossChance).toBe(0);
  });

  it("is reproducible, ordered and the chance of losing falls with time", () => {
    const a = project({ start: 5000, monthly: 450, years: 30, real: 0.04, vol: 0.14 });
    const b = project({ start: 5000, monthly: 450, years: 30, real: 0.04, vol: 0.14 });
    expect(a).toEqual(b);
    for (let y = 1; y <= 30; y++) {
      expect(a.p10[y]).toBeLessThan(a.p50[y]);
      expect(a.p50[y]).toBeLessThan(a.p90[y]);
    }
    const short = project({ start: 5000, monthly: 450, years: 3, real: 0.04, vol: 0.14 });
    expect(a.lossChance).toBeLessThan(short.lossChance);
    // Median of a 4% real mix over 30 years is well above what was put in.
    expect(a.p50[30]).toBeGreaterThan(a.contributed[30] * 1.4);
  });
});
