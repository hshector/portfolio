"use client";

import { useEffect, useState, useTransition } from "react";

import { estimateSaleAction } from "@/app/(app)/portfolio/actions";
import { Callout, cx, Field, Input, Select } from "@/components/ui/primitives";
import { dateLabel, money, parseDecimal, pct, units } from "@/lib/format";
import type { SaleEstimate } from "@/lib/portfolio/tax";

export interface SellablePosition {
  id: string;
  name: string;
  qty: number;
  price: number | null;
  currency: string;
}

const category = (e: SaleEstimate) => (e.category === "rcm" ? "capital income (gold ETC)" : e.gainEur >= 0 ? "capital gain" : "capital loss");

/** Folded card (same look as Disclosure) that mounts the estimate only once opened: a closed
 *  panel costs no server call and no DOM. */
export function SellEstimatePanel({ positions, initial }: { positions: SellablePosition[]; initial?: string }) {
  const [open, setOpen] = useState(!!initial);
  return (
    <details id="sell" open={open} onToggle={(e) => setOpen(e.currentTarget.open)} className="group card min-w-0">
      <summary className="tap flex cursor-pointer list-none items-center gap-3 px-5 py-4 [&::-webkit-details-marker]:hidden">
        <span className="min-w-0 flex-1 text-[15.5px] font-semibold">Before you sell</span>
        <span className="shrink-0 text-[14px] text-ink-2">Spanish tax</span>
        <svg aria-hidden width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="shrink-0 text-ink-3 transition-transform duration-200 group-open:rotate-180">
          <path d="m6 9 6 6 6-6" />
        </svg>
      </summary>
      {open && (
        <div className="min-w-0 px-5 pb-5">
          <SellEstimate positions={positions} initial={initial} />
        </div>
      )}
    </details>
  );
}

/** "Before you sell": the Spanish tax on a sale, estimated on today's portfolio before you place it. */
export function SellEstimate({ positions, initial }: { positions: SellablePosition[]; initial?: string }) {
  const first = positions.find((p) => p.id === initial) ?? positions[0];
  const [id, setId] = useState(first?.id ?? "");
  const pos = positions.find((p) => p.id === id) ?? first;
  const [qty, setQty] = useState(pos ? String(pos.qty) : "");
  const [price, setPrice] = useState(pos?.price !== null && pos?.price !== undefined ? String(pos.price) : "");
  const [fee, setFee] = useState("1");
  const [res, setRes] = useState<Awaited<ReturnType<typeof estimateSaleAction>> | null>(null);
  const [pending, start] = useTransition();

  const q = Number(parseDecimal(qty));
  const p = Number(parseDecimal(price));
  const f = Number(parseDecimal(fee || "0"));
  const valid = q > 0 && p >= 0 && f >= 0 && price.trim() !== "";

  // Recalculate shortly after the last keystroke; the server replays your real ledger.
  useEffect(() => {
    if (!pos || !valid) return;
    const t = setTimeout(() => start(async () => setRes(await estimateSaleAction({ instrumentId: pos.id, qty: q, price: p, feeEur: f }))), 300);
    return () => clearTimeout(t);
  }, [pos, q, p, f, valid]);

  if (!pos) return <p className="text-[15px] text-ink-2">Nothing to sell yet.</p>;

  const pick = (next: string) => {
    const np = positions.find((x) => x.id === next);
    setId(next);
    setQty(np ? String(np.qty) : "");
    setPrice(np?.price !== null && np?.price !== undefined ? String(np.price) : "");
    setRes(null);
  };
  // An emptied field hides the last figures instead of leaving them next to new inputs.
  const e = valid && res?.ok ? res.estimate : null;

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3">
        <Field label="What" className="col-span-2">
          <Select value={pos.id} onChange={(ev) => pick(ev.target.value)}>
            {positions.map((x) => (
              <option key={x.id} value={x.id}>
                {x.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Units" hint={`You hold ${units(pos.qty)}`}>
          <Input value={qty} onChange={(ev) => setQty(ev.target.value)} inputMode="decimal" />
        </Field>
        <Field label={`Price (${pos.currency})`} hint={pos.price === null ? "No price yet: enter it" : "Latest close"}>
          <Input value={price} onChange={(ev) => setPrice(ev.target.value)} inputMode="decimal" />
        </Field>
        <Field label="Fee (€)" className="col-span-2 sm:col-span-1">
          <Input value={fee} onChange={(ev) => setFee(ev.target.value)} inputMode="decimal" />
        </Field>
      </div>

      {valid && res && !res.ok && <p className="text-[14px] text-neg">{res.message}</p>}

      {e && (
        <div className={cx("flex flex-col gap-4", pending && "opacity-60")} aria-live="polite" aria-busy={pending}>
          <dl className="grid grid-cols-2 gap-3 rounded-[18px] bg-surface-2 px-4 py-4">
            <div>
              <dt className="text-[13px] text-ink-2">{e.taxEur < -0.005 ? "Tax saved this year" : "Tax this year"}</dt>
              <dd className={cx("num whitespace-nowrap text-[24px] font-bold tracking-[-0.02em]", e.taxEur < -0.005 && "text-pos")}>{money(Math.abs(e.taxEur))}</dd>
            </div>
            <div>
              <dt className="text-[13px] text-ink-2">You receive</dt>
              <dd className="num whitespace-nowrap text-[24px] font-bold tracking-[-0.02em]">{money(e.netEur)}</dd>
            </div>
            <div className="col-span-2 text-[14px] text-ink-2">
              <span className={cx("num font-semibold", e.gainEur >= 0 ? "text-pos" : "text-neg")}>
                {e.gainEur >= 0 ? "Gain " : "Loss "}
                {money(Math.abs(e.gainEur))}
              </span>{" "}
              ({category(e)}) on a cost of <span className="num">{money(e.costEur)}</span>
              {e.taxEur > 0.005 && e.gainEur > 0 && <> · {pct(e.taxEur / e.gainEur, 1, false)} of the gain</>}
            </div>
          </dl>

          {e.washSale && (
            <Callout tone="warn" title="This loss can't be used yet">
              You bought the same security in the last {e.washSale.windowMonths} months and still hold it. Spain only lets you use about{" "}
              {money(e.washSale.deferredEur)} of this loss when you sell those units.
            </Callout>
          )}
          {e.noRebuyUntil && !e.washSale && (
            <Callout tone="info" title="Keep the loss">
              Don&apos;t buy it back until after {dateLabel(e.noRebuyUntil)}, or Spain blocks this loss.
            </Callout>
          )}

          {e.gainEur < -0.005 && !e.washSale && Math.abs(e.taxEur) < 0.005 && (
            <p className="text-[14px] text-ink-2">No gains to offset in {e.year}: the loss can be used against gains of the next 4 years.</p>
          )}

          <p className="text-[14px] text-ink-2">
            Your savings base for {e.year}: <span className="num text-ink">{money(e.before.base, "EUR", 0)}</span> now,{" "}
            <span className="num text-ink">{money(e.after.base, "EUR", 0)}</span> with this sale.
          </p>

          <details className="group rounded-[14px] bg-surface-2 px-4 py-2.5">
            <summary className="cursor-pointer text-[14px] text-ink-2">Units sold, oldest first (FIFO)</summary>
            <ul className="mt-2 flex flex-col gap-1 text-[13.5px]">
              {e.lots.map((l, i) => (
                <li key={l.date + i} className="flex justify-between gap-3">
                  <span>
                    Bought {dateLabel(l.date)} · <span className="num">{units(l.qty)}</span>
                  </span>
                  <span className="num shrink-0 text-ink-2">cost {money(l.costEur)}</span>
                </li>
              ))}
            </ul>
          </details>
        </div>
      )}

      <p className="text-[12.5px] text-ink-3">
        Estimate on your recorded trades: FIFO, fees included, savings-base brackets (19–30 %). It does not include losses carried from previous years or income
        outside this app. Not tax advice.
      </p>
    </div>
  );
}
