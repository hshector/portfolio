// Data freshness judged at VIEW time (not at compute time), using the exchange
// calendar published by the engine (exchange_calendars XNYS), so no holiday table
// has to be maintained in TypeScript.

export type FreshnessStatus = "fresh" | "pending" | "stale" | "unknown";

export interface Freshness {
  status: FreshnessStatus;
  dataAsof: string; // session date of the data
  lastClosed: string | null; // last session that has closed
  expected: string | null; // last session whose data should already be published
  missedSessions: number; // sessions closed (and due) after dataAsof
  label: string;
}

// The daily job runs ~05:15 UTC with an 11:05 retry. A closed session is "due"
// once this much time has passed since its close; before that we say "pending".
export const PUBLISH_GRACE_HOURS = 16;

export function computeFreshness(
  dataAsof: string,
  calendar: [string, string][] | undefined,
  now: Date = new Date(),
): Freshness {
  if (!calendar || calendar.length === 0) {
    return { status: "unknown", dataAsof, lastClosed: null, expected: null, missedSessions: 0, label: "Calendario no disponible" };
  }
  const t = now.getTime();
  const closed = calendar.filter(([, close]) => Date.parse(close) <= t);
  const due = calendar.filter(([, close]) => Date.parse(close) + PUBLISH_GRACE_HOURS * 3600_000 <= t);
  const lastClosed = closed.length ? closed[closed.length - 1][0] : null;
  const expected = due.length ? due[due.length - 1][0] : null;
  const lastCal = calendar[calendar.length - 1][0];
  // Calendar horizon exceeded (engine has not run for a very long time).
  if (Date.parse(calendar[calendar.length - 1][1]) < t && lastCal > dataAsof) {
    const missed = due.filter(([d]) => d > dataAsof).length;
    return { status: "stale", dataAsof, lastClosed, expected, missedSessions: missed, label: `Datos desactualizados (${missed}+ sesiones)` };
  }
  const missed = due.filter(([d]) => d > dataAsof).length;
  if (missed > 0) {
    return {
      status: "stale",
      dataAsof,
      lastClosed,
      expected,
      missedSessions: missed,
      label: missed === 1 ? "1 session behind" : `${missed} sessions behind`,
    };
  }
  if (lastClosed && lastClosed > dataAsof) {
    return { status: "pending", dataAsof, lastClosed, expected, missedSessions: 0, label: "New close not processed yet" };
  }
  return { status: "fresh", dataAsof, lastClosed, expected, missedSessions: 0, label: "Up to date (close)" };
}
