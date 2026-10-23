import "server-only";

import { readFile } from "node:fs/promises";
import path from "node:path";
import { gunzipSync } from "node:zlib";

import { cache } from "react";

import { supabaseBaseUrl } from "@/lib/supabase/env";

import type { AssetDetail, Backtest, Excluded, FxFile, Latest, Market, Meta, PriceFile, Radar, SignalLog } from "./types";

// Market artifacts are read server-side only, from Supabase Storage (production,
// private bucket + secret key) or from a local directory (development / demo).
// The browser never talks to the data provider nor to the storage directly.

type Source = { kind: "supabase"; url: string; key: string; bucket: string } | { kind: "local"; dir: string } | { kind: "none" };

export function marketSource(): Source {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (url && key) return { kind: "supabase", url: supabaseBaseUrl(url), key, bucket: process.env.SUPABASE_BUCKET || "market" };
  const dir = process.env.WARRENIA_DATA_DIR || (process.env.VERCEL ? "" : path.resolve(process.cwd(), "..", "data"));
  if (dir) return { kind: "local", dir };
  return { kind: "none" };
}

export function storageHeaders(key: string): Record<string, string> {
  // Same as supabase-js: the key in `apikey` and as Bearer (sb_secret_ and legacy JWT keys alike).
  return { apikey: key, Authorization: `Bearer ${key}` };
}

export class StorageError extends Error {
  constructor(readonly status: number) {
    super(`storage ${status}`);
  }
}

// Every read is memoised per server instance, as a promise (concurrent requests share
// one download). Run artifacts are immutable (versioned by run id) and live until
// evicted; files that are rewritten in place get a short time-to-live.
const IMMUTABLE = Infinity;
const TTL = { latest: 30_000, signals: 60_000, files: 10 * 60_000 } as const;
const MEMO_MAX = 80;
const memo = new Map<string, { at: number; ttl: number; p: Promise<unknown> }>();

function remember<T>(key: string, ttl: number, load: () => Promise<T>, max = MEMO_MAX, store = memo): Promise<T> {
  const hit = store.get(key);
  if (hit && Date.now() - hit.at < hit.ttl) {
    store.delete(key); // least recently used goes first
    store.set(key, hit);
    return hit.p as Promise<T>;
  }
  const p = load();
  const entry = { at: Date.now(), ttl, p };
  store.delete(key);
  store.set(key, entry);
  while (store.size > max) store.delete(store.keys().next().value as string);
  // Failures are never cached: the next request retries.
  p.catch(() => {
    if (store.get(key) === entry) store.delete(key);
  });
  return p;
}

/** Drop run artifacts that no longer belong to the latest run (a new run was published). */
function pruneRuns(current: string) {
  for (const k of memo.keys()) if (k.startsWith("runs/") && !k.startsWith(current + "/")) memo.delete(k);
}

async function readRaw(p: string): Promise<Buffer | null> {
  const src = marketSource();
  if (src.kind === "none") return null;
  if (src.kind === "local") {
    try {
      return await readFile(/*turbopackIgnore: true*/ path.join(src.dir, "published", p));
    } catch {
      return null;
    }
  }
  const res = await fetch(`${src.url}/storage/v1/object/${src.bucket}/published/${p}`, {
    headers: storageHeaders(src.key),
    cache: "no-store",
    signal: AbortSignal.timeout(15_000),
  });
  if (res.status === 404) return null;
  if (res.status === 400) {
    // Storage answers 400 both for "object not found" and for auth problems: tell them apart.
    const body = await res.text();
    if (/not.?found/i.test(body)) return null;
    console.error("market: storage 400", p, body.slice(0, 200));
    throw new StorageError(400);
  }
  if (!res.ok) {
    console.error("market: storage", res.status, p);
    throw new StorageError(res.status);
  }
  return Buffer.from(await res.arrayBuffer());
}

function readJson<T>(p: string, ttl: number): Promise<T | null> {
  // Local mode reads files on every request: editing ../data shows up at once.
  if (marketSource().kind === "local" && ttl !== IMMUTABLE) ttl = 0;
  return remember(p, ttl, async () => {
    const buf = await readRaw(p);
    if (!buf) return null;
    const text = (p.endsWith(".gz") ? gunzipSync(buf) : buf).toString("utf8");
    return JSON.parse(text) as T;
  });
}

export async function getLatest(): Promise<Latest | null> {
  const latest = await readJson<Latest>("latest.json", TTL.latest);
  if (latest?.path) pruneRuns(latest.path);
  return latest;
}

async function inRun<T>(latest: Latest | null, file: string): Promise<T | null> {
  if (!latest) return null;
  // latest.json already proved storage access: a failure here is transient or a corrupt file, never a crash.
  return readJson<T>(`${latest.path}/${file}`, IMMUTABLE).catch((e) => {
    console.error("market: read failed", file, e);
    return null;
  });
}

export async function getMeta(latest: Latest | null) {
  return inRun<Meta>(latest, "meta.json");
}
export async function getRadar(latest: Latest | null) {
  return inRun<Radar>(latest, "radar.json.gz");
}
export async function getMarket(latest: Latest | null) {
  return inRun<Market>(latest, "market.json");
}
export async function getExcluded(latest: Latest | null) {
  return inRun<Excluded[]>(latest, "excluded.json.gz");
}

export function shardOf(ticker: string): string {
  const c = ticker.charAt(0).toUpperCase();
  return c >= "A" && c <= "Z" ? c : "_";
}

export async function getAsset(latest: Latest | null, ticker: string): Promise<AssetDetail | null> {
  const t = ticker.toUpperCase();
  if (!/^[A-Z0-9.\-]{1,12}$/.test(t)) return null;
  const shard = await inRun<Record<string, AssetDetail>>(latest, `assets/${shardOf(t)}.json.gz`);
  return shard?.[t] ?? null;
}

export async function getAssets(latest: Latest | null, tickers: string[]): Promise<Record<string, AssetDetail>> {
  const out: Record<string, AssetDetail> = {};
  await Promise.all(
    [...new Set(tickers.map((t) => t.toUpperCase()))].map(async (t) => {
      const a = await getAsset(latest, t);
      if (a) out[t] = a;
    }),
  );
  return out;
}

function quiet(e: unknown): null {
  console.error("market: read failed", e);
  return null;
}

export async function getBacktest() {
  return readJson<Backtest>("backtest/latest.json", TTL.files).catch(quiet);
}

/** Rolling log of signal changes (published/signals.json, rewritten by every compute). */
export async function getSignals() {
  return readJson<SignalLog>("signals.json", TTL.signals).catch(quiet);
}

export async function getFx() {
  return readJson<FxFile>("fx/ecb.json", TTL.files).catch(quiet);
}

export async function getPriceFile(symbol: string) {
  if (!/^[A-Z0-9.\-]{1,24}$/i.test(symbol)) return null;
  return readJson<PriceFile>(`prices/${symbol.toUpperCase()}.json`, TTL.files).catch(quiet);
}

const logos = new Map<string, { at: number; ttl: number; p: Promise<unknown> }>();

/** Company logo cached by the engine (published/logos/<TICKER>.png, from Logo.dev). */
export async function getLogo(ticker: string): Promise<Buffer | null> {
  if (!/^[A-Z0-9.\-]{1,12}$/.test(ticker)) return null;
  // Logos are a few KB and almost never change: keep the bytes (and the misses) in memory.
  const png = await remember(`logos/${ticker}`, 24 * 3600_000, () => readRaw(`logos/${ticker}.png`), 600, logos);
  if (!png) logos.set(`logos/${ticker}`, { at: Date.now(), ttl: 3600_000, p: Promise.resolve(null) });
  return png;
}

/** Everything a typical page needs, in one call (memoised per request: the layout and the
 *  page share it). Never throws: pages render an empty state, and `error` explains a
 *  configuration problem. */
export const loadMarket = cache(async () => {
  let error: string | null = null;
  const fail = (e: unknown) => {
    if (!error) {
      error =
        e instanceof StorageError && [400, 401, 403].includes(e.status)
          ? `Supabase rejects Vercel's secret key (${e.status}). Check /setup/check.`
          : "Could not read market data. It will retry on the next load.";
      console.error("market: load failed", e);
    }
    return null;
  };
  const latest = await getLatest().catch(fail);
  const meta = await getMeta(latest).catch(fail);
  const src = marketSource().kind;
  if (src === "none" && process.env.VERCEL) error = "SUPABASE_SECRET_KEY is missing in Vercel. Check /setup/check.";
  return { latest, meta, source: src, error };
});
