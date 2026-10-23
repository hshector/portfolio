// CSV import of transactions: parse -> validate -> preview. Nothing is written
// until the user confirms. Generic format (see docs/import-template.csv); column
// names accept Spanish or English aliases. Delimiter and decimal comma are detected.

import type { Bucket, InstrumentKind, Transaction, TxType } from "./types";
import { isTradeRepublic, parseTradeRepublic } from "./tr";

export interface ParsedRow {
  line: number;
  ok: boolean;
  errors: string[];
  tx: Omit<Transaction, "id" | "instrument_id"> | null;
  isin: string | null;
  ticker: string | null;
  name: string | null;
  /** Broker's own type (e.g. TRADING/SAVINGS_PLAN_EXECUTED), shown in the preview. */
  source?: string;
  /** What a new instrument should be (from the broker's asset class). */
  hint?: { kind: InstrumentKind; bucket: Bucket };
}

const ALIASES: Record<string, string[]> = {
  date: ["date", "fecha", "trade_date", "datum"],
  type: ["type", "tipo", "operacion", "operación", "typ"],
  isin: ["isin"],
  ticker: ["ticker", "symbol", "simbolo", "símbolo"],
  name: ["name", "nombre", "activo", "instrument", "instrumento"],
  quantity: ["quantity", "cantidad", "unidades", "shares", "titulos", "títulos", "stück"],
  price: ["price", "precio", "kurs"],
  amount: ["amount", "importe", "total", "betrag"],
  fees: ["fees", "fee", "comision", "comisión", "comisiones", "gebühr"],
  taxes: ["taxes", "tax", "impuestos", "retencion", "retención", "steuer"],
  currency: ["currency", "divisa", "moneda", "währung"],
  fx_rate: ["fx_rate", "fx", "tipo_cambio", "tipo de cambio"],
  split_ratio: ["split_ratio", "ratio"],
  note: ["note", "nota", "notas", "comentario"],
};

const TYPES: Record<string, TxType> = {
  buy: "buy", compra: "buy", kauf: "buy",
  sell: "sell", venta: "sell", verkauf: "sell",
  deposit: "deposit", aportacion: "deposit", aportación: "deposit", ingreso: "deposit", einzahlung: "deposit",
  withdrawal: "withdrawal", retirada: "withdrawal", reintegro: "withdrawal", auszahlung: "withdrawal",
  dividend: "dividend", dividendo: "dividend", dividende: "dividend", distribucion: "dividend", distribución: "dividend",
  interest: "interest", interes: "interest", interés: "interest", intereses: "interest", zinsen: "interest",
  fee: "fee", comision: "fee", comisión: "fee",
  tax: "tax", impuesto: "tax", steuer: "tax",
  split: "split",
};

export function detectDelimiter(header: string): string {
  const counts = [";", ",", "\t"].map((d) => [d, header.split(d).length] as const);
  counts.sort((a, b) => b[1] - a[1]);
  return counts[0][0];
}

/** RFC4180-ish line splitter with quotes. */
export function splitLine(line: string, d: string): string[] {
  const out: string[] = [];
  let cur = "";
  let q = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (q) {
      if (c === '"' && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (c === '"') q = false;
      else cur += c;
    } else if (c === '"') q = true;
    else if (c === d) {
      out.push(cur);
      cur = "";
    } else cur += c;
  }
  out.push(cur);
  return out.map((s) => s.trim());
}

export function parseNumber(s: string | undefined, decimalComma: boolean): number | null {
  if (s === undefined) return null;
  let t = s.replace(/[\s€$£]/g, "");
  if (!t) return null;
  if (decimalComma) t = t.replace(/\./g, "").replace(",", ".");
  else t = t.replace(/,/g, "");
  const v = Number(t);
  return Number.isFinite(v) ? v : NaN;
}

export function parseDate(s: string | undefined): string | null {
  if (!s) return null;
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return valid(+m[1], +m[2], +m[3]);
  m = s.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$/);
  if (m) return valid(+m[3], +m[2], +m[1]);
  return null;
}

function valid(y: number, mo: number, d: number): string | null {
  const dt = new Date(Date.UTC(y, mo - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d) return null;
  return dt.toISOString().slice(0, 10);
}

function fnv(s: string, seed: number): string {
  let h = seed >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h.toString(16).padStart(8, "0");
}

export function rowHash(parts: (string | number | null)[]): string {
  const s = parts.map((p) => (p === null ? "" : String(p))).join("|");
  return fnv(s, 2166136261) + fnv(s, 0x811c9dc5 ^ 0x5bd1e995);
}

export type CsvFormat = "generic" | "trade_republic";

export function parseTransactionsCsv(text: string, today: string): { rows: ParsedRow[]; headerErrors: string[]; columns: string[]; format: CsvFormat } {
  const lines = text.replace(/^﻿/, "").split(/\r?\n/).filter((l) => l.trim().length);
  if (!lines.length) return { rows: [], headerErrors: ["The file is empty"], columns: [], format: "generic" };
  const d = detectDelimiter(lines[0]);
  const header = splitLine(lines[0], d).map((h) => h.toLowerCase());
  if (d === "," && isTradeRepublic(header)) return { ...parseTradeRepublic(lines, today), format: "trade_republic" };
  const idx: Record<string, number> = {};
  for (const [key, aliases] of Object.entries(ALIASES)) {
    const i = header.findIndex((h) => aliases.includes(h));
    if (i >= 0) idx[key] = i;
  }
  const headerErrors: string[] = [];
  for (const req of ["date", "type"]) if (idx[req] === undefined) headerErrors.push(`Missing required column "${req}"`);
  if (headerErrors.length) return { rows: [], headerErrors, columns: header, format: "generic" };
  const decimalComma = d === ";";

  const rows: ParsedRow[] = lines.slice(1).map((line, k) => {
    const cells = splitLine(line, d);
    const get = (key: string) => (idx[key] !== undefined ? cells[idx[key]] : undefined);
    const errors: string[] = [];
    const date = parseDate(get("date"));
    if (!date) errors.push("Invalid date");
    else if (date > today) errors.push("Future date");
    const type = TYPES[(get("type") || "").toLowerCase().normalize("NFC")];
    if (!type) errors.push(`Unknown type "${get("type") ?? ""}"`);
    const nums: Record<string, number | null> = {};
    for (const key of ["quantity", "price", "amount", "fees", "taxes", "fx_rate", "split_ratio"]) {
      const v = parseNumber(get(key), decimalComma);
      if (Number.isNaN(v)) errors.push(`Invalid number in "${key}"`);
      nums[key] = v !== null && Number.isNaN(v) ? null : v;
    }
    const isin = (get("isin") || "").toUpperCase() || null;
    if (isin && !/^[A-Z]{2}[A-Z0-9]{9}[0-9]$/.test(isin)) errors.push("Badly formatted ISIN");
    const ticker = (get("ticker") || "").toUpperCase() || null;
    const name = get("name") || null;
    const currency = (get("currency") || "EUR").toUpperCase();
    if (!/^[A-Z]{3}$/.test(currency)) errors.push("Invalid currency");
    const needsInstrument = type && ["buy", "sell", "dividend", "split"].includes(type);
    if (needsInstrument && !isin && !ticker) errors.push("Missing ISIN or ticker");
    if (type === "buy" || type === "sell") {
      if (!(nums.quantity && nums.quantity > 0)) errors.push("Quantity must be > 0");
      if (nums.price === null || nums.price < 0) errors.push("Invalid price");
    }
    if (type && ["deposit", "withdrawal", "interest", "fee", "tax", "dividend"].includes(type)) {
      if (nums.amount === null || nums.amount < 0) errors.push("Invalid amount (must be positive)");
    }
    if (type === "split" && !(nums.split_ratio && nums.split_ratio > 0)) errors.push("split_ratio debe ser > 0");
    if (nums.fx_rate !== null && nums.fx_rate <= 0) errors.push("fx_rate debe ser > 0");
    if (currency !== "EUR" && nums.fx_rate === null) errors.push("Foreign-currency row: fill in fx_rate (EUR per unit)");

    const ok = errors.length === 0;
    const tx = ok
      ? {
          type: type!,
          trade_date: date!,
          quantity: nums.quantity,
          price: nums.price,
          amount: nums.amount,
          fees: nums.fees ?? 0,
          taxes: nums.taxes ?? 0,
          currency,
          fx_rate: nums.fx_rate ?? 1,
          split_ratio: nums.split_ratio,
          note: get("note") || null,
          source: "csv" as const,
          import_hash: rowHash([date, type!, isin ?? ticker, nums.quantity, nums.price, nums.amount, nums.fees, currency]),
        }
      : null;
    return { line: k + 2, ok, errors, tx, isin, ticker, name };
  });
  // Identical rows inside one file are real (two equal deposits the same day): the 2nd,
  // 3rd… copy gets its occurrence number in the hash. Re-importing the same file yields
  // the same hashes, so nothing is duplicated; the first copy keeps the original hash.
  const seen = new Map<string, number>();
  for (const r of rows) {
    if (!r.tx?.import_hash) continue;
    const base = r.tx.import_hash;
    const occ = (seen.get(base) ?? 0) + 1;
    seen.set(base, occ);
    if (occ > 1) r.tx.import_hash = rowHash([base, occ]);
  }
  return { rows, headerErrors, columns: header, format: "generic" };
}
