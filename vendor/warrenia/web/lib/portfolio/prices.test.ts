import { describe, expect, it } from "vitest";

import { rawFromAdjusted } from "./prices";

describe("rawFromAdjusted", () => {
  it("undoes a 4-for-1 split and a dividend adjustment", () => {
    const dates = ["2026-01-01", "2026-01-02", "2026-01-03", "2026-01-04"];
    // raw: 400, 400 (split ex 01-03 -> 100), 100, then dividend ex 01-04 of 1 on prev close 100 -> raw 99
    const adj = [400 * 0.25 * 0.99, 400 * 0.25 * 0.99, 100 * 0.99, 99];
    const r = rawFromAdjusted(dates, adj, [["2026-01-03", 0.25, "split", "4:1"], ["2026-01-04", 0.99, "dividend", "1"]]);
    expect(r.map((p) => Math.round(p.price * 1e6) / 1e6)).toEqual([400, 400, 100, 99]);
  });
  it("skips missing values", () => {
    expect(rawFromAdjusted(["a", "b"], [null, 5])).toEqual([{ date: "b", price: 5 }]);
  });
});
