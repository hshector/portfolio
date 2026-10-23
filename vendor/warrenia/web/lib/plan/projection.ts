// Wealth projection of the plan: where the portfolio could be in N years, in today's euros.
//
// Method: each asset class gets a long-run real (after inflation) return and volatility from
// published long-run evidence (below). The plan's mix gives one portfolio return and volatility
// (monthly rebalanced by the contributions), simulated as 2,000 log-normal monthly paths with a
// fixed seed (same inputs -> same picture). We show the 10th, 50th and 90th percentiles.
// This is a range of plausible outcomes, not a forecast; taxes on selling are not deducted.

import type { AssetClass, Choices } from "./catalog";
import { byIsin } from "./catalog";
import type { PlanKey } from "@/lib/portfolio/types";

export interface Assumption {
  label: string;
  real: number; // expected real return per year, geometric (what a buy-and-hold investor compounds)
  vol: number; // yearly volatility
  factor: "equity" | "gold" | "silver" | "commodities" | "bonds" | "bitcoin" | "cash";
}

/**
 * Sources: equities - Dimson, Marsh & Staunton, UBS Global Investment Returns Yearbook 2024 (world,
 * 1900-2023: 5.0% real a year, ~17% volatility; we use 4.5% because starting valuations are high).
 * Gold - Erb & Harvey (2013) "The Golden Dilemma": ~1% real over the very long run, ~15% volatility.
 * Commodities - Levine, Ooi, Richardson & Sasseville (2018) "Commodities for the Long Run": positive
 * but modest excess return; we use 1% real. Short euro government bonds and cash - near zero real
 * returns over the long run (DMS Yearbook, bills). Bitcoin - no cash flows and too short a history
 * for a reliable estimate (Liu & Tsyvinski 2021): 0% real with very high volatility.
 * Momentum - no extra return is assumed over the market (conservative), with more volatility.
 */
export const ASSUMPTIONS: Record<AssetClass, Assumption> = {
  world: { label: "World stocks", real: 0.045, vol: 0.16, factor: "equity" },
  world_dev: { label: "Developed-world stocks", real: 0.045, vol: 0.16, factor: "equity" },
  world_imi: { label: "World stocks incl. small", real: 0.045, vol: 0.165, factor: "equity" },
  momentum: { label: "Momentum stocks", real: 0.045, vol: 0.19, factor: "equity" },
  gold: { label: "Gold", real: 0.01, vol: 0.15, factor: "gold" },
  silver: { label: "Silver", real: 0.0, vol: 0.28, factor: "silver" },
  commodities: { label: "Commodities", real: 0.01, vol: 0.18, factor: "commodities" },
  bonds: { label: "Short euro government bonds", real: 0.003, vol: 0.02, factor: "bonds" },
  bitcoin: { label: "Bitcoin", real: 0.0, vol: 0.6, factor: "bitcoin" },
  cash: { label: "Cash", real: 0.0, vol: 0.01, factor: "cash" },
};

const FACTORS = ["equity", "gold", "silver", "commodities", "bonds", "bitcoin", "cash"] as const;
type Factor = (typeof FACTORS)[number];

/** Long-run correlations between asset classes (rounded; signs and sizes as in the literature). */
const CORR: Record<Factor, Partial<Record<Factor, number>>> = {
  equity: { gold: 0.05, silver: 0.25, commodities: 0.3, bonds: 0.1, bitcoin: 0.3, cash: 0 },
  gold: { silver: 0.75, commodities: 0.3, bonds: 0.15, bitcoin: 0.1, cash: 0 },
  silver: { commodities: 0.4, bonds: 0.05, bitcoin: 0.15, cash: 0 },
  commodities: { bonds: -0.05, bitcoin: 0.15, cash: 0 },
  bonds: { bitcoin: 0, cash: 0.2 },
  bitcoin: { cash: 0 },
  cash: {},
};

function corr(a: Factor, b: Factor): number {
  if (a === b) return 1;
  return CORR[a][b] ?? CORR[b][a] ?? 0;
}

/** Weight of each asset class in the plan: block targets x products chosen in each block. */
export function planMix(targets: Record<PlanKey, number>, choices: Required<Choices>): { cls: AssetClass; weight: number }[] {
  const w = new Map<AssetClass, number>();
  for (const k of Object.keys(targets) as PlanKey[]) {
    const t = targets[k] ?? 0;
    if (t <= 0) continue;
    for (const c of choices[k] ?? []) {
      const p = byIsin(c.isin);
      if (p) w.set(p.assetClass, (w.get(p.assetClass) ?? 0) + t * c.weight);
    }
  }
  const total = [...w.values()].reduce((s, x) => s + x, 0) || 1;
  return [...w.entries()].map(([cls, weight]) => ({ cls, weight: weight / total }));
}

/** Expected real return (geometric) and volatility of the whole mix. */
export function portfolioStats(mix: { cls: AssetClass; weight: number }[]): { real: number; vol: number } {
  // Arithmetic means add up linearly; geometric = arithmetic - variance / 2.
  let mean = 0;
  let variance = 0;
  for (const a of mix) {
    const A = ASSUMPTIONS[a.cls];
    mean += a.weight * (A.real + (A.vol * A.vol) / 2);
    for (const b of mix) {
      const B = ASSUMPTIONS[b.cls];
      const rho = a.cls === b.cls ? 1 : A.factor === B.factor ? 0.9 : corr(A.factor, B.factor);
      variance += a.weight * b.weight * A.vol * B.vol * rho;
    }
  }
  return { real: mean - variance / 2, vol: Math.sqrt(Math.max(variance, 0)) };
}

/** Small, fast, seeded PRNG (mulberry32) so the picture does not change on every visit. */
function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface Projection {
  years: number[];
  p10: number[];
  p50: number[];
  p90: number[];
  contributed: number[];
  /** Share of paths that end below the money put in. */
  lossChance: number;
  real: number;
  vol: number;
}

function quantile(sorted: Float64Array, q: number): number {
  const i = (sorted.length - 1) * q;
  const lo = Math.floor(i);
  const hi = Math.ceil(i);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (i - lo);
}

/**
 * Monthly simulation in today's euros. The monthly amount is assumed to grow with inflation
 * (constant in real terms), contributions are invested at the start of each month.
 */
export function project(opts: { start: number; monthly: number; years: number; real: number; vol: number; paths?: number; seed?: number }): Projection {
  const { start, monthly, years, real, vol } = opts;
  const paths = opts.paths ?? 2000;
  const rand = rng(opts.seed ?? 7);
  // Log-normal with the requested geometric mean: E[log growth] = ln(1 + real).
  const mu = Math.log(1 + real) / 12;
  const sigma = vol / Math.sqrt(12);
  const v = new Float64Array(paths).fill(start);
  const out: Projection = { years: [0], p10: [start], p50: [start], p90: [start], contributed: [start], lossChance: 0, real, vol };
  let spare: number | null = null;
  const normal = () => {
    if (spare !== null) {
      const s = spare;
      spare = null;
      return s;
    }
    let u = 0;
    while (u === 0) u = rand();
    const r = Math.sqrt(-2 * Math.log(u));
    const th = 2 * Math.PI * rand();
    spare = r * Math.sin(th);
    return r * Math.cos(th);
  };
  for (let y = 1; y <= years; y++) {
    for (let m = 0; m < 12; m++) {
      for (let i = 0; i < paths; i++) v[i] = (v[i] + monthly) * Math.exp(mu + sigma * normal());
    }
    const s = Float64Array.from(v).sort();
    out.years.push(y);
    out.p10.push(quantile(s, 0.1));
    out.p50.push(quantile(s, 0.5));
    out.p90.push(quantile(s, 0.9));
    out.contributed.push(start + monthly * 12 * y);
  }
  const put = out.contributed[out.contributed.length - 1];
  out.lossChance = v.reduce((n, x) => n + (x < put ? 1 : 0), 0) / paths;
  return out;
}
