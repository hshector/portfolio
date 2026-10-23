import { describe, expect, it } from "vitest";
import { computeFreshness } from "./freshness";

const cal: [string, string][] = [
  ["2026-10-07", "2026-10-07T20:00:00+00:00"],
  ["2026-10-08", "2026-10-08T20:00:00+00:00"],
  ["2026-10-09", "2026-10-09T20:00:00+00:00"],
  ["2026-10-12", "2026-10-12T20:00:00+00:00"],
  ["2026-10-13", "2026-10-13T20:00:00+00:00"],
];

describe("computeFreshness", () => {
  it("is fresh on the weekend after Friday's data", () => {
    const f = computeFreshness("2026-10-09", cal, new Date("2026-10-11T10:00:00Z"));
    expect(f.status).toBe("fresh");
  });

  it("is pending right after a new close (job not run yet)", () => {
    const f = computeFreshness("2026-10-09", cal, new Date("2026-10-12T22:00:00Z"));
    expect(f.status).toBe("pending");
    expect(f.lastClosed).toBe("2026-10-12");
  });

  it("is stale once the grace period after a close has passed", () => {
    const f = computeFreshness("2026-10-09", cal, new Date("2026-10-13T13:00:00Z"));
    expect(f.status).toBe("stale");
    expect(f.missedSessions).toBe(1);
  });

  it("counts several missed sessions", () => {
    const f = computeFreshness("2026-10-07", cal, new Date("2026-10-14T12:00:00Z"));
    expect(f.status).toBe("stale");
    expect(f.missedSessions).toBe(4);
  });

  it("is unknown without calendar", () => {
    expect(computeFreshness("2026-10-09", undefined).status).toBe("unknown");
  });
});
