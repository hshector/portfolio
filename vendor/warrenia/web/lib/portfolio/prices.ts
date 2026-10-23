import type { PricePoint } from "./engine";

/**
 * Engine series are adjusted backwards for splits and dividends (total return).
 * Portfolio valuation needs RAW prices (dividends are recorded as transactions and
 * splits as split transactions): raw(t) = adj(t) / prod(factor_e for events with ex_date > t).
 */
export function rawFromAdjusted(dates: string[], adj: (number | null)[], events: [string, number, string, string][] = []): PricePoint[] {
  const evs = [...events].sort((a, b) => a[0].localeCompare(b[0]));
  const out: PricePoint[] = [];
  // factor for date t = product of events strictly after t; walk backwards.
  let k = evs.length - 1;
  let f = 1;
  for (let i = dates.length - 1; i >= 0; i--) {
    while (k >= 0 && evs[k][0] > dates[i]) {
      f *= evs[k][1];
      k--;
    }
    const a = adj[i];
    if (a !== null && a !== undefined && Number.isFinite(a) && f > 0) out.push({ date: dates[i], price: a / f });
  }
  return out.reverse();
}
