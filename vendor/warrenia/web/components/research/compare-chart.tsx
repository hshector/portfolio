"use client";

import { useMemo, useState } from "react";

import { TimeSeriesChart, type SeriesSpec } from "@/components/charts/time-series";
import { Segmented } from "@/components/ui/primitives";
import { rebase, toPoints } from "@/lib/market/series";

export const COMPARE_COLORS = ["var(--accent)", "var(--info)", "var(--lilac)", "var(--ink-2)"];

export function CompareChart({ sessions, series }: { sessions: string[]; series: { t: string; c: (number | null)[] }[] }) {
  const [range, setRange] = useState<"3m" | "6m" | "1y" | "2y">("1y");
  const specs: SeriesSpec[] = useMemo(() => {
    const n = { "3m": 63, "6m": 126, "1y": 252, "2y": 504 }[range];
    const from = sessions[Math.max(0, sessions.length - n)];
    return series.map((s, i) => ({ kind: "line", data: rebase(toPoints(sessions, s.c), from), color: COMPARE_COLORS[i % 4], width: 2, priceFormat: "index", title: s.t }));
  }, [range, sessions, series]);
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <div className="flex flex-wrap gap-3 text-[12.5px]">
          {series.map((s, i) => (
            <span key={s.t} className="inline-flex items-center gap-1.5 font-mono text-ink-2">
              <span className="h-2 w-3 rounded-sm" style={{ background: COMPARE_COLORS[i % 4] }} />
              {s.t}
            </span>
          ))}
        </div>
        <Segmented size="sm" value={range} onChange={setRange} options={[{ value: "3m", label: "3M" }, { value: "6m", label: "6M" }, { value: "1y", label: "1A" }, { value: "2y", label: "2A" }]} />
      </div>
      <TimeSeriesChart series={specs} height={320} ariaLabel="Rentabilidad comparada, base 100" />
      <p className="t-meta">Total return, 100 at the start of the period.</p>
    </div>
  );
}
