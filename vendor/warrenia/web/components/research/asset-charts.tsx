"use client";

import { useMemo, useState } from "react";

import { TimeSeriesChart, type SeriesSpec } from "@/components/charts/time-series";
import { cx, Segmented } from "@/components/ui/primitives";
import { pct } from "@/lib/format";
import { relativeStrength, sliceFrom, sma, toPoints } from "@/lib/market/series";

type Range = "1m" | "6m" | "1y" | "2y";
const RANGE: Record<Range, number> = { "1m": 21, "6m": 126, "1y": 252, "2y": 504 };

/** Clean price chart (iOS Stocks style): one line, range selector, optional comparison. */
export function AssetCharts({
  sessions,
  close,
  bench,
  benchName,
  height = 260,
}: {
  sessions: string[];
  close: (number | null)[];
  volume?: (number | null)[];
  bench?: (number | null)[];
  benchName: string;
  hist?: { d: string[]; r: (number | null)[] };
  height?: number;
  compact?: boolean;
}) {
  const [range, setRange] = useState<Range>("1y");
  const [mode, setMode] = useState<"price" | "rel">("price");
  const [showMa, setShowMa] = useState(false);
  const full = useMemo(() => toPoints(sessions, close), [sessions, close]);
  const view = useMemo(() => sliceFrom(full, RANGE[range]), [full, range]);
  const change = view.length > 1 ? view[view.length - 1].value / view[0].value - 1 : null;

  const specs: SeriesSpec[] = useMemo(() => {
    if (mode === "rel" && bench) {
      const rs = relativeStrength(view, toPoints(sessions, bench));
      return [
        { kind: "area", data: rs, color: "var(--accent)", width: 2, priceFormat: "index" },
        { kind: "line", data: rs.map((p) => ({ time: p.time, value: 100 })), color: "var(--ink-3)", width: 1, dashed: true, priceFormat: "index" },
      ];
    }
    const out: SeriesSpec[] = [{ kind: "area", data: view, color: "var(--accent)", width: 2 }];
    if (showMa) {
      out.push({ kind: "line", data: sliceFrom(sma(full, 50), RANGE[range]), color: "var(--info)", width: 1 });
      out.push({ kind: "line", data: sliceFrom(sma(full, 200), RANGE[range]), color: "var(--ink-3)", width: 1, dashed: true });
    }
    return out;
  }, [mode, bench, view, sessions, showMa, full, range]);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-baseline justify-between gap-3">
        <span className={cx("num text-[15px] font-semibold", change === null ? "text-ink-2" : change >= 0 ? "text-pos" : "text-neg")}>
          {pct(change)} <span className="font-normal text-ink-3">over the period</span>
        </span>
        {bench && (
          <Segmented
            size="sm"
            value={mode}
            onChange={setMode}
            options={[
              { value: "price", label: "Price" },
              { value: "rel", label: `vs ${benchName}` },
            ]}
            ariaLabel="View"
          />
        )}
      </div>
      {specs[0]?.data.length > 1 ? (
        <TimeSeriesChart series={specs} height={height} ariaLabel={mode === "rel" ? `Performance relative to ${benchName}` : "Price history"} />
      ) : (
        <div className="flex items-center justify-center text-[14px] text-ink-3" style={{ height }}>
          Not enough data.
        </div>
      )}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Segmented
          value={range}
          onChange={setRange}
          className="min-w-0 flex-1 sm:flex-none"
          options={[
            { value: "1m", label: "1M" },
            { value: "6m", label: "6M" },
            { value: "1y", label: "1Y" },
            { value: "2y", label: "2Y" },
          ]}
          ariaLabel="Period"
        />
        {mode === "price" && (
          <button
            type="button"
            aria-pressed={showMa}
            onClick={() => setShowMa(!showMa)}
            title="50- and 200-day moving averages"
            className={cx("tap h-8 shrink-0 whitespace-nowrap rounded-full px-3 text-[13px] font-medium", showMa ? "bg-accent-soft text-accent-2" : "bg-surface-2 text-ink-2")}
          >
            MA 50/200
          </button>
        )}
      </div>
      {mode === "rel" && <p className="text-[13px] text-ink-3">If the line rises, the asset is doing better than {benchName}. 100 at the start of the period.</p>}
    </div>
  );
}

/** Rank history (technical detail). */
export function RankChart({ hist }: { hist: { d: string[]; r: (number | null)[] } }) {
  const pts = hist.d.map((d, i) => ({ time: d, value: hist.r[i] === null ? NaN : -(hist.r[i] as number) })).filter((p) => Number.isFinite(p.value));
  if (pts.length < 2) return <p className="text-[14px] text-ink-3">Not enough history.</p>;
  return <TimeSeriesChart series={[{ kind: "line", data: pts, color: "var(--accent)", width: 2, priceFormat: "rank" }]} height={180} ariaLabel="Rank over time" />;
}
