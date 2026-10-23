"use client";

import { useActionState, useEffect, useState, useTransition } from "react";
import { toast } from "sonner";

import { addManualPrice, addTransaction, deleteInstrument, deleteTransaction, saveInstrument, saveSettings, type ActionResult } from "@/app/(app)/portfolio/actions";
import { IconPlus, IconTrash } from "@/components/ui/icons";
import { Button, Field, Input, Select } from "@/components/ui/primitives";
import { ConfirmDialog, Sheet } from "@/components/ui/sheet";
import { localToday } from "@/lib/format";
import { instrumentKind, PRODUCTS } from "@/lib/plan/catalog";
import { BUCKET_LABELS, TX_LABELS, type Instrument, type Settings, type TxType } from "@/lib/portfolio/types";

/** Errors stay next to the form; success is a toast (the sheet closes). */
function Result({ state }: { state: ActionResult }) {
  if (!state || state.ok) return null;
  return <p className="text-[14px] text-neg">{state.message}</p>;
}

function useSuccessToast(state: ActionResult, then?: () => void) {
  useEffect(() => {
    if (!state?.ok) return;
    toast.success(state.message);
    then?.();
    // `then` is a fresh closure each render; the effect must run once per result.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);
}

const TYPES_WITH_INSTRUMENT: TxType[] = ["buy", "sell", "dividend", "split"];

export function TransactionForm({ instruments, defaultOpen = false }: { instruments: Instrument[]; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  const [type, setType] = useState<TxType>("buy");
  const [currency, setCurrency] = useState("EUR");
  const [state, action, pending] = useActionState<ActionResult, FormData>(addTransaction, null);
  useSuccessToast(state, () => setOpen(false));
  const needsIns = TYPES_WITH_INSTRUMENT.includes(type);
  const trade = type === "buy" || type === "sell";
  return (
    <Sheet
      title="New transaction"
      open={open}
      onOpenChange={setOpen}
      trigger={
        <Button variant="primary" size="sm">
          <IconPlus size={16} /> Transaction
        </Button>
      }
    >
      <form action={action} className="grid grid-cols-2 gap-3.5">
        <Field label="Type">
          <Select name="type" value={type} onChange={(e) => setType(e.target.value as TxType)}>
            {(Object.keys(TX_LABELS) as TxType[]).map((t) => (
              <option key={t} value={t}>
                {TX_LABELS[t]}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Date">
          <Input type="date" name="trade_date" required defaultValue={localToday()} max={localToday()} />
        </Field>
        {needsIns && (
          <Field label="Instrument" className="col-span-2" hint={instruments.length ? undefined : "Add an instrument first."}>
            <Select name="instrument_id" required>
              {instruments.map((i) => (
                <option key={i.id} value={i.id}>
                  {i.name} {i.isin ? `· ${i.isin}` : i.market_ticker ? `· ${i.market_ticker}` : ""}
                </option>
              ))}
            </Select>
          </Field>
        )}
        {trade && (
          <>
            <Field label="Units">
              <Input name="quantity" inputMode="decimal" required placeholder="0.000000" />
            </Field>
            <Field label="Price per unit">
              <Input name="price" inputMode="decimal" required placeholder="0,00" />
            </Field>
            <Field label="Fee">
              <Input name="fees" inputMode="decimal" placeholder="1.00" />
            </Field>
            {type === "sell" && (
              <Field label="Tax withheld">
                <Input name="taxes" inputMode="decimal" placeholder="0,00" />
              </Field>
            )}
          </>
        )}
        {!trade && type !== "split" && (
          <Field label={type === "dividend" ? "Net amount received" : "Amount"} className={type === "dividend" ? "" : "col-span-2"}>
            <Input name="amount" inputMode="decimal" required placeholder="0,00" />
          </Field>
        )}
        {type === "dividend" && (
          <Field label="Tax withheld (for reference)">
            <Input name="taxes" inputMode="decimal" placeholder="0,00" />
          </Field>
        )}
        {type === "split" && (
          <Field label="Ratio (new shares per old share)" className="col-span-2" hint="Split 4:1 → 4 · reverse split 1:10 → 0.1">
            <Input name="split_ratio" inputMode="decimal" required />
          </Field>
        )}
        {type !== "split" && (
          <Field label="Currency">
            <Select name="currency" value={currency} onChange={(e) => setCurrency(e.target.value)}>
              {["EUR", "USD", "GBP", "CHF"].map((c) => (
                <option key={c}>{c}</option>
              ))}
            </Select>
          </Field>
        )}
        {currency !== "EUR" && type !== "split" && (
          <Field label="Exchange rate (EUR per 1 unit)" hint="The one your broker applied">
            <Input name="fx_rate" inputMode="decimal" required placeholder="0.92" />
          </Field>
        )}
        <Field label="Note" className="col-span-2">
          <Input name="note" maxLength={500} placeholder="Optional" />
        </Field>
        <div className="col-span-2 flex items-center justify-between gap-3 pt-1">
          <Result state={state} />
          <Button variant="primary" type="submit" disabled={pending} className="ml-auto min-w-32">
            {pending ? "Saving…" : "Save"}
          </Button>
        </div>
        <p className="col-span-2 text-[13px] text-ink-3">Also record every cash transfer into the broker as a “Deposit”: that keeps the returns exact.</p>
      </form>
    </Sheet>
  );
}

export function InstrumentForm({ instrument, trigger }: { instrument?: Instrument; trigger?: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const [preset, setPreset] = useState<string>("");
  const fromPlan = PRODUCTS.find((p) => p.isin === preset);
  const d: Partial<Instrument> = instrument ?? (fromPlan ? { name: fromPlan.name, isin: fromPlan.isin, kind: instrumentKind(fromPlan), bucket: fromPlan.bucket, currency: "EUR" } : {});
  // demo: no EODHD or US prices are public, so a new instrument is priced with the prices you enter
  const [source, setSource] = useState(instrument?.price_source ?? "manual");
  const [state, action, pending] = useActionState<ActionResult, FormData>(saveInstrument, null);
  useSuccessToast(state, () => setOpen(false));
  return (
    <Sheet
      title={instrument ? "Edit instrument" : "New instrument"}
      open={open}
      onOpenChange={setOpen}
      trigger={
        trigger ?? (
          <Button size="sm">
            <IconPlus size={16} /> Instrument
          </Button>
        )
      }
    >
      {!instrument && (
        <Field label="Pick from your plan" hint="Fills in name, ISIN, type and block" className="mb-3.5">
          <Select value={preset} onChange={(e) => setPreset(e.target.value)} aria-label="Pick from your plan">
            <option value="">Another instrument…</option>
            {PRODUCTS.filter((p) => p.vehicle !== "Cash account").map((p) => (
              <option key={p.isin} value={p.isin}>
                {BUCKET_LABELS[p.bucket]} · {p.name}
                {p.recommended ? " (recommended)" : ""}
              </option>
            ))}
          </Select>
        </Field>
      )}
      <form key={preset} action={action} className="grid grid-cols-2 gap-3.5">
        {instrument && <input type="hidden" name="id" value={instrument.id} />}
        <Field label="Name" className="col-span-2">
          <Input name="name" required defaultValue={d.name} placeholder="e.g. Vanguard FTSE All-World UCITS ETF" />
        </Field>
        <Field label="ISIN">
          <Input name="isin" defaultValue={d.isin ?? ""} placeholder="IE00B4L5Y983" className="font-mono uppercase" />
        </Field>
        <Field label="Type">
          <Select name="kind" defaultValue={d.kind ?? "etf"}>
            <option value="etf">ETF</option>
            <option value="etc">ETC / ETP (gold, bitcoin…)</option>
            <option value="stock">Stock</option>
            <option value="fund">Index fund</option>
            <option value="other">Other</option>
          </Select>
        </Field>
        <Field label="Plan block">
          <Select name="bucket" defaultValue={d.bucket ?? "core"}>
            {(["core", "gold", "momentum", "cash", "other"] as const).map((b) => (
              <option key={b} value={b}>
                {BUCKET_LABELS[b]}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Price source">
          <Select name="price_source" value={source} onChange={(e) => setSource(e.target.value as typeof source)}>
            <option value="eodhd">EODHD (ETF/ETC on Xetra, EUR)</option>
            <option value="us_market">US market (engine, USD)</option>
            <option value="manual">Manual</option>
          </Select>
        </Field>
        {source === "eodhd" && (
          <Field label="EODHD symbol" hint="Format TICKER.EXCHANGE, e.g. VWCE.XETRA" className="col-span-2">
            <Input name="eodhd_symbol" defaultValue={instrument?.eodhd_symbol ?? ""} className="font-mono uppercase" />
          </Field>
        )}
        {source === "us_market" && (
          <Field label="US ticker" hint="Valued at the USD close converted with the ECB rate" className="col-span-2">
            <Input name="market_ticker" defaultValue={instrument?.market_ticker ?? ""} className="font-mono uppercase" />
          </Field>
        )}
        {source !== "us_market" && (
          <Field label="Trading currency">
            <Select name="currency" defaultValue={d.currency ?? "EUR"}>
              {["EUR", "USD", "GBP", "CHF"].map((c) => (
                <option key={c}>{c}</option>
              ))}
            </Select>
          </Field>
        )}
        {source === "us_market" && <input type="hidden" name="currency" value="USD" />}
        <Field label="Sector (stocks)">
          <Input name="sector" defaultValue={instrument?.sector ?? ""} placeholder="Technology" />
        </Field>
        <div className="col-span-2 flex items-center justify-between gap-3 pt-1">
          <Result state={state} />
          <Button variant="primary" type="submit" disabled={pending} className="ml-auto min-w-32">
            {pending ? "Saving…" : "Save"}
          </Button>
        </div>
      </form>
    </Sheet>
  );
}

export function DeleteButton({ id, kind, label }: { id: string; kind: "tx" | "instrument"; label: string }) {
  const [pending, start] = useTransition();
  return (
    <ConfirmDialog
      title={`${label}?`}
      description={kind === "tx" ? "The transaction is removed and the portfolio recalculated." : "The instrument is removed from your portfolio."}
      confirmLabel="Delete"
      onConfirm={() =>
        start(() =>
          (kind === "tx" ? deleteTransaction(id) : deleteInstrument(id)).then(
            () => void toast.success(kind === "tx" ? "Transaction deleted" : "Instrument deleted"),
            (e: Error) => void toast.error(e.message),
          ),
        )
      }
      trigger={
        <button disabled={pending} aria-label={label} title={label} className="tap rounded-full p-2 text-ink-3 hover:bg-neg-soft hover:text-neg disabled:opacity-40">
          <IconTrash size={15} />
        </button>
      }
    />
  );
}

export function ManualPriceForm({ instruments }: { instruments: Instrument[] }) {
  const [state, action, pending] = useActionState<ActionResult, FormData>(addManualPrice, null);
  useSuccessToast(state);
  const manual = instruments.filter((i) => i.price_source === "manual");
  if (!manual.length) return null;
  return (
    <form action={action} className="flex flex-wrap items-end gap-2">
      <Field label="Instrument (manual price)">
        <Select name="instrument_id">
          {manual.map((i) => (
            <option key={i.id} value={i.id}>
              {i.name}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Date">
        <Input type="date" name="price_date" required defaultValue={localToday()} max={localToday()} />
      </Field>
      <Field label="Price">
        <Input name="price" inputMode="decimal" required className="w-28" />
      </Field>
      <Button type="submit" disabled={pending}>
        Save price
      </Button>
      <Result state={state} />
    </form>
  );
}

export function SettingsForm({ settings }: { settings: Settings }) {
  const [state, action, pending] = useActionState<ActionResult, FormData>(saveSettings, null);
  useSuccessToast(state);
  return (
    <form action={action} className="grid max-w-xl grid-cols-2 gap-3.5 sm:grid-cols-3">
      <Field label="Core %">
        <Input name="core" inputMode="decimal" defaultValue={Math.round(settings.targets.core * 1000) / 10} />
      </Field>
      <Field label="Diversifiers %">
        <Input name="gold" inputMode="decimal" defaultValue={Math.round(settings.targets.gold * 1000) / 10} />
      </Field>
      <Field label="Momentum %">
        <Input name="momentum" inputMode="decimal" defaultValue={Math.round(settings.targets.momentum * 1000) / 10} />
      </Field>
      <Field label="Cash %" hint="Optional, usually 0">
        <Input name="cash" inputMode="decimal" defaultValue={Math.round((settings.targets.cash ?? 0) * 1000) / 10} />
      </Field>
      <Field label="Absolute band (pp)" hint="Tolerated drift">
        <Input name="band_abs" inputMode="decimal" defaultValue={Math.round(settings.band_abs * 1000) / 10} />
      </Field>
      <Field label="Relative band (%)" hint="Of the target weight">
        <Input name="band_rel" inputMode="decimal" defaultValue={Math.round(settings.band_rel * 1000) / 10} />
      </Field>
      <Field label="Monthly contribution (€)">
        <Input name="monthly_contribution" inputMode="decimal" defaultValue={settings.monthly_contribution} />
      </Field>
      <div className="col-span-2 flex items-center gap-3 sm:col-span-3">
        <Button type="submit" variant="primary" disabled={pending}>
          Save
        </Button>
        <Result state={state} />
      </div>
    </form>
  );
}
