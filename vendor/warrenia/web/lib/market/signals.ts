// Which signal changes concern you (mirror of engine/warrenia_engine/signals.py `relevant`).

import type { SignalEvent } from "./types";

export interface NotifyPrefs {
  holdings: boolean;
  watchlist: boolean;
  candidates: boolean;
}

export const DEFAULT_NOTIFY: NotifyPrefs = { holdings: true, watchlist: true, candidates: true };

export type SignalGroup = "holdings" | "watchlist" | "candidates";

export const GROUP_LABEL: Record<SignalGroup, string> = {
  holdings: "Stocks you own",
  watchlist: "Stocks you follow",
  candidates: "New buy candidates",
};

/** The events one user cares about, by group. A stock appears in one group only (owning wins). */
export function relevantEvents(events: SignalEvent[], held: Set<string>, watch: Set<string>, prefs: NotifyPrefs = DEFAULT_NOTIFY): Record<SignalGroup, SignalEvent[]> {
  const g: Record<SignalGroup, SignalEvent[]> = { holdings: [], watchlist: [], candidates: [] };
  for (const e of events) {
    if (held.has(e.t)) {
      if (prefs.holdings) g.holdings.push(e);
    } else if (watch.has(e.t)) {
      if (prefs.watchlist && e.from !== e.to) g.watchlist.push(e);
    } else if (prefs.candidates && e.to === "candidate" && e.from !== "candidate") g.candidates.push(e);
  }
  return g;
}

/** Sessions in the log, newest first. */
export function sessionsOf(events: SignalEvent[]): string[] {
  return [...new Set(events.map((e) => e.asof))].sort().reverse();
}

/** "Consider selling" became true for a stock you own (the most important alert). */
export function isSellAlert(e: SignalEvent): boolean {
  return e.hold_from && !e.hold_to && e.to !== "out";
}
