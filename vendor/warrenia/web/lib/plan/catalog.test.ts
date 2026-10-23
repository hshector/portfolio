import { describe, expect, it } from "vitest";

import { answersFor, byIsin, chooseCore, defaultChoices, isinValid, momentumRoute, normaliseChoices, PRODUCTS, productsFor, recommended, splitByProduct } from "./catalog";

describe("product catalog", () => {
  it("validates ISIN check digits (known references)", () => {
    expect(isinValid("US0378331005")).toBe(true); // Apple
    expect(isinValid("US0378331006")).toBe(false);
    expect(isinValid("IE00B4L5Y98")).toBe(false);
  });
  it("every ISIN in the catalog has a valid check digit and is unique", () => {
    for (const p of PRODUCTS.filter((x) => x.vehicle !== "Cash account")) expect(isinValid(p.isin), p.isin).toBe(true);
    expect(new Set(PRODUCTS.map((p) => p.isin)).size).toBe(PRODUCTS.length);
  });
  it("one recommended product per block, listed first, sane fees and a source each", () => {
    for (const b of ["core", "gold", "momentum", "cash"] as const) {
      expect(PRODUCTS.filter((p) => p.bucket === b && p.recommended)).toHaveLength(1);
      expect(productsFor(b)[0]).toBe(recommended(b));
    }
    for (const p of PRODUCTS) {
      expect(p.ter).toBeGreaterThanOrEqual(0);
      expect(p.ter).toBeLessThan(0.01);
      expect(p.sources.length).toBeGreaterThan(0);
    }
  });
  it("ETCs and crypto ETPs are capital-income for Spanish tax; UCITS ETFs and funds are capital gains; cash pays taxed interest", () => {
    for (const p of PRODUCTS) expect(p.tax).toBe(p.vehicle === "ETC" || p.vehicle === "ETP" ? "rcm" : p.vehicle === "Cash account" ? "interest" : "gain");
  });
  it("momentum sleeve routes small amounts to the ETF", () => {
    expect(momentumRoute(1200)).toBe("etf");
    expect(momentumRoute(8000)).toBe("stocks");
  });
});

describe("choices", () => {
  it("defaults to the recommended product of each block", () => {
    const d = defaultChoices();
    expect(d.core[0].isin).toBe(recommended("core").isin);
    expect(d.gold).toEqual([{ isin: recommended("gold").isin, weight: 1 }]);
    expect(d.cash).toEqual([{ isin: "CASH-ACCOUNT", weight: 1 }]);
  });
  it("normalises weights, drops unknown or misplaced products and merges duplicates", () => {
    const c = normaliseChoices({
      gold: [
        { isin: "IE00B4ND3602", weight: 60 },
        { isin: "XS2940466316", weight: 20 },
        { isin: "IE00B4ND3602", weight: 20 },
        { isin: "IE00BK5BQT80", weight: 50 }, // a core ETF is not a diversifier
        { isin: "XX0000000000", weight: 10 },
      ],
    });
    expect(c.gold).toEqual([
      { isin: "IE00B4ND3602", weight: 0.8 },
      { isin: "XS2940466316", weight: 0.2 },
    ]);
    expect(c.core).toEqual(defaultChoices().core);
    expect(normaliseChoices({ gold: [{ isin: "IE00B4ND3602", weight: 0 }] }).gold).toEqual(defaultChoices().gold);
  });
  it("splits each block's euros across its products", () => {
    const c = normaliseChoices({ gold: [{ isin: "IE00B4ND3602", weight: 3 }, { isin: "LU1650487413", weight: 1 }] });
    const s = splitByProduct({ core: 300, gold: 40, momentum: 60, cash: 0 }, c);
    expect(s.find((x) => x.product.isin === "IE00B4ND3602")?.amount).toBeCloseTo(30);
    expect(s.find((x) => x.product.isin === "LU1650487413")?.amount).toBeCloseTo(10);
    expect(s.reduce((t, x) => t + x.amount, 0)).toBeCloseTo(400);
  });
});

describe("core chooser", () => {
  it("maps the three questions to one product, always one in the catalog", () => {
    expect(chooseCore({ emerging: true, small: false, taxFreeSwitch: false }).isin).toBe("IE00BK5BQT80");
    expect(chooseCore({ emerging: true, small: true, taxFreeSwitch: false }).isin).toBe("IE00B3YLTY66");
    expect(chooseCore({ emerging: false, small: false, taxFreeSwitch: false }).isin).toBe("IE00BJ0KDQ92");
    expect(chooseCore({ emerging: true, small: true, taxFreeSwitch: true }).isin).toBe("IE00BYX5NX33");
    for (const e of [true, false]) for (const s of [true, false]) for (const t of [true, false]) {
      expect(byIsin(chooseCore({ emerging: e, small: s, taxFreeSwitch: t }).isin)?.bucket).toBe("core");
    }
  });
});

describe("core chooser round trip", () => {
  it("answersFor(product) leads back to that product for every core option the chooser can return", () => {
    for (const isin of ["IE00BK5BQT80", "IE00B3YLTY66", "IE00BJ0KDQ92", "IE00BYX5NX33"]) expect(chooseCore(answersFor(isin)).isin).toBe(isin);
  });
});
