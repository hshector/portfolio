import "server-only";

import { todayMadrid } from "@/lib/format";
import { getAssets, getFx, getPriceFile } from "@/lib/market/source";
import type { Latest, Meta } from "@/lib/market/types";
import type { UserStore } from "@/lib/user/store";

import { computePortfolio, PortfolioError, type FxTable, type PortfolioResult, type PriceSeries } from "./engine";
import { rawFromAdjusted } from "./prices";
import type { Instrument, Settings, Transaction } from "./types";

export interface LoadedPortfolio {
  instruments: Instrument[];
  transactions: Transaction[];
  settings: Settings;
  result: PortfolioResult | null;
  error: string | null;
  fxAsof: string | null;
  priceInfo: Record<string, { source: string; asof: string | null }>;
  /** Server-side inputs of the valuation (for what-if calculations such as a sale estimate). */
  prices: Record<string, PriceSeries>;
  fx: FxTable;
  asOf: string;
}

/** Valued on today's date in Spain, or on the latest trade if one is dated later (a trade
 *  entered from a time zone already on tomorrow must not vanish from the portfolio). */
function valuationDate(txs: Transaction[]): string {
  return txs.reduce((d, t) => (t.trade_date > d ? t.trade_date : d), todayMadrid());
}

export async function loadPortfolio(store: UserStore, latest: Latest | null, meta: Meta | null): Promise<LoadedPortfolio> {
  const [instruments, transactions, settings, manual, fxFile] = await Promise.all([
    store.instruments(),
    store.transactions(),
    store.settings(),
    store.manualPrices(),
    getFx().catch(() => null),
  ]);
  const prices: Record<string, PriceSeries> = {};
  const priceInfo: LoadedPortfolio["priceInfo"] = {};

  const usTickers = instruments.filter((i) => i.price_source === "us_market" && i.market_ticker).map((i) => i.market_ticker!);
  const eodhd = [...new Set(instruments.filter((i) => i.price_source === "eodhd" && i.eodhd_symbol).map((i) => i.eodhd_symbol!))];
  // US closes and EUR price files are independent downloads: fetch them all at once.
  const [assets, files] = await Promise.all([
    usTickers.length ? getAssets(latest, usTickers) : Promise.resolve({} as Awaited<ReturnType<typeof getAssets>>),
    Promise.all(eodhd.map(async (s) => [s, await getPriceFile(s).catch(() => null)] as const)).then((xs) => new Map(xs)),
  ]);
  for (const ins of instruments) {
    if (ins.price_source === "us_market" && ins.market_ticker) {
      const a = assets[ins.market_ticker];
      if (a?.series && meta?.sessions) {
        prices[ins.id] = { currency: "USD", source: `Massive EOD (${ins.market_ticker})`, points: rawFromAdjusted(meta.sessions, a.series.c, a.events ?? []) };
        priceInfo[ins.id] = { source: "Cierre EE. UU. (USD) + BCE", asof: latest?.data_asof ?? null };
      }
    } else if (ins.price_source === "eodhd" && ins.eodhd_symbol) {
      const f = files.get(ins.eodhd_symbol);
      if (f?.series.length) {
        prices[ins.id] = { currency: f.currency, source: f.source, points: f.series.map(([date, price]) => ({ date, price })) };
        priceInfo[ins.id] = { source: f.source, asof: f.asof };
      }
    }
    const m = manual.filter((p) => p.instrument_id === ins.id);
    if (m.length && !prices[ins.id]) {
      prices[ins.id] = { currency: ins.currency, source: "precio manual", points: m.map((p) => ({ date: p.price_date, price: p.price })).sort((a, b) => a.date.localeCompare(b.date)) };
      priceInfo[ins.id] = { source: "Manual price", asof: m[m.length - 1].price_date };
    }
  }
  const fx: FxTable = fxFile?.rates ?? {};
  const asOf = valuationDate(transactions);
  let result: PortfolioResult | null = null;
  let error: string | null = null;
  try {
    result = transactions.length ? computePortfolio(instruments, transactions, prices, fx, asOf) : null;
  } catch (e) {
    if (e instanceof PortfolioError) error = e.message;
    else throw e;
  }
  return { instruments, transactions, settings, result, error, fxAsof: fxFile?.asof ?? null, priceInfo, prices, fx, asOf };
}
