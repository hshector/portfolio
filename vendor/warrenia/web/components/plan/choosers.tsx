"use client";

import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";

import { saveChoices } from "@/app/(app)/portfolio/actions";
import { BUCKET_DOT, ProductCard } from "@/components/plan/product";
import { Button, cx, Segmented } from "@/components/ui/primitives";
import { money, pct } from "@/lib/format";
import type { ProxyStats } from "@/lib/market/types";
import { answersFor, BUCKET_NAME, byIsin, chooseCore, productsFor, splitByProduct, type Choices, type CoreAnswers, type PlanBucket } from "@/lib/plan/catalog";
import { activeKeys, contributionPlan } from "@/lib/portfolio/engine";
import type { Settings } from "@/lib/portfolio/types";


function useSave(bucket: PlanBucket) {
  const [pending, start] = useTransition();
  const save = (items: { isin: string; weight: number }[]) =>
    start(async () => {
      const r = await saveChoices({ bucket, items });
      if (r?.ok) toast.success(r.message);
      else toast.error(r?.message ?? "Could not save");
    });
  return { pending, save };
}

/** This month's contribution, split by block and then by the products you chose. */
export function PlanSplit({
  values,
  other,
  settings,
  choices,
  momentumLabel,
}: {
  values: Record<PlanBucket, number>;
  other: number;
  settings: Settings;
  choices: Required<Choices>;
  momentumLabel?: string;
}) {
  const [amount, setAmount] = useState(String(settings.monthly_contribution));
  const a = Number(amount.replace(",", ".")) || 0;
  const plan = contributionPlan(values, other, settings.targets, a);
  const lines = splitByProduct(plan, choices);
  return (
    <div className="flex flex-col gap-4">
      <label className="flex items-center justify-between gap-3 rounded-[14px] bg-surface-2 px-4 py-2">
        <span className="text-[15px] text-ink-2">Amount</span>
        <span className="flex items-center gap-1">
          <span className="text-[22px] font-bold">€</span>
          <input
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            inputMode="decimal"
            aria-label="Contribution amount"
            className="num w-24 bg-transparent text-right text-[22px] font-bold outline-none pointer-coarse:text-[22px]"
          />
        </span>
      </label>
      <ul className="flex flex-col gap-3">
        {activeKeys(settings.targets).map((b) => {
          const mine = lines.filter((l) => l.bucket === b);
          const name = (l: (typeof lines)[number]) => (b === "momentum" && momentumLabel ? momentumLabel : l.product.short);
          return (
            <li key={b} className="flex items-center gap-3">
              <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${BUCKET_DOT[b]}`} />
              <span className="min-w-0 flex-1">
                <span className="block text-[15px] font-medium">{BUCKET_NAME[b]}</span>
                {mine.length === 1 ? (
                  <span className="block truncate text-[13px] text-ink-2">{name(mine[0])}</span>
                ) : (
                  mine.map((l) => (
                    <span key={l.product.isin} className="flex justify-between gap-3 text-[13px] text-ink-2">
                      <span className="truncate">{name(l)}</span>
                      <span className="num shrink-0">{money(l.amount, "EUR", 0)}</span>
                    </span>
                  ))
                )}
              </span>
              <span className="num shrink-0 whitespace-nowrap text-[17px] font-semibold">{money(plan[b], "EUR", 0)}</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/** Three plain questions -> the core fund, with a button to make it your choice. */
export function CoreChooser({ current, stats }: { current: string; stats: Record<string, ProxyStats> }) {
  const [a, setA] = useState<CoreAnswers>(() => answersFor(current));
  const pick = chooseCore(a);
  const p = byIsin(pick.isin)!;
  const { pending, save } = useSave("core");
  const q = (k: keyof CoreAnswers, label: string, help: string) => (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between gap-3">
        <span className="text-[15px]">{label}</span>
        <Segmented
          ariaLabel={label}
          value={a[k] ? "yes" : "no"}
          onChange={(v) => setA((s) => ({ ...s, [k]: v === "yes" }))}
          options={[
            { value: "yes", label: "Yes" },
            { value: "no", label: "No" },
          ]}
        />
      </div>
      <p className="text-[12.5px] text-ink-3">{help}</p>
    </div>
  );
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 rounded-[18px] bg-surface-2 px-4 py-4">
        {q("emerging", "Include emerging markets?", "China, India, Taiwan, Brazil… About 10% of the world market. More diversification, a bit more risk.")}
        {q("small", "Include small companies?", "About 10% of the market. Historically a small extra return, with deeper falls.")}
        {q("taxFreeSwitch", "Want to switch funds without paying tax?", "In Spain only mutual funds can be switched tax-free (traspaso). They are not on Trade Republic.")}
      </div>
      <div>
        <ProductCard p={p} stats={p.proxy ? stats[p.proxy] : undefined} selected={p.isin === current} />
        <ul className="mt-2 flex flex-col gap-1 px-1 text-[13.5px] text-ink-2">
          {pick.why.map((w) => (
            <li key={w}>· {w}</li>
          ))}
        </ul>
        {p.isin !== current && (
          <Button variant="primary" className="tap mt-3" disabled={pending} onClick={() => save([{ isin: p.isin, weight: 1 }])}>
            {pending ? "Saving…" : "Use this as my core"}
          </Button>
        )}
      </div>
    </div>
  );
}

const MIXES: { label: string; help: string; w: Record<string, number> }[] = [
  { label: "Classic", help: "All gold: the best-documented crisis cushion", w: { IE00B4ND3602: 100 } },
  { label: "Steady", help: "Half gold, half short euro bonds: the smallest swings", w: { IE00B4ND3602: 50, LU1650487413: 50 } },
  { label: "Inflation", help: "Gold plus commodities: for an inflation shock", w: { IE00B4ND3602: 70, IE00BDFL4P12: 30 } },
  { label: "Adventurous", help: "Gold plus a little bitcoin: higher potential, much bigger falls", w: { IE00B4ND3602: 80, XS2940466316: 20 } },
];

/** Pick the diversifiers and their weights inside the block, with each one's behaviour side by side. */
export function DiversifierPicker({ current, stats }: { current: { isin: string; weight: number }[]; stats: Record<string, ProxyStats> }) {
  return <BlockPicker bucket="gold" current={current} stats={stats} mixes={MIXES} />;
}

const CASH_MIXES: typeof MIXES = [
  { label: "Account only", help: "Simplest and protected by the deposit guarantee", w: { "CASH-ACCOUNT": 100 } },
  { label: "Half and half", help: "Some tax deferral, some instant money", w: { "CASH-ACCOUNT": 50, LU0290358497: 50 } },
  { label: "Money-market ETF", help: "Tax only when you sell; for larger, long-held amounts", w: { LU0290358497: 100 } },
];

export function CashPicker({ current }: { current: { isin: string; weight: number }[] }) {
  return <BlockPicker bucket="cash" current={current} stats={{}} mixes={CASH_MIXES} saveLabel="Save cash choice" />;
}

function BlockPicker({
  bucket,
  current,
  stats,
  mixes,
  saveLabel = "Save mix",
}: {
  bucket: PlanBucket;
  current: { isin: string; weight: number }[];
  stats: Record<string, ProxyStats>;
  mixes: typeof MIXES;
  saveLabel?: string;
}) {
  const products = productsFor(bucket);
  const initial = useMemo(() => Object.fromEntries(products.map((p) => [p.isin, Math.round(100 * (current.find((c) => c.isin === p.isin)?.weight ?? 0))])), [products, current]);
  const [w, setW] = useState<Record<string, number>>(initial);
  const total = Object.values(w).reduce((s, x) => s + x, 0);
  const { pending, save } = useSave(bucket);
  const dirty = products.some((p) => (w[p.isin] ?? 0) !== initial[p.isin]);
  return (
    <div className="flex flex-col gap-4">
      <div className="-mx-1 flex gap-2 overflow-x-auto overscroll-x-contain px-1 pb-1 [scrollbar-width:none]">
        {mixes.map((m) => (
          <button
            key={m.label}
            title={m.help}
            onClick={() => setW(Object.fromEntries(products.map((p) => [p.isin, m.w[p.isin] ?? 0])))}
            className="tap h-9 shrink-0 rounded-full bg-surface-2 px-4 text-[14px] font-medium text-ink-2 hover:text-ink"
          >
            {m.label}
          </button>
        ))}
      </div>
      <ul className="flex flex-col gap-3">
        {products.map((p) => {
          const v = w[p.isin] ?? 0;
          return (
            <li key={p.isin} className={cx("rounded-[18px]", v > 0 ? "" : "opacity-90")}>
              <ProductCard p={p} stats={p.proxy ? stats[p.proxy] : undefined} compact={v === 0} selected={v > 0} />
              <label className="mt-2 flex items-center gap-3 px-1 text-[14px]">
                <span className="w-24 shrink-0 text-ink-2">Share of block</span>
                <input
                  type="range"
                  min={0}
                  max={100}
                  step={5}
                  value={v}
                  onChange={(e) => setW((s) => ({ ...s, [p.isin]: Number(e.target.value) }))}
                  aria-label={`Share of ${p.short}`}
                  className="min-w-0 flex-1 accent-[var(--accent)]"
                />
                <span className="num w-12 shrink-0 text-right font-semibold">{total > 0 ? pct(v / total, 0, false) : "0%"}</span>
              </label>
            </li>
          );
        })}
      </ul>
      <div className="sticky bottom-[calc(64px+env(safe-area-inset-bottom))] z-10 flex items-center justify-between gap-3 rounded-[18px] bg-surface px-4 py-3 shadow-[var(--shadow-card)] md:bottom-4">
        <span className="text-[14px] text-ink-2">{total === 0 ? "Pick at least one" : dirty ? "Unsaved changes" : "Saved"}</span>
        <Button
          variant="primary"
          className="tap"
          disabled={pending || total === 0 || !dirty}
          onClick={() => save(products.filter((p) => (w[p.isin] ?? 0) > 0).map((p) => ({ isin: p.isin, weight: w[p.isin] })))}
        >
          {pending ? "Saving…" : saveLabel}
        </Button>
      </div>
    </div>
  );
}
