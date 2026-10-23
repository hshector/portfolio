"use client";

import { useDeferredValue, useMemo, useRef, useState, useSyncExternalStore } from "react";

import { Segmented, Skeleton } from "@/components/ui/primitives";
import { money, parseDecimal, pct } from "@/lib/format";
import type { Choices } from "@/lib/plan/catalog";
import { ASSUMPTIONS, planMix, portfolioStats, project } from "@/lib/plan/projection";
import type { PlanKey } from "@/lib/portfolio/types";

const W = 640;
const H = 240;
const PAD = { l: 52, r: 12, t: 12, b: 28 };

function kEur(v: number): string {
  if (v >= 1e6) return `€${(v / 1e6).toFixed(v >= 1e7 ? 0 : 1)}M`;
  if (v >= 1e3) return `€${Math.round(v / 1e3)}k`;
  return `€${Math.round(v)}`;
}

function niceMax(v: number): number {
  const p = Math.pow(10, Math.floor(Math.log10(Math.max(v, 1))));
  for (const m of [1, 1.2, 1.6, 2, 2.4, 3, 4, 5, 6, 8, 10]) if (m * p >= v) return m * p;
  return 10 * p;
}

/** Where the plan could take you, in today's euros: bad case, middle case, good case. */
export function WealthProjection({ start, monthly, targets, choices }: { start: number; monthly: number; targets: Record<PlanKey, number>; choices: Required<Choices> }) {
  const [years, setYears] = useState("20");
  const [amount, setAmount] = useState(String(monthly));
  const [hover, setHover] = useState<number | null>(null);
  const svg = useRef<SVGSVGElement>(null);
  // The simulation (2,000 paths, month by month) runs only in the browser, after the page is
  // on screen, and at low priority: typing the amount or switching years never blocks input,
  // and the server does not spend ~70 ms of CPU on it for every Plan view.
  const mounted = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );
  const ready = useDeferredValue(mounted);
  const n = useDeferredValue(Number(years));
  const m = useDeferredValue(Math.max(0, Number(parseDecimal(amount)) || 0));
  const mix = useMemo(() => planMix(targets, choices), [targets, choices]);
  const stats = useMemo(() => portfolioStats(mix), [mix]);
  const proj = useMemo(() => (ready ? project({ start: Math.max(0, start), monthly: m, years: n, real: stats.real, vol: stats.vol }) : null), [ready, start, m, n, stats]);
  if (!proj) return <ProjectionPlaceholder />;
  const p = proj;

  const ymax = niceMax(p.p90[n]);
  const x = (y: number) => PAD.l + (y / n) * (W - PAD.l - PAD.r);
  const y = (v: number) => PAD.t + (1 - v / ymax) * (H - PAD.t - PAD.b);
  const line = (arr: number[]) => arr.map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join("");
  const band = `${line(p.p90)}${p.p10
    .map((v, i) => [i, v] as const)
    .reverse()
    .map(([i, v]) => `L${x(i).toFixed(1)},${y(v).toFixed(1)}`)
    .join("")}Z`;
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => f * ymax);
  const xt = [0, ...[5, 10, 15, 20, 25, 30, 35, 40].filter((t) => t <= n && (n <= 20 || t % 10 === 0))];
  const h = hover ?? n;

  function onMove(e: React.PointerEvent<SVGSVGElement>) {
    const r = svg.current?.getBoundingClientRect();
    if (!r) return;
    const px = ((e.clientX - r.left) / r.width) * W;
    setHover(Math.max(0, Math.min(n, Math.round(((px - PAD.l) / (W - PAD.l - PAD.r)) * n))));
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Segmented
          ariaLabel="Years"
          value={years}
          onChange={(v) => {
            setYears(v);
            setHover(null);
          }}
          options={["10", "20", "30", "40"].map((v) => ({ value: v, label: `${v} y` }))}
        />
        <label className="flex items-center gap-2 rounded-[12px] bg-surface-2 px-3 py-1.5 text-[14px] text-ink-2">
          Monthly €
          <input
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            inputMode="decimal"
            aria-label="Monthly amount for the projection"
            className="num w-20 bg-transparent text-right font-semibold text-ink outline-none pointer-coarse:text-[16px]"
          />
        </label>
      </div>

      <div>
        <p className="text-[14px] text-ink-2">In {n} years, in today&apos;s euros (after inflation)</p>
        <p className="num mt-1 text-[clamp(28px,8vw,36px)] font-bold leading-tight tracking-[-0.03em]">{money(p.p50[n], "EUR", 0)}</p>
        <p className="mt-1 text-[14.5px] text-ink-2">
          Middle case. 1 in 10 times less than <b className="num text-ink">{money(p.p10[n], "EUR", 0)}</b>, 1 in 10 times more than{" "}
          <b className="num text-ink">{money(p.p90[n], "EUR", 0)}</b>. You would have put in <b className="num text-ink">{money(p.contributed[n], "EUR", 0)}</b>.
        </p>
      </div>

      <figure className="m-0">
        <svg
          ref={svg}
          viewBox={`0 0 ${W} ${H}`}
          className="h-auto w-full touch-pan-y select-none"
          role="img"
          aria-label={`Projected value over ${n} years: middle case ${money(p.p50[n], "EUR", 0)}`}
          onPointerMove={onMove}
          onPointerLeave={() => setHover(null)}
        >
          {ticks.map((t) => (
            <g key={t}>
              <line x1={PAD.l} x2={W - PAD.r} y1={y(t)} y2={y(t)} stroke="var(--line)" strokeWidth={1} />
              <text x={PAD.l - 8} y={y(t) + 4} textAnchor="end" fontSize={12} fill="var(--ink-3)" className="num">
                {kEur(t)}
              </text>
            </g>
          ))}
          {xt.map((t) => (
            <text key={t} x={x(t)} y={H - 8} textAnchor="middle" fontSize={12} fill="var(--ink-3)" className="num">
              {t === 0 ? "today" : `${t}y`}
            </text>
          ))}
          <path d={band} fill="var(--accent)" opacity={0.16} />
          <path d={line(p.contributed)} fill="none" stroke="var(--ink-3)" strokeWidth={1.5} strokeDasharray="4 4" />
          <path d={line(p.p50)} fill="none" stroke="var(--accent)" strokeWidth={2} strokeLinejoin="round" />
          <line x1={x(h)} x2={x(h)} y1={PAD.t} y2={H - PAD.b} stroke="var(--ink-3)" strokeWidth={1} opacity={hover === null ? 0 : 0.6} />
          <circle cx={x(h)} cy={y(p.p50[h])} r={4.5} fill="var(--accent)" stroke="var(--surface)" strokeWidth={2} />
        </svg>
        <figcaption className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[12.5px] text-ink-2">
          <span className="flex items-center gap-1.5">
            <span className="h-0.5 w-4 rounded bg-accent" /> Middle case
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-2.5 w-4 rounded-sm bg-accent/20" /> 8 in 10 outcomes
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-4 border-t-[1.5px] border-dashed border-ink-3" /> Money put in
          </span>
          <span className="num ml-auto text-ink-3">
            {h === 0 ? "Today" : `Year ${h}`}: {money(p.p10[h], "EUR", 0)} – {money(p.p90[h], "EUR", 0)}
          </span>
        </figcaption>
      </figure>

      <p className="text-[14px] text-ink-2">
        Chance of ending with less than you put in: <b className="num text-ink">{pct(p.lossChance, 0, false)}</b>. Your mix is assumed to grow{" "}
        <b className="num text-ink">{pct(stats.real, 1, false)}</b> a year above inflation, with swings of about <b className="num text-ink">{pct(stats.vol, 0, false)}</b> a year.
      </p>

      <details className="rounded-[14px] bg-surface-2 px-4 py-2.5">
        <summary className="cursor-pointer text-[14px] text-ink-2">Year by year and assumptions</summary>
        <table className="mt-2 w-full text-[13px]">
          <thead>
            <tr className="text-left text-ink-3">
              <th className="py-1 font-medium">Year</th>
              <th className="py-1 text-right font-medium">Put in</th>
              <th className="py-1 text-right font-medium">Bad (1 in 10)</th>
              <th className="py-1 text-right font-medium">Middle</th>
              <th className="py-1 text-right font-medium">Good (1 in 10)</th>
            </tr>
          </thead>
          <tbody>
            {p.years
              .filter((yy) => yy > 0 && (yy % 5 === 0 || yy === n))
              .map((yy) => (
                <tr key={yy} className="num border-t border-line">
                  <td className="py-1">{yy}</td>
                  <td className="py-1 text-right">{kEur(p.contributed[yy])}</td>
                  <td className="py-1 text-right">{kEur(p.p10[yy])}</td>
                  <td className="py-1 text-right font-semibold">{kEur(p.p50[yy])}</td>
                  <td className="py-1 text-right">{kEur(p.p90[yy])}</td>
                </tr>
              ))}
          </tbody>
        </table>
        <ul className="mt-3 flex flex-col gap-1 text-[12.5px] text-ink-2">
          {[...mix]
            .sort((a, b) => b.weight - a.weight)
            .map((a) => (
              <li key={a.cls}>
                {ASSUMPTIONS[a.cls].label} {pct(a.weight, 0, false)}: {pct(ASSUMPTIONS[a.cls].real, 1, false)} a year after inflation, swings {pct(ASSUMPTIONS[a.cls].vol, 0, false)}
              </li>
            ))}
        </ul>
        <p className="mt-2 text-[12.5px] text-ink-3">
          Long-run evidence: world stocks earned about 5% a year above inflation from 1900 to 2023 (Dimson, Marsh &amp; Staunton); we use 4.5%. Gold about 1% (Erb &amp; Harvey 2013).
          No extra return is assumed for momentum. 2,000 simulated paths; the monthly amount rises with inflation. Before taxes on selling and assuming you never sell in a panic. Not a
          forecast.
        </p>
      </details>
    </div>
  );
}

/** Same footprint as the projection while it is being simulated (no layout shift). */
function ProjectionPlaceholder() {
  return (
    <div className="flex flex-col gap-4" aria-busy="true">
      <Skeleton className="h-9 w-full max-w-[320px]" />
      <div className="flex flex-col gap-2">
        <Skeleton className="h-4 w-56" />
        <Skeleton className="h-9 w-40" />
        <Skeleton className="h-4 w-full" />
      </div>
      <Skeleton className="aspect-[640/240] w-full" />
    </div>
  );
}
