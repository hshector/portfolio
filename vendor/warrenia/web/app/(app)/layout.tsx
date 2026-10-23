import Link from "next/link";

import { Wordmark } from "@/components/shell/brand";
import { DataBanners, FreshnessStamp } from "@/components/shell/freshness";
import { TabBar, TopNav } from "@/components/shell/nav";
import { IconBell } from "@/components/ui/icons";
import { computeFreshness } from "@/lib/market/freshness";
import { loadMarket } from "@/lib/market/source";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { latest, meta, error } = await loadMarket();
  const fresh = latest ? computeFreshness(latest.data_asof, meta?.calendar?.sessions) : null;
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="sticky top-0 z-30 border-b border-line/60 bg-canvas/90 pt-[env(safe-area-inset-top)] backdrop-blur-md">
        <div className="mx-auto flex h-16 w-full max-w-[1120px] items-center justify-between gap-2 px-4 md:px-8">
          <Link href="/" aria-label="Home" className="shrink-0">
            <Wordmark />
          </Link>
          <TopNav />
          <div className="flex min-w-0 items-center gap-1.5 sm:gap-2">
            <FreshnessStamp latest={latest} fresh={fresh} />
            <Link href="/alerts" aria-label="Alerts" className="tap inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-surface-3/70 text-ink-2 hover:text-ink">
              <IconBell size={17} />
            </Link>
          </div>
        </div>
      </header>
      <DataBanners latest={latest} fresh={fresh} warnings={meta?.warnings} error={error} />
      <main className="mx-auto w-full max-w-[1120px] flex-1 px-4 pb-28 pt-6 md:px-8 md:pb-16">{children}</main>
      <TabBar />
    </div>
  );
}
