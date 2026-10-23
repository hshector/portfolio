// Portfolio accounting. Pure functions, no I/O: everything financial is tested in
// engine.test.ts. Base currency: EUR.
//
// Conventions
// - Transaction amounts are converted to EUR with the transaction's fx_rate
//   (EUR per 1 unit of the transaction currency).
// - Cost basis and realised P&L: FIFO (the method required for homogeneous
//   securities in Spanish IRPF), fees included in cost / deducted from proceeds.
// - Cash is tracked in EUR. If a purchase would make cash negative and no deposit
//   was recorded, an "inferred contribution" for the shortfall is created on that
//   date (reported as a warning) so returns stay consistent.
// - TWR: daily chain-linking (Modified Dietz per day) with external flows at the
//   END of the day: r_d = (V_d - V_{d-1} - F_d) / V_{d-1}. When the portfolio was
//   empty the day before, the base is the day's flow (r_d = (V_d - F_d) / F_d).
//   Trades execute at their own price, so a deposit invested at today's price does
//   not earn the move from yesterday's close.
// - MWR: XIRR on external flows + final value.
// - Valuation prices: last available price <= date (forward-filled); if an
//   instrument has no price yet, its last trade price is used and flagged.
// - Spanish IRPF view of sales (informative, not tax advice): ETFs, funds and shares
//   produce capital gains ("ganancia patrimonial"); ETCs (debt securities backed by a
//   commodity) produce "rendimientos del capital mobiliario" (DGT V0267-25). A loss is
//   not computable while homogeneous securities bought within 2 months before/after
//   the sale are still held (art. 33.5.f / 25.2 LIRPF); for shares listed outside EU
//   regulated markets (e.g. US-only) the window is commonly 1 year (art. 33.5.g).

import { money } from "../format";

import { xirr } from "./xirr";
import { PLAN_KEYS, type Bucket, type Instrument, type PlanKey, type Settings, type Transaction } from "./types";

export interface PricePoint {
  date: string;
  price: number;
}

export interface PriceSeries {
  currency: string; // currency of the prices
  source: string;
  points: PricePoint[]; // ascending by date, raw (unadjusted) prices
}

export type FxTable = Record<string, [string, number][]>; // currency -> [date, units per EUR], ascending

export interface Lot {
  qty: number;
  costEur: number; // total EUR cost of the remaining qty (incl. fees)
  date: string;
}

export interface Position {
  instrument: Instrument;
  qty: number;
  costEur: number;
  avgCostEur: number | null;
  price: number | null;
  priceCurrency: string | null;
  priceDate: string | null;
  priceSource: string | null;
  valueEur: number | null;
  unrealizedEur: number | null;
  unrealizedPct: number | null;
  realizedEur: number;
  dividendsEur: number;
  feesEur: number;
  weight: number | null;
}

export type TaxCategory = "gp" | "rcm";

export interface SaleRecord {
  date: string;
  instrumentId: string;
  name: string;
  qty: number;
  proceedsEur: number;
  costEur: number;
  gainEur: number;
  category: TaxCategory;
  /** Loss not computable this year because homogeneous securities were (re)bought inside the window. */
  washSale: { windowMonths: number; repurchasedQty: number; deferredEur: number } | null;
}

export interface DailyPoint {
  date: string;
  value: number;
  invested: number; // cumulative net external contributions
  cash: number;
}

export interface PortfolioResult {
  asOf: string | null;
  positions: Position[];
  cashEur: number;
  totals: {
    value: number;
    netContributions: number;
    deposits: number;
    withdrawals: number;
    inferredDeposits: number;
    realized: number;
    unrealized: number;
    dividends: number;
    interest: number;
    fees: number;
    taxes: number;
    gain: number; // value - net contributions
  };
  series: DailyPoint[];
  twr: { cumulative: number | null; annualized: number | null; days: number };
  mwr: { xirr: number | null; note: string | null };
  allocation: { bucket: Bucket; value: number; weight: number }[];
  byCurrency: { currency: string; value: number; weight: number }[];
  sales: SaleRecord[];
  taxByYear: { year: string; gp: number; rcm: number; deferred: number }[];
  warnings: string[];
}

const DAY = 86_400_000;
const EPS = 1e-9;

export function addDays(d: string, n: number): string {
  return new Date(Date.parse(d + "T00:00:00Z") + n * DAY).toISOString().slice(0, 10);
}

function isWeekday(d: string): boolean {
  const w = new Date(d + "T00:00:00Z").getUTCDay();
  return w !== 0 && w !== 6;
}

/** Last value with date <= d (binary search). */
export function lastOnOrBefore<T extends { date: string }>(arr: T[], d: string): T | null {
  let lo = 0;
  let hi = arr.length - 1;
  let ans = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (arr[mid].date <= d) {
      ans = mid;
      lo = mid + 1;
    } else hi = mid - 1;
  }
  return ans >= 0 ? arr[ans] : null;
}

/**
 * ECB rate on or before `d` (binary search straight on the [date, rate] pairs: this runs for
 * every position on every day of the replay). Before the first published rate, the first
 * one is used: the ECB file covers ~2 years, and leaving a holding out of the value instead
 * would show a fake jump in the returns the day the rates start.
 */
export function fxRate(fx: FxTable, currency: string, d: string): number | null {
  if (currency === "EUR") return 1;
  const s = fx[currency];
  if (!s || !s.length) return null;
  let lo = 0;
  let hi = s.length - 1;
  let ans = 0;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (s[mid][0] <= d) {
      ans = mid;
      lo = mid + 1;
    } else hi = mid - 1;
  }
  return s[ans][1];
}

/** First date with an ECB rate for `currency` (null for EUR or an unknown currency). */
function fxStart(fx: FxTable, currency: string): string | null {
  return currency === "EUR" ? null : (fx[currency]?.[0]?.[0] ?? null);
}

/** Convert an amount in `currency` to EUR using ECB rates (units per EUR). */
export function toEur(amount: number, currency: string, fx: FxTable, d: string): number | null {
  const r = fxRate(fx, currency, d);
  return r ? amount / r : null;
}

// Same-day ordering: inflows first so a deposit and a buy on the same day do not
// create an inferred contribution.
const ORDER: Record<Transaction["type"], number> = {
  deposit: 0, interest: 1, dividend: 2, sell: 3, split: 4, buy: 5, fee: 6, tax: 7, withdrawal: 8,
};

export function sortTx(txs: Transaction[]): Transaction[] {
  return [...txs].sort((a, b) => a.trade_date.localeCompare(b.trade_date) || ORDER[a.type] - ORDER[b.type]);
}

export class PortfolioError extends Error {}

interface Ledger {
  lots: Map<string, Lot[]>;
  realized: Map<string, number>;
  dividends: Map<string, number>;
  fees: Map<string, number>;
  cash: number;
  flows: { date: string; amount: number; inferred: boolean }[]; // + contribution / - withdrawal (EUR)
  totals: { interest: number; fees: number; taxes: number };
  lastTradePrice: Map<string, PricePoint & { currency: string }>;
  sales: RawSale[];
}

interface RawSale {
  date: string;
  iid: string;
  qty: number;
  proceeds: number;
  cost: number;
  remaining: { date: string; qty: number }[]; // lots still held right after the sale
}

function newLedger(): Ledger {
  return {
    lots: new Map(), realized: new Map(), dividends: new Map(), fees: new Map(), cash: 0, flows: [],
    totals: { interest: 0, fees: 0, taxes: 0 }, lastTradePrice: new Map(), sales: [],
  };
}

function add(m: Map<string, number>, k: string, v: number) {
  m.set(k, (m.get(k) ?? 0) + v);
}

/** Apply one transaction to the ledger (mutates). */
export function applyTx(L: Ledger, t: Transaction): void {
  const fx = t.fx_rate > 0 ? t.fx_rate : 1;
  const iid = t.instrument_id ?? "";
  switch (t.type) {
    case "deposit":
      L.cash += (t.amount ?? 0) * fx;
      L.flows.push({ date: t.trade_date, amount: (t.amount ?? 0) * fx, inferred: false });
      break;
    case "withdrawal":
      L.cash -= (t.amount ?? 0) * fx;
      L.flows.push({ date: t.trade_date, amount: -(t.amount ?? 0) * fx, inferred: false });
      break;
    case "interest":
      L.cash += (t.amount ?? 0) * fx;
      L.totals.interest += (t.amount ?? 0) * fx;
      break;
    case "fee":
      L.cash -= (t.amount ?? 0) * fx;
      L.totals.fees += (t.amount ?? 0) * fx;
      break;
    case "tax":
      L.cash -= (t.amount ?? 0) * fx;
      L.totals.taxes += (t.amount ?? 0) * fx;
      break;
    case "dividend":
      L.cash += (t.amount ?? 0) * fx;
      add(L.dividends, iid, (t.amount ?? 0) * fx);
      L.totals.taxes += (t.taxes ?? 0) * fx;
      break;
    case "buy": {
      const q = t.quantity ?? 0;
      const cost = (q * (t.price ?? 0) + (t.fees ?? 0)) * fx;
      const lots = L.lots.get(iid) ?? [];
      lots.push({ qty: q, costEur: cost, date: t.trade_date });
      L.lots.set(iid, lots);
      L.cash -= cost;
      add(L.fees, iid, (t.fees ?? 0) * fx);
      L.totals.fees += (t.fees ?? 0) * fx;
      L.lastTradePrice.set(iid, { date: t.trade_date, price: t.price ?? 0, currency: t.currency });
      break;
    }
    case "sell": {
      let q = t.quantity ?? 0;
      const lots = L.lots.get(iid) ?? [];
      const held = lots.reduce((s, l) => s + l.qty, 0);
      if (q > held + 1e-7) throw new PortfolioError(`Sale of ${q} units on ${t.trade_date} with only ${held.toFixed(6)} held`);
      const proceeds = (q * (t.price ?? 0) - (t.fees ?? 0) - (t.taxes ?? 0)) * fx;
      let costSold = 0;
      while (q > EPS && lots.length) {
        const lot = lots[0];
        const take = Math.min(lot.qty, q);
        const c = lot.costEur * (take / lot.qty);
        costSold += c;
        lot.qty -= take;
        lot.costEur -= c;
        q -= take;
        if (lot.qty <= EPS) lots.shift();
      }
      L.lots.set(iid, lots);
      add(L.realized, iid, proceeds - costSold);
      L.sales.push({ date: t.trade_date, iid, qty: t.quantity ?? 0, proceeds, cost: costSold, remaining: lots.map((l) => ({ date: l.date, qty: l.qty })) });
      L.cash += proceeds;
      add(L.fees, iid, (t.fees ?? 0) * fx);
      L.totals.fees += (t.fees ?? 0) * fx;
      L.totals.taxes += (t.taxes ?? 0) * fx;
      L.lastTradePrice.set(iid, { date: t.trade_date, price: t.price ?? 0, currency: t.currency });
      break;
    }
    case "split": {
      const r = t.split_ratio ?? 1;
      for (const lot of L.lots.get(iid) ?? []) lot.qty *= r; // total cost unchanged
      const ltp = L.lastTradePrice.get(iid);
      if (ltp) L.lastTradePrice.set(iid, { ...ltp, price: ltp.price / r });
      break;
    }
  }
  if (L.cash < -0.005) {
    L.flows.push({ date: t.trade_date, amount: -L.cash, inferred: true });
    L.cash = 0;
  }
}

function heldQty(L: Ledger, iid: string): number {
  return (L.lots.get(iid) ?? []).reduce((s, l) => s + l.qty, 0);
}

function priceFor(
  ins: Instrument,
  prices: Record<string, PriceSeries>,
  L: Ledger,
  d: string,
): { price: number; currency: string; date: string; source: string } | null {
  const s = prices[ins.id];
  if (s && s.points.length) {
    const p = lastOnOrBefore(s.points, d);
    if (p) return { price: p.price, currency: s.currency, date: p.date, source: s.source };
  }
  const t = L.lastTradePrice.get(ins.id);
  if (t && t.date <= d) return { price: t.price, currency: t.currency, date: t.date, source: "last trade price" };
  return null;
}

export function computePortfolio(
  instruments: Instrument[],
  transactions: Transaction[],
  prices: Record<string, PriceSeries>,
  fx: FxTable,
  asOf: string,
): PortfolioResult {
  const warnings: string[] = [];
  const byId = new Map(instruments.map((i) => [i.id, i]));
  const txs = sortTx(transactions.filter((t) => t.trade_date <= asOf));
  for (const t of txs) {
    if (t.instrument_id && !byId.has(t.instrument_id)) throw new PortfolioError(`Transaction ${t.id} has an unknown instrument`);
  }
  const empty: PortfolioResult = {
    asOf: null, positions: [], cashEur: 0,
    totals: { value: 0, netContributions: 0, deposits: 0, withdrawals: 0, inferredDeposits: 0, realized: 0, unrealized: 0, dividends: 0, interest: 0, fees: 0, taxes: 0, gain: 0 },
    series: [], twr: { cumulative: null, annualized: null, days: 0 }, mwr: { xirr: null, note: null },
    allocation: [], byCurrency: [], sales: [], taxByYear: [], warnings,
  };
  if (!txs.length) return empty;

  // ---- Daily replay
  const L = newLedger();
  const series: DailyPoint[] = [];
  const twrDaily: number[] = [];
  let i = 0;
  let prevValue = 0;
  let invested = 0;
  const missingPrice = new Set<string>();
  const earlyFx = new Map<string, string>();
  const start = txs[0].trade_date;
  for (let d = start; d <= asOf; d = addDays(d, 1)) {
    const flowsBefore = L.flows.length;
    while (i < txs.length && txs[i].trade_date === d) applyTx(L, txs[i++]);
    const dayFlow = L.flows.slice(flowsBefore).reduce((s, f) => s + f.amount, 0);
    invested += dayFlow;
    if (!isWeekday(d) && d !== asOf && dayFlow === 0) continue;
    let value = L.cash;
    for (const [iid] of L.lots) {
      const q = heldQty(L, iid);
      if (q <= EPS) continue;
      const ins = byId.get(iid)!;
      const p = priceFor(ins, prices, L, d);
      if (!p) {
        missingPrice.add(ins.name);
        continue;
      }
      const v = toEur(q * p.price, p.currency, fx, d);
      if (v === null) {
        missingPrice.add(`${ins.name} (no ${p.currency} exchange rate)`);
        continue;
      }
      const f0 = fxStart(fx, p.currency);
      if (f0 && d < f0) earlyFx.set(p.currency, f0);
      value += v;
    }
    const base = prevValue > EPS ? prevValue : dayFlow;
    twrDaily.push(base > EPS ? (value - prevValue - dayFlow) / base : 0);
    series.push({ date: d, value, invested, cash: L.cash });
    prevValue = value;
  }
  if (missingPrice.size) warnings.push(`No price to value: ${[...missingPrice].join(", ")}.`);
  for (const [c, f0] of earlyFx) warnings.push(`${c} holdings before ${f0} are converted at the ${f0} ECB rate (the first one available).`);

  // ---- Positions at asOf
  const positions: Position[] = [];
  let unrealized = 0;
  const ids = new Set([...L.lots.keys(), ...L.realized.keys(), ...L.dividends.keys()]);
  for (const iid of ids) {
    const ins = byId.get(iid);
    if (!ins) continue;
    const qty = heldQty(L, iid);
    const cost = (L.lots.get(iid) ?? []).reduce((s, l) => s + l.costEur, 0);
    const p = qty > EPS ? priceFor(ins, prices, L, asOf) : null;
    const valueEur = p ? toEur(qty * p.price, p.currency, fx, asOf) : qty > EPS ? null : 0;
    const unr = valueEur !== null && qty > EPS ? valueEur - cost : null;
    if (unr !== null) unrealized += unr;
    if (p && p.source.startsWith("last trade")) warnings.push(`${ins.name}: valued at its last trade price (${p.date}); no price source.`);
    positions.push({
      instrument: ins, qty, costEur: cost, avgCostEur: qty > EPS ? cost / qty : null,
      price: p?.price ?? null, priceCurrency: p?.currency ?? null, priceDate: p?.date ?? null, priceSource: p?.source ?? null,
      valueEur, unrealizedEur: unr, unrealizedPct: unr !== null && cost > 0 ? unr / cost : null,
      realizedEur: L.realized.get(iid) ?? 0, dividendsEur: L.dividends.get(iid) ?? 0, feesEur: L.fees.get(iid) ?? 0, weight: null,
    });
  }
  const last = series[series.length - 1];
  const value = last?.value ?? 0;
  for (const p of positions) p.weight = p.valueEur !== null && value > 0 ? p.valueEur / value : null;
  positions.sort((a, b) => (b.valueEur ?? 0) - (a.valueEur ?? 0));

  const deposits = L.flows.filter((f) => f.amount > 0).reduce((s, f) => s + f.amount, 0);
  const withdrawals = -L.flows.filter((f) => f.amount < 0).reduce((s, f) => s + f.amount, 0);
  const inferred = L.flows.filter((f) => f.inferred).reduce((s, f) => s + f.amount, 0);
  if (inferred > 0) {
    warnings.push(`Deposits of ${money(inferred)} were inferred because purchases exceeded the cash recorded. Record your deposits for exact figures.`);
  }

  // ---- Spanish tax view of the sales
  const sales = taxView(L.sales, txs, byId);
  for (const sr of sales) {
    if (!sr.washSale) continue;
    warnings.push(
      `Sale of ${sr.name} on ${sr.date} at a loss of ${money(-sr.gainEur)}: you bought the same security within ${sr.washSale.windowMonths} months before or after and still hold it. ` +
        `Spain does not let you use that loss (about ${money(sr.washSale.deferredEur)}) until you sell those shares.`,
    );
  }
  const years = new Map<string, { year: string; gp: number; rcm: number; deferred: number }>();
  for (const sr of sales) {
    const y = sr.date.slice(0, 4);
    const row = years.get(y) ?? { year: y, gp: 0, rcm: 0, deferred: 0 };
    const deferred = sr.washSale?.deferredEur ?? 0;
    row[sr.category] += sr.gainEur + deferred; // deferred losses are not computable this year
    row.deferred += deferred;
    years.set(y, row);
  }
  const taxByYear = [...years.values()].sort((a, b) => a.year.localeCompare(b.year));

  // ---- Returns
  const days = series.length ? (Date.parse(asOf) - Date.parse(series[0].date)) / DAY : 0;
  const cum = twrDaily.reduce((acc, r) => acc * (1 + r), 1) - 1;
  const twr = { cumulative: series.length > 1 ? cum : null, annualized: days >= 365 ? Math.pow(1 + cum, 365 / days) - 1 : null, days: Math.round(days) };
  const flowsX = L.flows.map((f) => ({ date: f.date, amount: -f.amount }));
  flowsX.push({ date: asOf, amount: value });
  let note: string | null = null;
  let x = days >= 30 ? xirr(flowsX) : null;
  if (days < 30) note = "Less than 30 days of history: the annualised return is not meaningful.";
  else if (days < 365) note = "Less than a year: the return is annualised and very sensitive to recent moves.";
  if (x !== null && !Number.isFinite(x)) x = null;

  // ---- Allocation
  const alloc = new Map<Bucket, number>();
  const cur = new Map<string, number>();
  for (const p of positions) {
    if (!p.valueEur) continue;
    alloc.set(p.instrument.bucket, (alloc.get(p.instrument.bucket) ?? 0) + p.valueEur);
    const c = p.priceCurrency ?? p.instrument.currency;
    cur.set(c, (cur.get(c) ?? 0) + p.valueEur);
  }
  if (L.cash > 0.005) {
    alloc.set("cash", (alloc.get("cash") ?? 0) + L.cash); // broker cash + money-market funds
    cur.set("EUR", (cur.get("EUR") ?? 0) + L.cash);
  }
  const w = (v: number) => (value > 0 ? v / value : 0);

  return {
    asOf: last?.date ?? null,
    positions,
    cashEur: L.cash,
    totals: {
      value, netContributions: deposits - withdrawals, deposits, withdrawals, inferredDeposits: inferred,
      realized: [...L.realized.values()].reduce((s, v) => s + v, 0), unrealized,
      dividends: [...L.dividends.values()].reduce((s, v) => s + v, 0),
      interest: L.totals.interest, fees: L.totals.fees, taxes: L.totals.taxes, gain: value - (deposits - withdrawals),
    },
    series,
    twr,
    mwr: { xirr: x, note },
    allocation: [...alloc.entries()].map(([bucket, v]) => ({ bucket, value: v, weight: w(v) })).sort((a, b) => b.value - a.value),
    byCurrency: [...cur.entries()].map(([currency, v]) => ({ currency, value: v, weight: w(v) })).sort((a, b) => b.value - a.value),
    sales,
    taxByYear,
    warnings,
  };
}

// ------------------------------------------------------------ Spanish tax view

export function addMonths(d: string, n: number): string {
  const [y, m, day] = d.split("-").map(Number);
  const total = y * 12 + (m - 1) + n;
  const ny = Math.floor(total / 12);
  const nm = total % 12;
  const last = new Date(Date.UTC(ny, nm + 1, 0)).getUTCDate(); // clamp 31 -> 30/28...
  return `${ny}-${String(nm + 1).padStart(2, "0")}-${String(Math.min(day, last)).padStart(2, "0")}`;
}

export function taxCategory(ins: Instrument): TaxCategory {
  return ins.kind === "etc" ? "rcm" : "gp";
}

/** Anti-loss window in months: 2 for securities on EU regulated markets, 12 for US-only shares. */
export function washWindowMonths(ins: Instrument): number {
  return ins.kind === "stock" && (ins.price_source === "us_market" || ins.currency === "USD") ? 12 : 2;
}

function taxView(raw: RawSale[], txs: Transaction[], byId: Map<string, Instrument>): SaleRecord[] {
  return raw.map((s) => {
    const ins = byId.get(s.iid)!;
    const gain = s.proceeds - s.cost;
    const months = washWindowMonths(ins);
    let washSale: SaleRecord["washSale"] = null;
    if (gain < -0.005 && s.qty > EPS) {
      const from = addMonths(s.date, -months);
      const to = addMonths(s.date, months);
      const before = s.remaining.filter((l) => l.date >= from && l.date <= s.date).reduce((t, l) => t + l.qty, 0);
      // Buys on the sale day are applied after the sale (same-day ordering), so they count as "after".
      const after = txs
        .filter((t) => t.type === "buy" && t.instrument_id === s.iid && t.trade_date >= s.date && t.trade_date <= to)
        .reduce((t, b) => t + (b.quantity ?? 0), 0);
      const rq = before + after;
      if (rq > EPS) washSale = { windowMonths: months, repurchasedQty: rq, deferredEur: -gain * Math.min(1, rq / s.qty) };
    }
    return {
      date: s.date, instrumentId: s.iid, name: ins.name, qty: s.qty, proceedsEur: s.proceeds, costEur: s.cost, gainEur: gain,
      category: taxCategory(ins), washSale,
    };
  });
}

// ------------------------------------------------------------ targets & plan

export interface TargetRow {
  bucket: PlanKey;
  target: number;
  weight: number;
  value: number;
  deviation: number; // weight - target (absolute)
  outsideBand: boolean;
}

/** Blocks shown against their targets: cash only when you gave it a target. */
export function activeKeys(targets: Settings["targets"]): PlanKey[] {
  return PLAN_KEYS.filter((k) => k !== "cash" || (targets.cash ?? 0) > 0);
}

/**
 * Deviation vs targets, 5/25-style bands. Uninvested cash is left out unless cash is one of
 * your blocks (target above 0%): then broker cash and money-market funds count as that block.
 */
export function targetDeviation(res: PortfolioResult, s: Settings): TargetRow[] {
  const keys = activeKeys(s.targets);
  const withCash = keys.includes("cash");
  const invested = res.allocation.filter((a) => withCash || a.bucket !== "cash").reduce((t, a) => t + a.value, 0);
  return keys.map((b) => {
    const v = res.allocation.find((a) => a.bucket === b)?.value ?? 0;
    const weight = invested > 0 ? v / invested : 0;
    const target = s.targets[b] ?? 0;
    const dev = weight - target;
    const outside = invested > 0 && (Math.abs(dev) > s.band_abs || (target > 0 && Math.abs(dev) / target > s.band_rel));
    return { bucket: b, target, weight, value: v, deviation: dev, outsideBand: outside };
  });
}

/** Current value of each plan block (0 for blocks not shown). */
export function blockValues(dev: TargetRow[] | null): Record<PlanKey, number> {
  const out: Record<PlanKey, number> = { core: 0, gold: 0, momentum: 0, cash: 0 };
  for (const d of dev ?? []) out[d.bucket] = d.value;
  return out;
}

/**
 * Split a new contribution across blocks to move towards the targets without
 * selling (cash-flow rebalancing). Informational only.
 */
export function contributionPlan(values: Partial<Record<PlanKey, number>>, otherValue: number, targets: Settings["targets"], amount: number): Record<PlanKey, number> {
  const keys = PLAN_KEYS;
  const t = (k: PlanKey) => targets[k] ?? 0;
  const base = keys.reduce((s, k) => s + (values[k] ?? 0), 0) + otherValue + amount;
  const need = Object.fromEntries(keys.map((k) => [k, Math.max(0, t(k) * base - (values[k] ?? 0))])) as Record<PlanKey, number>;
  const totalNeed = keys.reduce((s, k) => s + need[k], 0);
  const tw = keys.reduce((s, k) => s + t(k), 0) || 1;
  const out = {} as Record<PlanKey, number>;
  for (const k of keys) {
    out[k] = totalNeed >= amount ? (totalNeed > 0 ? (amount * need[k]) / totalNeed : 0) : need[k] + ((amount - totalNeed) * t(k)) / tw;
  }
  return out;
}
