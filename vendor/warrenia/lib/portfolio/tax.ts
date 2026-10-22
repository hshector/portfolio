// "Before you sell": the Spanish IRPF effect of a sale, estimated before you place it.
// Pure functions, no I/O (tested in tax.test.ts). Informative, not tax advice.
//
// The sale is replayed through the same ledger as the portfolio (computePortfolio), so
// FIFO cost, fees and the anti-loss rule (art. 33.5.f/g LIRPF) are exactly the ones the
// portfolio shows afterwards. The tax is the difference in the year's savings-base tax
// with and without the sale:
// - gains and losses (ganancias patrimoniales) and capital income (rendimientos del
//   capital mobiliario: gold ETCs, dividends, interest) each net out within the year,
//   and a negative balance offsets up to 25 % of the other one (art. 49 LIRPF);
// - savings-base brackets: 19 % to €6,000, 21 % to €50,000, 23 % to €200,000, 27 % to
//   €300,000, 30 % above.
// Not included: losses carried over from previous years, other income you declare
// outside this app, and regional differences (the savings base has none).

import { addMonths, computePortfolio, sortTx, washWindowMonths, type FxTable, type PriceSeries, type SaleRecord, type TaxCategory } from "./engine";
import type { Instrument, Transaction } from "./types";

export const SAVINGS_BRACKETS: readonly (readonly [upTo: number, rate: number])[] = [
  [6_000, 0.19],
  [50_000, 0.21],
  [200_000, 0.23],
  [300_000, 0.27],
  [Infinity, 0.3],
];

/** Tax on a savings base (EUR), by brackets. */
export function savingsTax(base: number): number {
  let tax = 0;
  let from = 0;
  for (const [to, rate] of SAVINGS_BRACKETS) {
    if (base <= from) break;
    tax += (Math.min(base, to) - from) * rate;
    from = to;
  }
  return tax;
}

/** Taxable savings base of one year from its two balances (art. 49 LIRPF, without carry-overs). */
export function savingsBase(gp: number, rcm: number): number {
  if (gp < 0 && rcm > 0) return Math.max(0, rcm - Math.min(-gp, 0.25 * rcm));
  if (rcm < 0 && gp > 0) return Math.max(0, gp - Math.min(-rcm, 0.25 * gp));
  return Math.max(0, gp) + Math.max(0, rcm);
}

export interface YearTax {
  /** Net gains and losses from sales (losses blocked by the anti-loss rule excluded). */
  gp: number;
  /** Capital income: gold ETC sales, dividends (before withholding) and interest. */
  rcm: number;
  base: number;
  tax: number;
}

export interface LotOut {
  date: string;
  qty: number;
  costEur: number;
}

export interface SaleEstimate {
  date: string;
  qty: number;
  proceedsEur: number;
  costEur: number;
  gainEur: number;
  category: TaxCategory;
  /** Loss not usable this year: the same security was bought within the window and is still held. */
  washSale: SaleRecord["washSale"];
  /** For a loss: buying the same security back on or before this date blocks the loss (null for a gain). */
  noRebuyUntil: string | null;
  /** FIFO lots this sale takes, oldest first. */
  lots: LotOut[];
  year: string;
  before: YearTax;
  after: YearTax;
  /** Extra tax this year because of the sale (negative: the sale saves tax). */
  taxEur: number;
  /** Proceeds after fees and the extra tax (a tax saving is not added: it is in taxEur). */
  netEur: number;
}

export interface SaleInput {
  instrumentId: string;
  qty: number;
  /** Price per unit in `currency`. */
  price: number;
  currency: string;
  /** EUR per 1 unit of `currency` (1 for EUR). */
  fxEurPerUnit: number;
  feeEur: number;
  date: string;
}

export class SaleError extends Error {}

/** Lots held on `date` for one instrument, FIFO order (same rules as the portfolio ledger). */
export function openLots(txs: Transaction[], instrumentId: string, date: string): LotOut[] {
  const lots: LotOut[] = [];
  for (const t of sortTx(txs.filter((x) => x.instrument_id === instrumentId && x.trade_date <= date))) {
    const fx = t.fx_rate > 0 ? t.fx_rate : 1;
    if (t.type === "buy") {
      const q = t.quantity ?? 0;
      lots.push({ date: t.trade_date, qty: q, costEur: (q * (t.price ?? 0) + (t.fees ?? 0)) * fx });
    } else if (t.type === "sell") {
      let q = t.quantity ?? 0;
      while (q > 1e-9 && lots.length) {
        const lot = lots[0];
        const take = Math.min(lot.qty, q);
        const c = lot.costEur * (take / lot.qty);
        lot.qty -= take;
        lot.costEur -= c;
        q -= take;
        if (lot.qty <= 1e-9) lots.shift();
      }
    } else if (t.type === "split") {
      for (const lot of lots) lot.qty *= t.split_ratio ?? 1;
    }
  }
  return lots;
}

/** The first `qty` units of the open lots (what a FIFO sale takes). */
function takeFifo(lots: LotOut[], qty: number): LotOut[] {
  const out: LotOut[] = [];
  let q = qty;
  for (const lot of lots) {
    if (q <= 1e-9) break;
    const take = Math.min(lot.qty, q);
    out.push({ date: lot.date, qty: take, costEur: lot.costEur * (take / lot.qty) });
    q -= take;
  }
  return out;
}

/** The year's balances from a portfolio result plus the year's dividends and interest. */
export function yearTax(taxByYear: { year: string; gp: number; rcm: number }[], txs: Transaction[], year: string): YearTax {
  const row = taxByYear.find((y) => y.year === year);
  let income = 0;
  for (const t of txs) {
    if (!t.trade_date.startsWith(year)) continue;
    const fx = t.fx_rate > 0 ? t.fx_rate : 1;
    if (t.type === "dividend") income += ((t.amount ?? 0) + (t.taxes ?? 0)) * fx;
    else if (t.type === "interest") income += (t.amount ?? 0) * fx;
  }
  const gp = row?.gp ?? 0;
  const rcm = (row?.rcm ?? 0) + income;
  const base = savingsBase(gp, rcm);
  return { gp, rcm, base, tax: savingsTax(base) };
}

export function estimateSale(instruments: Instrument[], txs: Transaction[], prices: Record<string, PriceSeries>, fx: FxTable, input: SaleInput): SaleEstimate {
  const ins = instruments.find((i) => i.id === input.instrumentId);
  if (!ins) throw new SaleError("Unknown instrument");
  if (!(input.qty > 0)) throw new SaleError("Enter the units to sell");
  if (!(input.price >= 0) || !(input.fxEurPerUnit > 0)) throw new SaleError("Enter a valid price");
  const lots = openLots(txs, ins.id, input.date);
  const held = lots.reduce((s, l) => s + l.qty, 0);
  if (input.qty > held + 1e-7) throw new SaleError(`You hold ${held.toLocaleString("en-GB", { maximumFractionDigits: 6 })} units`);
  const qty = Math.min(input.qty, held);

  const sell: Transaction = {
    id: "__simulated_sale", instrument_id: ins.id, type: "sell", trade_date: input.date, quantity: qty, price: input.price,
    amount: null, fees: input.feeEur / input.fxEurPerUnit, taxes: 0, currency: input.currency, fx_rate: input.fxEurPerUnit,
    split_ratio: null, note: null, source: "manual",
  };
  const before = computePortfolio(instruments, txs, prices, fx, input.date);
  const after = computePortfolio(instruments, [...txs, sell], prices, fx, input.date);
  // Same-day ordering puts the simulated sale after any real sale of that day: it is the last one.
  const sale = [...after.sales].reverse().find((s) => s.instrumentId === ins.id && s.date === input.date);
  if (!sale) throw new SaleError("Could not simulate this sale");

  const year = input.date.slice(0, 4);
  const yBefore = yearTax(before.taxByYear, txs, year);
  const yAfter = yearTax(after.taxByYear, txs, year);
  const taxEur = yAfter.tax - yBefore.tax;
  return {
    date: input.date,
    qty,
    proceedsEur: sale.proceedsEur,
    costEur: sale.costEur,
    gainEur: sale.gainEur,
    category: sale.category,
    washSale: sale.washSale,
    noRebuyUntil: sale.gainEur < -0.005 ? addMonths(input.date, washWindowMonths(ins)) : null,
    lots: takeFifo(lots, qty),
    year,
    before: yBefore,
    after: yAfter,
    taxEur,
    netEur: sale.proceedsEur - Math.max(0, taxEur),
  };
}
