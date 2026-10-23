import Link from "next/link";

import { AssetAvatar, Delta } from "@/components/fin/fin";
import { InstrumentForm, TransactionForm } from "@/components/portfolio/forms";
import { SellEstimatePanel } from "@/components/portfolio/sell-estimate";
import { ValueChart } from "@/components/portfolio/value-chart";
import { PageHeader } from "@/components/shell/page-header";
import { MixBar, MiniStat } from "@/components/portfolio/mix";
import { ButtonLink, Callout, Card, cx, Disclosure, EmptyState } from "@/components/ui/primitives";
import { dateLabel, money, moneyHeadline, moneyShort, pct, units } from "@/lib/format";
import { getRadar, loadMarket } from "@/lib/market/source";
import { hasActions, holdLabel } from "@/lib/market/radar";
import { STATE_SIMPLE } from "@/lib/market/types";
import { blockValues, targetDeviation } from "@/lib/portfolio/engine";
import { loadPortfolio } from "@/lib/portfolio/load";
import { BUCKET_LABELS } from "@/lib/portfolio/types";
import { requireStore } from "@/lib/user/store";

export const metadata = { title: "Portfolio" };


export default async function PortfolioPage({ searchParams }: { searchParams: Promise<{ add?: string; sell?: string }> }) {
  const sp = await searchParams;
  const { latest, meta } = await loadMarket();
  const store = await requireStore();
  const [pf, radar] = await Promise.all([loadPortfolio(store, latest, meta), getRadar(latest)]);
  const res = pf.result;
  const rowsBy = new Map((radar?.rows ?? []).map((r) => [r.t, r]));
  const withActions = hasActions(radar?.rows ?? []);
  const actions = (
    <>
      <TransactionForm instruments={pf.instruments} defaultOpen={sp.add === "1" && pf.instruments.length > 0} />
      <InstrumentForm />
    </>
  );

  // Same outer structure in every branch so the action sheets keep their state across revalidation.
  const shell = (body: React.ReactNode) => (
    <div className="mx-auto flex max-w-[760px] flex-col gap-4">
      <PageHeader title="Portfolio" actions={actions} />
      {body}
    </div>
  );
  if (pf.error) {
    return shell(
      <>
        <Callout tone="neg" title="Some transactions don't add up">
          {pf.error} Check them in <Link href="/portfolio/transactions" className="underline">Transactions</Link>.
        </Callout>
      </>,
    );
  }
  if (!res) {
    return shell(
      <>
        <EmptyState
          title="Your portfolio is empty"
          action={
            <div className="flex flex-wrap justify-center gap-2">
              <ButtonLink href="/portfolio/import">Import CSV</ButtonLink>
            </div>
          }
        >
          <p>1. Add an instrument (e.g. your world ETF; the Plan has a shortcut).</p>
          <p>2. Record your deposit and your purchase.</p>
          <p className="mt-2 text-ink-3">Use the buttons above.</p>
        </EmptyState>
      </>,
    );
  }
  const t = res.totals;
  const dev = targetDeviation(res, pf.settings);
  const held = res.positions.filter((p) => p.qty > 1e-9);
  const gainPct = t.netContributions > 0 ? t.gain / t.netContributions : null;

  return shell(
    <>
      <Card>
        <p className="text-[14px] text-ink-2">Total value</p>
        <p className="num mt-0.5 whitespace-nowrap text-[clamp(30px,9.5vw,40px)] font-bold leading-tight tracking-[-0.03em]">{moneyHeadline(t.value)}</p>
        <p className={cx("num text-[15px] font-semibold", t.gain >= 0 ? "text-pos" : "text-neg")}>
          {t.gain >= 0 ? "+" : ""}
          {money(t.gain)} ({pct(gainPct)})
        </p>
        <div className="mt-4">
          <ValueChart series={res.series} />
        </div>
        <dl className="mt-4 grid grid-cols-3 gap-2 border-t border-line pt-4">
          <MiniStat label="Invested" value={moneyShort(t.netContributions)} />
          <MiniStat label="Return / yr" value={<Delta v={res.twr.annualized ?? res.twr.cumulative} />} />
          <MiniStat label="Your IRR" value={<Delta v={res.mwr.xirr} />} />
        </dl>
      </Card>

      {res.warnings.length > 0 && (
        <Disclosure title={<span className="text-warn">{res.warnings.length === 1 ? "1 notice" : `${res.warnings.length} notices`}</span>}>
          <ul className="flex flex-col gap-2 text-[14px] text-ink-2">
            {res.warnings.map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
        </Disclosure>
      )}

      <Card title="Holdings" pad={false}>
        <ul className="mt-2 divide-y divide-line">
          {held.map((p) => {
            const mr = p.instrument.market_ticker ? rowsBy.get(p.instrument.market_ticker) : undefined;
            const label = p.instrument.market_ticker ?? p.instrument.isin?.slice(0, 4) ?? p.instrument.name.slice(0, 3).toUpperCase();
            const inner = (
              <>
                <AssetAvatar t={label} logo={!!p.instrument.market_ticker} />
                <span className="min-w-0 flex-1">
                  <span className="line-clamp-2 text-[15.5px] font-semibold leading-snug">{p.instrument.name}</span>
                  <span className="flex min-w-0 text-[13px] text-ink-2">
                    <span className="num shrink-0 whitespace-nowrap">{units(p.qty)} units</span>
                    <span className="truncate">
                      &nbsp;· {BUCKET_LABELS[p.instrument.bucket]}
                      {mr && withActions && <span className={holdLabel(mr).cls}> · {holdLabel(mr).text}</span>}
                      {mr && !withActions && <span className={mr.st === "weakening" ? "text-neg" : ""}> · {STATE_SIMPLE[mr.st]}</span>}
                    </span>
                  </span>
                </span>
                <span className="shrink-0 text-right">
                  <span className="num block whitespace-nowrap text-[15.5px] font-semibold">{moneyHeadline(p.valueEur)}</span>
                  <Delta v={p.unrealizedPct} className="text-[13px] font-medium" />
                </span>
              </>
            );
            return (
              <li key={p.instrument.id}>
                {mr ? (
                  <Link href={`/research/${mr.t}`} className="flex items-center gap-3 px-5 py-3 transition-colors hover:bg-surface-2 active:bg-surface-3">
                    {inner}
                  </Link>
                ) : (
                  <div className="flex items-center gap-3 px-5 py-3">{inner}</div>
                )}
              </li>
            );
          })}
          {res.cashEur > 0.005 && (
            <li className="flex items-center justify-between px-5 py-3 text-[15px]">
              <span className="text-ink-2">Cash</span>
              <span className="num font-semibold">{money(res.cashEur)}</span>
            </li>
          )}
        </ul>
      </Card>

      {held.length > 0 && (
        <SellEstimatePanel
          initial={sp.sell}
          positions={held.map((p) => ({ id: p.instrument.id, name: p.instrument.name, qty: p.qty, price: p.price, currency: p.priceCurrency ?? p.instrument.currency }))}
        />
      )}

      <Card title="Mix" action={<Link href="/plan" className="text-accent">Plan</Link>}>
        <MixBar dev={dev} />
      </Card>

      {res.taxByYear.length > 0 && (
        <Disclosure title="Tax on your sales" meta={`${res.taxByYear[res.taxByYear.length - 1].year}: ${money(res.taxByYear[res.taxByYear.length - 1].gp + res.taxByYear[res.taxByYear.length - 1].rcm, "EUR", 0)}`}>
          <table className="w-full text-[14.5px]">
            <thead>
              <tr className="text-left text-[12.5px] text-ink-3">
                <th className="pb-2 font-medium">Year</th>
                <th className="pb-2 text-right font-medium">Gains</th>
                <th className="pb-2 text-right font-medium">ETC income</th>
              </tr>
            </thead>
            <tbody>
              {res.taxByYear.map((y) => (
                <tr key={y.year} className="border-t border-line">
                  <td className="py-2">{y.year}</td>
                  <td className="num py-2 text-right">{money(y.gp)}</td>
                  <td className="num py-2 text-right">{money(y.rcm)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {res.taxByYear.some((y) => y.deferred > 0) && <p className="mt-2 text-[13px] text-warn">Excludes losses you cannot use yet (you bought the same security back).</p>}
          <p className="mt-2 text-[12.5px] text-ink-3">Estimate for your Spanish return: FIFO, fees included. Gold ETCs count as capital income (V0267-25).</p>
        </Disclosure>
      )}

      <Disclosure title="More figures">
        <dl className="divide-y divide-line text-[15px]">
          {[
            ["Unrealised gain", money(t.unrealized)],
            ["Realised gain (FIFO)", money(t.realized)],
            ["Dividends", money(t.dividends)],
            ["Interest", money(t.interest)],
            ["Fees", money(t.fees)],
            ["Taxes", money(t.taxes)],
            ...res.byCurrency.map((c) => [`Exposure to ${c.currency}`, pct(c.weight, 1, false)] as [string, string]),
            ["Valued on", dateLabel(res.asOf)],
          ].map(([k, v]) => (
            <div key={k} className="flex justify-between gap-3 py-2.5">
              <dt className="text-ink-2">{k}</dt>
              <dd className="num whitespace-nowrap font-medium">{v}</dd>
            </div>
          ))}
        </dl>
        {res.mwr.note && <p className="pt-2 text-[13px] text-ink-3">{res.mwr.note}</p>}
      </Disclosure>

      <div className="flex flex-wrap gap-2">
        <ButtonLink href="/portfolio/transactions" size="sm">
          Transactions
        </ButtonLink>
        <ButtonLink href="/portfolio/import" size="sm">
          Import CSV
        </ButtonLink>
      </div>
    </>,
  );
}
