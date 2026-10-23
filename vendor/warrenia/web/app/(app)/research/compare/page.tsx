import Link from "next/link";

import { ActionPill, Delta, ScoreCell, StatePill, Ticker } from "@/components/fin/fin";
import { CompareChart } from "@/components/research/compare-chart";
import { PageHeader } from "@/components/shell/page-header";
import { EmptyState, Panel } from "@/components/ui/primitives";
import { compactUsd, num, pct } from "@/lib/format";
import { getAssets, loadMarket } from "@/lib/market/source";
import type { RadarRow } from "@/lib/market/types";
import { TradingViewChart, tvSymbol } from "@demo/tradingview";

export const metadata = { title: "Compare" };

type RowDef = [string, (r: RadarRow) => React.ReactNode];

const ROWS: { group: string; rows: RowDef[] }[] = [
  {
    group: "Ranking",
    rows: [
      ["What to do", (r) => <ActionPill action={r.act} />],
      ["Trend status", (r) => <StatePill state={r.st} short />],
      ["Rank", (r) => <span className="num">#{r.rank}</span>],
      ["Momentum score", (r) => <ScoreCell v={r.ov} />],
      ["Trend strength", (r) => <ScoreCell v={r.m} />],
      ["Trend quality", (r) => <ScoreCell v={r.tq} />],
      ["Acceleration", (r) => <ScoreCell v={r.a} />],
      ["Risk (0 = calmest)", (r) => <ScoreCell v={r.rk} invert />],
    ],
  },
  {
    group: "Returns",
    rows: [
      ["1 month", (r) => <Delta v={r.r1m} />],
      ["3 months", (r) => <Delta v={r.r3m} />],
      ["6 months", (r) => <Delta v={r.r6m} />],
      ["12 months", (r) => <Delta v={r.r12m} />],
      ["12 months skipping the last", (r) => <Delta v={r.r12_1} />],
    ],
  },
  {
    group: "Risk and trading",
    rows: [
      ["Volatility (3 months)", (r) => <span className="num">{pct(r.vol, 0, false)}</span>],
      ["Worst fall (1 year)", (r) => <span className="num">{pct(r.mdd, 0, false)}</span>],
      ["Beta", (r) => <span className="num">{num(r.beta)}</span>],
      ["Below 1-year high", (r) => <span className="num">{pct(r.d52, 1, false)}</span>],
      ["Average traded per day", (r) => <span className="num">{compactUsd(r.adv)}</span>],
      ["Company value", (r) => <span className="num">{compactUsd(r.mcap)}</span>],
    ],
  },
  {
    group: "Fundamentals",
    rows: [
      ["Fundamentals score", (r) => <ScoreCell v={r.fund ?? null} />],
      ["Piotroski F-Score", (r) => <span className="num">{r.fs === null || r.fs === undefined ? "—" : `${r.fs}/9`}</span>],
      ["P/E", (r) => <span className="num">{r.prof === false ? "loss" : num(r.pe ?? null, 1)}</span>],
    ],
  },
];

export default async function ComparePage({ searchParams }: { searchParams: Promise<{ t?: string }> }) {
  const sp = await searchParams;
  const tickers = (sp.t ?? "").split(",").map((s) => s.trim().toUpperCase()).filter(Boolean).slice(0, 4);
  const { latest, meta } = await loadMarket();
  const assets = await getAssets(latest, tickers);
  const found = tickers.filter((t) => assets[t]);
  return (
    <>
      <PageHeader title="Compare" sub="Up to 4 assets side by side." />
      {found.length < 1 || !meta ? (
        <EmptyState title="Nothing to compare" action={<Link className="text-accent" href="/radar">Open the radar</Link>}>
          Add tickers to the address (?t=AAA,BBB) or use Compare on an asset page.
        </EmptyState>
      ) : (
        <div className="flex flex-col gap-4">
          <Panel title="Relative performance">
            {found.some((t) => assets[t].series) ? (
              <CompareChart sessions={meta.sessions} series={found.map((t) => ({ t, c: assets[t].series?.c ?? [] }))} />
            ) : (
              <TradingViewChart symbols={found.map((t) => tvSymbol(t, assets[t].row.ex))} />
            )}
          </Panel>
          <Panel pad={false}>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[560px] text-[13px]">
                <thead>
                  <tr className="border-b border-line">
                    <th className="px-4 py-3 text-left md:px-5" />
                    {found.map((t) => (
                      <th key={t} className="px-3 py-3 text-right font-normal">
                        <Link href={`/research/${t}`} className="hover:text-accent">
                          <Ticker t={t} />
                        </Link>
                        <div className="truncate text-[11.5px] text-ink-3">{assets[t].row.n}</div>
                      </th>
                    ))}
                  </tr>
                </thead>
                {ROWS.map((g) => (
                  <tbody key={g.group}>
                    <tr>
                      <td colSpan={found.length + 1} className="t-label px-4 pb-1.5 pt-4 md:px-5">
                        {g.group}
                      </td>
                    </tr>
                    {g.rows.map(([label, fn]) => (
                      <tr key={label} className="border-t border-line">
                        <td className="px-4 py-2 text-ink-2 md:px-5">{label}</td>
                        {found.map((t) => (
                          <td key={t} className="px-3 py-2 text-right">
                            {assets[t].eligible || g.group !== "Ranking" ? fn(assets[t].row) : <span className="text-ink-3">not scored</span>}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                ))}
              </table>
            </div>
          </Panel>
          {tickers.length > found.length && <p className="t-meta">Not found in the latest run: {tickers.filter((t) => !assets[t]).join(", ")}</p>}
        </div>
      )}
    </>
  );
}
