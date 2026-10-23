import Link from "next/link";

import { ActionPill, AssetAvatar } from "@/components/fin/fin";
import { PageHeader } from "@/components/shell/page-header";
import { Card, EmptyState } from "@/components/ui/primitives";
import { dateLabel } from "@/lib/format";
import { DEFAULT_NOTIFY, GROUP_LABEL, isSellAlert, relevantEvents, sessionsOf, type SignalGroup } from "@/lib/market/signals";
import { getSignals, loadMarket } from "@/lib/market/source";
import { ACTION_LABELS, type SignalEvent } from "@/lib/market/types";
import { heldTickers } from "@/lib/user/holdings";
import { requireStore } from "@/lib/user/store";

export const metadata = { title: "Alerts" };

const label = (a: SignalEvent["from"]) => (a === "out" ? "Not scored" : a ? ACTION_LABELS[a] : "—");

function what(e: SignalEvent, own: boolean): { text: string; strong: boolean } {
  if (e.to === "out") return { text: "No longer analysed: it left the market filters (size, liquidity or data)", strong: own };
  if (own && e.hold_from !== e.hold_to) return e.hold_to ? { text: "Back to “keep”", strong: false } : { text: "Consider selling: it lost its momentum", strong: true };
  return { text: `${label(e.from)} → ${label(e.to)}`, strong: false };
}

function EventRow({ e, own }: { e: SignalEvent; own: boolean }) {
  const w = what(e, own);
  return (
    <li>
      <Link href={`/research/${e.t}`} className="flex items-center gap-3 px-5 py-3 transition-colors hover:bg-surface-2 active:bg-surface-3">
        <AssetAvatar t={e.t} size={34} />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[15px] font-semibold">{e.n ?? e.t}</span>
          <span className={w.strong ? "block text-[13.5px] font-medium text-neg" : "block text-[13.5px] text-ink-2"}>
            {e.t} · {w.text}
          </span>
        </span>
        {e.to && e.to !== "out" && <ActionPill action={e.to} className="shrink-0" desktopOnly />}
      </Link>
    </li>
  );
}

export default async function AlertsPage() {
  const { latest } = await loadMarket();
  const store = await requireStore();
  const [log, held, watch, settings] = await Promise.all([getSignals(), heldTickers(store), store.watchlist(), store.settings()]);
  const events = log?.events ?? [];
  const heldSet = new Set(held.tickers.map((t) => t.toUpperCase()));
  const watchSet = new Set(watch.map((w) => w.ticker.toUpperCase()));
  const prefs = { ...DEFAULT_NOTIFY, ...settings.notify };
  const days = sessionsOf(events).slice(0, 20);
  const latestDay = days[0];

  return (
    <div className="mx-auto max-w-[760px]">
      <PageHeader
        title="Alerts"
        sub={
          <>
            What changed for you ·{" "}
            <Link href="/settings?tab=notifications" className="text-accent">
              Notifications
            </Link>
          </>
        }
      />
      {!log ? (
        <EmptyState title="No signal changes recorded yet">The first changes appear after two daily updates.</EmptyState>
      ) : (
        <div className="flex flex-col gap-4">
          {days.map((d) => {
            const g = relevantEvents(
              events.filter((e) => e.asof === d),
              heldSet,
              watchSet,
              prefs,
            );
            const groups = (Object.keys(g) as SignalGroup[]).filter((k) => g[k].length);
            const sells = g.holdings.filter(isSellAlert).length;
            return (
              <Card key={d} title={`Close of ${dateLabel(d)}`} sub={sells ? `${sells} of your stocks: consider selling` : undefined} pad={false}>
                {groups.length === 0 ? (
                  <p className="px-5 pb-4 pt-1 text-[14.5px] text-ink-2">Nothing that concerns you changed.</p>
                ) : (
                  groups.map((k) => (
                    <div key={k}>
                      <p className="px-5 pb-1 pt-2 text-[13px] font-medium text-ink-2">{GROUP_LABEL[k]}</p>
                      <ul className="divide-y divide-line">
                        {g[k].slice(0, 15).map((e, i) => (
                          <EventRow key={`${e.t}-${i}`} e={e} own={k === "holdings"} />
                        ))}
                      </ul>
                      {g[k].length > 15 && <p className="px-5 py-2 text-[13px] text-ink-3">and {g[k].length - 15} more</p>}
                    </div>
                  ))
                )}
                {d === latestDay && (
                  <details className="mx-5 mb-4 mt-2 rounded-[14px] bg-surface-2 px-4 py-2.5">
                    <summary className="cursor-pointer text-[14px] text-ink-2">
                      Every change that day ({events.filter((e) => e.asof === d).length})
                    </summary>
                    <ul className="mt-2 flex flex-col gap-1 text-[13.5px]">
                      {events
                        .filter((e) => e.asof === d)
                        .slice(0, 150)
                        .map((e, i) => (
                          <li key={`${e.t}-${i}`} className="flex justify-between gap-3">
                            <Link href={`/research/${e.t}`} className="min-w-0 truncate">
                              <span className="font-medium">{e.t}</span> <span className="text-ink-3">{e.n}</span>
                            </Link>
                            <span className="shrink-0 whitespace-nowrap text-ink-2">
                              {label(e.from)} → {label(e.to)}
                            </span>
                          </li>
                        ))}
                    </ul>
                  </details>
                )}
              </Card>
            );
          })}
          {!days.length && <EmptyState title="No changes yet">Signals did not change since the last update.</EmptyState>}
          <p className="px-5 text-[12.5px] text-ink-3">
            {latest?.demo ? "Demo data: no notifications sent · " : ""}Kept 120 days.
          </p>
        </div>
      )}
    </div>
  );
}
