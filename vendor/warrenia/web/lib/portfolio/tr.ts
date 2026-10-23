// Trade Republic's own CSV export (Profile → Documents/Statements → Transaction export, since
// April 2026). Format, as read by Portfolio Performance and other importers (no official spec):
//
//   "datetime","date","account_type","category","type","asset_class","name","symbol","shares",
//   "price","amount","fee","tax","currency","original_amount","original_currency","fx_rate",
//   "description","transaction_id","counterparty_name","counterparty_iban","payment_reference","mcc_code"
//
// Comma separated, decimal points, signed values: buys have positive shares and a negative amount,
// sells negative shares and a positive amount; fee and tax are negative when paid. `symbol` is the
// ISIN, `date` the Berlin booking date, `amount` is in the account currency (EUR) and excludes fee
// and tax (cash effect = amount + fee + tax). Dividends: `amount` is the gross in EUR.
//
// Anything we cannot map safely (shares transferred in from another broker, corporate actions,
// bonds maturing...) is shown as an error row with what to do, never guessed.

import type { Bucket, InstrumentKind, TxType } from "./types";
import type { ParsedRow } from "./csv";
import { parseDate, rowHash, splitLine } from "./csv";

export const TR_COLUMNS = ["datetime", "date", "account_type", "category", "type", "asset_class", "name", "symbol", "shares", "price", "amount", "fee", "tax", "currency"];

export function isTradeRepublic(header: string[]): boolean {
  const h = new Set(header);
  return ["date", "category", "type", "symbol", "shares", "amount", "transaction_id"].every((c) => h.has(c)) && (h.has("account_type") || h.has("asset_class"));
}

const DEPOSIT = /INBOUND|INPAYMENT|DEPOSIT|TOP_UP|TRANSFER_IN/;
const WITHDRAW = /OUTBOUND|WITHDRAW|PAYOUT|TRANSFER_OUT/;
const FREE_SHARES = /SAVEBACK|STOCKPERK|BONUS|FREE_RECEIPT|GIFT|REWARD/;
const KIND: Record<string, InstrumentKind> = { STOCK: "stock", FUND: "etf", ETF: "etf", ETC: "etc", ETN: "etc", CRYPTO: "other", BOND: "other", DERIVATIVE: "other" };

function num(s: string | undefined): number | null {
  if (s === undefined) return null;
  const t = s.trim();
  if (!t) return null;
  const v = Number(t);
  return Number.isFinite(v) ? v : NaN;
}

type Base = Omit<NonNullable<ParsedRow["tx"]>, "import_hash" | "note" | "source" | "split_ratio" | "currency" | "fx_rate">;

/** Parse the export into the generic preview rows (one TR line may give two rows: saveback = deposit + buy). */
export function parseTradeRepublic(lines: string[], today: string): { rows: ParsedRow[]; headerErrors: string[]; columns: string[] } {
  const header = splitLine(lines[0], ",").map((h) => h.toLowerCase());
  const col = Object.fromEntries(header.map((h, i) => [h, i]));
  const rows: ParsedRow[] = [];
  const seen = new Map<string, number>();
  const dividends: { row: ParsedRow; isin: string; amount: number }[] = [];

  lines.slice(1).forEach((line, k) => {
    const c = splitLine(line, ",");
    const get = (n: string) => (col[n] !== undefined ? (c[col[n]] ?? "").trim() : "");
    const lineNo = k + 2;
    const category = get("category").toUpperCase();
    const type = get("type").toUpperCase();
    const assetClass = get("asset_class").toUpperCase();
    const name = get("name") || null;
    const symbol = get("symbol").toUpperCase();
    const isin = /^[A-Z]{2}[A-Z0-9]{9}[0-9]$/.test(symbol) ? symbol : null;
    const ticker = !isin && /^[A-Z0-9.\-]{1,12}$/.test(symbol) ? symbol : null; // crypto: BTC, ETH…
    const date = parseDate(get("date")) ?? parseDate(get("datetime"));
    const shares = num(get("shares"));
    const price = num(get("price"));
    const amount = num(get("amount"));
    const fee = num(get("fee"));
    const tax = num(get("tax"));
    const currency = (get("currency") || "EUR").toUpperCase();
    const label = `${category}/${type}`;
    const errors: string[] = [];
    if (!date) errors.push("Invalid date");
    else if (date > today) errors.push("Future date");
    for (const [k2, v] of [["shares", shares], ["price", price], ["amount", amount], ["fee", fee], ["tax", tax]] as const) if (Number.isNaN(v)) errors.push(`Invalid number in "${k2}"`);
    if (currency !== "EUR") errors.push(`Account currency ${currency}: only euro accounts are supported`);

    const hint = { kind: KIND[assetClass] ?? (isin ? "etf" : "other"), bucket: (assetClass === "STOCK" ? "momentum" : "other") as Bucket };
    const push = (t: TxType, base: Partial<Base>, note: string, part = 0, extraErrors: string[] = []) => {
      const errs = [...errors, ...extraErrors];
      const content = ["tr", date, type, isin ?? ticker, shares, amount, fee, tax, part];
      const key = content.join("|");
      const occ = (seen.get(key) ?? 0) + 1; // identical bookings on the same day stay distinct
      seen.set(key, occ);
      const ok = errs.length === 0;
      const r: ParsedRow = {
        line: lineNo,
        ok,
        errors: errs,
        isin,
        ticker,
        name,
        source: label,
        hint: ["buy", "sell", "dividend"].includes(t) ? hint : undefined,
        tx: ok
          ? {
              type: t,
              trade_date: date!,
              quantity: base.quantity ?? null,
              price: base.price ?? null,
              amount: base.amount ?? null,
              fees: base.fees ?? 0,
              taxes: base.taxes ?? 0,
              currency: "EUR",
              fx_rate: 1,
              split_ratio: null,
              note,
              source: "csv",
              import_hash: rowHash([...content, occ]),
            }
          : null,
      };
      rows.push(r);
      return r;
    };
    const fees = fee ? -fee : 0; // TR: negative = paid
    const taxes = tax ? -tax : 0;
    const absShares = shares ? Math.abs(shares) : 0;
    const unitPrice = amount && absShares ? Math.abs(amount) / absShares : price !== null && price >= 0 ? price : null;

    if (category === "TRADING" || category === "DELIVERY" || (shares !== null && shares !== 0 && category !== "CASH" && category !== "CORPORATE_ACTION")) {
      if (!isin) {
        return void push("buy", {}, label, 0, [assetClass === "CRYPTO" || ticker ? "Crypto bought directly (no ISIN): not supported. The plan uses a bitcoin ETP, which has an ISIN." : "No ISIN"]);
      }
      if (!shares) return void push("buy", {}, label, 0, ["No number of shares"]);
      // Free shares (saveback, stock perks, bonuses) that did not take cash from the account: record the
      // gift as a deposit and then the buy, so cash and returns stay right. When the row did debit cash,
      // the credit comes as its own cash row and this is an ordinary buy.
      const gift = FREE_SHARES.test(type) && shares > 0 && (amount === null || amount >= 0);
      if (!gift && (category === "DELIVERY" || /MIGRATION|TRANSFER/.test(type))) {
        return void push("buy", {}, label, 0, ["Shares transferred in: add them by hand with the price you originally paid (needed for taxes)"]);
      }
      if (gift) {
        const value = unitPrice !== null ? absShares * unitPrice : 0;
        if (value > 0) push("deposit", { amount: value }, `${label}: paid by Trade Republic`, 1);
        return void push("buy", { quantity: absShares, price: unitPrice ?? 0, fees: 0, taxes: 0 }, `${label}: free shares`, 2);
      }
      if (unitPrice === null) return void push("buy", {}, label, 0, ["No price or amount"]);
      // Taxes on a purchase (e.g. Spain's financial transaction tax) are part of its cost, like fees.
      if (shares > 0) return void push("buy", { quantity: absShares, price: unitPrice, fees: fees + taxes, taxes: 0 }, label);
      return void push("sell", { quantity: absShares, price: unitPrice, fees, taxes }, label);
    }

    if (category === "CORPORATE_ACTION") {
      return void push("split", {}, label, 0, [`Corporate action (${type}): record it by hand (for a split, its ratio)`]);
    }

    // Cash movements
    if (amount === null || amount === 0) return void push("fee", {}, label, 0, ["No amount: nothing to record"]);
    if (/MATURITY|REDEMPTION|TILG/.test(type)) return void push("deposit", {}, label, 0, ["Bond repayment: not supported, record it by hand"]);
    if (/DIVIDEND|DISTRIBUTION|COUPON/.test(type) || (type === "INTEREST_PAYMENT" && isin)) {
      if (!isin) return void push("dividend", {}, label, 0, ["Dividend without ISIN"]);
      if (amount < 0) {
        // Correction: Trade Republic reverses the original (negative amount) and books it again.
        const orig = dividends.find((d) => d.isin === isin && Math.abs(d.amount + amount) < 0.005 && d.row.ok);
        if (orig) {
          orig.row.ok = false;
          orig.row.tx = null;
          orig.row.errors.push(`Cancelled by the correction on line ${lineNo}`);
          return void push("dividend", {}, label, 0, [`Correction of line ${orig.row.line}: both left out`]);
        }
        return void push("dividend", {}, label, 0, ["Dividend correction without the original in this file: record it by hand"]);
      }
      // Stored like the manual form: net amount received, tax withheld alongside.
      const r = push("dividend", { amount: amount - taxes, taxes }, label, 0, amount - taxes < 0 ? ["Tax larger than the dividend: record it by hand"] : []);
      dividends.push({ row: r, isin, amount });
      return;
    }
    if (/INTEREST/.test(type)) {
      if (amount - taxes > 0) return void push("interest", { amount: amount - taxes, taxes }, taxes ? `${label}: net of ${taxes.toFixed(2)} € tax withheld` : label);
      return void push("fee", { amount: -amount }, `${label}: interest correction`);
    }
    if (/TAX/.test(type)) return void push(amount < 0 ? "tax" : "deposit", { amount: Math.abs(amount) }, amount < 0 ? label : `${label}: tax refund`);
    if (/FEE/.test(type)) return void push(amount < 0 ? "fee" : "deposit", { amount: Math.abs(amount) }, amount < 0 ? label : `${label}: fee refund`);
    if (DEPOSIT.test(type) || WITHDRAW.test(type) || /CARD|PAYMENT|TRANSFER|DIRECT_DEBIT|SEPA|ROUND|CASH/.test(type) || category === "CASH") {
      // Card payments and transfers: money leaving or entering the account.
      return void push(amount > 0 ? "deposit" : "withdrawal", { amount: Math.abs(amount) }, /CARD/.test(type) ? `${label}: card` : label);
    }
    push("deposit", {}, label, 0, [`Unknown type ${label}: record it by hand`]);
  });
  return { rows, headerErrors: [], columns: header };
}

const SUFFIX = new Set(["inc", "incorporated", "corp", "corporation", "co", "company", "plc", "ltd", "limited", "sa", "nv", "ag", "se", "spa", "holdings", "holding", "group", "the", "adr", "class", "reg", "registered", "shares", "ord", "ordinary", "com", "common", "stock"]);

export function normName(n: string): string {
  return n
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9 ]/g, " ")
    .split(/\s+/)
    .filter((w) => w && !SUFFIX.has(w))
    .join(" ");
}

/** US ticker for a Trade Republic name, only when exactly one stock in the radar has the same name. */
export function matchTicker(name: string | null, stocks: { t: string; n: string }[]): string | null {
  if (!name) return null;
  const key = normName(name);
  if (!key) return null;
  const hits = stocks.filter((s) => normName(s.n) === key);
  return hits.length === 1 ? hits[0].t : null;
}
