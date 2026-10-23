import Link from "next/link";

import { ActionPill, AssetAvatar, DeltaPill } from "@/components/fin/fin";
import { CashPicker, CoreChooser, DiversifierPicker, PlanSplit } from "@/components/plan/choosers";
import { ProductCard } from "@/components/plan/product";
import { WealthProjection } from "@/components/plan/projection";
import { PageHeader } from "@/components/shell/page-header";
import { Callout, Card, Disclosure } from "@/components/ui/primitives";
import { dateLabel, money, pct } from "@/lib/format";
import { hasActions } from "@/lib/market/radar";
import type { RadarRow } from "@/lib/market/types";
import { getMarket, getRadar, loadMarket } from "@/lib/market/source";
import { BUCKET_NAME, byIsin, MIN_SLEEVE_FOR_STOCKS_EUR, momentumRoute, normaliseChoices, recommended, STOCK_POSITIONS, VERIFIED_ON } from "@/lib/plan/catalog";
import { activeKeys, blockValues, targetDeviation } from "@/lib/portfolio/engine";
import { loadPortfolio } from "@/lib/portfolio/load";
import { requireStore } from "@/lib/user/store";

export const metadata = { title: "Plan" };

function Bullets({ items }: { items: React.ReactNode[] }) {
  return (
    <ul className="flex flex-col gap-2.5">
      {items.map((t, i) => (
        <li key={i} className="flex gap-3 text-[15px] leading-relaxed">
          <span className="mt-[9px] h-1.5 w-1.5 shrink-0 rounded-full bg-accent" />
          <span>{t}</span>
        </li>
      ))}
    </ul>
  );
}

export default async function PlanPage() {
  const { latest, meta } = await loadMarket();
  const store = await requireStore();
  const [radar, market, pf] = await Promise.all([getRadar(latest), getMarket(latest), loadPortfolio(store, latest, meta)]);
  const res = pf.result;
  const dev = res ? targetDeviation(res, pf.settings) : null;
  const values = blockValues(dev);
  const choices = normaliseChoices(pf.settings.choices);
  const stats = market?.proxies ?? {};
  const momEtf = recommended("momentum");
  const route = momentumRoute(values.momentum);
  const rows = radar?.rows ?? [];
  const candidates = hasActions(rows) ? rows.filter((r) => r.cls === "stock" && r.act === "candidate").sort((a, b) => a.rank - b.rank).slice(0, STOCK_POSITIONS) : [];
  const t = pf.settings.targets;
  const core = byIsin(choices.core[0].isin)!;

  return (
    <div className="mx-auto flex max-w-[760px] flex-col gap-4">
      <PageHeader title="Your plan" sub="What to buy each month." />

      <Card
        title="This month"
        sub={activeKeys(t)
          .map((k) => `${BUCKET_NAME[k]} ${pct(t[k], 0, false)}`)
          .join(" · ")}
      >
        <PlanSplit
          values={values}
          other={res?.allocation.find((a) => a.bucket === "other")?.value ?? 0}
          settings={pf.settings}
          choices={choices}
          momentumLabel={route === "etf" ? undefined : `Radar candidates (up to ${STOCK_POSITIONS}, equal amounts)`}
        />
      </Card>

      <Card id="projection" title="Where this could take you" sub="A range, not a promise.">
        <WealthProjection start={res?.totals.value ?? 0} monthly={pf.settings.monthly_contribution} targets={t} choices={choices} />
      </Card>

      <h2 className="px-1 pt-2 text-[13px] font-semibold uppercase tracking-[0.04em] text-ink-3">Blocks</h2>

      <Disclosure id="core" title={`1. ${BUCKET_NAME.core}`} meta={pct(t.core, 0, false)}>
        <CoreChooser current={core.isin} stats={stats} />
        <div className="mt-4">
          <Bullets
            items={[
              <>
                <b>Pick one and stay:</b> switching ETF in Spain means selling and paying tax.
              </>,
              <>
                <b>Accumulating class:</b> no tax on dividends until you sell.
              </>,
            ]}
          />
        </div>
      </Disclosure>

      <Disclosure id="diversifiers" title={`2. ${BUCKET_NAME.gold}`} meta={pct(t.gold, 0, false)}>
        <DiversifierPicker current={choices.gold} stats={stats} />
        <div className="mt-4">
          <Callout tone="info" title="What actually protects you">
            Gold holds up best when stocks crash. Short euro bonds are the steadiest. Commodities help with inflation. Silver and bitcoin are bets, not protection.
          </Callout>
          <Link href="/radar?cls=etf&preset=all&group=Commodities" className="mt-3 block text-[14px] font-medium text-accent">
            Gold and commodities on the radar ›
          </Link>
        </div>
      </Disclosure>

      <Disclosure id="momentum" title={`3. ${BUCKET_NAME.momentum}`} meta={pct(t.momentum, 0, false)}>
        <div className="flex flex-col gap-3">
          {candidates.length > 0 && route !== "etf" && <Candidates rows={candidates} asof={latest?.data_asof} />}
          <p className="text-[15px] font-semibold">
            {route === "etf" ? `Now (under ${money(MIN_SLEEVE_FOR_STOCKS_EUR, "EUR", 0)}): a momentum ETF` : "Simple option: a momentum ETF"}
          </p>
          <ProductCard p={momEtf} />
          {candidates.length > 0 && route === "etf" && <Candidates rows={candidates} asof={latest?.data_asof} later />}
          <Disclosure card={false} title="Rules for stocks">
            <Bullets
              items={[
                <>
                  <b>Buy</b> only <ActionPill action="candidate" />, equal amounts, up to {STOCK_POSITIONS}. Max 10% of the block in one company.
                </>,
                <>
                  <b>Wait</b> on <ActionPill action="wait" /> (just jumped) and <ActionPill action="watch" /> (weak annual report).
                </>,
                <>
                  <b>Sell</b> on &ldquo;Consider selling&rdquo;, not just because it stopped being a candidate.
                </>,
                <>
                  <b>Loss + buy back</b> within 2 months (1 year for US-only shares): Spain defers that loss.
                </>,
              ]}
            />
          </Disclosure>
        </div>
      </Disclosure>

      <Disclosure id="cash" title={`4. ${BUCKET_NAME.cash}`} meta={pct(t.cash ?? 0, 0, false)}>
        <Bullets
          items={[
            <>
              <b>Usually 0%.</b> Keep cash for an emergency fund or money you need within ~3 years.
            </>,
            <>
              Set it in{" "}
              <Link href="/settings?tab=portfolio" className="text-accent">
                Settings → Target mix
              </Link>
              .
            </>,
          ]}
        />
        <div className="mt-4">
          <CashPicker current={choices.cash} />
        </div>
      </Disclosure>

      <h2 className="px-1 pt-2 text-[13px] font-semibold uppercase tracking-[0.04em] text-ink-3">Good to know</h2>

      <Disclosure id="how" title="How to buy">
        <Bullets
          items={[
            <>
              A <b>monthly savings plan</b> per product (free on Trade Republic; a one-off order costs €1).
            </>,
            <>Come back once a month: the split tops up the block that is behind.</>,
            <>No need to check daily.</>,
          ]}
        />
      </Disclosure>

      <Disclosure id="taxes" title="Taxes in Spain">
        <Bullets
          items={[
            <>
              <b>Savings base:</b> 19% to €6k · 21% to €50k · 23% to €200k · 27% to €300k · 30% above.
            </>,
            <>
              <b>ETFs and shares:</b> taxed only when you sell, FIFO. Declared by you.
            </>,
            <>
              <b>Gold/silver ETCs:</b> capital income, not gains (ruling V0267-25). Crypto ETPs likely the same.
            </>,
            <>
              <b>Index funds</b> can be switched tax-free (traspaso).
            </>,
            <>
              <b>US dividends:</b> 15% withheld in the US, deductible.
            </>,
            <>
              <b>US-listed ETFs</b> can&apos;t be bought from the EU (PRIIPs).
            </>,
            <>
              <b>Modelo 720:</b> report securities abroad above €50,000.
            </>,
          ]}
        />
        <p className="mt-4 text-[12.5px] text-ink-3">
          Products checked {dateLabel(VERIFIED_ON)}. Read the KID before buying. Not financial or tax advice.
        </p>
      </Disclosure>
    </div>
  );
}

function Candidates({ rows, asof, later }: { rows: RadarRow[]; asof?: string | null; later?: boolean }) {
  return (
    <div className="overflow-hidden rounded-[18px] bg-surface-2">
      <p className="px-4 pt-3 text-[13.5px] text-ink-2">
        {later ? "Later, with more money" : "Buy candidates"} · {dateLabel(asof)}
      </p>
      <ul className="divide-y divide-line">
        {rows.map((r) => (
          <li key={r.t}>
            <Link href={`/research/${r.t}`} className="flex items-center gap-3 px-4 py-2.5 transition-colors hover:bg-surface-3 active:bg-surface-3">
              <AssetAvatar t={r.t} size={34} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[15px] font-semibold">{r.n}</span>
                <span className="block truncate text-[12.5px] text-ink-2">{r.t}</span>
              </span>
              <DeltaPill v={r.r6m} />
            </Link>
          </li>
        ))}
      </ul>
      <Link href="/radar?preset=buy" className="block px-4 py-3 text-[14px] font-medium text-accent">
        See all on the radar
      </Link>
    </div>
  );
}
