"use client";

import { useMemo } from "react";

import { TimeSeriesChart } from "@/components/charts/time-series";
import type { DailyPoint } from "@/lib/portfolio/engine";

export function ValueChart({ series }: { series: DailyPoint[] }) {
  const specs = useMemo(
    () => [
      { kind: "area" as const, data: series.map((p) => ({ time: p.date, value: p.value })), color: "var(--accent)", width: 2 },
      { kind: "line" as const, data: series.map((p) => ({ time: p.date, value: p.invested })), color: "var(--ink-3)", width: 1, dashed: true },
    ],
    [series],
  );
  if (series.length < 2) return <p className="py-8 text-center text-[14px] text-ink-3">The chart appears from the second day.</p>;
  return (
    <>
      <div className="mb-2 flex gap-4 text-[12.5px] text-ink-2">
        <span className="flex items-center gap-1.5">
          <span className="h-0.5 w-3.5 rounded bg-accent" /> Value
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-3.5 border-t border-dashed border-ink-3" /> Invested
        </span>
      </div>
      <TimeSeriesChart series={specs} height={180} ariaLabel="Portfolio value versus money invested" />
    </>
  );
}
