import { describe, expect, it } from "vitest";

import { parseDate, parseNumber, parseTransactionsCsv } from "./csv";

describe("csv import", () => {
  it("parses a semicolon / decimal-comma file with Spanish headers", () => {
    const text = [
      "fecha;tipo;isin;nombre;cantidad;precio;importe;comision;divisa",
      "02/01/2026;aportación;;;;;450,00;;EUR",
      "02/01/2026;compra;IE00B4L5Y983;iShares Core MSCI World;3,5;98,40;;1,00;EUR",
      "15/03/2026;dividendo;IE00B4L5Y983;;;;1,23;;EUR",
    ].join("\n");
    const { rows, headerErrors } = parseTransactionsCsv(text, "2026-10-10");
    expect(headerErrors).toEqual([]);
    expect(rows.every((r) => r.ok)).toBe(true);
    expect(rows[1].tx).toMatchObject({ type: "buy", trade_date: "2026-01-02", quantity: 3.5, price: 98.4, fees: 1 });
    expect(rows[0].tx?.amount).toBe(450);
  });

  it("reports row-level errors without importing them", () => {
    const text = [
      "date,type,ticker,quantity,price,currency,fx_rate",
      "2026-13-01,buy,NVDA,1,100,EUR,",
      "2026-01-05,compra,,1,100,EUR,",
      "2026-01-05,buy,NVDA,0,100,EUR,",
      "2026-01-05,buy,NVDA,1,100,USD,",
      "2027-01-05,buy,NVDA,1,100,EUR,",
      "2026-01-05,swap,NVDA,1,100,EUR,",
    ].join("\n");
    const { rows } = parseTransactionsCsv(text, "2026-10-10");
    expect(rows.map((r) => r.ok)).toEqual([false, false, false, false, false, false]);
    expect(rows[0].errors).toContain("Invalid date");
    expect(rows[1].errors).toContain("Missing ISIN or ticker");
    expect(rows[2].errors).toContain("Quantity must be > 0");
    expect(rows[3].errors.join()).toMatch(/fx_rate/);
    expect(rows[4].errors).toContain("Future date");
    expect(rows[5].errors.join()).toMatch(/Unknown type/);
  });

  it("keeps identical rows as separate trades with stable hashes", () => {
    const text = ["date,type,ticker,quantity,price", "2026-01-05,buy,NVDA,1,100", "2026-01-05,buy,NVDA,1,100"].join("\n");
    const a = parseTransactionsCsv(text, "2026-10-10");
    const b = parseTransactionsCsv(text, "2026-10-10");
    const single = parseTransactionsCsv(text.split("\n").slice(0, 2).join("\n"), "2026-10-10");
    expect(a.rows.map((r) => r.ok)).toEqual([true, true]);
    expect(a.rows[0].tx?.import_hash).not.toBe(a.rows[1].tx?.import_hash);
    expect(a.rows.map((r) => r.tx?.import_hash)).toEqual(b.rows.map((r) => r.tx?.import_hash)); // re-import: no duplicates
    expect(single.rows[0].tx?.import_hash).toBe(a.rows[0].tx?.import_hash); // first copy keeps its hash
  });

  it("requires date and type columns", () => {
    expect(parseTransactionsCsv("foo,bar\n1,2", "2026-10-10").headerErrors.length).toBe(2);
  });

  it("parses numbers and dates", () => {
    expect(parseNumber("1.234,56", true)).toBe(1234.56);
    expect(parseNumber("1,234.56", false)).toBe(1234.56);
    expect(parseNumber("abc", false)).toBeNaN();
    expect(parseDate("29/02/2025")).toBeNull();
    expect(parseDate("29.02.2024")).toBe("2024-02-29");
  });
});
