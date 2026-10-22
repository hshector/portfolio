import { describe, expect, it } from "vitest";

import { addDays, type PriceSeries } from "./engine";
import { estimateSale, openLots, SaleError, savingsBase, savingsTax } from "./tax";
import type { Instrument, Transaction } from "./types";

const ETF: Instrument = { id: "etf", name: "MSCI World", isin: "IE00B4L5Y983", kind: "etf", bucket: "core", currency: "EUR", price_source: "manual", market_ticker: null, eodhd_symbol: null, sector: null };
const GOLD: Instrument = { id: "gold", name: "Gold ETC", isin: "IE00B4ND3602", kind: "etc", bucket: "gold", currency: "EUR", price_source: "manual", market_ticker: null, eodhd_symbol: null, sector: null };
const NVDA: Instrument = { id: "nvda", name: "NVIDIA", isin: "US67066G1040", kind: "stock", bucket: "momentum", currency: "USD", price_source: "us_market", market_ticker: "NVDA", eodhd_symbol: null, sector: null };

let n = 0;
function tx(p: Partial<Transaction> & Pick<Transaction, "type" | "trade_date">): Transaction {
  return { id: `t${n++}`, instrument_id: null, quantity: null, price: null, amount: null, fees: 0, taxes: 0, currency: "EUR", fx_rate: 1, split_ratio: null, note: null, source: "manual", ...p };
}
function flat(id: string, price: number, from = "2025-01-01", days = 700, currency = "EUR"): Record<string, PriceSeries> {
  return { [id]: { currency, source: "test", points: Array.from({ length: days }, (_, i) => ({ date: addDays(from, i), price })) } };
}
const eur = (instrumentId: string, qty: number, price: number, date: string, feeEur = 0) => ({ instrumentId, qty, price, currency: "EUR", fxEurPerUnit: 1, feeEur, date });

describe("savings-base tax", () => {
  it("applies the brackets", () => {
    expect(savingsTax(0)).toBe(0);
    expect(savingsTax(6_000)).toBeCloseTo(1_140);
    expect(savingsTax(10_000)).toBeCloseTo(1_140 + 4_000 * 0.21);
    expect(savingsTax(400_000)).toBeCloseTo(6_000 * 0.19 + 44_000 * 0.21 + 150_000 * 0.23 + 100_000 * 0.27 + 100_000 * 0.3);
  });
  it("offsets a negative balance against at most 25 % of the other", () => {
    expect(savingsBase(1_000, 500)).toBe(1_500);
    expect(savingsBase(-1_000, 2_000)).toBe(1_500); // 25 % of 2,000
    expect(savingsBase(-100, 2_000)).toBe(1_900);
    expect(savingsBase(4_000, -3_000)).toBe(3_000);
    expect(savingsBase(-5, -5)).toBe(0);
  });
});

describe("estimateSale", () => {
  const buys = [
    tx({ type: "deposit", trade_date: "2025-01-02", amount: 5_000 }),
    tx({ type: "buy", trade_date: "2025-01-02", instrument_id: "etf", quantity: 10, price: 100, fees: 1 }),
    tx({ type: "buy", trade_date: "2025-06-02", instrument_id: "etf", quantity: 10, price: 150, fees: 1 }),
  ];

  it("takes FIFO lots and taxes the gain at the savings rate", () => {
    const e = estimateSale([ETF], buys, flat("etf", 200), {}, eur("etf", 15, 200, "2026-03-02", 1));
    expect(e.lots.map((l) => [l.date, l.qty])).toEqual([["2025-01-02", 10], ["2025-06-02", 5]]);
    expect(e.costEur).toBeCloseTo(1_001 + 1_501 / 2, 6);
    expect(e.proceedsEur).toBeCloseTo(15 * 200 - 1, 6);
    expect(e.gainEur).toBeCloseTo(2_999 - 1_751.5, 6);
    expect(e.taxEur).toBeCloseTo(1_247.5 * 0.19, 6);
    expect(e.netEur).toBeCloseTo(2_999 - 1_247.5 * 0.19, 6);
    expect(e.noRebuyUntil).toBeNull();
  });

  it("stacks on gains already realised this year (higher bracket)", () => {
    const txs = [...buys, tx({ type: "sell", trade_date: "2026-01-10", instrument_id: "etf", quantity: 10, price: 800 })]; // +6,999 in 2026
    const e = estimateSale([ETF], txs, flat("etf", 200), {}, eur("etf", 10, 200, "2026-03-02"));
    expect(e.before.gp).toBeCloseTo(6_999, 6);
    expect(e.gainEur).toBeCloseTo(2_000 - 1_501, 6);
    expect(e.taxEur).toBeCloseTo(499 * 0.21, 6);
  });

  it("shows the tax a loss saves when it offsets this year's gains", () => {
    const txs = [
      tx({ type: "deposit", trade_date: "2025-01-02", amount: 5_000 }),
      tx({ type: "buy", trade_date: "2025-01-02", instrument_id: "etf", quantity: 10, price: 100 }),
      tx({ type: "buy", trade_date: "2025-01-02", instrument_id: "gold", quantity: 10, price: 100 }),
      tx({ type: "sell", trade_date: "2026-01-10", instrument_id: "etf", quantity: 5, price: 300 }), // +1,000 gain
    ];
    const e = estimateSale([ETF, GOLD], txs, { ...flat("etf", 300), ...flat("gold", 60) }, {}, eur("gold", 10, 60, "2026-03-02"));
    expect(e.category).toBe("rcm");
    expect(e.gainEur).toBeCloseTo(-400, 6);
    // The ETC loss is capital income: it offsets up to 25 % of the 1,000 gain.
    expect(e.after.base).toBeCloseTo(750, 6);
    expect(e.taxEur).toBeCloseTo(-250 * 0.19, 6);
    expect(e.netEur).toBeCloseTo(600, 6); // the saving is reported in taxEur, not added here
    expect(e.noRebuyUntil).toBe("2026-05-02");
  });

  it("blocks a loss when the same security was bought within the window and is still held", () => {
    const txs = [
      tx({ type: "deposit", trade_date: "2025-01-02", amount: 5_000 }),
      tx({ type: "buy", trade_date: "2025-01-02", instrument_id: "etf", quantity: 10, price: 100 }),
      tx({ type: "buy", trade_date: "2026-02-15", instrument_id: "etf", quantity: 10, price: 80 }),
    ];
    const e = estimateSale([ETF], txs, flat("etf", 70), {}, eur("etf", 10, 70, "2026-03-02"));
    expect(e.gainEur).toBeCloseTo(-300, 6);
    expect(e.washSale?.windowMonths).toBe(2);
    expect(e.taxEur).toBeCloseTo(0, 6);
  });

  it("converts foreign prices and fees with the given rate, and applies a 1-year window to US shares", () => {
    const txs = [
      tx({ type: "deposit", trade_date: "2025-01-02", amount: 2_000 }),
      tx({ type: "buy", trade_date: "2025-06-02", instrument_id: "nvda", quantity: 10, price: 100, currency: "USD", fx_rate: 0.9 }),
    ];
    const e = estimateSale([NVDA], txs, flat("nvda", 80, "2025-01-01", 700, "USD"), { USD: [["2025-01-01", 1.25]] }, {
      instrumentId: "nvda", qty: 10, price: 80, currency: "USD", fxEurPerUnit: 0.8, feeEur: 1, date: "2026-03-02",
    });
    expect(e.proceedsEur).toBeCloseTo(800 * 0.8 - 1, 6);
    expect(e.gainEur).toBeCloseTo(639 - 900, 6);
    expect(e.noRebuyUntil).toBe("2027-03-02");
  });

  it("refuses to sell more than you hold", () => {
    expect(() => estimateSale([ETF], buys, {}, {}, eur("etf", 21, 100, "2026-03-02"))).toThrow(SaleError);
  });

  it("follows splits in the open lots", () => {
    const txs = [...buys, tx({ type: "split", trade_date: "2025-09-01", instrument_id: "etf", split_ratio: 2 })];
    expect(openLots(txs, "etf", "2026-01-01").map((l) => l.qty)).toEqual([20, 20]);
  });
});
