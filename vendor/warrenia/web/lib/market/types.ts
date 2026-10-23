// Types of the artifacts published by the Python engine (engine/warrenia_engine/publish.py).
// Field names are short on purpose (radar.json can hold thousands of rows).

export type AssetClass = "stock" | "etf";
export type StateKey = "speculative" | "extended" | "weakening" | "breakout" | "strong" | "improving" | "neutral";
export type ActionKey = "candidate" | "wait" | "watch" | "avoid" | "none";

export interface Latest {
  schema: number;
  run_id: string;
  data_asof: string; // YYYY-MM-DD session date of the data
  session_close_utc: string | null;
  computed_at: string;
  demo: boolean;
  status: "ok" | "degraded";
  provider: string;
  path: string;
}

export interface RadarRow {
  t: string; // ticker
  n: string; // name
  cls: AssetClass;
  ex: string | null;
  sec: string | null;
  mcap: number | null;
  px: number | null;
  d1: number | null;
  r1m: number | null;
  r3m: number | null;
  r6m: number | null;
  r12m: number | null;
  ytd: number | null;
  r12_1: number | null;
  vol: number | null;
  atr: number | null;
  mdd: number | null;
  dd: number | null;
  beta: number | null;
  d52: number | null;
  adv: number | null;
  rvol: number | null;
  s50: number | null;
  s200: number | null;
  m: number; // Momentum Score
  tq: number; // Trend Quality
  a: number; // Acceleration
  rk: number; // Risk (0 = lowest risk)
  ov: number; // Overall score
  rank: number;
  dr: number | null; // rank change over 21 sessions (positive = improved)
  dm: number | null; // Momentum percentile change over 21 sessions
  lead: number | null; // residual momentum
  secrel: number | null; // 6m return relative to sector ETF
  st: StateKey;
  pst: StateKey | null; // state in previous run
  tags: StateKey[];
  why: string[];
  flags: string[];
  bo: boolean;
  h52: boolean;
  act: ActionKey; // what to do now (engine rules: scoring.decide)
  hold: boolean; // if already owned: keep (true) or review a sale (false)
  pe: number | null; // P/E on last annual net income (stocks; null if loss-making or unknown)
  prof: boolean | null; // profitable in the last fiscal year (null = unknown)
  fund?: number | null; // Fundamentals score 0-100 (stocks; null = no annual report data)
  fs?: number | null; // Piotroski F-Score 0-9
  flags_f?: number; // fundamental flags: red x10 + yellow
}

export interface ProxyStats {
  label: string;
  from: string;
  years: number;
  ann_return: number | null;
  vol: number | null;
  max_drawdown: number | null;
  corr_stocks: number | null;
  beta_stocks: number | null;
  worst_month: number | null;
  when_stocks_fall: number | null;
  stocks_when_fall: number | null;
  down_months: number;
}

export interface Fundamentals {
  available: boolean;
  metrics?: Record<string, number | boolean | string | null> & { fscore_signals?: Record<string, boolean | null> | null };
  scores?: { fund: number | null; f_quality: number | null; f_safety: number | null; f_value: number | null };
  rules?: Record<string, number>;
}

export interface Profile {
  description: string;
  homepage: string | null;
  employees: number | null;
  list_date: string | null;
  industry: string | null;
  fetched_at: string;
}

export type BenchReturns = Record<string, { d1?: number | null; r1m: number | null; r3m: number | null; r6m: number | null; r12m: number | null; ytd?: number | null }>;

export interface Radar {
  asof: string;
  bench: BenchReturns;
  rows: RadarRow[];
}

export interface Component {
  key: string;
  label: string;
  weight: number;
  raw: number | null;
  pct: number | null;
}

export interface RuleCondition {
  text: string;
  value: number | boolean | null;
  op: string;
  threshold: number | boolean;
  pass: boolean;
}

export interface Report {
  ticker: string;
  name: string;
  cls: AssetClass;
  state: StateKey;
  state_label: string;
  thesis: string[];
  evidence: { label: string; value: string; context: string }[];
  risks: string[];
  invalidation: string[];
  data_quality: { source: string; asof: string; history_sessions: number; missing_frac: number | null; total_return: boolean; notes: string[] };
  disclaimer: string;
  rank?: number;
  action?: ActionKey;
  action_label?: string;
  action_why?: string[];
  entry?: string | null;
}

export interface ActionDecision {
  action: ActionKey;
  label: string;
  why: string[];
  entry: string | null;
  hold: boolean;
  red_flags?: string[];
  yellow_flags?: string[];
}

export interface AssetDetail {
  row: RadarRow;
  eligible: boolean;
  excluded?: string[];
  indicators?: Record<string, number | boolean | null>;
  components?: Record<"momentum" | "trend_quality" | "acceleration" | "risk", Component[]>;
  state?: { state: StateKey; tags: StateKey[]; trace: Record<string, RuleCondition[]> };
  action?: ActionDecision;
  fundamentals?: Fundamentals | null;
  profile?: Profile;
  report?: Report;
  hist?: { d: string[]; r: (number | null)[]; o: (number | null)[] };
  series?: { c: (number | null)[]; v: (number | null)[] };
  events?: [string, number, "split" | "dividend", string][];
}

export interface Coverage {
  candidates: number;
  eligible: number;
  excluded_by_reason: Record<string, number>;
}

export interface Meta {
  schema: number;
  run_id: string;
  data_asof: string;
  session_close_utc: string;
  computed_at: string;
  expected_last_session: string;
  demo: boolean;
  provider: string;
  total_return: boolean;
  status: "ok" | "degraded";
  warnings: string[];
  git_sha: string | null;
  data_window: { first_session: string; last_session: string; sessions: number; plan_limited_before: string | null };
  lake: { refreshed: Record<string, string>; ingested_sessions: number };
  data_type: string;
  coverage: Record<AssetClass, Coverage>;
  benchmarks: Record<string, string>;
  primary_benchmark: string;
  sector_etfs: Record<string, string>;
  states: Record<StateKey, string>;
  actions?: Record<ActionKey, string>;
  sessions: string[];
  calendar?: { exchange: string; sessions: [string, string][] };
  methodology: {
    version: string;
    config_hash: string;
    scores: Record<string, Record<string, number>>;
    overall: Record<string, number>;
    classification: Record<string, Record<string, number>>;
    fundamentals?: { scores: Record<string, Record<string, number>>; overall: Record<string, number>; rules: Record<string, number> };
    windows: Record<string, number>;
    labels: Record<string, string>;
    universe: string;
    universe_rules: Record<string, Record<string, unknown>>;
  };
  sensitivity: null | {
    samples: number;
    concentration: number;
    top_n: number;
    spearman: { median: number; p05: number };
    topn_overlap: { median: number; p05: number; min: number };
    target_median_topn_overlap: number;
    passes_target: boolean;
  };
  correlation: null | { labels: string[]; matrix: (number | null)[][]; threshold: number; high_pairs: { a: string; b: string; rho: number }[] };
  reports: Record<AssetClass, Report[]>;
  compute_seconds?: number;
}

export interface Market {
  asof: string;
  breadth: { above_sma50?: number; above_sma200?: number; new_52w_high?: number; median_r3m?: number; n?: number };
  states: Record<AssetClass, Partial<Record<StateKey, number>>>;
  sectors: { sector: string; etf: string; r1m: number | null; r3m: number | null; r6m: number | null; r12m: number | null; rs_slope_21: number | null; strength: number | null; in_top50: number; eligible: number }[];
  proxies?: Record<string, ProxyStats>;
  benchmarks: Record<string, { price: number | null; px_vs_sma50: number | null; px_vs_sma200: number | null; vol_63: number | null; dd_now: number | null; d1?: number | null; r1m: number | null; r3m: number | null; r6m: number | null; r12m: number | null }>;
  primary: string;
}

export interface Excluded {
  t: string;
  n: string;
  cls: AssetClass;
  reasons: string[];
  codes: string[];
  px: number | null;
  adv: number | null;
}

export interface Backtest {
  status: string;
  conclusive?: boolean;
  demo?: boolean;
  message?: string;
  computed_at?: string;
  data_asof?: string;
  period?: { first_signal: string; last_signal: string; end: string; rebalances: number; years: number };
  settings?: Record<string, string | number>;
  strategies?: Record<string, string>;
  results?: Record<string, Record<string, number | null | Record<string, { days: number; ann_return: number | null }>>>;
  sector_exposure_overall?: Record<string, number>;
  curves?: { dates: string[]; series: Record<string, (number | null)[]> };
  limitations?: string[];
}

export interface FxFile {
  base: "EUR";
  asof: string | null;
  source: string;
  rates: Record<string, [string, number][]>;
}

export interface PriceFile {
  symbol: string;
  currency: string;
  source: string;
  asof: string | null;
  series: [string, number][];
}

export const STATE_LABELS: Record<StateKey, string> = {
  strong: "Strong, steady trend",
  improving: "Gaining strength",
  breakout: "New high (unconfirmed)",
  extended: "Ran up too fast",
  weakening: "Losing steam",
  speculative: "Very volatile",
  neutral: "No clear trend",
};

export const STATE_SHORT = STATE_LABELS;

/** Plain-language labels used in the interface. */
export const STATE_SIMPLE = STATE_LABELS;

/** One-sentence explanation of each state for non-experts. */
export const STATE_EXPLAIN: Record<StateKey, string> = {
  strong: "Rising steadily, above its averages and near its highs.",
  improving: "Its trend is getting stronger compared with the rest of the market.",
  breakout: "It just broke above its recent highs on strong volume. Needs a few days to confirm.",
  extended: "Strong trend, but the price has jumped far above its usual level in a short time.",
  weakening: "It was a leader and is losing steam.",
  speculative: "Very sharp moves: high risk.",
  neutral: "It does not match any specific pattern.",
};

/** What to do with an asset now (engine: scoring.decide). */
export const ACTION_LABELS: Record<ActionKey, string> = {
  candidate: "Buy candidate",
  wait: "Wait for a dip",
  watch: "Watch",
  avoid: "Avoid",
  none: "No signal",
};

export const ACTION_EXPLAIN: Record<ActionKey, string> = {
  candidate: "In the strongest 20%, rising steadily without having shot up, and its finances pass every check: you can buy it now.",
  wait: "Strong trend, but it shot up recently. Buying now means buying the spike: better to wait until it cools off.",
  watch: "Interesting, but not a buy yet: something is missing (confirmation, strength or solid finances).",
  avoid: "Weak trend, very volatile, losing steam or financially fragile. Not a buy; if you own it, consider selling.",
  none: "No clear momentum signal.",
};

/** One stock whose action or hold verdict changed between two published sessions (engine signals.py). */
export interface SignalEvent {
  asof: string;
  t: string;
  n: string | null;
  from: ActionKey | "out" | null;
  to: ActionKey | "out" | null;
  hold_from: boolean;
  hold_to: boolean;
  rank: number | null;
  ov: number | null;
  fund: number | null;
}

export interface SignalLog {
  updated_at: string;
  asof: string;
  events: SignalEvent[];
}
