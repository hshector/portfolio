import { RadarView } from "@/components/radar/radar-view";
import { PageHeader } from "@/components/shell/page-header";
import { EmptyState } from "@/components/ui/primitives";
import { toListRow } from "@/lib/market/radar";
import { getRadar, loadMarket } from "@/lib/market/source";
import { heldTickers } from "@/lib/user/holdings";
import { requireStore } from "@/lib/user/store";

export const metadata = { title: "Radar" };

export default async function RadarPage({ searchParams }: { searchParams: Promise<{ cls?: string; preset?: string; group?: string }> }) {
  const sp = await searchParams;
  const { latest, meta } = await loadMarket();
  const store = await requireStore();
  const [radar, held, watch] = await Promise.all([getRadar(latest), heldTickers(store), store.watchlist()]);

  if (!latest || !radar || !meta) {
    return (
      <>
        <PageHeader title="Radar" />
        <EmptyState title="No data yet">The first ranking appears when the initial data download finishes (about 2 hours after setup).</EmptyState>
      </>
    );
  }
  return (
    <>
      <PageHeader title="Radar" sub="Strongest trends, and whether to buy, wait or avoid." />
      <RadarView
        rows={radar.rows.map(toListRow)}
        bench={radar.bench}
        primary={meta.primary_benchmark}
        held={held.tickers}
        watch={watch.map((w) => w.ticker)}
        initial={{ cls: sp.cls, preset: sp.preset, group: sp.group }}
      />
    </>
  );
}
