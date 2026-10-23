import { cx } from "@/components/ui/primitives";
import { dateLabel, dateTimeLabel } from "@/lib/format";
import type { Freshness } from "@/lib/market/freshness";
import type { Latest } from "@/lib/market/types";

/** Small pill with the date of the DATA (never the time the page was opened). */
export function FreshnessStamp({ latest, fresh }: { latest: Latest | null; fresh: Freshness | null }) {
  if (!latest) return <span className="text-[13px] text-ink-3">No data</span>;
  const stale = !latest.demo && fresh?.status === "stale";
  const title = `Data from the ${dateLabel(latest.data_asof)} close (NYSE) · calculated ${dateTimeLabel(latest.computed_at)}${fresh ? ` · ${fresh.label}` : ""}`;
  return (
    <span title={title} className={cx("inline-flex h-8 items-center gap-1.5 whitespace-nowrap rounded-full px-3 text-[13px] font-medium", stale ? "bg-warn-soft text-warn" : "bg-surface-3/70 text-ink-2")}>
      <span className={cx("h-1.5 w-1.5 rounded-full", stale ? "bg-warn" : latest.demo ? "bg-accent" : "bg-pos")} />
      {latest.demo && <span className="hidden sm:inline">Demo · </span>}
      {/* Narrow phones (or a large display size) keep just the date. */}
      <span className="hidden min-[370px]:inline">Close </span>
      {dateLabel(latest.data_asof, false)}
    </span>
  );
}

export function DataBanners({ latest, fresh, warnings = [], error }: { latest: Latest | null; fresh: Freshness | null; warnings?: string[]; error?: string | null }) {
  const msgs: { tone: "accent" | "warn"; text: React.ReactNode }[] = [];
  if (error) msgs.push({ tone: "warn", text: error });
  if (!latest) return msgs.length ? <Banners msgs={msgs} /> : null;
  if (latest.demo) msgs.push({ tone: "accent", text: "You are looking at demo (fictitious) data. Connect real data in Settings." });
  if (!latest.demo && fresh?.status === "stale")
    msgs.push({ tone: "warn", text: <>Out-of-date data: from the {dateLabel(latest.data_asof)} close, but {dateLabel(fresh.expected)} has already closed.</> });
  if (latest.status === "degraded" && !latest.demo) msgs.push({ tone: "warn", text: warnings[0] ?? "The last update finished with warnings." });
  if (!msgs.length) return null;
  return <Banners msgs={msgs} />;
}

function Banners({ msgs }: { msgs: { tone: "accent" | "warn"; text: React.ReactNode }[] }) {
  return (
    <div className="mx-auto w-full max-w-[1120px] px-4 pt-3 md:px-8">
      {msgs.map((m, i) => (
        <p key={i} className={cx("mb-2 rounded-[14px] px-4 py-2.5 text-[13.5px]", m.tone === "accent" ? "bg-accent-soft text-accent-2" : "bg-warn-soft text-warn")}>
          {m.text}
        </p>
      ))}
    </div>
  );
}
