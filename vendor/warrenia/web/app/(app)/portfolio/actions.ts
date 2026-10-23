"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { computePortfolio, fxRate, PortfolioError } from "@/lib/portfolio/engine";
import { loadPortfolio } from "@/lib/portfolio/load";
import { estimateSale, SaleError, type SaleEstimate } from "@/lib/portfolio/tax";
import { parseTransactionsCsv, type CsvFormat, type ParsedRow } from "@/lib/portfolio/csv";
import { matchTicker } from "@/lib/portfolio/tr";
import { getRadar, loadMarket } from "@/lib/market/source";
import { BUCKET_LABELS, type Instrument, type PlanKey, type Transaction } from "@/lib/portfolio/types";
import { byIsin, instrumentKind, normaliseChoices } from "@/lib/plan/catalog";
import { latestToday, parseDecimal } from "@/lib/format";
import { requireStore } from "@/lib/user/store";

export type ActionResult = { ok: boolean; message: string } | null;

// "In the future" means after today anywhere on Earth: the user may be on a phone in any time zone.
const today = () => latestToday();
const opt = <T extends z.ZodTypeAny>(s: T) => z.preprocess((v) => (v === "" || v === null ? undefined : v), s.optional());
const numStr = z.coerce.number().refine(Number.isFinite);

const InstrumentSchema = z.object({
  id: opt(z.string().uuid()),
  name: z.string().trim().min(1).max(120),
  isin: opt(z.string().trim().toUpperCase().regex(/^[A-Z]{2}[A-Z0-9]{9}[0-9]$/, "Invalid ISIN")),
  kind: z.enum(["etf", "stock", "etc", "fund", "other"]),
  bucket: z.enum(["core", "gold", "momentum", "cash", "other"]),
  currency: z.string().trim().toUpperCase().regex(/^[A-Z]{3}$/),
  price_source: z.enum(["us_market", "eodhd", "manual"]),
  market_ticker: opt(z.string().trim().toUpperCase().regex(/^[A-Z0-9.\-]{1,12}$/, "Invalid ticker")),
  eodhd_symbol: opt(z.string().trim().toUpperCase().regex(/^[A-Z0-9.\-]{1,24}$/, "Invalid EODHD symbol")),
  sector: opt(z.string().trim().max(60)),
});

function msg(e: unknown) {
  if (e instanceof z.ZodError) return e.issues.map((i) => i.message).join(" · ");
  return e instanceof Error ? e.message : "Unexpected error";
}

export async function saveInstrument(_: ActionResult, form: FormData): Promise<ActionResult> {
  try {
    const d = InstrumentSchema.parse(Object.fromEntries(form));
    if (d.price_source === "us_market" && !d.market_ticker) return { ok: false, message: "Enter the US ticker so the market engine can value it" };
    if (d.price_source === "eodhd" && !d.eodhd_symbol) return { ok: false, message: "Enter the EODHD symbol (e.g. EUNL.XETRA)" };
    const store = await requireStore();
    await store.upsertInstrument({
      ...(d.id ? { id: d.id } : {}),
      name: d.name, isin: d.isin ?? null, kind: d.kind, bucket: d.bucket, currency: d.price_source === "us_market" ? "USD" : d.currency,
      price_source: d.price_source, market_ticker: d.market_ticker ?? null, eodhd_symbol: d.eodhd_symbol ?? null, sector: d.sector ?? null,
    });
    revalidatePath("/portfolio", "layout");
    return { ok: true, message: "Instrument saved" };
  } catch (e) {
    return { ok: false, message: msg(e) };
  }
}

export async function deleteInstrument(id: string) {
  const store = await requireStore();
  const txs = await store.transactions();
  if (txs.some((t) => t.instrument_id === id)) throw new Error("This instrument has transactions: delete them first");
  await store.deleteInstrument(z.string().uuid().parse(id));
  revalidatePath("/portfolio", "layout");
}

const TxSchema = z.object({
  type: z.enum(["buy", "sell", "deposit", "withdrawal", "dividend", "interest", "fee", "tax", "split"]),
  trade_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  instrument_id: opt(z.string().uuid()),
  quantity: opt(numStr.pipe(z.number().positive())),
  price: opt(numStr.pipe(z.number().nonnegative())),
  amount: opt(numStr.pipe(z.number().nonnegative())),
  fees: opt(numStr.pipe(z.number().nonnegative())),
  taxes: opt(numStr.pipe(z.number().nonnegative())),
  currency: z.string().trim().toUpperCase().regex(/^[A-Z]{3}$/).default("EUR"),
  fx_rate: opt(numStr.pipe(z.number().positive())),
  split_ratio: opt(numStr.pipe(z.number().positive())),
  note: opt(z.string().trim().max(500)),
});

/** Validate a candidate set of transactions by replaying the ledger (no oversells). */
async function validateLedger(instruments: Instrument[], txs: Transaction[]) {
  computePortfolio(instruments, txs, {}, {}, today());
}

export async function addTransaction(_: ActionResult, form: FormData): Promise<ActionResult> {
  try {
    const DECIMALS = ["quantity", "price", "amount", "fees", "taxes", "fx_rate", "split_ratio"];
    const raw = Object.fromEntries([...form.entries()].map(([k, v]) => [k, typeof v === "string" && DECIMALS.includes(k) ? parseDecimal(v) : v]));
    const d = TxSchema.parse(raw);
    if (d.trade_date > today()) return { ok: false, message: "The date cannot be in the future" };
    const needsIns = ["buy", "sell", "dividend", "split"].includes(d.type);
    if (needsIns && !d.instrument_id) return { ok: false, message: "Choose the instrument" };
    if ((d.type === "buy" || d.type === "sell") && (d.quantity === undefined || d.price === undefined)) return { ok: false, message: "Quantity and price are required" };
    if (["deposit", "withdrawal", "dividend", "interest", "fee", "tax"].includes(d.type) && d.amount === undefined) return { ok: false, message: "Enter the amount" };
    if (d.type === "split" && !d.split_ratio) return { ok: false, message: "Enter the split ratio (new shares per old share)" };
    if (d.currency !== "EUR" && !d.fx_rate) return { ok: false, message: "Foreign-currency transaction: enter the exchange rate used (EUR per unit)" };
    const store = await requireStore();
    const [instruments, txs] = await Promise.all([store.instruments(), store.transactions()]);
    const tx: Omit<Transaction, "id"> = {
      type: d.type, trade_date: d.trade_date, instrument_id: needsIns ? d.instrument_id! : null,
      quantity: d.quantity ?? null, price: d.price ?? null, amount: d.amount ?? null, fees: d.fees ?? 0, taxes: d.taxes ?? 0,
      currency: d.currency, fx_rate: d.currency === "EUR" ? 1 : d.fx_rate!, split_ratio: d.split_ratio ?? null, note: d.note ?? null, source: "manual",
    };
    await validateLedger(instruments, [...txs, { ...tx, id: "new" }]);
    await store.addTransactions([tx]);
    revalidatePath("/portfolio", "layout");
    revalidatePath("/");
    return { ok: true, message: "Transaction saved" };
  } catch (e) {
    if (e instanceof PortfolioError) return { ok: false, message: e.message };
    return { ok: false, message: msg(e) };
  }
}

export async function deleteTransaction(id: string) {
  id = z.string().min(1).max(64).parse(id);
  const store = await requireStore();
  const [instruments, txs] = await Promise.all([store.instruments(), store.transactions()]);
  try {
    await validateLedger(instruments, txs.filter((t) => t.id !== id));
  } catch (e) {
    if (e instanceof PortfolioError) throw new Error(`Cannot delete: ${e.message}`);
    throw e;
  }
  await store.deleteTransaction(id);
  revalidatePath("/portfolio", "layout");
  revalidatePath("/");
}

// ------------------------------------------------------------------ import

export interface ImportPreview {
  ok: boolean;
  message: string;
  format?: CsvFormat;
  headerErrors: string[];
  rows: (ParsedRow & { match: string | null; willCreate: boolean; newAs?: string })[];
  valid: number;
  invalid: number;
}

type NewInstrument = Omit<Instrument, "id">;

/** How an unknown instrument will be created: catalog product, US stock found in the radar, or manual. */
function newInstrumentFor(r: ParsedRow, usTicker: string | null): NewInstrument {
  const p = r.isin ? byIsin(r.isin) : undefined;
  if (p) return { name: p.name, isin: p.isin, kind: instrumentKind(p), bucket: p.bucket, currency: "EUR", price_source: "manual", market_ticker: null, eodhd_symbol: null, sector: null };
  const isStock = r.hint?.kind === "stock" || ((r.isin ?? "").startsWith("US") && !!r.ticker);
  const ticker = usTicker ?? (r.hint ? null : r.ticker);
  if (isStock && ticker) {
    return { name: r.name || ticker, isin: r.isin, kind: "stock", bucket: "momentum", currency: "USD", price_source: "us_market", market_ticker: ticker, eodhd_symbol: null, sector: null };
  }
  return {
    name: r.name || r.ticker || r.isin || "Instrument", isin: r.isin, kind: r.hint?.kind ?? (isStock ? "stock" : "etf"), bucket: r.hint?.bucket ?? (isStock ? "momentum" : "other"),
    currency: "EUR", price_source: "manual", market_ticker: r.hint ? null : r.ticker, eodhd_symbol: null, sector: null,
  };
}

function describeNew(n: NewInstrument): string {
  const src = n.price_source === "us_market" ? `US stock ${n.market_ticker}, priced daily` : "price from your trades (set a price source later)";
  return `${BUCKET_LABELS[n.bucket]} · ${src}`;
}

async function radarStocks(): Promise<{ t: string; n: string }[]> {
  const { latest } = await loadMarket();
  const radar = await getRadar(latest).catch(() => null);
  return (radar?.rows ?? []).filter((r) => r.cls === "stock").map((r) => ({ t: r.t, n: r.n }));
}

async function buildPreview(text: string): Promise<ImportPreview> {
  if (text.length > 2_000_000) return { ok: false, message: "File too large (max 2 MB)", headerErrors: [], rows: [], valid: 0, invalid: 0 };
  const store = await requireStore();
  const instruments = await store.instruments();
  const parsed = parseTransactionsCsv(text, today());
  const stocks = parsed.rows.some((r) => r.hint?.kind === "stock") ? await radarStocks() : [];
  const rows = parsed.rows.map((r) => {
    const m = instruments.find((i) => (r.isin && i.isin === r.isin) || (r.ticker && i.market_ticker === r.ticker));
    const needs = r.tx && ["buy", "sell", "dividend", "split"].includes(r.tx.type);
    const willCreate = !!(needs && !m);
    const nu = willCreate ? newInstrumentFor(r, r.hint?.kind === "stock" ? matchTicker(r.name, stocks) : null) : null;
    return { ...r, match: m?.name ?? null, willCreate, newAs: nu ? describeNew(nu) : undefined };
  });
  const valid = rows.filter((r) => r.ok).length;
  return { ok: !parsed.headerErrors.length, message: "", format: parsed.format, headerErrors: parsed.headerErrors, rows, valid, invalid: rows.length - valid };
}

export async function previewImport(text: string): Promise<ImportPreview> {
  return buildPreview(text);
}

export async function commitImport(text: string): Promise<{ ok: boolean; message: string }> {
  // Re-parse on the server: the client preview is never trusted.
  const p = await buildPreview(text);
  if (!p.ok) return { ok: false, message: p.headerErrors.join(" · ") || p.message };
  const good = p.rows.filter((r) => r.ok && r.tx);
  if (!good.length) return { ok: false, message: "No valid rows to import" };
  const store = await requireStore();
  let instruments = await store.instruments();
  const stocks = good.some((r) => r.willCreate && r.hint?.kind === "stock") ? await radarStocks() : [];
  for (const r of good) {
    if (!r.willCreate) continue;
    if (instruments.some((i) => (r.isin && i.isin === r.isin) || (r.ticker && i.market_ticker === r.ticker))) continue;
    await store.upsertInstrument(newInstrumentFor(r, r.hint?.kind === "stock" ? matchTicker(r.name, stocks) : null));
    instruments = await store.instruments();
  }
  const txs = good.map((r) => {
    const ins = instruments.find((i) => (r.isin && i.isin === r.isin) || (r.ticker && i.market_ticker === r.ticker));
    const needs = ["buy", "sell", "dividend", "split"].includes(r.tx!.type);
    return { ...r.tx!, instrument_id: needs ? (ins?.id ?? null) : null };
  });
  const existing = await store.transactions();
  const fresh = txs.filter((t) => !existing.some((e) => e.import_hash && e.import_hash === t.import_hash));
  try {
    await validateLedger(instruments, [...existing, ...fresh.map((t, i) => ({ ...t, id: `n${i}` }))]);
  } catch (e) {
    if (e instanceof PortfolioError) return { ok: false, message: `Import cancelled: ${e.message}` };
    throw e;
  }
  const n = await store.addTransactions(fresh);
  revalidatePath("/portfolio", "layout");
  revalidatePath("/");
  return { ok: true, message: `${n} transactions imported · ${txs.length - fresh.length} already existed · ${p.invalid} rows with errors skipped` };
}

// --------------------------------------------------------------- settings

const SettingsSchema = z.object({
  core: numStr.pipe(z.number().min(0).max(100)),
  gold: numStr.pipe(z.number().min(0).max(100)),
  momentum: numStr.pipe(z.number().min(0).max(100)),
  cash: z.preprocess((v) => (v === "" || v === undefined ? "0" : v), numStr.pipe(z.number().min(0).max(100))),
  band_abs: numStr.pipe(z.number().min(0.5).max(50)),
  band_rel: numStr.pipe(z.number().min(5).max(100)),
  monthly_contribution: numStr.pipe(z.number().min(0).max(1_000_000)),
});

export async function saveSettings(_: ActionResult, form: FormData): Promise<ActionResult> {
  try {
    const d = SettingsSchema.parse(Object.fromEntries([...form.entries()].map(([k, v]) => [k, parseDecimal(String(v))])));
    if (Math.abs(d.core + d.gold + d.momentum + d.cash - 100) > 0.01) return { ok: false, message: "Target weights must add up to 100%" };
    const store = await requireStore();
    await store.saveSettings({
      targets: { core: d.core / 100, gold: d.gold / 100, momentum: d.momentum / 100, cash: d.cash / 100 },
      band_abs: d.band_abs / 100, band_rel: d.band_rel / 100, monthly_contribution: d.monthly_contribution,
    });
    revalidatePath("/", "layout");
    return { ok: true, message: "Settings saved" };
  } catch (e) {
    return { ok: false, message: msg(e) };
  }
}

const PriceSchema = z.object({ instrument_id: z.string().uuid(), price_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), price: numStr.pipe(z.number().positive()) });

export async function addManualPrice(_: ActionResult, form: FormData): Promise<ActionResult> {
  try {
    const d = PriceSchema.parse({ ...Object.fromEntries(form), price: parseDecimal(String(form.get("price") ?? "")) });
    if (d.price_date > today()) return { ok: false, message: "Future date" };
    const store = await requireStore();
    await store.addManualPrice(d);
    revalidatePath("/portfolio", "layout");
    return { ok: true, message: "Price saved" };
  } catch (e) {
    return { ok: false, message: msg(e) };
  }
}

const ChoicesSchema = z.object({
  bucket: z.enum(["core", "gold", "momentum", "cash"]),
  items: z.array(z.object({ isin: z.string().regex(/^([A-Z]{2}[A-Z0-9]{9}[0-9]|CASH-ACCOUNT)$/), weight: z.number().min(0).max(100) })).max(10),
});

/** Products chosen for one block of the plan. Weights are relative; they are normalised to 100%. */
export async function saveChoices(input: { bucket: PlanKey; items: { isin: string; weight: number }[] }): Promise<ActionResult> {
  try {
    const d = ChoicesSchema.parse(input);
    const store = await requireStore();
    const current = normaliseChoices((await store.settings()).choices);
    const next = normaliseChoices({ ...current, [d.bucket]: d.items });
    if (!d.items.some((x) => x.weight > 0) || next[d.bucket].length === 0) return { ok: false, message: "Pick at least one product" };
    await store.saveChoices(next);
    revalidatePath("/", "layout");
    return { ok: true, message: "Plan updated" };
  } catch (e) {
    const m = msg(e);
    return { ok: false, message: /choices/.test(m) ? "Your database needs migration 0002_settings_choices.sql (see docs/DEPLOY.md)." : m };
  }
}

// ------------------------------------------------------------- sale estimate

const SaleSchema = z.object({
  instrumentId: z.string().min(1).max(64),
  qty: z.number().positive().finite(),
  price: z.number().nonnegative().finite(),
  feeEur: z.number().min(0).max(10_000),
});

/** Spanish tax on a sale you are thinking about, on today's portfolio. Nothing is saved. */
export async function estimateSaleAction(raw: z.input<typeof SaleSchema>): Promise<{ ok: true; estimate: SaleEstimate } | { ok: false; message: string }> {
  const p = SaleSchema.safeParse(raw);
  if (!p.success) return { ok: false, message: "Enter the units and the price" };
  try {
    const { latest, meta } = await loadMarket();
    const store = await requireStore();
    const pf = await loadPortfolio(store, latest, meta);
    if (pf.error) return { ok: false, message: pf.error };
    const ins = pf.instruments.find((i) => i.id === p.data.instrumentId);
    if (!ins) return { ok: false, message: "Unknown instrument" };
    // The price is in the currency the instrument is valued in (USD for US shares).
    const currency = pf.result?.positions.find((x) => x.instrument.id === ins.id)?.priceCurrency ?? ins.currency;
    const rate = fxRate(pf.fx, currency, pf.asOf);
    if (!rate) return { ok: false, message: `No ${currency} exchange rate published yet` };
    const estimate = estimateSale(pf.instruments, pf.transactions, pf.prices, pf.fx, {
      instrumentId: ins.id, qty: p.data.qty, price: p.data.price, currency, fxEurPerUnit: 1 / rate, feeEur: p.data.feeEur, date: pf.asOf,
    });
    return { ok: true, estimate };
  } catch (e) {
    if (e instanceof SaleError || e instanceof PortfolioError) return { ok: false, message: e.message };
    return { ok: false, message: msg(e) };
  }
}
