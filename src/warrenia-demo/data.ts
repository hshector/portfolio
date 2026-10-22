// Demo data for the WarrenIA pavilion: a made-up investor, made-up prices and made-up companies,
// run through WarrenIA's own code (vendor/warrenia, its tests run with ours). Nothing here is real
// market data, and nothing names a real fund or company (WarrenIA's promo rules: demo data only,
// visibly labelled, no third-party marks, no financial promises).

import { contributionPlan, computePortfolio, type PriceSeries, type PortfolioResult } from '../../vendor/warrenia/lib/portfolio/engine';
import { estimateSale, type SaleEstimate } from '../../vendor/warrenia/lib/portfolio/tax';
import { DEFAULT_SETTINGS, type Instrument, type PlanKey, type Transaction } from '../../vendor/warrenia/lib/portfolio/types';
import { defaultChoices, recommended } from '../../vendor/warrenia/lib/plan/catalog';
import { planMix, portfolioStats, project } from '../../vendor/warrenia/lib/plan/projection';
import { applyRadar, DEFAULT_FILTERS, PRESETS, toListRow, type PresetKey, type RadarListRow } from '../../vendor/warrenia/lib/market/radar';
import type { ActionKey, RadarRow, StateKey } from '../../vendor/warrenia/lib/market/types';

export const AS_OF = '2026-10-21';
const START = '2023-10-02';
export const MONTHLY = DEFAULT_SETTINGS.monthly_contribution; // 450 €

function rng(seed: number) {
  return () => { seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const gauss = (r: () => number) => Math.sqrt(-2 * Math.log(r() || 1e-12)) * Math.cos(2 * Math.PI * r());
const addDays = (d: string, n: number) => new Date(Date.parse(d + 'T00:00:00Z') + n * 86_400_000).toISOString().slice(0, 10);
const weekday = (d: string) => { const w = new Date(d + 'T00:00:00Z').getUTCDay(); return w !== 0 && w !== 6; };

// ---------------------------------------------------------------- the investor's three funds
// (the ISINs are only the plan catalog's keys for each block; the names shown are generic)
const fund = (id: string, name: string, bucket: PlanKey, isin: string): Instrument =>
  ({ id, name, isin, kind: 'etf', bucket, currency: 'EUR', price_source: 'manual', market_ticker: null, eodhd_symbol: null, sector: null });
export const INSTRUMENTS: Instrument[] = [
  fund('core', 'Indexado mundial', 'core', recommended('core').isin),
  fund('gold', 'Oro físico', 'gold', recommended('gold').isin),
  fund('momentum', 'Momentum mundial', 'momentum', recommended('momentum').isin),
];

// three years of made-up daily closes: drift and volatility per year
const PATHS: Record<string, { p0: number; mu: number; vol: number; seed: number }> = {
  core: { p0: 92, mu: 0.05, vol: 0.14, seed: 32 },
  gold: { p0: 31, mu: 0.04, vol: 0.13, seed: 132 },
  momentum: { p0: 54, mu: 0.055, vol: 0.19, seed: 64 },
};
export const PRICES: Record<string, PriceSeries> = Object.fromEntries(
  Object.entries(PATHS).map(([id, p]) => {
    const r = rng(p.seed), dt = 1 / 252, points = [];
    let price = p.p0;
    for (let d = START; d <= AS_OF; d = addDays(d, 1)) {
      if (!weekday(d)) continue;
      price *= Math.exp((p.mu - (p.vol * p.vol) / 2) * dt + p.vol * Math.sqrt(dt) * gauss(r));
      points.push({ date: d, price: Math.round(price * 100) / 100 });
    }
    return [id, { currency: 'EUR', source: 'demo', points }];
  }),
);
const priceOn = (id: string, d: string) => {
  const pts = PRICES[id].points;
  let best = pts[0];
  for (const p of pts) { if (p.date > d) break; best = p; }
  return best.price;
};

// ---------------------------------------------------------------- what they did: 450 € a month, split by the plan
function buildTransactions(): Transaction[] {
  const txs: Transaction[] = [];
  let n = 0;
  const tx = (o: Partial<Transaction> & Pick<Transaction, 'type' | 'trade_date'>): Transaction =>
    ({ id: `demo-${n++}`, instrument_id: null, quantity: null, price: null, amount: null, fees: 0, taxes: 0, currency: 'EUR', fx_rate: 1, split_ratio: null, note: null, source: 'manual', ...o });
  const holdings: Record<string, number> = { core: 0, gold: 0, momentum: 0 };
  const targets = DEFAULT_SETTINGS.targets;
  for (let m = 0; ; m++) {
    const d0 = new Date(Date.UTC(2023, 9 + m, 3)).toISOString().slice(0, 10);
    if (d0 > AS_OF) break;
    let d = d0; while (!weekday(d)) d = addDays(d, 1);
    const amount = m === 0 ? 6000 : MONTHLY;
    txs.push(tx({ type: 'deposit', trade_date: d, amount }));
    // WarrenIA's own rule for the month: fill the blocks furthest below target first
    const values: Partial<Record<PlanKey, number>> = {};
    for (const id of Object.keys(holdings)) values[id as PlanKey] = holdings[id] * priceOn(id, d);
    const split = contributionPlan(values, 0, targets, amount - 1.5 * 3);
    for (const [id, eur] of Object.entries(split)) {
      if (!eur || eur < 1 || !(id in holdings)) continue;
      const price = priceOn(id, d), qty = Math.floor((eur / price) * 1000) / 1000;
      if (qty <= 0) continue;
      holdings[id] += qty;
      txs.push(tx({ type: 'buy', trade_date: d, instrument_id: id, quantity: qty, price, fees: 1.5 }));
    }
  }
  // one sale, to show the taxes: some gold in spring 2025
  const saleDate = '2025-04-14', price = priceOn('gold', saleDate);
  txs.push(tx({ type: 'sell', trade_date: saleDate, instrument_id: 'gold', quantity: 8, price, fees: 1.5 }));
  return txs;
}
export const TRANSACTIONS = buildTransactions();

let cached: PortfolioResult | null = null;
export function portfolio() {
  return (cached ??= computePortfolio(INSTRUMENTS, TRANSACTIONS, PRICES, {}, AS_OF));
}

/** "Before you sell": WarrenIA's Spanish tax estimate for selling qty units of a fund today. */
export function saleEstimate(id: string, qty: number): SaleEstimate {
  const price = priceOn(id, AS_OF);
  return estimateSale(INSTRUMENTS, TRANSACTIONS, PRICES, {}, { instrumentId: id, qty, price, currency: 'EUR', fxEurPerUnit: 1, feeEur: 1.5, date: AS_OF });
}

/** This month's 450 €, split the way WarrenIA would split it. */
export function monthPlan() {
  const p = portfolio();
  const values: Partial<Record<PlanKey, number>> = {};
  for (const pos of p.positions) values[pos.instrument.bucket as PlanKey] = (values[pos.instrument.bucket as PlanKey] ?? 0) + (pos.valueEur ?? 0);
  return contributionPlan(values, p.cashEur, DEFAULT_SETTINGS.targets, MONTHLY);
}

/** "Where this could take you": the plan's projection fan (a range, not a promise). */
export function projection(years: number, monthly = MONTHLY) {
  const stats = portfolioStats(planMix(DEFAULT_SETTINGS.targets, defaultChoices()));
  return project({ start: portfolio().totals.value, monthly, years, real: stats.real, vol: stats.vol, paths: 1500, seed: 7 });
}

// ---------------------------------------------------------------- the radar: 36 made-up companies
const SECTORS = ['Technology', 'Healthcare', 'Industrials', 'Financial Services', 'Consumer Cyclical', 'Energy', 'Utilities', 'Communication Services'];
function radarRows(): RadarRow[] {
  const r = rng(29), rows: RadarRow[] = [];
  for (let i = 0; i < 36; i++) {
    const m = Math.round(r() * 1000) / 10, a = Math.round((r() - 0.4) * 1000) / 10, rk = Math.round(r() * 1000) / 10;
    const r12 = (m / 100) * 0.9 - 0.15 + gauss(r) * 0.08, r6 = r12 * 0.55 + gauss(r) * 0.05, r3 = r6 * 0.5 + gauss(r) * 0.04, r1 = r3 * 0.35 + gauss(r) * 0.03;
    const extended = r1 > 0.075, weak = a < -15;
    const st: StateKey = m > 80 ? (extended ? 'extended' : 'strong') : m > 60 ? (a > 10 ? 'improving' : 'strong') : weak ? 'weakening' : 'neutral';
    const act: ActionKey = m > 80 && !extended && rk < 70 ? 'candidate' : st === 'extended' ? 'wait' : m > 60 ? 'watch' : weak ? 'avoid' : 'none';
    rows.push({
      t: `D${String(i + 1).padStart(3, '0')}`, n: `Empresa Demo ${String(i + 1).padStart(2, '0')}`, cls: 'stock', ex: 'DEMO', sec: SECTORS[i % SECTORS.length],
      mcap: Math.round(2e9 + r() * 3e11), px: Math.round((20 + r() * 300) * 100) / 100, d1: gauss(r) * 0.015,
      r1m: r1, r3m: r3, r6m: r6, r12m: r12, ytd: r12 * 0.8, r12_1: r12 - r1, vol: 0.18 + r() * 0.3, atr: null, mdd: -0.1 - r() * 0.3, dd: -r() * 0.12, beta: 0.7 + r() * 0.8,
      d52: null, adv: Math.round(5e6 + r() * 2e8), rvol: 0.7 + r() * 0.8, s50: null, s200: null,
      m, tq: Math.round(r() * 1000) / 10, a, rk, ov: Math.round((m * 0.6 + (100 - rk) * 0.2 + Math.max(0, a) * 0.2) * 10) / 10, rank: 0,
      dr: Math.round(gauss(r) * 6), dm: Math.round(gauss(r) * 80) / 10, lead: null, secrel: null,
      st, pst: null, tags: [st], why: [], flags: [], bo: r() > 0.85, h52: r() > 0.8, act, hold: act !== 'avoid', pe: null, prof: r() > 0.25,
    });
  }
  rows.sort((x, y) => y.m - x.m).forEach((row, i) => (row.rank = i + 1));
  return rows;
}
const RADAR: RadarListRow[] = radarRows().map(toListRow);

/** The radar list for a preset, filtered and sorted by WarrenIA's own query code. */
export function radar(preset: PresetKey) {
  const p = PRESETS.find((x) => x.key === preset)!;
  return applyRadar(RADAR, DEFAULT_FILTERS, p, p.sort, { horizon: 'r6m', bench: { SPY: { r1m: 0.01, r3m: 0.03, r6m: 0.05, r12m: 0.1 } }, benchmark: 'SPY', held: new Set(), watch: new Set() });
}
