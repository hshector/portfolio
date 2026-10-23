import { describe, expect, it } from "vitest";

import { isSellAlert, relevantEvents, sessionsOf } from "./signals";
import type { SignalEvent } from "./types";

const ev = (t: string, from: SignalEvent["from"], to: SignalEvent["to"], p: Partial<SignalEvent> = {}): SignalEvent => ({
  asof: "2026-10-09", t, n: `${t} Inc`, from, to, hold_from: true, hold_to: true, rank: 1, ov: 80, fund: 60, ...p,
});

describe("signal relevance", () => {
  const events = [
    ev("AAA", "watch", "candidate"),
    ev("CCC", "candidate", "avoid", { hold_to: false }),
    ev("DDD", "watch", "out", { hold_to: false, rank: null }),
    ev("HOLD", "watch", "watch", { hold_to: false, asof: "2026-10-08" }),
  ];
  it("groups by holdings, followed and new candidates (same rules as the engine)", () => {
    const g = relevantEvents(events, new Set(["CCC"]), new Set(["DDD", "HOLD"]));
    expect(g.holdings.map((e) => e.t)).toEqual(["CCC"]);
    expect(g.watchlist.map((e) => e.t)).toEqual(["DDD"]); // hold-only change of a followed stock is skipped
    expect(g.candidates.map((e) => e.t)).toEqual(["AAA"]);
  });
  it("respects preferences", () => {
    const g = relevantEvents(events, new Set(["CCC"]), new Set(), { holdings: false, watchlist: true, candidates: false });
    expect(g.holdings).toEqual([]);
    expect(g.candidates).toEqual([]);
  });
  it("sell alerts and sessions", () => {
    expect(isSellAlert(events[1])).toBe(true);
    expect(isSellAlert(events[2])).toBe(false); // left the market: a different message
    expect(sessionsOf(events)).toEqual(["2026-10-09", "2026-10-08"]);
  });
});
