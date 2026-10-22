import { describe, expect, it } from "vitest";

import { applyRadar, DEFAULT_FILTERS, etfGroup, hasActions, holdLabel, PRESETS, relReturn } from "./radar";
import type { RadarRow } from "./types";

function row(p: Partial<RadarRow>): RadarRow {
  return {
    t: "X", n: "X Corp", cls: "stock", ex: "XNAS", sec: "Technology", mcap: 1e10, px: 10, d1: 0, r1m: 0.01, r3m: 0.05, r6m: 0.1, r12m: 0.2,
    ytd: 0.1, r12_1: 0.18, vol: 0.3, atr: 0.02, mdd: 0.1, dd: 0.02, beta: 1, d52: 0.01, adv: 5e7, rvol: 1, s50: 0.03, s200: 0.1,
    m: 50, tq: 50, a: 50, rk: 50, ov: 50, rank: 1, dr: 0, dm: 0, lead: 0, secrel: 0, st: "neutral", pst: null, tags: [], why: [], flags: [],
    bo: false, h52: false, act: "none", hold: true, pe: 20, prof: true, ...p,
  };
}

const ctx = { horizon: "r6m" as const, bench: { SPY: { r1m: 0, r3m: 0, r6m: 0.05, r12m: 0.1 } }, benchmark: "SPY", held: new Set<string>(), watch: new Set<string>() };

describe("radar queries", () => {
  const rows = [
    row({ t: "A", rank: 1, m: 95, a: 40, rk: 70, ov: 99, act: "wait" }),
    row({ t: "B", rank: 2, m: 85, a: 90, rk: 20, ov: 95, dr: 30, act: "candidate", prof: null }),
    row({ t: "C", rank: 3, m: 75, a: 10, rk: 30, ov: 90, st: "weakening", dm: -25 }),
    row({ t: "D", rank: 4, m: 30, a: 99, rk: 10, ov: 40, bo: true }),
    row({ t: "E", rank: 5, cls: "etf", m: 99, ov: 99 }),
  ];
  const run = (key: string, f = DEFAULT_FILTERS) => {
    const p = PRESETS.find((x) => x.key === key)!;
    return applyRadar(rows, f, p, p.sort, ctx).map((r) => r.t);
  };

  it("full ranking keeps the engine order and separates classes", () => {
    expect(run("all")).toEqual(["A", "B", "C", "D"]);
    expect(run("all", { ...DEFAULT_FILTERS, cls: "etf" })).toEqual(["E"]);
  });
  it("'para comprar' shows only candidates and 'esperar' only overheated leaders", () => {
    expect(run("buy")).toEqual(["B"]);
    expect(run("wait")).toEqual(["A"]);
  });
  it("action and profitability filters", () => {
    expect(run("all", { ...DEFAULT_FILTERS, actions: ["wait", "candidate"] })).toEqual(["A", "B"]);
    expect(run("all", { ...DEFAULT_FILTERS, onlyProfitable: true })).toEqual(["A", "C", "D"]);
  });
  it("hold verdict and legacy artifacts", () => {
    expect(holdLabel({ hold: true }).text).toBe("Keep");
    expect(holdLabel({ hold: false }).text).toBe("Consider selling");
    expect(hasActions(rows)).toBe(true);
    expect(hasActions([{ ...rows[0], act: undefined as unknown as "none" }])).toBe(false);
  });
  it("acceleration requires momentum >= 50", () => expect(run("accel")).toEqual(["B", "A", "C"]));
  it("strong + low vol sorts by risk ascending", () => expect(run("lowvol")).toEqual(["B", "A"]));
  it("fading leaders", () => expect(run("fading")).toEqual(["C"]));
  it("breakouts", () => expect(run("breakouts")).toEqual(["D"]));
  it("improvers sorts by rank change", () => expect(run("improvers")[0]).toBe("B"));
  it("filters by max risk and search", () => {
    expect(run("all", { ...DEFAULT_FILTERS, maxRisk: 25 })).toEqual(["B", "D"]);
    expect(run("all", { ...DEFAULT_FILTERS, search: "c" })).toContain("C");
  });
  it("relative return vs benchmark is geometric", () => {
    expect(relReturn(row({ r6m: 0.155 }), "r6m", ctx.bench, "SPY")).toBeCloseTo(0.1);
    expect(relReturn(row({ r6m: null }), "r6m", ctx.bench, "SPY")).toBeNull();
  });
});

describe("etfGroup", () => {
  it("puts gold, oil and broad commodities together, by ticker or name", () => {
    expect(etfGroup({ t: "GLD", n: "SPDR Gold Trust" })).toBe("Commodities");
    expect(etfGroup({ t: "XYZ", n: "United States Oil Fund" })).toBe("Commodities");
    expect(etfGroup({ t: "DBC", n: "Demo Proxy DBC" })).toBe("Commodities");
    expect(etfGroup({ t: "SHY", n: "iShares 1-3 Year Treasury Bond ETF" })).toBe("Bonds");
    expect(etfGroup({ t: "XLK", n: "Technology Select Sector SPDR" })).toBe("Equity");
    expect(etfGroup({ t: "BOIL", n: "Boiling Point Equity ETF" })).toBe("Equity");
  });
});
