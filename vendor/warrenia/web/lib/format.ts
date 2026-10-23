// Number formatting (en-GB conventions: 1,234.56, €1,234.56, 9 Oct 2026; tabular-friendly). Never invent a value:
// null / undefined / NaN render as an em dash.

const DASH = "—";
export const LOCALE = "en-GB";

export function isNum(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v);
}

export function pct(v: number | null | undefined, digits = 1, sign = true): string {
  if (!isNum(v)) return DASH;
  const s = new Intl.NumberFormat(LOCALE, {
    style: "percent",
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
    signDisplay: sign ? "exceptZero" : "auto",
  }).format(v);
  return s.replace(/ %/, " %");
}

export function num(v: number | null | undefined, digits = 2): string {
  if (!isNum(v)) return DASH;
  return new Intl.NumberFormat(LOCALE, { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(v);
}

export function int(v: number | null | undefined): string {
  if (!isNum(v)) return DASH;
  return new Intl.NumberFormat(LOCALE, { maximumFractionDigits: 0 }).format(v);
}

export function money(v: number | null | undefined, currency = "EUR", digits = 2): string {
  if (!isNum(v)) return DASH;
  return new Intl.NumberFormat(LOCALE, { style: "currency", currency, minimumFractionDigits: digits, maximumFractionDigits: digits }).format(v);
}

/** Headline amounts: no cents from 100,000 so an eight-figure value still fits a phone. */
export function moneyHeadline(v: number | null | undefined, currency = "EUR"): string {
  return money(v, currency, isNum(v) && Math.abs(v) >= 100_000 ? 0 : 2);
}

/** Amount in a small tile: whole euros, and €7.57M style from 100,000. Never truncated. */
export function moneyShort(v: number | null | undefined, currency = "EUR"): string {
  if (!isNum(v)) return DASH;
  if (Math.abs(v) < 100_000) return money(v, currency, 0);
  return new Intl.NumberFormat(LOCALE, { style: "currency", currency, notation: "compact", maximumFractionDigits: 2 }).format(v);
}

/** Units held: whole numbers stay whole; fractions keep broker precision (6 decimals below 1 unit), no trailing zeros. */
export function units(v: number | null | undefined): string {
  if (!isNum(v)) return DASH;
  const a = Math.abs(v);
  return new Intl.NumberFormat(LOCALE, { maximumFractionDigits: a < 1 ? 6 : a < 1000 ? 4 : 2 }).format(v);
}

export function compactUsd(v: number | null | undefined): string {
  if (!isNum(v)) return DASH;
  const a = Math.abs(v);
  if (a >= 1e12) return `$${num(v / 1e12, 2)}T`;
  if (a >= 1e9) return `$${num(v / 1e9, 1)}B`;
  if (a >= 1e6) return `$${num(v / 1e6, 0)}M`;
  return `$${int(v)}`;
}

export function score(v: number | null | undefined): string {
  if (!isNum(v)) return DASH;
  return Math.round(v).toString();
}

export function signClass(v: number | null | undefined): string {
  if (!isNum(v) || v === 0) return "text-ink-2";
  return v > 0 ? "text-pos" : "text-neg";
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "9 Oct 2026" from an ISO date (YYYY-MM-DD), no timezone shifts. */
export function dateLabel(iso: string | null | undefined, withYear = true): string {
  if (!iso) return DASH;
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  if (!y || !m || !d) return DASH;
  return withYear ? `${d} ${MONTHS[m - 1]} ${y}` : `${d} ${MONTHS[m - 1]}`;
}

/** Local date-time for timestamps (computed_at etc.), explicit timezone. */
export function dateTimeLabel(iso: string | null | undefined, tz = "Europe/Madrid"): string {
  if (!iso) return DASH;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return DASH;
  return new Intl.DateTimeFormat(LOCALE, {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: tz,
    timeZoneName: "short",
  }).format(d);
}

// ------------------------------------------------------------------ input

function ymd(now: Date, timeZone?: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

/** Today's date (YYYY-MM-DD) on this device's clock, not UTC: in Spain UTC is still
 *  "yesterday" until 01:00 / 02:00. */
export function localToday(now = new Date()): string {
  return ymd(now);
}

/** Today in Spain, the date the portfolio is valued on. */
export function todayMadrid(now = new Date()): string {
  return ymd(now, "Europe/Madrid");
}

/** The latest date that is already "today" somewhere (UTC+14): a trade dated after it is in the future for everyone. */
export function latestToday(now = new Date()): string {
  return ymd(now, "Pacific/Kiritimati");
}

/**
 * A typed amount as a plain decimal string ("1234.56"). Accepts what people type in Spain
 * and in English: "1.500,50", "1,500.50", "1 500,5", "0,5". With both separators the last
 * one is the decimal mark; repeated separators are thousands. Anything else is returned
 * as is, for the validator to reject.
 */
export function parseDecimal(raw: string): string {
  const s = raw.trim().replace(/[\s  ']/g, "");
  if (!/^[+-]?[\d.,]+$/.test(s)) return s;
  const lastComma = s.lastIndexOf(",");
  const lastDot = s.lastIndexOf(".");
  if (lastComma >= 0 && lastDot >= 0) {
    const dec = lastComma > lastDot ? "," : ".";
    const thousands = dec === "," ? "." : ",";
    return s.split(thousands).join("").replace(dec, ".");
  }
  const sep = lastComma >= 0 ? "," : lastDot >= 0 ? "." : null;
  if (!sep) return s;
  const parts = s.split(sep);
  if (parts.length > 2) return parts.join(""); // 1.500.000 or 1,500,000
  return parts.join(".");
}
