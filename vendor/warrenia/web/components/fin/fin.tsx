import { cx } from "@/components/ui/primitives";
import { isNum, pct } from "@/lib/format";
import { ACTION_LABELS, STATE_SIMPLE, type ActionKey, type StateKey } from "@/lib/market/types";

export function Delta({ v, digits = 1, className }: { v: number | null | undefined; digits?: number; className?: string }) {
  const tone = !isNum(v) || v === 0 ? "text-ink-2" : v > 0 ? "text-pos" : "text-neg";
  return <span className={cx("num", tone, className)}>{pct(v, digits)}</span>;
}

/** Filled pill for a return (Trade Republic style). */
export function DeltaPill({ v, className }: { v: number | null | undefined; className?: string }) {
  const tone = !isNum(v) || v === 0 ? "bg-surface-2 text-ink-2" : v > 0 ? "bg-pos-soft text-pos" : "bg-neg-soft text-neg";
  return <span className={cx("num inline-flex h-7 min-w-[72px] items-center justify-center rounded-full px-2.5 text-[13px] font-semibold", tone, className)}>{pct(v, 1)}</span>;
}

/** Simple horizontal meter 0-100 (used only inside the score breakdown). */
export function Meter({ v, invert = false, className }: { v: number | null | undefined; invert?: boolean; className?: string }) {
  const val = isNum(v) ? Math.max(0, Math.min(100, v)) : 0;
  const color = invert ? (val >= 75 ? "bg-neg" : val >= 50 ? "bg-warn" : "bg-pos") : val >= 70 ? "bg-accent" : val >= 40 ? "bg-accent/50" : "bg-ink-3/50";
  return (
    <span className={cx("relative block h-1.5 rounded-full bg-surface-3", className)} aria-hidden>
      <span className={cx("absolute inset-y-0 left-0 rounded-full", color)} style={{ width: `${val}%` }} />
    </span>
  );
}

/** Kept name for older call sites. */
export const ScoreBar = ({ v, invert, width = "w-14" }: { v: number | null | undefined; invert?: boolean; className?: string; width?: string }) => <Meter v={v} invert={invert} className={width} />;

export function ScoreCell({ v, invert = false }: { v: number | null | undefined; invert?: boolean }) {
  return <span className={cx("num font-medium", invert && isNum(v) && v >= 75 ? "text-neg" : "text-ink")}>{isNum(v) ? Math.round(v) : "—"}</span>;
}

// State pills are neutral; only a small dot carries the (dusty) state colour.
const STATE_DOT: Record<StateKey, string> = {
  strong: "bg-pos",
  improving: "bg-accent",
  breakout: "bg-info",
  extended: "bg-warn",
  weakening: "bg-neg",
  speculative: "bg-violet",
  neutral: "bg-ink-3",
};

export function StatePill({ state, className }: { state: StateKey; short?: boolean; className?: string }) {
  return (
    <span className={cx("inline-flex h-6 items-center gap-1.5 rounded-full bg-surface-2 px-2.5 text-[12px] font-medium whitespace-nowrap text-ink-2", className)}>
      <span aria-hidden className={cx("h-1.5 w-1.5 shrink-0 rounded-full", STATE_DOT[state])} />
      {STATE_SIMPLE[state]}
    </span>
  );
}

const ACTION_DOT: Record<ActionKey, string> = {
  candidate: "bg-pos",
  wait: "bg-warn",
  watch: "bg-info",
  avoid: "bg-neg",
  none: "bg-ink-3",
};

/** What to do with the asset now: the primary signal of the radar (neutral pill + coloured dot). */
export function ActionPill({ action, className, desktopOnly = false }: { action: ActionKey | undefined; className?: string; desktopOnly?: boolean }) {
  const a = action ?? "none";
  return (
    <span className={cx(desktopOnly ? "hidden sm:inline-flex" : "inline-flex", "h-6 items-center gap-1.5 rounded-full bg-surface-2 px-2.5 text-[12px] font-semibold whitespace-nowrap text-ink", className)}>
      <span aria-hidden className={cx("h-1.5 w-1.5 shrink-0 rounded-full", ACTION_DOT[a])} />
      {ACTION_LABELS[a]}
    </span>
  );
}

export function Ticker({ t, className }: { t: string; className?: string }) {
  return <span className={cx("font-semibold tracking-[-0.01em]", className)}>{t}</span>;
}

export { AssetAvatar } from "./asset-avatar";
