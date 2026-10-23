"use client";

import { useMemo } from "react";

import { TimeSeriesChart, type SeriesSpec } from "@/components/charts/time-series";

const COLORS: Record<string, string> = {
  overall: "var(--accent)",
  overall_filtered: "var(--sand)",
  candidates: "var(--violet)",
  candidates_buffer: "var(--gold)",
  risk_adjusted: "var(--lilac)",
  pure_12_1: "var(--info)",
  ew_universe: "var(--ink-2)",
  bench_SPY: "var(--ink-3)",
};

export function BacktestChart({ dates, series, labels }: { dates: string[]; series: Record<string, (number | null)[]>; labels: Record<string, string> }) {
  const specs: SeriesSpec[] = useMemo(
    () =>
      Object.entries(series)
        .filter(([k]) => k in COLORS)
        .map(([k, v]) => ({
          kind: "line" as const,
          data: dates.map((d, i) => ({ time: d, value: (v[i] ?? NaN) * 100 })).filter((p) => Number.isFinite(p.value)),
          color: COLORS[k],
          width: k === "overall" || k === "candidates_buffer" ? 2 : 1,
          dashed: k.startsWith("bench") || k === "ew_universe",
          priceFormat: "index" as const,
        })),
    [dates, series],
  );
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-[12px] text-ink-2">
        {Object.keys(series)
          .filter((k) => k in COLORS)
          .map((k) => (
            <span key={k} className="inline-flex items-center gap-1.5">
              <span className="h-0.5 w-4" style={{ background: COLORS[k].startsWith("var") ? `var(${COLORS[k].slice(4, -1)})` : COLORS[k] }} />
              {labels[k] ?? k}
            </span>
          ))}
      </div>
      <TimeSeriesChart series={specs} height={300} ariaLabel="Backtest growth curves, 100 at the start" />
    </div>
  );
}
