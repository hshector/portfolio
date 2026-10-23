import type { ReactNode } from "react";

/** iOS-style large title. */
export function PageHeader({ title, sub, actions }: { title: ReactNode; sub?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="flex flex-col gap-3 pb-5 md:flex-row md:items-end md:justify-between">
      <div className="min-w-0">
        <h1 className="t-title">{title}</h1>
        {sub && <div className="mt-1 text-[15px] text-ink-2">{sub}</div>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}
