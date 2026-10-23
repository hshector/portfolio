import Link from "next/link";

import { AssetAvatar, Delta, DeltaPill } from "@/components/fin/fin";
import { PlanSplit } from "@/components/plan/choosers";
import { MiniStat, MixDonut } from "@/components/portfolio/mix";
import { Sparkline } from "@/components/portfolio/sparkline";
import { Card } from "@/components/ui/primitives";
import { money, moneyHeadline, pct } from "@/lib/format";
import { hasActions } from "@/lib/market/radar";
import { getMarket, getRadar, loadMarket } from "@/lib/market/source";
import { STATE_SIMPLE } from "@/lib/market/types";
import { momentumRoute, normaliseChoices, STOCK_POSITIONS } from "@/lib/plan/catalog";
import { blockValues, targetDeviation } from "@/lib/portfolio/engine";
import { loadPortfolio } from "@/lib/portfolio/load";
import { requireStore } from "@/lib/user/store";

export const metadata = { title: "Home" };


export default async function Home() {
  const { latest, meta } = await loadMarket();
  const store = await requireStore();
  const [radar, market, pf, watch] = await Promise.all([getRadar(latest), getMarket(latest), loadPortfolio(store, latest, meta), store.watchlist()]);
  const res = pf.result;
  const rows = radar?.rows ?? [];
  const withActions = hasActions(rows);
  const top = rows
    .filter((r) => r.cls === "stock" && (!withActions || r.act === "candidate"))
    .sort((a, b) => a.rank - b.rank)
    .slice(0, 5);
  const byT = new Map((radar?.rows ?? []).map((r) => [r.t, r]));
  const dev = res ? targetDeviation(res, pf.settings) : null;
  const values = blockValues(dev);

  // Only facts that matter to the user: their positions and the assets they follow.
  const news: { t: string; text: string; href?: string }[] = [];
  for (const p of res?.positions ?? []) {
    const r = p.instrument.market_ticker ? byT.get(p.instrument.market_ticker) : undefined;
    if (!r || p.qty <= 0) continue;
    // A sell signal on something you own goes straight to what selling would cost in tax.
    if (withActions && !r.hold) news.push({ t: r.t, text: `${r.n}: consider selling (it lost its momentum)`, href: `/portfolio?sell=${encodeURIComponent(p.instrument.id)}#sell` });
    else if (r.st === "weakening") news.push({ t: r.t, text: `${r.n} is losing steam` });
  }
  for (const w of watch) {
    const r = byT.get(w.ticker);
    if (r?.pst && r.pst !== r.st) news.push({ t: r.t, text: `${r.n}: now “${STATE_SIMPLE[r.st]}”` });
  }
  const spy = market?.benchmarks[market.primary];
  const gainPct = res && res.totals.netContributions > 0 ? res.totals.gain / res.totals.netContributions : null;

  return (
    <div className="mx-auto flex max-w-[760px] flex-col gap-4">
      <section className="nebula relative overflow-hidden rounded-[28px] px-6 pb-6 pt-7 shadow-[0_8px_24px_var(--hero-shadow)]">
        <p className="text-[15px] font-medium text-hero-ink/75">Your portfolio</p>
        {res ? (
          <>
            <p className="num mt-1 whitespace-nowrap text-[clamp(32px,10vw,44px)] font-bold leading-tight tracking-[-0.03em]">{moneyHeadline(res.totals.value)}</p>
            <p className="num mt-1 text-[15px] font-medium text-hero-ink/85">
              {res.totals.gain >= 0 ? "+" : ""}
              {money(res.totals.gain)} ({pct(gainPct)})
            </p>
            <Sparkline series={res.series} window={30} className="-mx-6 -mb-6 mt-5 block h-[88px] w-[calc(100%+3rem)] text-hero-ink/70" />
          </>
        ) : (
          <>
            <p className="mt-1 text-[30px] font-bold leading-tight tracking-[-0.02em]">Start tracking your investments</p>
            <p className="mt-2 max-w-md text-[15px] text-hero-ink/85">Record your deposits and purchases to see what you earn and whether your mix follows the plan.</p>
            <Link href="/portfolio" className="tap mt-6 inline-block rounded-full bg-hero-btn px-5 py-2.5 text-[15px] font-semibold text-hero-btn-ink">
              Set up portfolio
            </Link>
          </>
        )}
      </section>

      {res && (
        <div className="grid grid-cols-2 gap-2">
          <Link href="/portfolio" className="tap flex h-11 items-center justify-center whitespace-nowrap rounded-full bg-accent px-4 text-[15px] font-semibold text-accent-ink">
            View portfolio
          </Link>
          <Link href="/portfolio?add=1" className="tap flex h-11 items-center justify-center whitespace-nowrap rounded-full bg-surface px-4 text-[15px] font-semibold text-ink shadow-[0_1px_2px_rgb(0_0_0/0.06)]">
            Add transaction
          </Link>
        </div>
      )}

      {dev && res && res.totals.value > 0 && (
        <Card title="Your mix">
          <MixDonut dev={dev} other={res.allocation.find((a) => a.bucket === "other")?.value ?? 0} />
        </Card>
      )}

      <Card
        title="This month"
        action={
          <Link href="/plan" className="text-accent">
            Plan
          </Link>
        }
      >
        <PlanSplit
          values={values}
          other={res?.allocation.find((a) => a.bucket === "other")?.value ?? 0}
          settings={pf.settings}
          choices={normaliseChoices(pf.settings.choices)}
          momentumLabel={momentumRoute(values.momentum) === "etf" ? undefined : `Buy candidates from the radar (up to ${STOCK_POSITIONS})`}
        />
      </Card>

      {news.length > 0 && (
        <Card
          title="News"
          action={
            <Link href="/alerts" className="text-accent">
              All alerts
            </Link>
          }
        >
          <ul className="flex flex-col gap-3">
            {news.slice(0, 4).map((n, i) => (
              <li key={n.t + i}>
                <Link href={n.href ?? `/research/${n.t}`} className="flex items-center gap-3 text-[15px]">
                  <AssetAvatar t={n.t} size={34} />
                  {n.text}
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Card
        title={withActions ? "Buy candidates" : "Strongest today"}
        action={
          <Link href="/radar" className="text-accent">
            Radar
          </Link>
        }
        pad={false}
      >
        <ul className="mt-2 divide-y divide-line">
          {top.slice(0, 3).map((r) => (
            <li key={r.t}>
              <Link href={`/research/${r.t}`} className="flex items-center gap-3 px-5 py-3 transition-colors hover:bg-surface-2 active:bg-surface-3">
                <AssetAvatar t={r.t} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[15.5px] font-semibold">{r.n}</span>
                  <span className="block truncate text-[13px] text-ink-2">{r.t}</span>
                </span>
                <DeltaPill v={r.r6m} />
              </Link>
            </li>
          ))}
          {!top.length && <li className="px-5 py-6 text-[15px] text-ink-2">{rows.length ? "No buy candidates today." : "No ranking published yet."}</li>}
        </ul>
      </Card>

      {spy && market && (
        <Card title="Market">
          <dl className="grid grid-cols-2 gap-3">
            <MiniStat label="S&P 500 vs 200-day" value={<Delta v={spy.px_vs_sma200} />} />
            <MiniStat label="Stocks in uptrend" value={pct(market.breadth.above_sma200, 0, false)} />
          </dl>
        </Card>
      )}
    </div>
  );
}
