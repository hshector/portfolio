import { describe, expect, it } from "vitest";

import { latestToday, localToday, moneyHeadline, parseDecimal, todayMadrid, units } from "./format";

describe("worst-case number formatting", () => {
  it("keeps the precision of tiny fractional positions", () => {
    expect(units(0.000123)).toBe("0.000123");
    expect(units(1.5)).toBe("1.5");
    expect(units(214587.3)).toBe("214,587.3");
    expect(units(17)).toBe("17");
  });
  it("drops cents from headline amounts of 100,000 or more", () => {
    expect(moneyHeadline(8870622.02)).toBe("€8,870,622");
    expect(moneyHeadline(99999.5)).toBe("€99,999.50");
    expect(moneyHeadline(null)).toBe("—");
  });
});

describe("typed amounts", () => {
  it("reads Spanish and English separators", () => {
    expect(parseDecimal("1.500,50")).toBe("1500.50");
    expect(parseDecimal("1,500.50")).toBe("1500.50");
    expect(parseDecimal("1 500,5")).toBe("1500.5");
    expect(parseDecimal("0,000123")).toBe("0.000123");
    expect(parseDecimal("12.5")).toBe("12.5");
    expect(parseDecimal("1.000.000")).toBe("1000000");
    expect(parseDecimal(" 42 ")).toBe("42");
    expect(Number(parseDecimal("abc"))).toBeNaN();
  });
});

describe("today", () => {
  it("uses Spain's date, not UTC's, after midnight in Madrid", () => {
    const halfPastMidnightMadrid = new Date("2026-07-14T22:30:00Z"); // 00:30 CEST on the 15th
    expect(todayMadrid(halfPastMidnightMadrid)).toBe("2026-07-15");
    expect(latestToday(halfPastMidnightMadrid)).toBe("2026-07-15");
    expect(localToday(halfPastMidnightMadrid)).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
