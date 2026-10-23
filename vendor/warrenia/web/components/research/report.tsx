import { cx } from "@/components/ui/primitives";
import type { RuleCondition } from "@/lib/market/types";
import { STATE_SIMPLE, type StateKey } from "@/lib/market/types";

function fmtVal(c: RuleCondition) {
  if (typeof c.value === "boolean") return c.value ? "yes" : "no";
  if (c.value === null) return "n/d";
  const v = c.value;
  return Math.abs(v) < 5 && !Number.isInteger(v) ? v.toFixed(2).replace(".", ",") : String(Math.round(v * 10) / 10).replace(".", ",");
}

export function RuleTrace({ trace, state }: { trace: Record<string, RuleCondition[]>; state: StateKey }) {
  const order: StateKey[] = ["speculative", "extended", "weakening", "breakout", "strong", "improving"];
  return (
    <div className="flex flex-col gap-3">
      {order.map((k) => {
        const conds = trace[k] ?? [];
        const fired = k === state;
        return (
          <details key={k} open={fired} className={cx("rounded-[14px] px-4 py-2.5", fired ? "bg-accent-soft" : "bg-surface-2")}>
            <summary className="cursor-pointer text-[14px] text-ink-2">
              <span className={fired ? "font-semibold text-ink" : ""}>{STATE_SIMPLE[k]}</span>
              <span className="ml-2 text-ink-3">{conds.filter((c) => c.pass).length}/{conds.length} conditions</span>
            </summary>
            <ul className="mt-2 flex flex-col gap-1">
              {conds.map((c, i) => (
                <li key={i} className="flex items-start justify-between gap-3 text-[13px]">
                  <span className={c.pass ? "text-ink-2" : "text-ink-3"}>
                    <span className={c.pass ? "text-pos" : "text-ink-3"}>{c.pass ? "✓" : "·"}</span> {c.text}
                  </span>
                  <span className="num shrink-0 text-ink-3">
                    {fmtVal(c)} {typeof c.threshold === "number" ? `${c.op} ${c.threshold}` : ""}
                  </span>
                </li>
              ))}
            </ul>
          </details>
        );
      })}
      <p className="text-[12.5px] text-ink-3">The first status that matches, in this order, is applied. Thresholds in config/momentum.yaml.</p>
    </div>
  );
}
