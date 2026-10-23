"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";

import { commitImport, previewImport, type ImportPreview } from "@/app/(app)/portfolio/actions";
import { Badge, Button, Callout } from "@/components/ui/primitives";
import { TX_LABELS } from "@/lib/portfolio/types";
import { num } from "@/lib/format";

export function ImportFlow() {
  const [text, setText] = useState("");
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [pending, start] = useTransition();

  async function onFile(f: File | undefined) {
    if (!f) return;
    if (f.size > 2_000_000) {
      setResult({ ok: false, message: "File too large (max 2 MB)" });
      return;
    }
    setText(await f.text());
    setPreview(null);
    setResult(null);
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <label className="tap inline-flex h-9 cursor-pointer items-center rounded-[8px] border border-line-2 bg-surface-2 px-3.5 text-[13.5px] hover:bg-surface-3">
          Choose CSV file
          <input type="file" accept=".csv,text/csv,text/plain" className="sr-only" onChange={(e) => onFile(e.target.files?.[0])} />
        </label>
        <span className="t-meta">or paste the content below</span>
      </div>
      <textarea
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          setPreview(null);
        }}
        rows={7}
        spellCheck={false}
        placeholder={"date,type,isin,ticker,name,quantity,price,amount,fees,currency,fx_rate\n2026-01-02,deposit,,,,,,450,,EUR,"}
        className="w-full rounded-[8px] border border-line-2 bg-canvas-2 p-3 font-mono text-[12px] text-ink outline-none pointer-coarse:text-[16px] focus:border-accent-line"
      />
      <div className="flex gap-2">
        <Button disabled={!text.trim() || pending} onClick={() => start(async () => setPreview(await previewImport(text)))}>
          Preview and check
        </Button>
        {preview && preview.valid > 0 && (
          <Button
            variant="primary"
            disabled={pending}
            onClick={() =>
              start(async () => {
                const r = await commitImport(text);
                setResult(r);
                if (r.ok) toast.success(r.message);
              })
            }
          >
            Import {preview.valid} valid rows
          </Button>
        )}
      </div>
      {result && !result.ok && <Callout tone="neg">{result.message}</Callout>}
      {preview && preview.headerErrors.length > 0 && <Callout tone="neg" title="Invalid header">{preview.headerErrors.join(" · ")}</Callout>}
      {preview?.format === "trade_republic" && (
        <Callout tone="accent" title="Trade Republic export recognised">
          Savings plans, buys, sales, dividends (net of tax), interest, card payments and transfers are mapped for you. Rows we cannot map safely are listed with what to do.
        </Callout>
      )}
      {preview && preview.rows.length > 0 && (
        <div className="overflow-x-auto rounded-[10px] border border-line">
          <p className="px-3 py-2 text-[12.5px] text-ink-2">
            {preview.valid} valid · {preview.invalid} with errors (they will not be imported)
          </p>
          <table className="w-full min-w-[720px] text-[12.5px]">
            <thead>
              <tr className="border-y border-line text-left text-[11px] uppercase tracking-[0.05em] text-ink-3">
                <th className="px-3 py-1.5 font-medium">Line</th>
                <th className="px-3 py-1.5 font-medium">Date</th>
                <th className="px-3 py-1.5 font-medium">Type</th>
                <th className="px-3 py-1.5 font-medium">Instrument</th>
                <th className="px-3 py-1.5 text-right font-medium">Qty</th>
                <th className="px-3 py-1.5 text-right font-medium">Price / amount</th>
                <th className="px-3 py-1.5 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {preview.rows.map((r, i) => (
                <tr key={`${r.line}-${i}`} className="border-b border-line">
                  <td className="num px-3 py-1.5 text-ink-3">{r.line}</td>
                  <td className="num px-3 py-1.5">{r.tx?.trade_date ?? "—"}</td>
                  <td className="px-3 py-1.5">
                    {r.tx ? TX_LABELS[r.tx.type] : "—"}
                    {r.source && <span className="block text-[11px] text-ink-3">{r.source}</span>}
                  </td>
                  <td className="px-3 py-1.5 text-ink-2">
                    {r.match ?? r.name ?? r.isin ?? r.ticker ?? "—"} {r.willCreate && <Badge tone="info">new</Badge>}
                    {r.willCreate && r.newAs && <span className="block text-[11px] text-ink-3">{r.newAs}</span>}
                  </td>
                  <td className="num px-3 py-1.5 text-right">{r.tx?.quantity !== null && r.tx?.quantity !== undefined ? num(r.tx.quantity, 4) : ""}</td>
                  <td className="num px-3 py-1.5 text-right">{r.tx ? num(r.tx.price ?? r.tx.amount ?? null) : ""}</td>
                  <td className="px-3 py-1.5">{r.ok ? <span className="text-pos">OK</span> : <span className="text-neg">{r.errors.join(" · ")}</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
