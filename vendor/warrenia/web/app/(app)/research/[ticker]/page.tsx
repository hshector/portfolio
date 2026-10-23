import Link from "next/link";
import { notFound } from "next/navigation";

import { ActionPill, AssetAvatar, Delta, Meter, StatePill } from "@/components/fin/fin";
import { AssetCharts, RankChart } from "@/components/research/asset-charts";
import { FundamentalsCard } from "@/components/research/fundamentals";
import { RuleTrace } from "@/components/research/report";
import { WatchButton } from "@/components/research/watch-button";
import { IconChevronDown } from "@/components/ui/icons";
import { Callout, Card, Disclosure, EmptyState } from "@/components/ui/primitives";
import { compactUsd, dateLabel, num, pct } from "@/lib/format";
import { holdLabel, riskLabel } from "@/lib/market/radar";
import { getAsset, getRadar, loadMarket } from "@/lib/market/source";
import { ACTION_EXPLAIN, STATE_EXPLAIN, type Component } from "@/lib/market/types";
import { loadPortfolio } from "@/lib/portfolio/load";
import { portfolioRelevance } from "@/lib/portfolio/relevance";
import { requireStore } from "@/lib/user/store";
import { TradingViewChart, tvSymbol } from "@demo/tradingview";

/** The ticker in the URL; a malformed escape ("%E0") is a not-found, not a crash. */
function tickerOf(raw: string): string {
  try {
    return decodeURIComponent(raw).toUpperCase();
  } catch {
    return "";
  }
}

export async function generateMetadata({ params }: { params: Promise<{ ticker: string }> }) {
  const { ticker } = await params;
  return { title: tickerOf(ticker) || "Not found" };
}

const SCORES = [
  { key: "momentum", field: "m", label: "Trend strength", help: "How much it rose over 6 and 12 months, adjusted for how much it swings." },
  { key: "trend_quality", field: "tq", label: "Trend quality", help: "Whether it rises steadily and in an orderly way." },
  { key: "acceleration", field: "a", label: "Acceleration", help: "Whether the trend has been speeding up in recent weeks." },
] as const;

function Bullets({ items }: { items: string[] }) {
  return (
    <ul className="flex flex-col gap-2.5">
      {items.map((t, i) => (
        <li key={i} className="flex gap-3 text-[15px] leading-relaxed text-ink">
          <span className="mt-[9px] h-1.5 w-1.5 shrink-0 rounded-full bg-accent" />
          <span>{t}</span>
        </li>
      ))}
    </ul>
  );
}

function Fold({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <details className="group border-t border-line first:border-t-0">
      <summary className="flex cursor-pointer list-none items-center justify-between px-5 py-4 text-[15px] font-medium [&::-webkit-details-marker]:hidden">
        {title}
        <IconChevronDown size={18} className="text-ink-3 transition-transform group-open:rotate-180" />
      </summary>
      <div className="px-5 pb-5">{children}</div>
    </details>
  );
}

function ComponentsTable({ list }: { list: Component[] }) {
  return (
    <table className="w-full text-[13.5px]">
      <tbody>
        {list.map((c) => (
          <tr key={c.key} className="border-t border-line first:border-t-0">
            <td className="py-2 pr-3 text-ink-2">{c.label}</td>
            <td className="num py-2 text-right">{num(c.raw, Math.abs(c.raw ?? 0) >= 10 ? 1 : 3)}</td>
            <td className="num w-16 py-2 text-right text-ink-3">p{c.pct === null ? "—" : Math.round(c.pct)}</td>
            <td className="num w-12 py-2 text-right text-ink-3">{Math.round(c.weight * 100)}%</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export default async function AssetPage({ params }: { params: Promise<{ ticker: string }> }) {
  const { ticker: raw } = await params;
  const ticker = tickerOf(raw);
  if (!ticker) notFound();
  const { latest, meta } = await loadMarket();
  const store = await requireStore();
  // Everything in parallel: the asset, the ranking, the benchmark and your portfolio.
  const [asset, radar, bench, watch, pf] = await Promise.all([
    getAsset(latest, ticker),
    getRadar(latest),
    meta ? getAsset(latest, meta.primary_benchmark) : null,
    store.watchlist(),
    loadPortfolio(store, latest, meta),
  ]);
  if (!meta)
    return (
      <EmptyState title="No market data yet">
        <p>It appears when the first daily download finishes.</p>
      </EmptyState>
    );
  if (!asset) notFound();
  const r = asset.row;
  const total = radar?.rows.filter((x) => x.cls === r.cls).length ?? 0;
  const rep = asset.report;
  const risk = riskLabel(r.rk);
  const act = asset.action;
  const ownedPos = pf.result?.positions.find((p) => p.instrument.market_ticker === ticker && p.qty > 1e-9);
  const owned = !!ownedPos;
  const hold = act ? holdLabel(act) : null;
  const BENCH = radar?.bench[meta.primary_benchmark];

  return (
    <div className="mx-auto flex max-w-[760px] flex-col gap-4">
      <Link href="/radar" className="text-[15px] font-medium text-accent">
        ‹ Radar
      </Link>

      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3.5">
          <AssetAvatar t={ticker} size={52} />
          <div className="min-w-0">
            <h1 className="line-clamp-3 text-[22px] font-bold leading-tight tracking-[-0.02em] sm:text-[24px]">{r.n}</h1>
            <p className="text-[14px] text-ink-2">
              {ticker} · {r.cls === "etf" ? "US-listed ETF" : (r.sec ?? "Stock")}
            </p>
          </div>
        </div>
        <WatchButton ticker={ticker} initial={watch.some((w) => w.ticker === ticker)} />
      </div>

      <div>
        {r.px !== null && <div className="num text-[40px] font-bold leading-tight tracking-[-0.03em]">${num(r.px)}</div>}
        <p className="text-[14px] text-ink-2">
          <Delta v={r.d1} className="font-semibold" /> today · close of {dateLabel(latest?.data_asof)}
        </p>
      </div>

      <Card pad={false} className="px-3 py-4 sm:px-5">
        {asset.series ? <AssetCharts sessions={meta.sessions} close={asset.series.c} bench={bench?.series?.c} benchName={meta.primary_benchmark} /> : <TradingViewChart symbols={[tvSymbol(ticker, r.ex)]} />}
      </Card>

      {!asset.eligible ? (
        <Callout tone="warn" title="Not scored">
          Outside the analysed market: {asset.excluded?.join(" · ").toLowerCase() || "it does not pass the filters"}.
        </Callout>
      ) : (
        <Card>
          <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-3">
            <div className="shrink-0">
              <p className="text-[14px] text-ink-2">Momentum score</p>
              <p className="num mt-1 text-[44px] font-bold leading-none tracking-[-0.03em]">
                {Math.round(r.ov)}
                <span className="text-[18px] font-semibold text-ink-3">/100</span>
              </p>
              <p className="mt-2 text-[14px] text-ink-2">
                Rank {r.rank} of {total}
              </p>
            </div>
            <div className="flex flex-col items-end gap-2">
              {act && <ActionPill action={act.action} className="h-8 px-3.5 text-[14px]" />}
              <StatePill state={r.st} />
            </div>
          </div>
          {act?.entry && <p className="mt-4 rounded-[14px] bg-warn-soft px-4 py-3 text-[14.5px]">{act.entry}</p>}
          {hold && (
            <p className="mt-4 text-[14.5px] text-ink-2">
              {owned ? "You own it: " : "If you owned it: "}
              <span className={`font-semibold ${hold.cls}`}>{hold.text}</span>
              {ownedPos && (
                <Link href={`/portfolio?sell=${encodeURIComponent(ownedPos.instrument.id)}#sell`} className="ml-2 whitespace-nowrap font-medium text-accent">
                  Tax if you sell ›
                </Link>
              )}
            </p>
          )}
          <div className="mt-5 flex flex-col gap-4">
            {SCORES.map((s) => (
              <div key={s.key}>
                <div className="mb-1.5 flex items-baseline justify-between">
                  <span className="text-[15px]" title={s.help}>
                    {s.label}
                  </span>
                  <span className="num text-[15px] font-semibold">{Math.round(r[s.field])}</span>
                </div>
                <Meter v={r[s.field]} />
              </div>
            ))}
            <div>
              <div className="mb-1.5 flex items-baseline justify-between">
                <span className="text-[15px]">Risk</span>
                <span className={`text-[15px] font-semibold ${risk.cls}`}>{risk.text}</span>
              </div>
              <Meter v={r.rk} invert />
            </div>
          </div>
          {act && (
            <Disclosure card={false} title="What to do now" className="mt-5">
              <p className="text-[15px] leading-relaxed">{ACTION_EXPLAIN[act.action]}</p>
              <p className="mt-2 text-[14.5px] text-ink-2">{STATE_EXPLAIN[r.st]}</p>
              {act.why.length > 0 && (
                <div className="mt-3">
                  <Bullets items={act.why} />
                </div>
              )}
            </Disclosure>
          )}
        </Card>
      )}

      <Card title="Returns">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {(
            [
              ["1 month", r.r1m],
              ["3 months", r.r3m],
              ["6 months", r.r6m],
              ["1 year", r.r12m],
            ] as const
          ).map(([l, v]) => (
            <div key={l} className="rounded-[14px] bg-surface-2 px-3 py-3 text-center">
              <p className="text-[12.5px] text-ink-2">{l}</p>
              <Delta v={v} className="whitespace-nowrap text-[17px] font-semibold" />
            </div>
          ))}
        </div>
        {BENCH && (
          <p className="mt-3 flex justify-between gap-3 text-[14px] text-ink-2">
            <span>vs {meta.primary_benchmark}, 6 months</span>
            <Delta v={r.r6m !== null && BENCH.r6m !== null ? (1 + r.r6m) / (1 + (BENCH.r6m as number)) - 1 : null} className="font-semibold" />
          </p>
        )}
      </Card>

      {r.cls === "stock" && asset.eligible && (
        <Disclosure title="Fundamentals" meta={r.fund === null || r.fund === undefined ? undefined : `${Math.round(r.fund)}/100`}>
          <FundamentalsCard f={asset.fundamentals} />
        </Disclosure>
      )}

      {rep && (
        <Disclosure title="Analysis">
          <div className="flex flex-col gap-5">
            {(
              [
                ["Why it stands out", rep.thesis.slice(0, 1)],
                ["Risks", rep.risks],
                ["What to watch", rep.invalidation],
                ["In your portfolio", portfolioRelevance(r, pf.result, pf.instruments, pf.settings)],
              ] as const
            ).map(([h, items]) => (
              <div key={h}>
                <h3 className="mb-2 text-[14px] font-semibold text-ink-2">{h}</h3>
                <Bullets items={[...items]} />
              </div>
            ))}
          </div>
        </Disclosure>
      )}

      <Disclosure title="About">
        {asset.profile ? (
          <>
            <p className="text-[15px] leading-relaxed">{asset.profile.description}</p>
            <p className="mt-2 text-[13px] text-ink-2">
              {[
                asset.profile.industry,
                asset.profile.employees ? `${asset.profile.employees.toLocaleString("en-GB")} employees` : null,
                asset.profile.list_date ? `listed since ${asset.profile.list_date.slice(0, 4)}` : null,
                r.mcap ? `company value ${compactUsd(r.mcap)}` : null,
              ]
                .filter(Boolean)
                .join(" · ")}
              {asset.profile.homepage && (
                <>
                  {" · "}
                  <a href={asset.profile.homepage} target="_blank" rel="noreferrer" className="text-accent">
                    website
                  </a>
                </>
              )}
            </p>
          </>
        ) : r.cls === "etf" ? (
          <p className="text-[15px] leading-relaxed">
            US-listed: EU retail investors cannot buy it (PRIIPs). European equivalents are in the{" "}
            <Link href="/plan" className="font-semibold text-accent">
              Plan
            </Link>
            .
          </p>
        ) : (
          <p className="text-[15px] leading-relaxed text-ink-2">
            {r.sec ? `${r.sec} company` : "Company"}
            {r.mcap ? ` worth about ${compactUsd(r.mcap)}` : ""}.
          </p>
        )}
      </Disclosure>

      <section className="card overflow-hidden">
        <h2 className="px-5 pb-1 pt-5 text-[17px] font-semibold">Technical detail</h2>
        {asset.state && (
          <Fold title="Why it has this status">
            <RuleTrace trace={asset.state.trace} state={asset.state.state} />
          </Fold>
        )}
        {asset.components && (
          <Fold title="What each score is made of">
            <div className="flex flex-col gap-5">
              {(["momentum", "trend_quality", "acceleration", "risk"] as const).map((k) => (
                <div key={k}>
                  <p className="mb-1 text-[14px] font-semibold">{{ momentum: "Trend strength", trend_quality: "Trend quality", acceleration: "Acceleration", risk: "Risk (0 = calmest)" }[k]}</p>
                  <ComponentsTable list={asset.components![k]} />
                </div>
              ))}
            </div>
          </Fold>
        )}
        {rep && (
          <Fold title="All the data">
            <dl className="divide-y divide-line">
              {rep.evidence.map((e) => (
                <div key={e.label} className="flex flex-col gap-0.5 py-2.5 sm:flex-row sm:justify-between sm:gap-4">
                  <dt className="text-[14px] text-ink-2">{e.label}</dt>
                  <dd className="num text-[14px] sm:text-right">
                    {e.value}
                    {e.context && <span className="block text-[12.5px] text-ink-3">{e.context}</span>}
                  </dd>
                </div>
              ))}
              <div className="flex justify-between py-2.5 text-[14px]">
                <dt className="text-ink-2">Company value</dt>
                <dd className="num">{compactUsd(r.mcap)}</dd>
              </div>
              <div className="flex justify-between py-2.5 text-[14px]">
                <dt className="text-ink-2">Volatility (3 months)</dt>
                <dd className="num">{pct(r.vol, 0, false)}</dd>
              </div>
            </dl>
          </Fold>
        )}
        {asset.hist && asset.hist.d.length > 1 && (
          <Fold title="Rank over time">
            <RankChart hist={asset.hist} />
          </Fold>
        )}
        {rep && (
          <Fold title="Data quality">
            <ul className="flex flex-col gap-1.5 text-[14px] text-ink-2">
              <li>Source: {rep.data_quality.source} · close of {dateLabel(rep.data_quality.asof)}</li>
              <li>{rep.data_quality.history_sessions} days of history</li>
              {rep.data_quality.notes.map((n) => (
                <li key={n}>{n}</li>
              ))}
              {(asset.events ?? []).slice(-5).map(([d, , kind, detail]) => (
                <li key={d + kind}>
                  {kind === "split" ? `Split ${detail}` : `Dividend $${detail}`} on {dateLabel(d)}
                </li>
              ))}
            </ul>
          </Fold>
        )}
      </section>

      <div className="flex items-center justify-between gap-3 px-1">
        <p className="text-[12.5px] text-ink-3">Not personal advice.</p>
        <Link href={`/research/compare?t=${ticker},${meta.primary_benchmark}`} className="shrink-0 text-[14px] font-medium text-accent">
          Compare
        </Link>
      </div>
    </div>
  );
}
