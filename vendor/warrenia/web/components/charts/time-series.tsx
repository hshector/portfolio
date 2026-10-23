"use client";

import type { IChartApi, Time } from "lightweight-charts";
import { useEffect, useRef } from "react";

import { useThemeClass } from "@/components/shell/theme";

export interface SeriesSpec {
  kind: "line" | "area" | "histogram";
  data: { time: string; value: number }[];
  color: string; // css color or var(--token)
  width?: number;
  dashed?: boolean;
  title?: string;
  scale?: "right" | "left" | "volume";
  priceFormat?: "price" | "percent" | "index" | "rank";
}

function cssVar(v: string): string {
  if (!v.startsWith("var(")) return v;
  const name = v.slice(4, -1);
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || "#888";
}

function alpha(color: string, a: number): string {
  const c = color.trim();
  if (c.startsWith("#") && c.length === 7) {
    const n = parseInt(c.slice(1), 16);
    return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
  }
  return c;
}

const MONTHS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sept", "oct", "nov", "dic"];

const FORMATS = {
  price: { type: "price" as const, precision: 2, minMove: 0.01 },
  percent: { type: "custom" as const, formatter: (v: number) => `${(v * 100).toFixed(1).replace(".", ",")} %`, minMove: 0.0001 },
  index: { type: "price" as const, precision: 1, minMove: 0.1 },
  rank: { type: "custom" as const, formatter: (v: number) => `#${Math.round(-v)}`, minMove: 1 },
};

/**
 * Thin wrapper over TradingView Lightweight Charts (Apache-2.0), themed from the
 * design tokens. Crosshair + time axis; no decorative elements.
 */
export function TimeSeriesChart({ series, height = 280, className, ariaLabel }: { series: SeriesSpec[]; height?: number; className?: string; ariaLabel: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  // Colours are read from the tokens once per chart: rebuild it when the theme changes.
  const themeClass = useThemeClass();

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let chart: IChartApi | null = null;
    let cancelled = false;
    // The charting library is loaded on demand: screens without a chart never download it,
    // and screens with one show their figures before it arrives (the box keeps its height).
    import("lightweight-charts").then(({ AreaSeries, ColorType, createChart, CrosshairMode, HistogramSeries, LineSeries, LineStyle }) => {
      if (cancelled) return;
      const ink3 = cssVar("var(--ink-3)");
      // Phones: no price axis and no last-value badges. At ~330px they collide with each
      // other and with the axis; the figures are already printed above every chart.
      const compact = window.matchMedia("(max-width: 639px)").matches;
      const nf = new Intl.NumberFormat("en-GB", { maximumFractionDigits: 2 });
      chart = createChart(el, {
        height,
        localization: { locale: "en-GB", priceFormatter: (v: number) => nf.format(v), dateFormat: "dd MMM yyyy" },
        autoSize: true,
        layout: { background: { type: ColorType.Solid, color: "transparent" }, textColor: ink3, fontFamily: "-apple-system, BlinkMacSystemFont, system-ui, sans-serif", fontSize: 11, attributionLogo: false },
        grid: { vertLines: { visible: false }, horzLines: { visible: false } },
        rightPriceScale: { visible: !compact, borderVisible: false, scaleMargins: { top: 0.08, bottom: 0.08 } },
        leftPriceScale: { visible: false, borderVisible: false },
        timeScale: {
          borderVisible: false,
          fixLeftEdge: true,
          fixRightEdge: true,
          tickMarkFormatter: (time: Time, type: number) => {
            const d = typeof time === "string" ? new Date(time + "T00:00:00Z") : new Date(Number(time) * 1000);
            if (type === 0) return String(d.getUTCFullYear());
            if (type === 1) return MONTHS[d.getUTCMonth()];
            return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`;
          },
        },
        crosshair: { mode: CrosshairMode.Magnet, vertLine: { color: cssVar("var(--line-2)"), labelBackgroundColor: cssVar("var(--surface-3)") }, horzLine: { color: cssVar("var(--line-2)"), labelBackgroundColor: cssVar("var(--surface-3)"), labelVisible: !compact } },
        handleScroll: { mouseWheel: false, pressedMouseMove: true, horzTouchDrag: true, vertTouchDrag: false },
        handleScale: { mouseWheel: false, pinch: true, axisPressedMouseMove: false },
    });
    chartRef.current = chart;
    for (const s of series) {
      const color = cssVar(s.color);
      const common = {
        priceScaleId: s.scale === "volume" ? "volume" : s.scale === "left" ? "left" : "right",
        priceFormat: FORMATS[s.priceFormat ?? "price"],
        lastValueVisible: !compact && s.kind !== "histogram",
        priceLineVisible: false,
        title: s.title,
      };
      const data = s.data.map((d) => ({ time: d.time as Time, value: d.value }));
      if (s.kind === "line") {
        const ser = chart.addSeries(LineSeries, { ...common, color, lineWidth: (s.width ?? 2) as 1 | 2 | 3 | 4, lineStyle: s.dashed ? LineStyle.Dashed : LineStyle.Solid, crosshairMarkerRadius: 3 });
        ser.setData(data);
      } else if (s.kind === "area") {
        const ser = chart.addSeries(AreaSeries, { ...common, lineColor: color, topColor: alpha(color, 0.18), bottomColor: alpha(color, 0.0), lineWidth: (s.width ?? 2) as 1 | 2 | 3 | 4, crosshairMarkerRadius: 4 });
        ser.setData(data);
      } else {
        const ser = chart.addSeries(HistogramSeries, { ...common, color: alpha(color, 0.35) });
        ser.setData(data);
        chart.priceScale("volume").applyOptions({ scaleMargins: { top: 0.82, bottom: 0 }, visible: false });
      }
    }
    chart.timeScale().fitContent();
    });
    return () => {
      cancelled = true;
      chart?.remove();
      chartRef.current = null;
    };
  }, [series, height, themeClass]);

  return <div ref={ref} role="img" aria-label={ariaLabel} className={className} style={{ height }} />;
}
