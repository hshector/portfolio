import { cx } from "@/components/ui/primitives";
import { dateLabel, num, pct } from "@/lib/format";
import type { Product } from "@/lib/plan/catalog";
import type { ProxyStats } from "@/lib/market/types";
import type { PlanKey } from "@/lib/portfolio/types";

/** Colour of each plan block (dots and bars). */
export const BUCKET_DOT: Record<PlanKey, string> = { core: "bg-accent", gold: "bg-gold", momentum: "bg-violet", cash: "bg-info" };

export const TAX_LABEL = { gain: "Capital gain when sold", rcm: "Capital income (rendimiento) when sold", interest: "Interest taxed every year" } as const;

/** One product: what it is, what's inside, what it costs and how it has behaved. */
export function ProductCard({ p, stats, compact = false, selected = false }: { p: Product; stats?: ProxyStats; compact?: boolean; selected?: boolean }) {
  return (
    <div className={cx("rounded-[18px] px-4 py-4", selected ? "bg-accent-soft ring-1 ring-[var(--accent-line)]" : "bg-surface-2")}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          {(selected || p.recommended) && (
            <p className="mb-1 text-[12px] font-semibold uppercase tracking-[0.04em] text-accent-2">{selected ? "Your choice" : "Recommended"}</p>
          )}
          <p className="text-[15.5px] font-semibold leading-snug">{p.name}</p>
          {p.vehicle === "Cash account" ? (
            <p className="mt-0.5 text-[13.5px] text-ink-2">No ISIN: it is the balance of your account</p>
          ) : (
            <p className="num mt-0.5 select-all text-[13.5px] text-ink-2">ISIN {p.isin}</p>
          )}
        </div>
        <span className="num shrink-0 rounded-full bg-surface px-3 py-1 text-[13px] font-semibold whitespace-nowrap">
          {p.ter === 0 ? "No fee" : `${pct(p.ter, 2, false)} a year`}
        </span>
      </div>
      <p className="mt-2 text-[14.5px]">{p.role}</p>
      <p className="mt-1 text-[13.5px] text-ink-2">
        {p.vehicle} · {p.coverage} · {p.distribution} · {p.domicile} · {TAX_LABEL[p.tax]}
        {p.terNote ? ` · fee ${p.terNote}` : ""}
        {p.onTradeRepublic === false ? " · not on Trade Republic" : ""}
      </p>
      {stats && <StatsRow s={stats} />}
      {!compact && p.inside && <InsideBox p={p} />}
      {!compact && (
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <ul className="flex flex-col gap-1.5 text-[14px]">
            {p.pros.map((x) => (
              <li key={x} className="flex gap-2">
                <span className="text-pos">+</span>
                <span>{x}</span>
              </li>
            ))}
          </ul>
          <ul className="flex flex-col gap-1.5 text-[14px]">
            {p.cons.map((x) => (
              <li key={x} className="flex gap-2">
                <span className="text-neg">−</span>
                <span>{x}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

/** How the asset class behaved over the data window, in plain words. */
export function StatsRow({ s }: { s: ProxyStats }) {
  const items: [string, string][] = [
    ["Yearly swings", pct(s.vol, 0, false)],
    ["Worst fall", pct(s.max_drawdown !== null ? -s.max_drawdown : null, 0)],
    ["Moves with stocks", s.corr_stocks === null ? "—" : s.corr_stocks > 0.7 ? "a lot" : s.corr_stocks > 0.3 ? "somewhat" : s.corr_stocks > -0.2 ? "barely" : "opposite"],
    ["In months stocks fell", pct(s.when_stocks_fall, 1)],
  ];
  return (
    <div className="mt-3">
      <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {items.map(([k, v]) => (
          <div key={k} className="rounded-[12px] bg-surface px-3 py-2">
            <dt className="text-[12px] text-ink-2">{k}</dt>
            <dd className="num text-[15px] font-semibold whitespace-nowrap">{v}</dd>
          </div>
        ))}
      </dl>
      <p className="mt-1.5 text-[12px] text-ink-3">
        Measured on {s.label.toLowerCase()} ({s.years} years since {dateLabel(s.from)}; stocks fell {s.down_months} months, by {pct(s.stocks_when_fall, 1)} on average).
        Correlation {num(s.corr_stocks, 2)}. Past behaviour, not a forecast.
      </p>
    </div>
  );
}

function InsideBox({ p }: { p: Product }) {
  const i = p.inside!;
  return (
    <div className="mt-3 rounded-[14px] bg-surface px-3.5 py-3 text-[14px]">
      <p className="font-semibold">What&apos;s inside</p>
      <p className="mt-1 text-ink-2">
        {i.holdings}
        {i.usShare !== undefined && ` · US ${pct(i.usShare, 0, false)}`}
        {i.topShare !== undefined && ` · top 10 = ${pct(i.topShare, 0, false)}`}
      </p>
      {i.top && (
        <ul className="mt-2 flex flex-col gap-1">
          {i.top.map(([n, w]) => (
            <li key={n} className="flex justify-between gap-3">
              <span>{n}</span>
              <span className="num text-ink-2">{pct(w, 1, false)}</span>
            </li>
          ))}
        </ul>
      )}
      {i.note && <p className="mt-1.5 text-ink-2">{i.note}</p>}
      <p className="mt-1.5 text-[12px] text-ink-3">
        As of {dateLabel(i.asof)} ·{" "}
        <a href={i.source} target="_blank" rel="noreferrer" className="underline">
          source
        </a>
      </p>
    </div>
  );
}
