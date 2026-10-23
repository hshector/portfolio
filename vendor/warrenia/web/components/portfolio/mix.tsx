import type { ReactNode } from "react";

import { BUCKET_DOT } from "@/components/plan/product";
import { cx } from "@/components/ui/primitives";
import { pct } from "@/lib/format";
import type { TargetRow } from "@/lib/portfolio/engine";
import { BUCKET_LABELS } from "@/lib/portfolio/types";

/** Small figure with a short label: three fit across a phone. */
export function MiniStat({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="truncate text-[12.5px] text-ink-2">{label}</dt>
      <dd className="num whitespace-nowrap text-[17px] font-semibold">{value}</dd>
    </div>
  );
}

/** Current mix as one stacked bar, then one line per block: weight, target and an
 *  arrow when it is outside its band. Replaces one bar + sentence per block. */
export function MixBar({ dev }: { dev: TargetRow[] }) {
  const total = dev.reduce((t, d) => t + d.weight, 0) || 1;
  return (
    <div>
      <div className="flex h-2.5 overflow-hidden rounded-full bg-surface-3" role="img" aria-label="Current mix">
        {dev.map((d) => (
          <div key={d.bucket} className={BUCKET_DOT[d.bucket]} style={{ width: `${(d.weight / total) * 100}%` }} />
        ))}
      </div>
      <ul className="mt-3 flex flex-col gap-2">
        {dev.map((d) => (
          <li key={d.bucket} className="flex items-center gap-2.5 text-[15px]">
            <span className={cx("h-2.5 w-2.5 shrink-0 rounded-full", BUCKET_DOT[d.bucket])} />
            <span className="min-w-0 flex-1 truncate">{BUCKET_LABELS[d.bucket]}</span>
            {d.outsideBand && (
              <span className="shrink-0 text-[13px] font-medium text-warn" title={d.deviation > 0 ? "Above target" : "Below target"}>
                {d.deviation > 0 ? "▲" : "▼"}
              </span>
            )}
            <span className="num shrink-0 whitespace-nowrap">
              <span className="font-semibold">{pct(d.weight, 0, false)}</span>
              <span className="text-ink-3"> / {pct(d.target, 0, false)}</span>
            </span>
          </li>
        ))}
      </ul>
      {dev.some((d) => d.outsideBand) && <p className="mt-3 text-[13px] text-ink-3">▲▼ off target: next month&apos;s contribution evens it out.</p>}
    </div>
  );
}

const BUCKET_VAR: Record<TargetRow["bucket"], string> = { core: "var(--accent)", gold: "var(--gold)", momentum: "var(--violet)", cash: "var(--info)" };

/** Current mix as a donut with a short legend: weight now, target underneath. */
export function MixDonut({ dev, other = 0 }: { dev: TargetRow[]; other?: number }) {
  // Holdings outside the plan's blocks ("Other") get their own grey slice so the ring adds up to 100%.
  const invested = dev.reduce((t, d) => t + d.value, 0) + other;
  const rows = [
    ...dev.map((d) => ({ key: d.bucket as string, label: BUCKET_LABELS[d.bucket], color: BUCKET_VAR[d.bucket], dot: BUCKET_DOT[d.bucket], weight: invested > 0 ? d.value / invested : 0, target: d.target as number | null, off: d.outsideBand })),
    ...(other > 0 ? [{ key: "other", label: BUCKET_LABELS.other, color: "var(--ink-3)", dot: "bg-ink-3", weight: other / invested, target: null, off: false }] : []),
  ];
  const total = rows.reduce((t, d) => t + d.weight, 0);
  const R = 15.915; // circumference 100, so dash lengths are percentages
  const GAP = rows.filter((d) => d.weight > 0).length > 1 ? 1.2 : 0;
  let offset = 25; // start at 12 o'clock
  return (
    <div className="flex items-center gap-5">
      <svg viewBox="0 0 42 42" className="h-[112px] w-[112px] shrink-0" role="img" aria-label="Current mix">
        <circle cx="21" cy="21" r={R} fill="none" stroke="var(--surface-3)" strokeWidth="6" />
        {total > 0 &&
          rows.map((d) => {
            const len = (d.weight / total) * 100;
            if (len <= 0) return null;
            const el = (
              <circle
                key={d.key}
                cx="21"
                cy="21"
                r={R}
                fill="none"
                stroke={d.color}
                strokeWidth="6"
                strokeDasharray={`${Math.max(len - GAP, 0.01)} ${100 - Math.max(len - GAP, 0.01)}`}
                strokeDashoffset={offset}
              />
            );
            offset -= len;
            return el;
          })}
      </svg>
      <ul className="flex min-w-0 flex-1 flex-col gap-2">
        {rows.map((d) => (
          <li key={d.key} className="flex items-start gap-2">
            <span className={cx("mt-[7px] h-2.5 w-2.5 shrink-0 rounded-full", d.dot)} />
            <span className="min-w-0 flex-1">
              <span className="flex items-baseline justify-between gap-2 text-[15px]">
                <span className="truncate">{d.label}</span>
                <span className="num shrink-0 font-semibold">{pct(d.weight, 0, false)}</span>
              </span>
              <span className={cx("num block text-[12.5px]", d.off ? "text-warn" : "text-ink-3")}>{d.target === null ? "not in the plan" : `target ${pct(d.target, 0, false)}`}</span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
