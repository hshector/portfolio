import "server-only";

import { sortTx } from "@/lib/portfolio/engine";
import type { Instrument, Transaction } from "@/lib/portfolio/types";

import type { UserStore } from "./store";

/** Net quantity per instrument (no prices needed). */
export function netQuantities(txs: Transaction[]): Map<string, number> {
  const q = new Map<string, number>();
  for (const t of sortTx(txs)) {
    if (!t.instrument_id) continue;
    const cur = q.get(t.instrument_id) ?? 0;
    if (t.type === "buy") q.set(t.instrument_id, cur + (t.quantity ?? 0));
    else if (t.type === "sell") q.set(t.instrument_id, cur - (t.quantity ?? 0));
    else if (t.type === "split") q.set(t.instrument_id, cur * (t.split_ratio ?? 1));
  }
  return q;
}

export interface HeldInfo {
  tickers: string[];
  instruments: Instrument[];
}

/** Market tickers currently held (US stocks / ETFs priced from the engine). */
export async function heldTickers(store: UserStore): Promise<HeldInfo> {
  const [ins, txs] = await Promise.all([store.instruments(), store.transactions()]);
  const q = netQuantities(txs);
  const held = ins.filter((i) => (q.get(i.id) ?? 0) > 1e-9);
  return { tickers: held.map((i) => i.market_ticker).filter((t): t is string => !!t), instruments: held };
}
