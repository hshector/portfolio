import Link from "next/link";

import { signOut } from "@/app/login/actions";
import { SettingsForm } from "@/components/portfolio/forms";
import { BacktestChart } from "@/components/settings/backtest-chart";
import { PageHeader } from "@/components/shell/page-header";
import { ThemePicker } from "@/components/shell/theme";
import { IconChevronRight, IconLogout } from "@/components/ui/icons";
import { MiniStat } from "@/components/portfolio/mix";
import { Badge, Button, Callout, Disclosure, EmptyState, Panel } from "@/components/ui/primitives";
import { dateLabel, dateTimeLabel, int, num, pct } from "@/lib/format";
import { computeFreshness } from "@/lib/market/freshness";
import { getBacktest, getExcluded, loadMarket } from "@/lib/market/source";
import type { Meta } from "@/lib/market/types";
import { NotifySettings } from "@/components/alerts/notify-settings";
import { DEFAULT_NOTIFY } from "@/lib/market/signals";
import { appMode } from "@/lib/supabase/env";
import { requireStore } from "@/lib/user/store";

export const metadata = { title: "Settings" };

const TABS = [
  ["data", "Data status"],
  ["method", "How it is calculated"],
  ["backtest", "Historical test"],
  ["portfolio", "Portfolio target"],
  ["notifications", "Notifications"],
  ["account", "Account"],
] as const;

const SCORE_LABEL: Record<string, string> = {
  momentum: "Trend strength",
  trend_quality: "Trend quality",
  acceleration: "Acceleration",
  risk: "Risk (0 = calmest)",
  inverse_risk: "100 − Risk",
  quality: "Quality",
  safety: "Financial health",
  value: "Value",
};

const FUND_LABEL: Record<string, string> = {
  gross_profitability: "Gross profit on assets (Novy-Marx 2013)",
  roa: "Return on assets",
  cfo_assets: "Operating cash flow on assets",
  low_accruals: "Profit backed by cash (Sloan 1996)",
  fscore: "Piotroski F-Score (2000)",
  zscore: "Altman Z'' bankruptcy score",
  low_debt: "Low debt",
  interest_coverage: "Interest coverage",
  ebit_ev: "Operating profit / enterprise value (Greenblatt)",
  fcf_yield: "Free cash flow yield",
  earnings_yield: "Earnings yield",
  distress_zscore: "Avoid if Altman Z'' is below",
  min_fscore: "Buy candidate needs an F-Score of at least",
  max_dilution: "…and share count growth of at most",
  max_accruals: "…and accruals of at most",
  min_ebit_ev: "…and operating profit / value of at least",
};

const MENU: {
  group: string;
  items: { href: string; label: string; sub: string }[];
}[] = [
  {
    group: "Data",
    items: [
      {
        href: "/settings?tab=data",
        label: "Data status",
        sub: "Date, sources and coverage",
      },
      {
        href: "/settings?tab=method",
        label: "How it is calculated",
        sub: "Radar and fundamentals method",
      },
      {
        href: "/settings?tab=backtest",
        label: "Historical test",
        sub: "Backtest and its limits",
      },
    ],
  },
  {
    group: "Portfolio",
    items: [
      {
        href: "/settings?tab=portfolio",
        label: "Target mix and monthly amount",
        sub: "Core / diversifiers / momentum and bands",
      },
      {
        href: "/plan",
        label: "Products in each block",
        sub: "Core fund, diversifiers, momentum",
      },
      {
        href: "/portfolio/transactions",
        label: "Transactions",
        sub: "Edit or delete",
      },
      { href: "/portfolio/import", label: "Import CSV", sub: "With preview" },
    ],
  },
  {
    group: "Alerts",
    items: [
      {
        href: "/settings?tab=notifications",
        label: "Notifications",
        sub: "Signal changes on your phone",
      },
      {
        href: "/alerts",
        label: "Recent signal changes",
        sub: "What changed after each update",
      },
    ],
  },
  {
    group: "Account",
    items: [{ href: "/settings?tab=account", label: "Account", sub: "Session" }],
  },
];

export default async function SettingsPage({ searchParams }: { searchParams: Promise<{ tab?: string; q?: string }> }) {
  const sp = await searchParams;
  const tab = TABS.find(([k]) => k === sp.tab)?.[0];
  const { latest, meta } = await loadMarket();
  if (!tab) {
    return (
      <div className="mx-auto max-w-[760px]">
        <PageHeader title="Settings" />
        <div className="flex flex-col gap-6">
          <div>
            <p className="mb-2 px-5 text-[13px] font-medium text-ink-2">Appearance</p>
            <div className="card px-4 py-4">
              <ThemePicker />
            </div>
          </div>
          {MENU.map((g) => (
            <div key={g.group}>
              <p className="mb-2 px-5 text-[13px] font-medium text-ink-2">{g.group}</p>
              <div className="card divide-y divide-line overflow-hidden">
                {g.items.map((it) => (
                  <Link key={it.href} href={it.href} className="flex items-center justify-between gap-3 px-5 py-3.5 transition-colors hover:bg-surface-2 active:bg-surface-3">
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[15.5px]">{it.label}</span>
                      <span className="block truncate text-[13px] text-ink-3">{it.sub}</span>
                    </span>
                    <IconChevronRight size={18} className="shrink-0 text-ink-3" />
                  </Link>
                ))}
              </div>
            </div>
          ))}
          <p className="px-5 text-[12.5px] text-ink-3">
            Not financial advice · Logos by{" "}
            <a href="https://logo.dev" target="_blank" rel="noopener noreferrer" className="underline underline-offset-2">
              Logo.dev
            </a>
            .
          </p>
        </div>
      </div>
    );
  }
  const title = TABS.find(([k]) => k === tab)![1];
  return (
    <div className="mx-auto max-w-[960px]">
      <Link href="/settings" className="text-[15px] font-medium text-accent">
        ‹ Settings
      </Link>
      <div className="mt-3">
        <PageHeader title={title} />
      </div>
      {tab === "data" && <DataTab latest={latest} meta={meta} q={sp.q} />}
      {tab === "method" && (meta ? <MethodTab meta={meta} /> : <EmptyState title="No data published" />)}
      {tab === "backtest" && <BacktestTab />}
      {tab === "portfolio" && <PortfolioTab />}
      {tab === "notifications" && <NotificationsTab />}
      {tab === "account" && <AccountTab />}
    </div>
  );
}

async function DataTab({ latest, meta, q }: { latest: Awaited<ReturnType<typeof loadMarket>>["latest"]; meta: Meta | null; q?: string }) {
  if (!latest || !meta) {
    return (
      <EmptyState title="No data published yet">
        Set the repository secrets and run the <code className="font-mono">market-data</code> workflow (see docs/DEPLOY.md). Locally:{" "}
        <code className="font-mono">python -m warrenia_engine demo</code>.
      </EmptyState>
    );
  }
  const fresh = computeFreshness(latest.data_asof, meta.calendar?.sessions);
  const excluded = (await getExcluded(latest)) ?? [];
  const filt = q ? excluded.filter((e) => e.t.includes(q.toUpperCase()) || e.n.toLowerCase().includes(q.toLowerCase())) : excluded;
  return (
    <div className="grid gap-4 xl:grid-cols-2">
      <Panel title="Last run">
        <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-2 text-[13px]">
          <dt className="text-ink-3">Data (close)</dt>
          <dd>
            {dateLabel(meta.data_asof)} · NYSE · {meta.data_type}
          </dd>
          <dt className="text-ink-3">Calculated</dt>
          <dd>
            {dateTimeLabel(meta.computed_at)} {meta.compute_seconds ? <span className="t-meta">({num(meta.compute_seconds, 0)} s)</span> : null}
          </dd>
          <dt className="text-ink-3">Freshness</dt>
          <dd className={fresh.status === "stale" ? "text-warn" : fresh.status === "fresh" ? "text-pos" : "text-ink-2"}>{latest.demo ? "Demo data" : fresh.label}</dd>
          <dt className="text-ink-3">Status</dt>
          <dd>
            {meta.status === "ok" ? <Badge tone="pos">OK</Badge> : <Badge tone="warn">With warnings</Badge>} {meta.demo && <Badge tone="accent">DEMO</Badge>}
          </dd>
          <dt className="text-ink-3">Provider</dt>
          <dd>{meta.provider}</dd>
          <dt className="text-ink-3">Data window</dt>
          <dd className="num">
            {dateLabel(meta.data_window.first_session)} → {dateLabel(meta.data_window.last_session)} ({int(meta.data_window.sessions)} sessions)
          </dd>
          <dt className="text-ink-3">Total return</dt>
          <dd>{meta.total_return ? "Yes (splits and dividends)" : "No: splits only (dividends not available)"}</dd>
          <dt className="text-ink-3">Run</dt>
          <dd className="break-all font-mono text-[12px] text-ink-2">
            {meta.run_id} · cfg {meta.methodology.config_hash}
            {meta.git_sha ? ` · ${meta.git_sha.slice(0, 7)}` : ""}
          </dd>
        </dl>
        {meta.warnings.length > 0 && (
          <div className="mt-4 flex flex-col gap-2">
            {meta.warnings.map((w) => (
              <Callout key={w} tone="warn">
                {w}
              </Callout>
            ))}
          </div>
        )}
      </Panel>
      <Panel title="Market coverage">
        <div className="grid gap-4 sm:grid-cols-2">
          {(["stock", "etf"] as const).map((c) => (
            <div key={c} className="flex flex-col gap-2">
              <span className="t-label">{c === "stock" ? "Stocks" : "ETFs"}</span>
              <span className="num text-[20px] font-semibold">
                {int(meta.coverage[c].eligible)} <span className="text-[13px] font-normal text-ink-3">eligible of {int(meta.coverage[c].candidates)}</span>
              </span>
              <ul className="flex flex-col gap-1 text-[12.5px]">
                {Object.entries(meta.coverage[c].excluded_by_reason).map(([r, n]) => (
                  <li key={r} className="flex justify-between gap-3 text-ink-2">
                    <span>{r}</span>
                    <span className="num text-ink-3">{int(n)}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </Panel>
      <Disclosure title="Sources, cost and frequency" className="xl:col-span-2">
        <p className="mb-3 text-[13px] text-ink-2">{meta.methodology.universe}</p>
        <div className="grid gap-4 text-[13px] text-ink-2 md:grid-cols-2">
          <ul className="flex flex-col gap-2">
            <li>
              <span className="text-ink">US prices (stocks and ETFs):</span> Massive (formerly Polygon.io), free plan: end of day, ~2 years of history, 5 requests/min. One request
              returns the whole market for a day. Company descriptions come from the same provider.
            </li>
            <li>
              <span className="text-ink">Company size, sector and annual reports:</span> SEC EDGAR (official, free): shares outstanding × price; sector approximated from the SIC
              code (not GICS); financial statements from XBRL filings (US GAAP frames; IFRS filers such as European ADRs from each company&apos;s own file, converted to USD at ECB
              rates).
            </li>
            <li>
              <span className="text-ink">Exchange rates:</span> ECB reference rates (official, daily).
            </li>
            <li>
              <span className="text-ink">EUR prices of ETFs/ETCs:</span> EODHD free plan (~20 calls/day): enough for a handful of portfolio instruments.
            </li>
          </ul>
          <ul className="flex flex-col gap-2">
            <li>
              <span className="text-ink">Frequency:</span> a scheduled GitHub Actions job after each NYSE close (≈ 05:15 UTC, retry 11:05 UTC). Annual reports weekly.
            </li>
            <li>
              <span className="text-ink">Data type:</span> daily close. No real time or intraday.
            </li>
            <li>
              <span className="text-ink">Cost:</span> €0/month as configured. A longer history (a robust backtest) needs a paid plan.
            </li>
            <li>
              <span className="text-ink">Use:</span> personal and private; data is not redistributed (the app requires sign-in).
            </li>
          </ul>
        </div>
      </Disclosure>
      <Panel title={`Excluded assets (${int(excluded.length)})`} className="xl:col-span-2" pad={false}>
        <form className="px-4 pb-3 md:px-5">
          <input type="hidden" name="tab" value="data" />
          <input
            name="q"
            defaultValue={q}
            placeholder="Search ticker or name"
            className="h-8 w-full max-w-56 rounded-[8px] border border-line-2 bg-canvas-2 px-2.5 text-[13px] outline-none pointer-coarse:text-[16px]"
          />
        </form>
        <ul className="max-h-[420px] overflow-y-auto">
          {filt.slice(0, 300).map((e) => (
            <li key={e.t + e.cls} className="border-t border-line px-4 py-2 text-[12.5px] md:px-5">
              <p className="flex min-w-0 gap-2">
                <span className="shrink-0 font-mono text-ink">{e.t}</span>
                <span className="min-w-0 truncate text-ink-3">{e.n}</span>
              </p>
              <p className="text-ink-2">{e.reasons.join(" · ")}</p>
            </li>
          ))}
          {filt.length > 300 && <li className="t-meta px-5 py-2">Showing 300 of {int(filt.length)}. Use the search.</li>}
        </ul>
      </Panel>
    </div>
  );
}

function MethodTab({ meta }: { meta: Meta }) {
  const m = meta.methodology;
  const corr = meta.correlation;
  const sens = meta.sensitivity;
  return (
    <div className="grid gap-4 xl:grid-cols-2">
      <Panel title="Overall momentum score" meta={`Method v${m.version} · fixed weights`}>
        <ul className="flex flex-col gap-2">
          {Object.entries(m.overall).map(([k, w]) => (
            <li key={k} className="flex items-center gap-3 text-[13px]">
              <span className="w-32 shrink-0 truncate text-ink-2 sm:w-44">{SCORE_LABEL[k] ?? k}</span>
              <span className="h-1.5 flex-1 rounded-full bg-surface-3">
                <span className="block h-1.5 rounded-full bg-accent" style={{ width: `${w * 100}%` }} />
              </span>
              <span className="num w-10 text-right">{Math.round(w * 100)} %</span>
            </li>
          ))}
        </ul>
        <Disclosure card={false} title="How the score is built" className="mt-4">
          <p className="t-meta">
            Each score is the weighted average of its components&apos; percentiles across the market, expressed again as a percentile (0-100) within its class (stocks or ETFs).
            Return versus a single benchmark is not a ranking factor: subtracting the same reference from every asset does not change the order (it is shown as context).
          </p>
        </Disclosure>
      </Panel>
      <Panel title="Components">
        <div className="flex flex-col gap-4">
          {Object.entries(m.scores).map(([s, comps]) => (
            <div key={s}>
              <p className="t-label mb-1.5">{SCORE_LABEL[s] ?? s}</p>
              <ul className="flex flex-col gap-1 text-[12.5px]">
                {Object.entries(comps).map(([k, w]) => (
                  <li key={k} className="flex justify-between gap-3 text-ink-2">
                    <span>{m.labels[k] ?? k}</span>
                    <span className="num text-ink-3">{Math.round(w * 100)} %</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </Panel>
      <Panel title="Weight sensitivity">
        {sens ? (
          <div className="flex flex-col gap-3 text-[13px]">
            <dl className="grid grid-cols-3 gap-3">
              <MiniStat label="Spearman" value={num(sens.spearman.median, 2)} />
              <MiniStat label={`Top-${sens.top_n} overlap`} value={pct(sens.topn_overlap.median, 0, false)} />
              <MiniStat label="Worst" value={pct(sens.topn_overlap.min, 0, false)} />
            </dl>
            <p className="text-[12.5px] text-ink-3">
              {sens.samples} weight variations around the current ones. Spearman correlation with the base ranking: median{" "}
              <span className="num text-ink">{num(sens.spearman.median, 3)}</span> (p5 {num(sens.spearman.p05, 3)}). Top-{sens.top_n} overlap: median{" "}
              <span className="num text-ink">{pct(sens.topn_overlap.median, 0, false)}</span>, p5 {pct(sens.topn_overlap.p05, 0, false)}, minimum{" "}
              {pct(sens.topn_overlap.min, 0, false)}.
            </p>
            <p>
              {sens.passes_target ? <Badge tone="pos">Meets the target</Badge> : <Badge tone="warn">Misses the target</Badge>}{" "}
              <span className="t-meta">declared target: median overlap ≥ {pct(sens.target_median_topn_overlap, 0, false)}</span>
            </p>
          </div>
        ) : (
          <p className="t-body">Market too small for this analysis.</p>
        )}
      </Panel>
      <Panel title="Correlation between components">
        {corr ? (
          <>
            {corr.high_pairs.length > 0 ? (
              <Callout tone="warn" title={`Pairs with |ρ| ≥ ${corr.threshold} (review)`}>
                {corr.high_pairs.map((p) => `${m.labels[p.a] ?? p.a} ↔ ${m.labels[p.b] ?? p.b}: ${num(p.rho, 2)}`).join(" · ")}
              </Callout>
            ) : (
              <p className="text-[13px] text-pos">No pair exceeds {corr.threshold}.</p>
            )}
            <Disclosure card={false} title="Matrix" className="mt-3">
              <div className="overflow-x-auto">
                <table className="text-[10.5px]">
                  <tbody>
                    {corr.labels.map((a, i) => (
                      <tr key={a}>
                        <td className="whitespace-nowrap pr-2 text-ink-3">{a}</td>
                        {corr.matrix[i].map((v, j) => {
                          const x = v ?? 0;
                          return (
                            <td
                              key={j}
                              title={`${a} · ${corr.labels[j]}: ${v === null ? "n/a" : v.toFixed(2)}`}
                              className="num h-5 w-7 text-center"
                              style={{
                                background: x >= 0 ? `rgb(82 127 98 / ${Math.abs(x) * 0.55})` : `rgb(90 110 148 / ${Math.abs(x) * 0.55})`,
                              }}
                            >
                              {i === j ? "" : v === null ? "·" : Math.round(x * 10)}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
                <p className="t-meta mt-2">Values × 10. Green = positive correlation, blue = negative.</p>
              </div>
            </Disclosure>
          </>
        ) : (
          <p className="t-body">Not available.</p>
        )}
      </Panel>
      <Panel title="Fundamentals" meta="Last annual report · percentiles among stocks" className="xl:col-span-2">
        {m.fundamentals ? (
          <div className="grid gap-4 text-[12.5px] md:grid-cols-4">
            {Object.entries(m.fundamentals.scores).map(([s, comps]) => (
              <div key={s}>
                <p className="t-label mb-1">
                  {SCORE_LABEL[s] ?? s} · {Math.round((m.fundamentals!.overall[s] ?? 0) * 100)}%
                </p>
                <ul className="flex flex-col gap-0.5 text-ink-2">
                  {Object.entries(comps).map(([k, w]) => (
                    <li key={k} className="flex justify-between gap-3">
                      <span>{FUND_LABEL[k] ?? k}</span>
                      <span className="num text-ink-3">{Math.round(w * 100)}%</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
            <div>
              <p className="t-label mb-1">Rules</p>
              <ul className="flex flex-col gap-0.5 text-ink-2">
                {Object.entries(m.fundamentals.rules).map(([k, v]) => (
                  <li key={k} className="flex justify-between gap-3">
                    <span>{FUND_LABEL[k] ?? k}</span>
                    <span className="num text-ink-3">{String(v)}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        ) : (
          <p className="t-body">Not published by this run.</p>
        )}
      </Panel>
      <Disclosure title="Status rules" className="xl:col-span-2">
        <div className="grid gap-4 text-[12.5px] md:grid-cols-3">
          {Object.entries(m.classification).map(([k, v]) => (
            <div key={k}>
              <p className="t-label mb-1">{meta.states[k as keyof Meta["states"]] ?? k}</p>
              <ul className="flex flex-col gap-0.5 text-ink-2">
                {Object.entries(v).map(([p, val]) => (
                  <li key={p} className="flex justify-between gap-3">
                    <span className="font-mono text-[11.5px] text-ink-3">{p}</span>
                    <span className="num">{String(val)}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </Disclosure>
    </div>
  );
}

async function BacktestTab() {
  const bt = await getBacktest();
  if (!bt || bt.status !== "ok" || !bt.results) {
    return <EmptyState title="No backtest published">{bt?.message ?? "The “backtest” workflow runs on Saturdays or manually from GitHub Actions."}</EmptyState>;
  }
  const labels: Record<string, string> = { ...(bt.strategies ?? {}) };
  for (const k of Object.keys(bt.results)) if (k.startsWith("bench_")) labels[k] = `Benchmark ${k.slice(6)} (buy and hold)`;
  const keys = Object.keys(bt.results);
  const cols: [string, string, (v: number | null) => string][] = [
    ["cagr", "CAGR", (v) => pct(v)],
    ["vol", "Volatility", (v) => pct(v, 1, false)],
    ["sharpe", "Sharpe", (v) => num(v)],
    ["max_drawdown", "Max DD", (v) => pct(v, 1, false)],
    ["calmar", "Calmar", (v) => num(v)],
    ["annual_turnover", "Yearly turnover", (v) => (v === null || v === undefined ? "—" : `${num(v, 1)}x`)],
    ["total_costs", "Costs", (v) => pct(v, 2, false)],
  ];
  return (
    <div className="flex flex-col gap-4">
      <Callout tone={bt.conclusive ? "info" : "warn"} title={bt.conclusive ? "Backtest" : "Exploratory results, NOT conclusive"}>
        {bt.limitations?.[0]} {bt.demo && "These results also use synthetic demo data."}
      </Callout>
      {bt.results.overall && bt.results.candidates_buffer && (
        <Panel title="Does waiting for a dip pay off?">
          <dl className="grid grid-cols-2 gap-3">
            <MiniStat label="Full ranking / yr" value={pct(bt.results.overall.cagr as number | null)} />
            <MiniStat label="Candidates only / yr" value={pct(bt.results.candidates_buffer.cagr as number | null)} />
            <MiniStat label="Turnover" value={`${num(bt.results.overall.annual_turnover as number | null, 1)}x`} />
            <MiniStat label="Turnover" value={`${num(bt.results.candidates_buffer.annual_turnover as number | null, 1)}x`} />
          </dl>
          {bt.demo && <p className="mt-3 text-[12.5px] text-ink-3">Synthetic data: this comparison means nothing yet.</p>}
        </Panel>
      )}
      <Panel title="Growth of 1 unit" meta={`${bt.period?.first_signal} → ${bt.period?.end} · ${bt.settings?.cost_bps_per_side} bp per side`}>
        {bt.curves && <BacktestChart dates={bt.curves.dates} series={bt.curves.series} labels={labels} />}
      </Panel>
      <Panel title="Metrics" pad={false}>
        <ul className="divide-y divide-line">
          {keys.map((k) => (
            <li key={k} className="px-4 py-3 md:px-5">
              <p className="text-[14px] font-medium">{labels[k] ?? k}</p>
              <dl className="mt-2 grid grid-cols-3 gap-x-3 gap-y-2 sm:grid-cols-7">
                {cols.map(([c, l, f]) => (
                  <MiniStat key={c} label={l} value={f((bt.results![k][c] as number | null) ?? null)} />
                ))}
              </dl>
            </li>
          ))}
        </ul>
      </Panel>
      <div className="grid gap-4 xl:grid-cols-2">
        <Panel title="By market regime" meta="Yearly return">
          <ul className="flex flex-col gap-1.5 text-[13px]">
            {Object.entries((bt.results.overall?.regimes as Record<string, { days: number; ann_return: number | null }>) ?? {}).map(([k, v]) => (
              <li key={k} className="flex justify-between text-ink-2">
                <span>{k}</span>
                <span className="num">
                  {pct(v.ann_return)} <span className="text-ink-3">({v.days} days)</span>
                </span>
              </li>
            ))}
          </ul>
        </Panel>
        <Disclosure title="Limitations">
          <ul className="flex list-disc flex-col gap-1.5 pl-4 text-[13px] text-ink-2 marker:text-ink-3">
            {bt.limitations?.map((l) => (
              <li key={l}>{l}</li>
            ))}
          </ul>
        </Disclosure>
      </div>
      <p className="t-meta">
        Simulated historical results. They do not guarantee future results. Calculated {dateTimeLabel(bt.computed_at)} with data to {dateLabel(bt.data_asof)}.
      </p>
    </div>
  );
}

async function PortfolioTab() {
  const store = await requireStore();
  const s = await store.settings();
  return (
    <Panel title="Target weights and bands">
      <SettingsForm settings={s} />
    </Panel>
  );
}

async function NotificationsTab() {
  const store = await requireStore();
  const [s, devices] = await Promise.all([store.settings(), store.pushSubscriptions().catch(() => [])]);
  return (
    <div className="max-w-[640px]">
      <NotifySettings publicKey={process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || null} prefs={{ ...DEFAULT_NOTIFY, ...s.notify }} devices={devices.length} />
    </div>
  );
}

async function AccountTab() {
  const store = await requireStore();
  const mode = appMode();
  return (
    <Panel title="Account">
      <div className="flex flex-col gap-3 text-[13px]">
        <p className="text-ink-2">
          {mode === "supabase" ? (
            <>
              Signed in as <span className="text-ink">{store.email}</span>. Your data is isolated per user (Row Level Security).
            </>
          ) : (
            <>
              Demo: no sign-in. Your plan, portfolio and watchlist are stored only in this browser; nobody else sees them.
            </>
          )}
        </p>
        {mode === "supabase" && (
          <form action={signOut}>
            <Button type="submit">
              <IconLogout size={15} /> Sign out
            </Button>
          </form>
        )}
      </div>
    </Panel>
  );
}
