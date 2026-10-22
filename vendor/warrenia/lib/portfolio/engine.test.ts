import { describe, expect, it } from "vitest";

import { addDays, computePortfolio, contributionPlan, PortfolioError, targetDeviation, toEur, type PriceSeries } from "./engine";
import { DEFAULT_SETTINGS, type Instrument, type Transaction } from "./types";
import { xirr } from "./xirr";

const ETF: Instrument = { id: "etf", name: "MSCI World", isin: "IE00B4L5Y983", kind: "etf", bucket: "core", currency: "EUR", price_source: "eodhd", market_ticker: null, eodhd_symbol: "EUNL.XETRA", sector: null };
const GOLD: Instrument = { id: "gold", name: "Gold ETC", isin: "DE000A0S9GB0", kind: "etc", bucket: "gold", currency: "EUR", price_source: "eodhd", market_ticker: null, eodhd_symbol: "4GLD.XETRA", sector: null };
const NVDA: Instrument = { id: "nvda", name: "NVIDIA", isin: "US67066G1040", kind: "stock", bucket: "momentum", currency: "USD", price_source: "us_market", market_ticker: "NVDA", eodhd_symbol: null, sector: "Technology" };

let n = 0;
function tx(p: Partial<Transaction> & Pick<Transaction, "type" | "trade_date">): Transaction {
  return { id: `t${n++}`, instrument_id: null, quantity: null, price: null, amount: null, fees: 0, taxes: 0, currency: "EUR", fx_rate: 1, split_ratio: null, note: null, source: "manual", ...p };
}

function flat(id: string, price: number, from = "2026-01-01", days = 400, currency = "EUR"): Record<string, PriceSeries> {
  const points = [];
  for (let i = 0; i < days; i++) points.push({ date: addDays(from, i), price });
  return { [id]: { currency, source: "test", points } };
}

describe("FIFO and P&L", () => {
  it("realises gains FIFO with fees in cost and proceeds", () => {
    const txs = [
      tx({ type: "deposit", trade_date: "2026-01-02", amount: 3000 }),
      tx({ type: "buy", trade_date: "2026-01-02", instrument_id: "etf", quantity: 10, price: 100, fees: 1 }),
      tx({ type: "buy", trade_date: "2026-02-02", instrument_id: "etf", quantity: 10, price: 120, fees: 1 }),
      tx({ type: "sell", trade_date: "2026-03-02", instrument_id: "etf", quantity: 15, price: 130, fees: 1 }),
    ];
    const r = computePortfolio([ETF], txs, flat("etf", 130), {}, "2026-03-02");
    const p = r.positions[0];
    // proceeds 15*130-1 = 1949; cost FIFO = 1001 + 5/10*1201 = 1601.5
    expect(p.realizedEur).toBeCloseTo(1949 - 1601.5, 6);
    expect(p.qty).toBeCloseTo(5);
    expect(p.costEur).toBeCloseTo(600.5, 6);
    expect(p.valueEur).toBeCloseTo(650, 6);
    expect(p.unrealizedEur).toBeCloseTo(49.5, 6);
    expect(r.cashEur).toBeCloseTo(3000 - 1001 - 1201 + 1949, 6);
    expect(r.totals.fees).toBeCloseTo(3, 6);
    expect(r.totals.value).toBeCloseTo(r.cashEur + 650, 6);
  });

  it("rejects selling more than held", () => {
    const txs = [
      tx({ type: "buy", trade_date: "2026-01-02", instrument_id: "etf", quantity: 1, price: 100 }),
      tx({ type: "sell", trade_date: "2026-01-03", instrument_id: "etf", quantity: 2, price: 100 }),
    ];
    expect(() => computePortfolio([ETF], txs, {}, {}, "2026-01-05")).toThrow(PortfolioError);
  });

  it("applies splits to quantity without changing cost", () => {
    const txs = [
      tx({ type: "deposit", trade_date: "2026-01-02", amount: 1000 }),
      tx({ type: "buy", trade_date: "2026-01-02", instrument_id: "nvda", quantity: 2, price: 500, currency: "EUR" }),
      tx({ type: "split", trade_date: "2026-02-02", instrument_id: "nvda", split_ratio: 10 }),
    ];
    const r = computePortfolio([NVDA], txs, flat("nvda", 55, "2026-01-01", 60, "USD"), { USD: [["2026-01-01", 1.1]] }, "2026-02-10");
    expect(r.positions[0].qty).toBeCloseTo(20);
    expect(r.positions[0].costEur).toBeCloseTo(1000);
    expect(r.positions[0].valueEur).toBeCloseTo((20 * 55) / 1.1, 6); // USD -> EUR with ECB rate
  });
});

describe("contributions, cash and returns", () => {
  it("infers missing contributions and warns", () => {
    const txs = [tx({ type: "buy", trade_date: "2026-01-02", instrument_id: "etf", quantity: 4, price: 100, fees: 1 })];
    const r = computePortfolio([ETF], txs, flat("etf", 100), {}, "2026-01-10");
    expect(r.totals.inferredDeposits).toBeCloseTo(401);
    expect(r.totals.netContributions).toBeCloseTo(401);
    expect(r.cashEur).toBeCloseTo(0);
    expect(r.warnings.join(" ")).toMatch(/inferred/);
  });

  it("TWR ignores the size and timing of contributions", () => {
    // Price +10% in January, +10% in February; a large deposit in between.
    const pts = [];
    for (let i = 0; i < 70; i++) {
      const d = addDays("2026-01-01", i);
      const price = d < "2026-02-01" ? 100 : d < "2026-03-01" ? 110 : 121;
      pts.push({ date: d, price });
    }
    const prices = { etf: { currency: "EUR", source: "t", points: pts } };
    const txs = [
      tx({ type: "deposit", trade_date: "2026-01-01", amount: 1000 }),
      tx({ type: "buy", trade_date: "2026-01-01", instrument_id: "etf", quantity: 10, price: 100 }),
      tx({ type: "deposit", trade_date: "2026-02-01", amount: 11000 }),
      tx({ type: "buy", trade_date: "2026-02-01", instrument_id: "etf", quantity: 100, price: 110 }),
    ];
    const r = computePortfolio([ETF], txs, prices, {}, "2026-03-05");
    expect(r.twr.cumulative).toBeCloseTo(0.21, 6);
    expect(r.totals.value).toBeCloseTo(110 * 121, 6);
    // Money-weighted return is lower than TWR because most money came before the smaller gain.
    expect(r.mwr.xirr).not.toBeNull();
  });

  it("dividends and interest add to value but are not external flows", () => {
    const txs = [
      tx({ type: "deposit", trade_date: "2026-01-02", amount: 1000 }),
      tx({ type: "buy", trade_date: "2026-01-02", instrument_id: "etf", quantity: 10, price: 100 }),
      tx({ type: "dividend", trade_date: "2026-01-20", instrument_id: "etf", amount: 5, taxes: 1 }),
      tx({ type: "interest", trade_date: "2026-01-25", amount: 2 }),
    ];
    const r = computePortfolio([ETF], txs, flat("etf", 100), {}, "2026-01-31");
    expect(r.totals.netContributions).toBe(1000);
    expect(r.totals.dividends).toBe(5);
    expect(r.totals.interest).toBe(2);
    expect(r.twr.cumulative).toBeCloseTo(0.007, 6);
  });

  it("flags positions without a price source", () => {
    const txs = [tx({ type: "deposit", trade_date: "2026-01-02", amount: 100 }), tx({ type: "buy", trade_date: "2026-01-02", instrument_id: "gold", quantity: 1, price: 90 })];
    const r = computePortfolio([GOLD], txs, {}, {}, "2026-01-05");
    expect(r.positions[0].priceSource).toMatch(/last trade price/);
    expect(r.warnings.some((w) => w.includes("Gold ETC"))).toBe(true);
  });

  it("converts with ECB rates (units per EUR)", () => {
    expect(toEur(110, "USD", { USD: [["2026-01-01", 1.1]] }, "2026-01-05")).toBeCloseTo(100);
    expect(toEur(110, "USD", {}, "2026-01-05")).toBeNull();
    const usd: [string, number][] = [["2026-01-01", 1.1], ["2026-01-02", 1.2], ["2026-01-05", 1.0]];
    expect(toEur(120, "USD", { USD: usd }, "2026-01-04")).toBeCloseTo(100); // weekend: Friday's rate
    expect(toEur(110, "USD", { USD: usd }, "2025-12-01")).toBeCloseTo(100); // before the file: first rate
  });

  it("keeps foreign holdings in the value before the first ECB rate (no fake jump)", () => {
    const txs = [
      tx({ type: "deposit", trade_date: "2026-01-02", amount: 1000 }),
      tx({ type: "buy", trade_date: "2026-01-02", instrument_id: "nvda", quantity: 10, price: 100, currency: "USD", fx_rate: 1 / 1.25 }),
    ];
    const r = computePortfolio([NVDA], txs, flat("nvda", 100, "2026-01-01", 60, "USD"), { USD: [["2026-02-01", 1.25]] }, "2026-02-27");
    // 200 EUR cash + 1000 USD at 1.25 = 1000 EUR every day: before Feb the first rate is used, so no jump on 1 Feb.
    expect(r.series.find((p) => p.date === "2026-01-15")!.value).toBeCloseTo(1000, 6);
    expect(r.twr.cumulative).toBeCloseTo(0, 6);
    expect(r.warnings.some((w) => w.includes("USD holdings before 2026-02-01"))).toBe(true);
  });
});

describe("xirr", () => {
  it("matches a simple one-year case", () => {
    expect(xirr([{ date: "2025-01-01", amount: -1000 }, { date: "2026-01-01", amount: 1100 }])).toBeCloseTo(0.1, 6);
  });
  it("handles losses and multiple flows", () => {
    const r = xirr([
      { date: "2025-01-01", amount: -1000 },
      { date: "2025-07-01", amount: -1000 },
      { date: "2026-01-01", amount: 1800 },
    ]);
    expect(r).not.toBeNull();
    expect(r!).toBeLessThan(0);
  });
  it("returns null when undefined", () => {
    expect(xirr([{ date: "2025-01-01", amount: -1000 }])).toBeNull();
    expect(xirr([{ date: "2025-01-01", amount: 100 }, { date: "2026-01-01", amount: 100 }])).toBeNull();
  });
});

describe("targets and contribution plan", () => {
  it("detects deviations outside 5/25 bands", () => {
    const txs = [
      tx({ type: "deposit", trade_date: "2026-01-02", amount: 1000 }),
      tx({ type: "buy", trade_date: "2026-01-02", instrument_id: "etf", quantity: 9, price: 100 }),
      tx({ type: "buy", trade_date: "2026-01-02", instrument_id: "gold", quantity: 1, price: 100 }),
    ];
    const prices = { ...flat("etf", 100), ...flat("gold", 100) };
    const r = computePortfolio([ETF, GOLD], txs, prices, {}, "2026-01-05");
    const dev = targetDeviation(r, DEFAULT_SETTINGS);
    const core = dev.find((d) => d.bucket === "core")!;
    const mom = dev.find((d) => d.bucket === "momentum")!;
    expect(core.weight).toBeCloseTo(0.9);
    expect(core.outsideBand).toBe(true); // +15 pp
    expect(mom.outsideBand).toBe(true); // 0% vs 15%
  });

  it("splits a contribution towards targets without selling", () => {
    const plan = contributionPlan({ core: 900, gold: 100, momentum: 0 }, 0, DEFAULT_SETTINGS.targets, 450);
    expect(plan.core + plan.gold + plan.momentum).toBeCloseTo(450);
    expect(plan.momentum).toBeGreaterThan(plan.core);
    expect(plan.core).toBeGreaterThanOrEqual(0);
  });

  it("cash is ignored at 0% and becomes a block (broker cash counts) when it has a target", () => {
    const txs = [
      tx({ type: "deposit", trade_date: "2026-01-02", amount: 1200 }),
      tx({ type: "buy", trade_date: "2026-01-02", instrument_id: "etf", quantity: 9, price: 100 }),
      tx({ type: "buy", trade_date: "2026-01-02", instrument_id: "gold", quantity: 1, price: 100 }),
    ];
    const r = computePortfolio([ETF, GOLD], txs, { ...flat("etf", 100), ...flat("gold", 100) }, {}, "2026-01-05");
    const off = targetDeviation(r, DEFAULT_SETTINGS);
    expect(off.map((d) => d.bucket)).toEqual(["core", "gold", "momentum"]);
    expect(off[0].weight).toBeCloseTo(0.9); // the 200 € of idle cash is left out
    const withCash = { ...DEFAULT_SETTINGS, targets: { core: 0.7, gold: 0.1, momentum: 0.1, cash: 0.1 } };
    const on = targetDeviation(r, withCash);
    expect(on.map((d) => d.bucket)).toEqual(["core", "gold", "momentum", "cash"]);
    expect(on.find((d) => d.bucket === "cash")!.weight).toBeCloseTo(200 / 1200);
    expect(on.find((d) => d.bucket === "core")!.weight).toBeCloseTo(900 / 1200);
    const plan = contributionPlan({ core: 900, gold: 100, momentum: 0, cash: 200 }, 0, withCash.targets, 300);
    expect(plan.core + plan.gold + plan.momentum + plan.cash).toBeCloseTo(300);
    expect(plan.cash).toBe(0); // cash is above its 10% target: the euros go to the blocks behind
    expect(contributionPlan({ core: 0, gold: 0, momentum: 0 }, 0, DEFAULT_SETTINGS.targets, 400).cash).toBe(0);
  });

  it("first contribution follows the targets exactly", () => {
    const plan = contributionPlan({ core: 0, gold: 0, momentum: 0 }, 0, DEFAULT_SETTINGS.targets, 400);
    expect(plan.core).toBeCloseTo(300);
    expect(plan.gold).toBeCloseTo(40);
    expect(plan.momentum).toBeCloseTo(60);
  });
});

describe("Spanish tax view of sales", () => {
  it("classifies ETF gains as ganancia patrimonial and ETC gains as capital mobiliario", () => {
    const txs = [
      tx({ type: "deposit", trade_date: "2026-01-02", amount: 3000 }),
      tx({ type: "buy", trade_date: "2026-01-02", instrument_id: "etf", quantity: 10, price: 100 }),
      tx({ type: "buy", trade_date: "2026-01-02", instrument_id: "gold", quantity: 10, price: 100 }),
      tx({ type: "sell", trade_date: "2026-06-01", instrument_id: "etf", quantity: 10, price: 110 }),
      tx({ type: "sell", trade_date: "2026-06-01", instrument_id: "gold", quantity: 10, price: 120 }),
    ];
    const r = computePortfolio([ETF, GOLD], txs, { ...flat("etf", 110), ...flat("gold", 120) }, {}, "2026-06-30");
    expect(r.taxByYear).toEqual([{ year: "2026", gp: 100, rcm: 200, deferred: 0 }]);
    expect(r.sales.every((s) => s.washSale === null)).toBe(true);
  });

  it("defers a loss when the same EU-listed ETF is bought back within 2 months", () => {
    const txs = [
      tx({ type: "deposit", trade_date: "2026-01-02", amount: 3000 }),
      tx({ type: "buy", trade_date: "2026-01-02", instrument_id: "etf", quantity: 10, price: 100 }),
      tx({ type: "sell", trade_date: "2026-03-10", instrument_id: "etf", quantity: 10, price: 80 }),
      tx({ type: "buy", trade_date: "2026-04-20", instrument_id: "etf", quantity: 5, price: 85 }),
    ];
    const r = computePortfolio([ETF], txs, flat("etf", 85), {}, "2026-06-30");
    const s = r.sales[0];
    expect(s.gainEur).toBeCloseTo(-200);
    expect(s.washSale).toEqual({ windowMonths: 2, repurchasedQty: 5, deferredEur: 100 });
    expect(r.taxByYear[0]).toEqual({ year: "2026", gp: -100, rcm: 0, deferred: 100 });
    expect(r.warnings.join(" ")).toMatch(/does not let you use that loss/);
  });

  it("buying back after the window keeps the loss computable", () => {
    const txs = [
      tx({ type: "deposit", trade_date: "2026-01-02", amount: 3000 }),
      tx({ type: "buy", trade_date: "2026-01-02", instrument_id: "etf", quantity: 10, price: 100 }),
      tx({ type: "sell", trade_date: "2026-03-10", instrument_id: "etf", quantity: 10, price: 80 }),
      tx({ type: "buy", trade_date: "2026-05-11", instrument_id: "etf", quantity: 5, price: 85 }),
    ];
    const r = computePortfolio([ETF], txs, flat("etf", 85), {}, "2026-06-30");
    expect(r.sales[0].washSale).toBeNull();
  });

  it("US-only shares use a 1-year window and earlier lots still held count too", () => {
    const usd = { USD: [["2026-01-01", 1]] as [string, number][] };
    const txs = [
      tx({ type: "deposit", trade_date: "2026-01-02", amount: 5000 }),
      tx({ type: "buy", trade_date: "2026-01-02", instrument_id: "nvda", quantity: 10, price: 100, currency: "USD" }),
      tx({ type: "buy", trade_date: "2026-05-02", instrument_id: "nvda", quantity: 10, price: 90, currency: "USD" }),
      // FIFO sells the January lot at a loss; the May lot (inside 1 year) is still held.
      tx({ type: "sell", trade_date: "2026-09-01", instrument_id: "nvda", quantity: 10, price: 70, currency: "USD" }),
    ];
    const r = computePortfolio([NVDA], txs, flat("nvda", 70, "2026-01-01", 400, "USD"), usd, "2026-10-01");
    expect(r.sales[0].washSale?.windowMonths).toBe(12);
    expect(r.sales[0].washSale?.deferredEur).toBeCloseTo(300);
  });

  it("addMonths clamps month ends", async () => {
    const { addMonths } = await import("./engine");
    expect(addMonths("2026-12-31", 2)).toBe("2027-02-28");
    expect(addMonths("2026-03-31", -1)).toBe("2026-02-28");
    expect(addMonths("2026-01-15", -12)).toBe("2025-01-15");
  });
});
