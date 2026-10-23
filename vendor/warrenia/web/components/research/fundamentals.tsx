import { Meter } from "@/components/fin/fin";
import { cx } from "@/components/ui/primitives";
import { compactUsd, dateLabel, isNum, num, pct } from "@/lib/format";
import type { Fundamentals } from "@/lib/market/types";

const SIGNALS: Record<string, string> = {
  roa_positive: "Made a profit",
  cfo_positive: "Generated cash from its business",
  roa_improving: "More profitable than the year before",
  cash_earnings: "Cash generated exceeds reported profit",
  leverage_not_up: "Did not take on more long-term debt (relative to its size)",
  liquidity_up: "Better able to pay its short-term bills",
  no_dilution: "Did not issue new shares",
  margin_up: "Higher gross margin than the year before",
  turnover_up: "Sells more per euro of assets than the year before",
};

type Tone = "good" | "ok" | "bad" | "na";
const TONE: Record<Tone, string> = { good: "text-pos", ok: "text-ink", bad: "text-neg", na: "text-ink-3" };

function grade(v: unknown, good: (x: number) => boolean, bad: (x: number) => boolean): Tone {
  if (!isNum(v)) return "na";
  return good(v) ? "good" : bad(v) ? "bad" : "ok";
}

/** Fundamental analysis of the last annual report, in plain words. */
export function FundamentalsCard({ f }: { f: Fundamentals | null | undefined }) {
  if (!f || !f.available || !f.metrics) {
    return (
      <p className="text-[15px] leading-relaxed text-ink-2">
        No annual report data at the SEC for this company (it does not file structured XBRL reports there). The checks cannot run: look at its annual report yourself before
        buying.
      </p>
    );
  }
  const m = f.metrics;
  const s = f.scores;
  const fin = m.financial === true;
  const adr = m.adr === true;
  const noPrice = adr ? "n/a (ADR)" : "—";
  const evEbit = isNum(m.ebit_ev) && m.ebit_ev > 0 ? 1 / m.ebit_ev : null;
  const z = m.zscore;
  const rows: { label: string; value: string; tone: Tone; help: string }[] = [
    {
      label: "Return on assets",
      value: pct(m.roa as number, 1),
      tone: grade(m.roa, (x) => x >= 0.07, (x) => x <= 0),
      help: "Profit for each euro the company owns. Above 7% is good.",
    },
    {
      label: "Gross profit on assets",
      value: pct(m.gross_profitability as number, 0, false),
      tone: grade(m.gross_profitability, (x) => x >= 0.33, (x) => x < 0.1),
      help: "The best single measure of a quality business (Novy-Marx 2013). Above 33% is strong.",
    },
    {
      label: "Profit backed by cash",
      value: isNum(m.accruals) ? (m.accruals <= 0 ? "Yes" : `Only partly (${pct(m.accruals, 0)} of assets)`) : "—",
      tone: grade(m.accruals, (x) => x <= 0, (x) => x > 0.1),
      help: "When reported profit is much higher than the cash coming in, future returns tend to be weaker (Sloan 1996).",
    },
    {
      label: "Piotroski F-Score",
      value: isNum(m.fscore) ? `${m.fscore}/9` : fin ? "n/a (bank or insurer)" : "—",
      tone: grade(m.fscore, (x) => x >= 7, (x) => x <= 3),
      help: "Nine yes/no checks of improving financial health (Piotroski 2000). 7-9 strong, 0-3 weak.",
    },
    {
      label: "Bankruptcy risk (Altman Z'')",
      value: isNum(z) ? `${num(z, 1)} · ${z >= 2.6 ? "safe" : z >= 1.1 ? "grey zone" : "danger"}` : fin ? "n/a (bank or insurer)" : "—",
      tone: grade(z, (x) => x >= 2.6, (x) => x < 1.1),
      help: "Combines liquidity, retained profits, operating profit and debt (Altman). Below 1.1 means high risk.",
    },
    {
      label: "Debt",
      value: isNum(m.debt_assets) ? `${pct(m.debt_assets, 0, false)} of assets${m.debt_reported === false ? " (none reported)" : ""}` : "—",
      tone: grade(m.debt_assets, (x) => x <= 0.3, (x) => x > 0.6),
      help: "How much of what it owns is financed with borrowed money.",
    },
    {
      label: "Price vs operating profit (EV/EBIT)",
      value: evEbit !== null ? `${num(evEbit, 0)}x` : isNum(m.ebit_ev) ? "operating loss" : noPrice,
      tone: evEbit === null ? (isNum(m.ebit_ev) ? "bad" : "na") : evEbit <= 15 ? "good" : evEbit > 40 ? "bad" : "ok",
      help: "What you pay for the whole business (shares + debt − cash) per euro of yearly operating profit. Lower is cheaper; the market is often 15-25x (Greenblatt).",
    },
    {
      label: "Free cash flow yield",
      value: isNum(m.fcf_yield) ? pct(m.fcf_yield, 1) : noPrice,
      tone: grade(m.fcf_yield, (x) => x >= 0.05, (x) => x < 0),
      help: "Cash left after investments, as a % of the share price. Higher is cheaper.",
    },
    {
      label: "P/E",
      value: isNum(m.pe) ? num(m.pe, 1) : isNum(m.net_income) && (m.net_income as number) <= 0 ? "loss" : noPrice,
      tone: grade(m.pe, (x) => x <= 20, (x) => x > 60),
      help: "Share price divided by profit per share.",
    },
    {
      label: "Sales growth",
      value: pct(m.revenue_growth as number, 0),
      tone: grade(m.revenue_growth, (x) => x >= 0.1, (x) => x < 0),
      help: "Change in revenue versus the previous fiscal year.",
    },
    {
      label: "New shares issued",
      value: isNum(m.share_change) ? pct(m.share_change, 1) : "—",
      tone: grade(m.share_change, (x) => x <= 0, (x) => x > 0.05),
      help: "Companies that keep issuing shares tend to do worse (Pontiff & Woodgate 2008). Negative = buybacks.",
    },
  ];
  const sig = (m.fscore_signals ?? {}) as Record<string, boolean | null>;
  return (
    <div className="flex flex-col gap-5">
      {s && (
        <div className="flex flex-col gap-4">
          <div className="flex items-end justify-between gap-3">
            <div className="shrink-0">
              <p className="whitespace-nowrap text-[14px] text-ink-2">Fundamentals score</p>
              <p className="num mt-1 text-[36px] font-bold leading-none tracking-[-0.03em]">
                {isNum(s.fund) ? Math.round(s.fund) : "—"}
                <span className="text-[16px] font-semibold text-ink-3">/100</span>
              </p>
            </div>
            <p className="max-w-[60%] text-right text-[13px] text-ink-2">Compared with every other stock in the radar. Last fiscal year ending {dateLabel(m.fy_end as string)}.</p>
          </div>
          {(
            [
              ["Quality", s.f_quality, "Profitable, with profits backed by cash"],
              ["Financial health", s.f_safety, "Low debt, no distress, improving"],
              ["Value", s.f_value, "How cheap it is for the profit and cash it makes"],
            ] as const
          ).map(([l, v, h]) => (
            <div key={l}>
              <div className="mb-1.5 flex items-baseline justify-between gap-3">
                <span className="text-[15px]">
                  {l} <span className="text-[12.5px] text-ink-3">· {h}</span>
                </span>
                <span className="num text-[15px] font-semibold">{isNum(v) ? Math.round(v) : "—"}</span>
              </div>
              <Meter v={v} />
            </div>
          ))}
        </div>
      )}
      <dl className="divide-y divide-line">
        {rows.map((r) => (
          <div key={r.label} className="flex flex-col gap-0.5 py-2.5 sm:flex-row sm:items-baseline sm:justify-between sm:gap-4">
            <dt className="min-w-0">
              <span className="text-[14.5px]">{r.label}</span>
              <span className="block text-[12.5px] text-ink-3">{r.help}</span>
            </dt>
            <dd className={cx("num shrink-0 text-[15px] font-semibold sm:text-right", TONE[r.tone])}>{r.value}</dd>
          </div>
        ))}
      </dl>
      {Object.keys(sig).length > 0 && (
        <details className="rounded-[14px] bg-surface-2 px-4 py-2.5">
          <summary className="cursor-pointer text-[14px] text-ink-2">The nine F-Score checks</summary>
          <ul className="mt-2 flex flex-col gap-1">
            {Object.entries(SIGNALS).map(([k, label]) => (
              <li key={k} className="flex items-start gap-2 text-[13.5px]">
                <span className={sig[k] === true ? "text-pos" : sig[k] === false ? "text-neg" : "text-ink-3"}>{sig[k] === true ? "✓" : sig[k] === false ? "✗" : "·"}</span>
                {label}
              </li>
            ))}
          </ul>
        </details>
      )}
      <p className="text-[12.5px] text-ink-3">
        Source: SEC annual report ({m.standard === "IFRS" ? "IFRS" : "US GAAP"}
        {m.currency && m.currency !== "USD" ? `, reported in ${m.currency}, amounts converted to USD at ECB rates` : ""})
        {isNum(m.revenue) ? ` · revenue ${compactUsd(m.revenue as number)}` : ""}.
        {adr ? " Price-based ratios are not shown for ADRs: the price is per ADR and the number of shares per ADR is not in the data." : ""} These checks filter out fragile
        companies; they do not predict the share price on their own.
      </p>
    </div>
  );
}
