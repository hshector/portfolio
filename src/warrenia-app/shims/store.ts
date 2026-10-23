// Replaces WarrenIA's lib/user/store.ts (Supabase with a login, or a JSON file in development):
// in the demo every visitor has their own store, kept in their browser's localStorage. Same
// interface and the same rules as the app's LocalStore. Nothing a visitor enters leaves their
// browser, and nobody sees anyone else's data.

import { DEFAULT_SETTINGS, normTargets, type Instrument, type ManualPrice, type Settings, type Transaction } from '@vendor/lib/portfolio/types';
import type { PushSub, UserStore, WatchItem } from '@vendor/lib/user/store';

export type { PushSub, UserStore, WatchItem };

export class AuthError extends Error {}

interface Data {
  instruments: Instrument[];
  transactions: Transaction[];
  manual_prices: ManualPrice[];
  watchlist: WatchItem[];
  settings: Settings;
  push: PushSub[];
}

const KEY = 'warrenia-demo:user';
const empty = (): Data => ({ instruments: [], transactions: [], manual_prices: [], watchlist: [], settings: DEFAULT_SETTINGS, push: [] });
// (if the browser refuses storage, e.g. some private windows, the data lives until the page closes)
let memory: Data | null = null;

function load(): Data {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const d = JSON.parse(raw) as Partial<Data>;
      return {
        instruments: d.instruments ?? [],
        transactions: d.transactions ?? [],
        manual_prices: d.manual_prices ?? [],
        watchlist: d.watchlist ?? [],
        settings: d.settings ? { ...d.settings, targets: normTargets(d.settings.targets) } : DEFAULT_SETTINGS,
        push: d.push ?? [],
      };
    }
  } catch {
    /* fall through */
  }
  return structuredClone(memory ?? empty());
}

function mutate<T>(fn: (d: Data) => T): T {
  const d = load();
  const out = fn(d);
  memory = d;
  try {
    localStorage.setItem(KEY, JSON.stringify(d));
  } catch {
    /* kept in memory */
  }
  return out;
}

/** Forget everything this visitor entered (Settings → Account). */
export function clearDemoData() {
  memory = null;
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* nothing stored */
  }
}

class BrowserStore implements UserStore {
  readonly kind = 'local' as const;
  readonly email = null;

  async instruments() {
    return load().instruments.sort((a, b) => a.name.localeCompare(b.name));
  }
  async upsertInstrument(i: Omit<Instrument, 'id'> & { id?: string }) {
    return mutate((d) => {
      const existing = d.instruments.find((x) => (i.id && x.id === i.id) || (i.isin && x.isin === i.isin));
      if (existing) {
        Object.assign(existing, i, { id: existing.id });
        return existing;
      }
      const row = { ...i, id: crypto.randomUUID() } as Instrument;
      d.instruments.push(row);
      return row;
    });
  }
  async deleteInstrument(id: string) {
    mutate((d) => {
      if (d.transactions.some((t) => t.instrument_id === id)) throw new Error('El instrumento tiene operaciones registradas');
      d.instruments = d.instruments.filter((x) => x.id !== id);
    });
  }
  async transactions() {
    return load().transactions.sort((a, b) => a.trade_date.localeCompare(b.trade_date));
  }
  async addTransactions(txs: Omit<Transaction, 'id'>[]) {
    return mutate((d) => {
      let n = 0;
      for (const t of txs) {
        if (t.import_hash && d.transactions.some((x) => x.import_hash === t.import_hash)) continue;
        d.transactions.push({ ...t, id: crypto.randomUUID() });
        n++;
      }
      return n;
    });
  }
  async deleteTransaction(id: string) {
    mutate((d) => {
      d.transactions = d.transactions.filter((x) => x.id !== id);
    });
  }
  async manualPrices() {
    return load().manual_prices;
  }
  async addManualPrice(p: Omit<ManualPrice, 'id'>) {
    mutate((d) => {
      d.manual_prices = d.manual_prices.filter((x) => !(x.instrument_id === p.instrument_id && x.price_date === p.price_date));
      d.manual_prices.push({ ...p, id: crypto.randomUUID() });
    });
  }
  async watchlist() {
    return load().watchlist;
  }
  async setWatch(ticker: string, on: boolean, note: string | null = null) {
    mutate((d) => {
      d.watchlist = d.watchlist.filter((w) => w.ticker !== ticker);
      if (on) d.watchlist.push({ ticker, note, added_at: new Date().toISOString() });
    });
  }
  async settings() {
    return load().settings;
  }
  async saveSettings(s: Settings) {
    mutate((d) => {
      d.settings = { ...s, choices: s.choices ?? d.settings.choices, notify: s.notify ?? d.settings.notify };
    });
  }
  async saveChoices(c: NonNullable<Settings['choices']>) {
    mutate((d) => {
      d.settings = { ...d.settings, choices: c };
    });
  }
  async saveNotify(n: NonNullable<Settings['notify']>) {
    mutate((d) => {
      d.settings = { ...d.settings, notify: n };
    });
  }
  async pushSubscriptions() {
    return load().push;
  }
  async savePushSubscription(p: PushSub) {
    mutate((d) => {
      d.push = [...d.push.filter((x) => x.endpoint !== p.endpoint), { ...p, created_at: new Date().toISOString() }];
    });
  }
  async deletePushSubscription(endpoint: string) {
    mutate((d) => {
      d.push = d.push.filter((x) => x.endpoint !== endpoint);
    });
  }
}

const store = new BrowserStore();
export const requireStore = async (): Promise<UserStore> => store;
