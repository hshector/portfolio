import { describe, expect, it } from "vitest";

import { parseTransactionsCsv } from "./csv";
import { matchTicker, normName } from "./tr";

const H =
  '"datetime","date","account_type","category","type","asset_class","name","symbol","shares","price","amount","fee","tax","currency","original_amount","original_currency","fx_rate","description","transaction_id","counterparty_name","counterparty_iban","payment_reference","mcc_code"';
const row = (date: string, category: string, type: string, assetClass: string, name: string, symbol: string, shares: string, price: string, amount: string, fee: string, tax: string, id: string) =>
  `"${date}T09:00:00.000Z","${date}","DEFAULT","${category}","${type}","${assetClass}","${name}","${symbol}","${shares}","${price}","${amount}","${fee}","${tax}","EUR","","","","","${id}","","","",""`;

const CSV = [
  H,
  row("2025-12-01", "CASH", "CUSTOMER_INBOUND", "", "", "", "", "", "1000.00", "", "", "1"),
  row("2026-01-02", "TRADING", "SAVINGS_PLAN_EXECUTED", "FUND", "Core MSCI World USD (Acc)", "IE00B4L5Y983", "1.2345678901", "101.230000", "-124.97", "0.00", "", "2"),
  row("2026-03-10", "TRADING", "BUY", "STOCK", "Apple", "US0378331005", "2.0000000000", "180.500000", "-361.00", "-1.00", "", "3"),
  row("2026-03-15", "CASH", "CARD_TRANSACTION", "", "", "", "", "", "-12.50", "", "", "4"),
  row("2026-04-01", "CASH", "INTEREST_PAYMENT", "", "", "", "", "", "3.21", "", "-0.61", "5"),
  row("2026-05-15", "CASH", "DIVIDEND", "STOCK", "Apple", "US0378331005", "", "", "0.40", "", "-0.14", "6"),
  row("2026-05-20", "CASH", "DIVIDEND", "STOCK", "Apple", "US0378331005", "", "", "-0.40", "", "0.14", "7"),
  row("2026-05-21", "CASH", "DIVIDEND", "STOCK", "Apple", "US0378331005", "", "", "0.41", "", "-0.14", "8"),
  row("2026-06-01", "TRADING", "BENEFITS_SAVEBACK", "FUND", "Core MSCI World USD (Acc)", "IE00B4L5Y983", "0.0500000000", "100.000000", "", "", "", "9"),
  row("2026-06-02", "DELIVERY", "MIGRATION", "STOCK", "Microsoft", "US5949181045", "3.0000000000", "", "", "", "", "10"),
  row("2026-06-03", "TRADING", "BUY", "CRYPTO", "Bitcoin", "BTC", "0.0010000000", "60000.00", "-60.00", "-1.00", "", "11"),
  row("2026-07-14", "TRADING", "SELL", "STOCK", "Apple", "US0378331005", "-1.0000000000", "210.000000", "210.00", "-1.00", "-3.80", "12"),
  row("2026-08-03", "TRADING", "SAVINGS_PLAN_EXECUTED", "FUND", "Core MSCI World USD (Acc)", "IE00B4L5Y983", "1.1500000000", "108.600000", "-124.89", "0.00", "", "13"),
  row("2026-08-03", "TRADING", "SAVINGS_PLAN_EXECUTED", "FUND", "Core MSCI World USD (Acc)", "IE00B4L5Y983", "1.1500000000", "108.600000", "-124.89", "0.00", "", "14"),
].join("\n");

describe("Trade Republic CSV", () => {
  const p = parseTransactionsCsv(CSV, "2026-10-12");
  const ok = p.rows.filter((r) => r.ok);
  const byLine = (l: number) => p.rows.filter((r) => r.line === l);

  it("is recognised by its header", () => {
    expect(p.format).toBe("trade_republic");
    expect(p.headerErrors).toEqual([]);
  });

  it("maps deposits, savings plans, buys with fees, card payments and interest net of tax", () => {
    expect(byLine(2)[0].tx).toMatchObject({ type: "deposit", amount: 1000 });
    expect(byLine(3)[0].tx).toMatchObject({ type: "buy", quantity: 1.2345678901, fees: 0 });
    expect(byLine(3)[0].tx!.price! * 1.2345678901).toBeCloseTo(124.97, 6); // price from the cash amount
    expect(byLine(3)[0].hint).toEqual({ kind: "etf", bucket: "other" });
    expect(byLine(4)[0].tx).toMatchObject({ type: "buy", quantity: 2, price: 180.5, fees: 1 });
    expect(byLine(4)[0].hint?.kind).toBe("stock");
    expect(byLine(5)[0].tx).toMatchObject({ type: "withdrawal", amount: 12.5 });
    expect(byLine(6)[0].tx).toMatchObject({ type: "interest", taxes: 0.61 });
    expect(byLine(6)[0].tx!.amount).toBeCloseTo(2.6, 6);
  });

  it("cancels a reversed dividend and keeps the rebooking, net of tax", () => {
    expect(byLine(7)[0].ok).toBe(false);
    expect(byLine(8)[0].ok).toBe(false);
    expect(byLine(9)[0].tx).toMatchObject({ type: "dividend", taxes: 0.14 });
    expect(byLine(9)[0].tx!.amount).toBeCloseTo(0.27, 6);
  });

  it("free shares become a deposit plus a buy; transfers-in and direct crypto are refused with a reason", () => {
    const sb = byLine(10);
    expect(sb.map((r) => r.tx?.type)).toEqual(["deposit", "buy"]);
    expect(sb[0].tx!.amount).toBeCloseTo(5, 6);
    expect(sb[1].tx).toMatchObject({ quantity: 0.05, price: 100 });
    expect(byLine(11)[0].ok).toBe(false);
    expect(byLine(11)[0].errors[0]).toMatch(/price you originally paid/);
    expect(byLine(12)[0].errors[0]).toMatch(/Crypto/);
  });

  it("sells carry fee and tax; identical bookings on the same day both import", () => {
    expect(byLine(13)[0].tx).toMatchObject({ type: "sell", quantity: 1, price: 210, fees: 1, taxes: 3.8 });
    const a = byLine(14)[0].tx!.import_hash;
    const b = byLine(15)[0].tx!.import_hash;
    expect(a).not.toBe(b);
    expect(ok.length).toBe(11); // 14 lines: 2 cancelled dividends, 1 transfer-in, 1 crypto refused; saveback gives 2 rows
  });

  it("re-importing the same file gives the same hashes (no duplicates)", () => {
    const again = parseTransactionsCsv(CSV, "2026-10-12");
    expect(again.rows.map((r) => r.tx?.import_hash)).toEqual(p.rows.map((r) => r.tx?.import_hash));
  });
});

describe("ticker matching by name", () => {
  const stocks = [
    { t: "AAPL", n: "Apple Inc." },
    { t: "GOOGL", n: "Alphabet Inc. Class A" },
    { t: "GOOG", n: "Alphabet Inc. Class C" },
    { t: "MSFT", n: "Microsoft Corp" },
  ];
  it("matches unique names only", () => {
    expect(normName("Apple Inc.")).toBe("apple");
    expect(matchTicker("Apple", stocks)).toBe("AAPL");
    expect(matchTicker("Microsoft", stocks)).toBe("MSFT");
    expect(matchTicker("Alphabet A", stocks)).toBe("GOOGL");
    expect(matchTicker("Alphabet", stocks)).toBeNull();
    expect(matchTicker("Unknown Co", stocks)).toBeNull();
  });
});
