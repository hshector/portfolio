import "server-only";

import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";

import { cache } from "react";

import { DEFAULT_SETTINGS, normTargets, type Instrument, type ManualPrice, type Settings, type Transaction } from "@/lib/portfolio/types";
import { appMode, isAllowedEmail } from "@/lib/supabase/env";
import { supabaseServer } from "@/lib/supabase/server";

export interface WatchItem {
  ticker: string;
  note: string | null;
  added_at: string;
}

export interface PushSub {
  endpoint: string;
  p256dh: string;
  auth: string;
  device: string | null;
  created_at?: string;
}

export interface UserStore {
  readonly kind: "supabase" | "local";
  readonly email: string | null;
  instruments(): Promise<Instrument[]>;
  upsertInstrument(i: Omit<Instrument, "id"> & { id?: string }): Promise<Instrument>;
  deleteInstrument(id: string): Promise<void>;
  transactions(): Promise<Transaction[]>;
  addTransactions(txs: Omit<Transaction, "id">[]): Promise<number>;
  deleteTransaction(id: string): Promise<void>;
  manualPrices(): Promise<ManualPrice[]>;
  addManualPrice(p: Omit<ManualPrice, "id">): Promise<void>;
  watchlist(): Promise<WatchItem[]>;
  setWatch(ticker: string, on: boolean, note?: string | null): Promise<void>;
  settings(): Promise<Settings>;
  saveSettings(s: Settings): Promise<void>;
  saveChoices(c: NonNullable<Settings["choices"]>): Promise<void>;
  saveNotify(n: NonNullable<Settings["notify"]>): Promise<void>;
  pushSubscriptions(): Promise<PushSub[]>;
  savePushSubscription(p: PushSub): Promise<void>;
  deletePushSubscription(endpoint: string): Promise<void>;
}

export class AuthError extends Error {}

/** Resolve the store for the current request (once per request: pages, layouts and their
 *  children share it). Throws AuthError if not signed in / not allowed. */
export const requireStore = cache(async (): Promise<UserStore> => {
  const mode = appMode();
  if (mode === "local") return new LocalStore();
  if (mode === "misconfigured") throw new AuthError("App not configured");
  const sb = await supabaseServer();
  // getClaims verifies the JWT signature locally against the project's cached public keys
  // (asymmetric signing keys); with a legacy shared secret it falls back to asking Auth.
  const { data } = await sb.auth.getClaims();
  const email = typeof data?.claims?.email === "string" ? data.claims.email : null;
  if (!data?.claims?.sub || !isAllowedEmail(email)) throw new AuthError("No autorizado");
  return new SupabaseStore(sb, email);
});

// ------------------------------------------------------------------ Supabase

type Sb = Awaited<ReturnType<typeof supabaseServer>>;

function check<T>(res: { data: T | null; error: { message: string; code?: string } | null }): T {
  if (res.error) {
    const c = res.error.code;
    console.error("db:", c, res.error.message);
    // Message is shown by app/(app)/error.tsx: say what to do, not the raw Postgres text.
    if (c === "PGRST205" || c === "42P01") throw new Error("Database tables are missing: run the files in supabase/migrations in Supabase → SQL Editor.");
    if (c === "PGRST204" || c === "42703") throw new Error("Database update missing: run the newest files in supabase/migrations in Supabase → SQL Editor.");
    if (c === "42501") throw new Error("The database denies access to your user: run supabase/migrations/0001_init.sql again.");
    throw new Error("Database error. Please try again.");
  }
  return res.data as T;
}

const num = (v: unknown) => (v === null || v === undefined ? null : Number(v));

function normTx(r: Record<string, unknown>): Transaction {
  return {
    id: String(r.id),
    instrument_id: (r.instrument_id as string) ?? null,
    type: r.type as Transaction["type"],
    trade_date: String(r.trade_date),
    quantity: num(r.quantity),
    price: num(r.price),
    amount: num(r.amount),
    fees: Number(r.fees ?? 0),
    taxes: Number(r.taxes ?? 0),
    currency: String(r.currency ?? "EUR"),
    fx_rate: Number(r.fx_rate ?? 1),
    split_ratio: num(r.split_ratio),
    note: (r.note as string) ?? null,
    source: (r.source as "manual" | "csv") ?? "manual",
    import_hash: (r.import_hash as string) ?? null,
  };
}

class SupabaseStore implements UserStore {
  readonly kind = "supabase" as const;
  constructor(private sb: Sb, readonly email: string | null) {}

  async instruments() {
    return check(await this.sb.from("instruments").select("*").order("name")) as Instrument[];
  }
  async upsertInstrument(i: Omit<Instrument, "id"> & { id?: string }) {
    const row = check(await this.sb.from("instruments").upsert(i).select().single());
    return row as unknown as Instrument;
  }
  async deleteInstrument(id: string) {
    check(await this.sb.from("instruments").delete().eq("id", id));
  }
  async transactions() {
    const rows = check(await this.sb.from("transactions").select("*").order("trade_date").order("created_at"));
    return (rows as Record<string, unknown>[]).map(normTx);
  }
  async addTransactions(txs: Omit<Transaction, "id">[]) {
    if (!txs.length) return 0;
    const res = await this.sb.from("transactions").upsert(txs, { onConflict: "user_id,import_hash", ignoreDuplicates: true }).select("id");
    return (check(res) as unknown[]).length;
  }
  async deleteTransaction(id: string) {
    check(await this.sb.from("transactions").delete().eq("id", id));
  }
  async manualPrices() {
    const rows = check(await this.sb.from("manual_prices").select("*").order("price_date"));
    return (rows as Record<string, unknown>[]).map((r) => ({ id: String(r.id), instrument_id: String(r.instrument_id), price_date: String(r.price_date), price: Number(r.price) }));
  }
  async addManualPrice(p: Omit<ManualPrice, "id">) {
    check(await this.sb.from("manual_prices").upsert(p, { onConflict: "instrument_id,price_date" }));
  }
  async watchlist() {
    return check(await this.sb.from("watchlist").select("ticker,note,added_at").order("added_at")) as WatchItem[];
  }
  async setWatch(ticker: string, on: boolean, note: string | null = null) {
    if (on) check(await this.sb.from("watchlist").upsert({ ticker, note }));
    else check(await this.sb.from("watchlist").delete().eq("ticker", ticker));
  }
  async settings() {
    const rows = check(await this.sb.from("settings").select("*").limit(1)) as Record<string, unknown>[];
    if (!rows.length) return DEFAULT_SETTINGS;
    const r = rows[0];
    return {
      targets: normTargets(r.targets as Settings["targets"]),
      band_abs: Number(r.band_abs),
      band_rel: Number(r.band_rel),
      monthly_contribution: Number(r.monthly_contribution),
      choices: (r.choices as Settings["choices"]) ?? undefined,
      notify: (r.notify as Settings["notify"]) ?? undefined,
    };
  }
  async saveSettings(s: Settings) {
    // choices and notify are saved on their own: this keeps working before migrations 0002/0003 are applied.
    const { choices: _c, notify: _n, ...rest } = s;
    void _c;
    void _n;
    check(await this.sb.from("settings").upsert({ ...rest, updated_at: new Date().toISOString() }));
  }
  async saveChoices(c: NonNullable<Settings["choices"]>) {
    check(await this.sb.from("settings").upsert({ choices: c, updated_at: new Date().toISOString() }));
  }
  async saveNotify(n: NonNullable<Settings["notify"]>) {
    check(await this.sb.from("settings").upsert({ notify: n, updated_at: new Date().toISOString() }));
  }
  async pushSubscriptions() {
    return check(await this.sb.from("push_subscriptions").select("endpoint,p256dh,auth,device,created_at").order("created_at")) as PushSub[];
  }
  async savePushSubscription(p: PushSub) {
    check(await this.sb.from("push_subscriptions").upsert({ endpoint: p.endpoint, p256dh: p.p256dh, auth: p.auth, device: p.device }, { onConflict: "endpoint" }));
  }
  async deletePushSubscription(endpoint: string) {
    check(await this.sb.from("push_subscriptions").delete().eq("endpoint", endpoint));
  }
}

// --------------------------------------------------------------------- Local

interface LocalData {
  instruments: Instrument[];
  transactions: Transaction[];
  manual_prices: ManualPrice[];
  watchlist: WatchItem[];
  settings: Settings;
  push: PushSub[];
}

const LOCAL_FILE = () => process.env.WARRENIA_LOCAL_STORE || path.resolve(process.cwd(), ".data", "user.json");

let lock: Promise<unknown> = Promise.resolve();

class LocalStore implements UserStore {
  readonly kind = "local" as const;
  readonly email = null;

  private async load(): Promise<LocalData> {
    try {
      const d = JSON.parse(await readFile(/*turbopackIgnore: true*/ LOCAL_FILE(), "utf8")) as Partial<LocalData>;
      return {
        instruments: d.instruments ?? [],
        transactions: d.transactions ?? [],
        manual_prices: d.manual_prices ?? [],
        watchlist: d.watchlist ?? [],
        settings: d.settings ? { ...d.settings, targets: normTargets(d.settings.targets) } : DEFAULT_SETTINGS,
        push: d.push ?? [],
      };
    } catch {
      return { instruments: [], transactions: [], manual_prices: [], watchlist: [], settings: DEFAULT_SETTINGS, push: [] };
    }
  }

  private async mutate<T>(fn: (d: LocalData) => T): Promise<T> {
    const run = lock.then(async () => {
      const d = await this.load();
      const out = fn(d);
      const file = LOCAL_FILE();
      await mkdir(/*turbopackIgnore: true*/ path.dirname(file), { recursive: true });
      await writeFile(/*turbopackIgnore: true*/ file + ".tmp", JSON.stringify(d, null, 1));
      await rename(/*turbopackIgnore: true*/ file + ".tmp", file);
      return out;
    });
    lock = run.catch(() => undefined);
    return run;
  }

  async instruments() {
    return (await this.load()).instruments.sort((a, b) => a.name.localeCompare(b.name));
  }
  async upsertInstrument(i: Omit<Instrument, "id"> & { id?: string }) {
    return this.mutate((d) => {
      const existing = d.instruments.find((x) => (i.id && x.id === i.id) || (i.isin && x.isin === i.isin));
      if (existing) {
        Object.assign(existing, i, { id: existing.id });
        return existing;
      }
      const row = { ...i, id: randomUUID() } as Instrument;
      d.instruments.push(row);
      return row;
    });
  }
  async deleteInstrument(id: string) {
    await this.mutate((d) => {
      if (d.transactions.some((t) => t.instrument_id === id)) throw new Error("El instrumento tiene operaciones registradas");
      d.instruments = d.instruments.filter((x) => x.id !== id);
    });
  }
  async transactions() {
    return (await this.load()).transactions.sort((a, b) => a.trade_date.localeCompare(b.trade_date));
  }
  async addTransactions(txs: Omit<Transaction, "id">[]) {
    return this.mutate((d) => {
      let n = 0;
      for (const t of txs) {
        if (t.import_hash && d.transactions.some((x) => x.import_hash === t.import_hash)) continue;
        d.transactions.push({ ...t, id: randomUUID() });
        n++;
      }
      return n;
    });
  }
  async deleteTransaction(id: string) {
    await this.mutate((d) => {
      d.transactions = d.transactions.filter((x) => x.id !== id);
    });
  }
  async manualPrices() {
    return (await this.load()).manual_prices;
  }
  async addManualPrice(p: Omit<ManualPrice, "id">) {
    await this.mutate((d) => {
      d.manual_prices = d.manual_prices.filter((x) => !(x.instrument_id === p.instrument_id && x.price_date === p.price_date));
      d.manual_prices.push({ ...p, id: randomUUID() });
    });
  }
  async watchlist() {
    return (await this.load()).watchlist;
  }
  async setWatch(ticker: string, on: boolean, note: string | null = null) {
    await this.mutate((d) => {
      d.watchlist = d.watchlist.filter((w) => w.ticker !== ticker);
      if (on) d.watchlist.push({ ticker, note, added_at: new Date().toISOString() });
    });
  }
  async settings() {
    return (await this.load()).settings;
  }
  async saveSettings(s: Settings) {
    await this.mutate((d) => {
      d.settings = { ...s, choices: s.choices ?? d.settings.choices, notify: s.notify ?? d.settings.notify };
    });
  }
  async saveChoices(c: NonNullable<Settings["choices"]>) {
    await this.mutate((d) => {
      d.settings = { ...d.settings, choices: c };
    });
  }
  async saveNotify(n: NonNullable<Settings["notify"]>) {
    await this.mutate((d) => {
      d.settings = { ...d.settings, notify: n };
    });
  }
  async pushSubscriptions() {
    return (await this.load()).push;
  }
  async savePushSubscription(p: PushSub) {
    await this.mutate((d) => {
      d.push = [...d.push.filter((x) => x.endpoint !== p.endpoint), { ...p, created_at: new Date().toISOString() }];
    });
  }
  async deletePushSubscription(endpoint: string) {
    await this.mutate((d) => {
      d.push = d.push.filter((x) => x.endpoint !== endpoint);
    });
  }
}
