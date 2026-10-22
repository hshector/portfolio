// Radar query logic (pure, tested). The engine already computed every metric;
// here we only filter / sort published values — no metric is created in the UI.

import type { ActionKey, BenchReturns, RadarRow, StateKey } from "./types";

/** Plain-language risk bucket from the Risk percentile. */
export function riskLabel(rk: number | null | undefined): { text: string; cls: string } {
  if (rk === null || rk === undefined || !Number.isFinite(rk)) return { text: "—", cls: "text-ink-3" };
  if (rk < 34) return { text: "Low", cls: "text-pos" };
  if (rk < 67) return { text: "Medium", cls: "text-ink-2" };
  return { text: "High", cls: "text-neg" };
}


/** The fields the radar list filters, sorts and shows. The page sends only these to the
 *  browser: the full rows are several times larger and the list can hold thousands. */
export const LIST_FIELDS = [
  "t", "n", "cls", "ex", "sec", "mcap", "adv", "vol", "rvol", "r1m", "r3m", "r6m", "r12m",
  "m", "a", "rk", "ov", "rank", "dr", "dm", "st", "act", "prof", "bo", "h52",
] as const satisfies readonly (keyof RadarRow)[];
export type RadarListRow = Pick<RadarRow, (typeof LIST_FIELDS)[number]>;

// Decimals kept per field: enough for every figure the list prints (returns to 0.1 %).
const ROUND: Partial<Record<keyof RadarListRow, number>> = { mcap: 0, adv: 0, vol: 4, rvol: 2, r1m: 4, r3m: 4, r6m: 4, r12m: 4, dm: 1 };

export function toListRow(r: RadarRow): RadarListRow {
  const out = {} as Record<string, unknown>;
  for (const k of LIST_FIELDS) {
    const v = r[k];
    const d = ROUND[k];
    out[k] = d !== undefined && typeof v === "number" && Number.isFinite(v) ? Math.round(v * 10 ** d) / 10 ** d : v;
  }
  return out as RadarListRow;
}

export type Horizon = "r1m" | "r3m" | "r6m" | "r12m";
export type PresetKey = "buy" | "all" | "wait" | "strongest" | "accel" | "lowvol" | "fading" | "breakouts" | "improvers" | "watch";

export interface Preset {
  key: PresetKey;
  label: string;
  question: string;
  note?: string;
  filter?: (r: RadarListRow) => boolean;
  sort: { key: SortKey; dir: "asc" | "desc" };
}

export type SortKey = keyof RadarListRow | "ret" | "rel";

export const PRESETS: Preset[] = [
  {
    key: "buy",
    label: "Buy now",
    question: "Buy candidates: the strongest 20%, rising steadily, not overheated, with solid finances",
    filter: (r) => r.act === "candidate",
    sort: { key: "rank", dir: "asc" },
  },
  { key: "all", label: "Full ranking", question: "Everything, ordered by momentum score (including what is not a buy now)", sort: { key: "rank", dir: "asc" } },
  {
    key: "wait",
    label: "Wait for a dip",
    question: "Leaders that shot up recently: buying now means buying the spike",
    filter: (r) => r.act === "wait",
    sort: { key: "rank", dir: "asc" },
  },
  { key: "strongest", label: "Strongest trend", question: "Which stocks have the strongest trend right now?", sort: { key: "m", dir: "desc" } },
  {
    key: "accel",
    label: "Speeding up",
    question: "Which are speeding up the most in recent weeks?",
    filter: (r) => r.m >= 50,
    sort: { key: "a", dir: "desc" },
  },
  {
    key: "lowvol",
    label: "Strong and calm",
    question: "Which combine a strong trend with relatively calm prices?",
    filter: (r) => r.m >= 80,
    sort: { key: "rk", dir: "asc" },
  },
  {
    key: "fading",
    label: "Losing steam",
    question: "Which leaders are starting to lose steam?",
    filter: (r) => r.m >= 70 && (r.st === "weakening" || (r.dm !== null && r.dm <= -15)),
    sort: { key: "dm", dir: "asc" },
  },
  {
    key: "breakouts",
    label: "New highs",
    question: "Which are breaking to new highs on strong volume?",
    note: "Daily closing data: volume is confirmed per day, not intraday.",
    filter: (r) => r.bo || (r.h52 && (r.rvol ?? 0) >= 1.5),
    sort: { key: "ov", dir: "desc" },
  },
  {
    key: "improvers",
    label: "Most improved",
    question: "Which climbed the ranking the most in the last month?",
    filter: (r) => r.dr !== null,
    sort: { key: "dr", dir: "desc" },
  },
  { key: "watch", label: "Following", question: "Assets you follow", sort: { key: "rank", dir: "asc" } },
];

export interface Filters {
  cls: "stock" | "etf";
  search: string;
  sectors: string[];
  states: StateKey[];
  actions: ActionKey[];
  onlyProfitable: boolean;
  minMcap: number;
  minAdv: number;
  maxRisk: number;
  maxVol: number;
  exchange: string;
  onlyHeld: boolean;
  onlyWatch: boolean;
}

export const DEFAULT_FILTERS: Filters = {
  cls: "stock",
  search: "",
  sectors: [],
  states: [],
  actions: [],
  onlyProfitable: false,
  minMcap: 0,
  minAdv: 0,
  maxRisk: 100,
  maxVol: 10,
  exchange: "",
  onlyHeld: false,
  onlyWatch: false,
};

export function relReturn(r: RadarListRow, h: Horizon, bench: BenchReturns, b: string): number | null {
  const a = r[h];
  const rb = bench[b]?.[h];
  if (a === null || a === undefined || rb === null || rb === undefined) return null;
  return (1 + a) / (1 + rb) - 1;
}

export function sortValue(r: RadarListRow, key: SortKey, h: Horizon, bench: BenchReturns, b: string): number | string | null {
  if (key === "ret") return r[h];
  if (key === "rel") return relReturn(r, h, bench, b);
  const v = r[key as keyof RadarListRow];
  return typeof v === "number" || typeof v === "string" ? v : null;
}

// ETFs carry no sector: group them by what they hold, so gold and commodities are one tap away.
const COMMODITY_T = new Set(["GLD", "IAU", "GLDM", "SGOL", "BAR", "AAAU", "SLV", "SIVR", "PPLT", "PALL", "DBC", "PDBC", "GSG", "COMT", "DBA", "DBB", "CPER", "USO", "BNO", "UNG", "COPX", "GDX", "GDXJ", "SIL", "URA"]);
const COMMODITY_RE = /\b(gold|silver|platinum|palladium|precious|commodit\w*|oil|crude|natural gas|copper|metals?|miners?|uranium|agricultur\w*)\b/i;
const BOND_RE = /\b(treasury|bonds?|t-bill|aggregate|fixed income|muni\w*|corporate|tips)\b/i;
export const ETF_GROUPS = ["Commodities", "Bonds", "Equity"] as const;
export type EtfGroup = (typeof ETF_GROUPS)[number];

export function etfGroup(r: Pick<RadarRow, "t" | "n">): EtfGroup {
  if (COMMODITY_T.has(r.t) || COMMODITY_RE.test(r.n)) return "Commodities";
  if (BOND_RE.test(r.n)) return "Bonds";
  return "Equity";
}

/** Sector for stocks, holding group for ETFs. */
export function groupOf(r: RadarListRow): string {
  return r.cls === "etf" ? etfGroup(r) : (r.sec ?? "—");
}

export function applyRadar<R extends RadarListRow>(
  rows: R[],
  f: Filters,
  preset: Preset,
  sort: { key: SortKey; dir: "asc" | "desc" },
  ctx: { horizon: Horizon; bench: BenchReturns; benchmark: string; held: Set<string>; watch: Set<string> },
): R[] {
  const q = f.search.trim().toLowerCase();
  const out = rows.filter((r) => {
    if (r.cls !== f.cls) return false;
    if (preset.filter && !preset.filter(r)) return false;
    if (q && !r.t.toLowerCase().includes(q) && !r.n.toLowerCase().includes(q)) return false;
    if (f.sectors.length && !f.sectors.includes(groupOf(r))) return false;
    if (f.states.length && !f.states.includes(r.st)) return false;
    if (f.actions.length && !f.actions.includes(r.act)) return false;
    if (f.onlyProfitable && r.prof !== true) return false;
    if (f.minMcap && !(r.mcap !== null && r.mcap >= f.minMcap)) return false;
    if (f.minAdv && !(r.adv !== null && r.adv >= f.minAdv)) return false;
    if (f.maxRisk < 100 && !(r.rk <= f.maxRisk)) return false;
    if (f.maxVol < 10 && !(r.vol !== null && r.vol <= f.maxVol)) return false;
    if (f.exchange && r.ex !== f.exchange) return false;
    if (f.onlyHeld && !ctx.held.has(r.t)) return false;
    if ((f.onlyWatch || preset.key === "watch") && !ctx.watch.has(r.t)) return false;
    return true;
  });
  const dir = sort.dir === "asc" ? 1 : -1;
  out.sort((a, b) => {
    const va = sortValue(a, sort.key, ctx.horizon, ctx.bench, ctx.benchmark);
    const vb = sortValue(b, sort.key, ctx.horizon, ctx.bench, ctx.benchmark);
    if (va === null && vb === null) return a.rank - b.rank;
    if (va === null) return 1; // missing values always last
    if (vb === null) return -1;
    if (va < vb) return -dir;
    if (va > vb) return dir;
    return a.rank - b.rank;
  });
  return out;
}

/** Artifacts published before the action layer existed have no `act`: fall back to the full ranking. */
export function hasActions(rows: Pick<RadarRow, "act">[]): boolean {
  return rows.some((r) => typeof r.act === "string");
}

/** Plain-language verdict for an asset you already own (buffer rule of the engine). */
export function holdLabel(r: { hold: boolean }): { text: string; cls: string } {
  if (r.hold) return { text: "Keep", cls: "text-pos" };
  return { text: "Consider selling", cls: "text-neg" };
}
