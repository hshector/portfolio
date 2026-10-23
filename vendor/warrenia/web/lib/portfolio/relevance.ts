import type { RadarRow } from "@/lib/market/types";

import type { PortfolioResult } from "./engine";
import type { Instrument, Settings } from "./types";

/** "Portfolio relevance" lines for an asset report. Only statements backed by data. */
export function portfolioRelevance(row: RadarRow, res: PortfolioResult | null, instruments: Instrument[], settings: Settings): string[] {
  if (!res || res.totals.value <= 0) return ["No portfolio recorded yet: add your transactions to see how this asset fits."];
  const out: string[] = [];
  const p1 = (x: number) => `${(100 * x).toFixed(1)}%`;
  const pos = res.positions.find((p) => p.instrument.market_ticker === row.t && p.qty > 0);
  if (pos) {
    out.push(`You own it: ${p1(pos.weight ?? 0)} of your portfolio (${pos.instrument.name}).`);
    if (typeof row.hold === "boolean") {
      out.push(
        row.hold
          ? "Verdict for your position: keep (still in the stronger half of the market, no avoid signal)."
          : "Verdict for your position: consider selling (it left the stronger half of the market or has an avoid signal).",
      );
    }
  } else {
    out.push("You don't own it.");
  }
  if (row.sec) {
    const sectorW = res.positions
      .filter((p) => p.instrument.kind === "stock" && p.instrument.sector === row.sec && p.weight)
      .reduce((s, p) => s + (p.weight ?? 0), 0);
    out.push(`Your direct exposure to ${row.sec} through individual stocks: ${p1(sectorW)}.` + (pos ? "" : " Buying it would increase it."));
  }
  const etfs = instruments.filter((i) => i.kind === "etf" && res.positions.some((p) => p.instrument.id === i.id && p.qty > 0));
  if (etfs.length) {
    out.push(`Your world ETFs (${etfs.map((e) => e.name).join(", ")}) probably hold it too; the exact overlap is not calculated.`);
  }
  const mom = res.allocation.find((a) => a.bucket === "momentum");
  const invested = res.allocation.filter((a) => a.bucket !== "cash").reduce((s, a) => s + a.value, 0);
  const w = invested > 0 && mom ? mom.value / invested : 0;
  out.push(`Momentum block: ${p1(w)} of what you have invested, versus a target of ${(100 * settings.targets.momentum).toFixed(0)}%.`);
  return out;
}
