// Derived chart series from an asset's adjusted closes (computed client- or
// server-side from published data; nothing here is fetched).

export type Pt = { time: string; value: number };

export function toPoints(dates: string[], values: (number | null)[]): Pt[] {
  const out: Pt[] = [];
  for (let i = 0; i < dates.length && i < values.length; i++) {
    const v = values[i];
    if (v !== null && v !== undefined && Number.isFinite(v)) out.push({ time: dates[i], value: v });
  }
  return out;
}

export function sma(pts: Pt[], n: number): Pt[] {
  const out: Pt[] = [];
  let sum = 0;
  for (let i = 0; i < pts.length; i++) {
    sum += pts[i].value;
    if (i >= n) sum -= pts[i - n].value;
    if (i >= n - 1) out.push({ time: pts[i].time, value: sum / n });
  }
  return out;
}

/** Relative strength vs benchmark, rebased to 100 at the first common date. */
export function relativeStrength(asset: Pt[], bench: Pt[]): Pt[] {
  const b = new Map(bench.map((p) => [p.time, p.value]));
  const out: Pt[] = [];
  let base: number | null = null;
  for (const p of asset) {
    const bv = b.get(p.time);
    if (!bv) continue;
    const r = p.value / bv;
    if (base === null) base = r;
    out.push({ time: p.time, value: (100 * r) / base });
  }
  return out;
}

export function drawdown(pts: Pt[]): Pt[] {
  let peak = -Infinity;
  return pts.map((p) => {
    peak = Math.max(peak, p.value);
    return { time: p.time, value: p.value / peak - 1 };
  });
}

export function rebase(pts: Pt[], from?: string): Pt[] {
  const start = from ? pts.findIndex((p) => p.time >= from) : 0;
  if (start < 0 || !pts[start]) return [];
  const b = pts[start].value;
  return pts.slice(start).map((p) => ({ time: p.time, value: (100 * p.value) / b }));
}

export function sliceFrom(pts: Pt[], sessions: number): Pt[] {
  return sessions >= pts.length ? pts : pts.slice(pts.length - sessions);
}
