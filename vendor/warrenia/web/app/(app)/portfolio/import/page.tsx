import Link from "next/link";

import { ImportFlow } from "@/components/portfolio/import-flow";
import { PageHeader } from "@/components/shell/page-header";
import { Panel } from "@/components/ui/primitives";

export const metadata = { title: "Import transactions" };

export default function ImportPage() {
  return (
    <>
      <PageHeader title="Import transactions (CSV)" sub={<><Link href="/portfolio" className="hover:text-ink">Portfolio</Link> / preview and checks before anything is saved</>} />
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_380px]">
        <Panel>
          <ImportFlow />
        </Panel>
        <Panel title="Accepted format">
          <div className="flex flex-col gap-3 text-[13px] text-ink-2">
            <p className="text-ink">
              <b>Trade Republic:</b> upload its CSV as it comes. In the app or at app.traderepublic.com: Profile → Documents (Statements) → Transaction export → pick the period →
              CSV. It is recognised automatically.
            </p>
            <p>Any other broker: a CSV with these columns.</p>
            <p>Required columns: <code className="font-mono text-ink">date</code> and <code className="font-mono text-ink">type</code>. Optional: isin, ticker, name, quantity, price, amount, fees, taxes, currency, fx_rate, ratio, note (Spanish and German headers also work).</p>
            <p>Types: buy, sell, deposit, withdrawal, dividend, interest, fee, tax, split.</p>
            <p>Separator &ldquo;;&rdquo; with decimal commas, or &ldquo;,&rdquo; with decimal points. Dates YYYY-MM-DD or DD/MM/YYYY.</p>
            <p>Repeated rows are detected (re-importing does not duplicate them). Unknown instruments are created with manual pricing; review them afterwards.</p>
            <p className="t-meta">
              No credentials are ever asked for: you upload a file you exported yourself. Template for other brokers: docs/import-template.csv.
            </p>
          </div>
        </Panel>
      </div>
    </>
  );
}
