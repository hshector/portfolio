// Replaces WarrenIA's lib/market/source.ts (which reads the private Supabase bucket on the server):
// here the browser reads the public extract that WarrenIA's engine publishes every night
// (engine/warrenia_engine/public.py) and the build copies to /warrenia-app/data/. Same functions,
// same return types. There are no prices in it: assets come without `series`.

import type { AssetDetail, Backtest, Excluded, FxFile, Latest, Market, Meta, PriceFile, Radar, SignalLog } from '@vendor/lib/market/types';

const BASE = `${import.meta.env.BASE_URL}data/`;
const memo = new Map<string, Promise<unknown>>();

export class StorageError extends Error {
  constructor(readonly status: number) {
    super(`storage ${status}`);
  }
}

function readJson<T>(file: string): Promise<T | null> {
  let p = memo.get(file) as Promise<T | null> | undefined;
  if (!p) {
    p = fetch(BASE + file).then(async (r) => {
      if (r.status === 404) return null;
      if (!r.ok) throw new StorageError(r.status);
      return (await r.json()) as T;
    });
    // failures are never cached: the next read retries
    p.catch(() => memo.delete(file));
    memo.set(file, p);
  }
  return p;
}

export function marketSource() {
  return { kind: 'public' as const };
}

export async function getLatest() {
  return readJson<Latest>('latest.json');
}
const inRun = <T>(latest: Latest | null, file: string) => (latest ? readJson<T>(file).catch(() => null) : Promise.resolve(null));
export const getMeta = (latest: Latest | null) => inRun<Meta>(latest, 'meta.json');
export const getRadar = (latest: Latest | null) => inRun<Radar>(latest, 'radar.json');
export const getMarket = (latest: Latest | null) => inRun<Market>(latest, 'market.json');
export const getExcluded = (latest: Latest | null) => inRun<Excluded[]>(latest, 'excluded.json');

export function shardOf(ticker: string): string {
  const c = ticker.charAt(0).toUpperCase();
  return c >= 'A' && c <= 'Z' ? c : '_';
}

export async function getAsset(latest: Latest | null, ticker: string): Promise<AssetDetail | null> {
  const t = ticker.toUpperCase();
  if (!/^[A-Z0-9.\-]{1,12}$/.test(t)) return null;
  return inRun<AssetDetail>(latest, `assets/${encodeURIComponent(t)}.json`);
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

/** signals, backtest and fx are in the extract only if WarrenIA has them: latest.json lists which. */
async function optional<T>(file: string): Promise<T | null> {
  const latest = await getLatest().catch(() => null);
  if (!(latest as (Latest & { files?: string[] }) | null)?.files?.includes(file)) return null;
  return readJson<T>(file).catch(() => null);
}
export const getBacktest = () => optional<Backtest>('backtest.json');
export const getSignals = () => optional<SignalLog>('signals.json');
export const getFx = () => optional<FxFile>('fx.json');
/** EUR prices of funds are not public (EODHD's terms): a fund is valued with the prices you enter. */
export const getPriceFile = async (_symbol: string): Promise<PriceFile | null> => null;

/** Logo URL (the extract has a PNG for each company Logo.dev knows). */
export const logoUrl = (ticker: string) => `${BASE}logos/${encodeURIComponent(ticker)}.png`;

export async function loadMarket() {
  let error: string | null = null;
  const fail = () => {
    error ??= 'Could not read market data. It will retry on the next load.';
    return null;
  };
  const latest = await getLatest().catch(fail);
  const meta = await getMeta(latest).catch(fail);
  return { latest, meta, source: 'public' as const, error };
}
