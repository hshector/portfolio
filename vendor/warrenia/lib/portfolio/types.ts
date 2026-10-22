export type Bucket = "core" | "gold" | "momentum" | "cash" | "other";
/** The blocks of the plan (targets add up to 100%). Cash is optional: 0% unless you choose otherwise. */
export type PlanKey = "core" | "gold" | "momentum" | "cash";
export const PLAN_KEYS: PlanKey[] = ["core", "gold", "momentum", "cash"];
export type InstrumentKind = "etf" | "stock" | "etc" | "fund" | "other";
export type PriceSource = "us_market" | "eodhd" | "manual";
export type TxType = "buy" | "sell" | "deposit" | "withdrawal" | "dividend" | "interest" | "fee" | "tax" | "split";

export interface Instrument {
  id: string;
  name: string;
  isin: string | null;
  kind: InstrumentKind;
  bucket: Bucket;
  currency: string;
  price_source: PriceSource;
  market_ticker: string | null;
  eodhd_symbol: string | null;
  sector: string | null;
}

export interface Transaction {
  id: string;
  instrument_id: string | null;
  type: TxType;
  trade_date: string; // YYYY-MM-DD
  quantity: number | null;
  price: number | null;
  amount: number | null;
  fees: number;
  taxes: number;
  currency: string;
  fx_rate: number; // EUR per 1 unit of `currency`
  split_ratio: number | null;
  note: string | null;
  source: "manual" | "csv";
  import_hash?: string | null;
}

export interface ManualPrice {
  id: string;
  instrument_id: string;
  price_date: string;
  price: number;
}

export interface Settings {
  targets: Record<PlanKey, number>;
  /** Products chosen for each block (lib/plan/catalog.ts); missing = recommended defaults. */
  choices?: Partial<Record<PlanKey, { isin: string; weight: number }[]>>;
  band_abs: number;
  band_rel: number;
  monthly_contribution: number;
  /** Signal-change notifications: what to be told about (migration 0003). */
  notify?: { holdings: boolean; watchlist: boolean; candidates: boolean };
}

export const DEFAULT_SETTINGS: Settings = {
  targets: { core: 0.75, gold: 0.1, momentum: 0.15, cash: 0 },
  band_abs: 0.05,
  band_rel: 0.25,
  monthly_contribution: 450,
};

/** Settings saved before the cash block existed have no `cash` target: it is 0. */
export function normTargets(t: Partial<Record<PlanKey, number>> | null | undefined): Record<PlanKey, number> {
  if (!t || typeof t.core !== "number") return { ...DEFAULT_SETTINGS.targets };
  return { core: t.core, gold: t.gold ?? 0, momentum: t.momentum ?? 0, cash: t.cash ?? 0 };
}

export const BUCKET_LABELS: Record<Bucket, string> = {
  core: "Core",
  gold: "Diversifiers",
  momentum: "Momentum",
  other: "Other",
  cash: "Cash",
};

export const TX_LABELS: Record<TxType, string> = {
  buy: "Buy",
  sell: "Sell",
  deposit: "Deposit",
  withdrawal: "Withdrawal",
  dividend: "Dividend",
  interest: "Interest",
  fee: "Fee",
  tax: "Tax",
  split: "Split",
};
