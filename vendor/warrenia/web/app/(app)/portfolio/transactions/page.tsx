import Link from "next/link";

import { DeleteButton, InstrumentForm, ManualPriceForm, TransactionForm } from "@/components/portfolio/forms";
import { PageHeader } from "@/components/shell/page-header";
import { Card, Disclosure, EmptyState } from "@/components/ui/primitives";
import { dateLabel, money, num } from "@/lib/format";
import { BUCKET_LABELS, TX_LABELS } from "@/lib/portfolio/types";
import { requireStore } from "@/lib/user/store";

export const metadata = { title: "Transactions" };

export default async function TransactionsPage() {
  const store = await requireStore();
  const [instruments, txs] = await Promise.all([store.instruments(), store.transactions()]);
  const byId = new Map(instruments.map((i) => [i.id, i]));
  const amount = (t: (typeof txs)[number]) =>
    t.amount !== null ? money(t.amount, t.currency) : t.quantity !== null && t.price !== null ? money(t.quantity * t.price, t.currency) : "";
  const hasManual = instruments.some((i) => i.price_source === "manual");
  return (
    <>
      <PageHeader
        title="Transactions"
        sub={<Link href="/portfolio" className="text-accent">‹ Portfolio</Link>}
        actions={
          <>
            <InstrumentForm />
            <TransactionForm instruments={instruments} />
          </>
        }
      />
      <div className="flex flex-col gap-4">
        <Card title="Instruments" pad={false}>
          {instruments.length === 0 ? (
            <div className="px-5 pb-5">
              <EmptyState title="No instruments">Add your core fund, your diversifiers and any stocks you buy.</EmptyState>
            </div>
          ) : (
            <ul className="mt-2 divide-y divide-line">
              {instruments.map((i) => (
                <li key={i.id} className="flex items-center gap-2 py-2.5 pl-5 pr-3">
                  <span className="min-w-0 flex-1">
                    <span className="line-clamp-2 text-[15px] font-medium leading-snug">{i.name}</span>
                    <span className="block truncate text-[12.5px] text-ink-2">
                      {BUCKET_LABELS[i.bucket]} · {i.market_ticker ?? i.isin ?? "—"}
                      {i.price_source === "manual" && <span className="text-warn"> · manual price</span>}
                    </span>
                  </span>
                  <InstrumentForm instrument={i} trigger={<button className="tap shrink-0 rounded-full px-3 py-1.5 text-[13px] font-medium text-ink-2 hover:bg-surface-2">Edit</button>} />
                  <DeleteButton id={i.id} kind="instrument" label={`Delete ${i.name}`} />
                </li>
              ))}
            </ul>
          )}
        </Card>

        {hasManual && (
          <Disclosure title="Update a manual price">
            <ManualPriceForm instruments={instruments} />
          </Disclosure>
        )}

        <Card title={`History (${txs.length})`} pad={false}>
          {txs.length === 0 ? (
            <div className="px-5 pb-5">
              <EmptyState title="No transactions">Record your first deposit and purchase, or import a CSV.</EmptyState>
            </div>
          ) : (
            <ul className="mt-2 divide-y divide-line">
              {[...txs].reverse().map((t) => (
                <li key={t.id} className="flex items-center gap-2 py-2.5 pl-5 pr-3">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[15px] font-medium">
                      {TX_LABELS[t.type]}
                      {t.instrument_id && <span className="font-normal text-ink-2"> · {byId.get(t.instrument_id)?.name}</span>}
                    </span>
                    <span className="num block truncate text-[12.5px] text-ink-2">
                      {dateLabel(t.trade_date)}
                      {t.type === "split" ? ` · ×${num(t.split_ratio, 4)}` : t.quantity !== null && t.price !== null ? ` · ${num(t.quantity, 4)} × ${num(t.price)} ${t.currency}` : ""}
                      {t.fees ? ` · fee ${money(t.fees, t.currency)}` : ""}
                      {t.source === "csv" ? " · csv" : ""}
                    </span>
                  </span>
                  <span className="num shrink-0 whitespace-nowrap text-[15px] font-semibold">{amount(t)}</span>
                  <DeleteButton id={t.id} kind="tx" label="Delete transaction" />
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </>
  );
}
