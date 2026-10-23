import Link from "next/link";
import { cloneElement, isValidElement, useId, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes } from "react";

export function cx(...c: (string | false | null | undefined)[]) {
  return c.filter(Boolean).join(" ");
}

type Variant = "primary" | "secondary" | "ghost" | "danger";

const BTN: Record<Variant, string> = {
  primary: "bg-accent text-accent-ink hover:bg-accent-2 font-semibold",
  secondary: "bg-surface-2 text-ink hover:bg-surface-3 font-medium",
  ghost: "text-ink-2 hover:text-ink hover:bg-surface-2 font-medium",
  danger: "text-neg bg-neg-soft hover:brightness-95 font-medium",
};

export function Button({ variant = "secondary", size = "md", className, ...p }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: "sm" | "md" }) {
  return (
    <button
      {...p}
      className={cx(
        "tap inline-flex items-center justify-center gap-1.5 rounded-full disabled:opacity-40 disabled:pointer-events-none whitespace-nowrap",
        size === "sm" ? "h-9 px-4 text-[14px]" : "h-11 px-5 text-[15px]",
        BTN[variant],
        className,
      )}
    />
  );
}

export function ButtonLink({ href, variant = "secondary", size = "md", className, children }: { href: string; variant?: Variant; size?: "sm" | "md"; className?: string; children: ReactNode }) {
  return (
    <Link
      href={href}
      className={cx("tap inline-flex items-center gap-1.5 rounded-full whitespace-nowrap", size === "sm" ? "h-9 px-4 text-[14px]" : "h-11 px-5 text-[15px]", BTN[variant], className)}
    >
      {children}
    </Link>
  );
}

/** White rounded card with an optional sentence-case title. */
export function Card({ title, sub, action, children, className, pad = true, id }: { title?: ReactNode; sub?: ReactNode; action?: ReactNode; children: ReactNode; className?: string; pad?: boolean; id?: string }) {
  return (
    <section id={id} className={cx("card min-w-0", className)}>
      {(title || action) && (
        <header className="flex items-start justify-between gap-3 px-5 pb-1 pt-5">
          <div className="min-w-0">
            {title && <h2 className="text-[17px] font-semibold tracking-[-0.01em]">{title}</h2>}
            {sub && <p className="mt-0.5 text-[13.5px] text-ink-2">{sub}</p>}
          </div>
          {action && <div className="shrink-0 text-[14px]">{action}</div>}
        </header>
      )}
      <div className={cx(pad && "px-5 pb-5", pad && (title || action ? "pt-3" : "pt-5"))}>{children}</div>
    </section>
  );
}

/** Older name, same component. */
export function Panel({ title, meta, actions, children, className, pad = true, id }: { title?: ReactNode; meta?: ReactNode; actions?: ReactNode; children: ReactNode; className?: string; pad?: boolean; id?: string }) {
  return (
    <Card title={title} sub={meta} action={actions} className={className} pad={pad} id={id}>
      {children}
    </Card>
  );
}

export function Badge({ tone = "neutral", children, className, title }: { tone?: "neutral" | "accent" | "pos" | "neg" | "warn" | "info"; children: ReactNode; className?: string; title?: string }) {
  const t = {
    neutral: "bg-surface-2 text-ink-2",
    accent: "bg-accent-soft text-accent-2",
    pos: "bg-pos-soft text-pos",
    neg: "bg-neg-soft text-neg",
    warn: "bg-warn-soft text-warn",
    info: "bg-info-soft text-info",
  }[tone];
  return (
    <span title={title} className={cx("inline-flex h-6 items-center gap-1 rounded-full px-2.5 text-[12px] font-medium whitespace-nowrap", t, className)}>
      {children}
    </span>
  );
}

// Inputs and selects are 16px on touch screens: below that iOS Safari zooms the page on focus.
export function Input({ className, ...p }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...p}
      className={cx(
        className?.match(/(^|\s)w-/) ? "" : "w-full",
        "h-11 rounded-[12px] bg-surface-2 px-3.5 text-[15px] pointer-coarse:text-[16px] text-ink placeholder:text-ink-3 outline-none transition-colors focus:bg-surface focus:ring-2 focus:ring-accent/40",
        className,
      )}
    />
  );
}

export function Select({ className, children, ...p }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      {...p}
      className={cx(
        // A <select> is as wide as its longest option unless told otherwise: long product names would push the page sideways.
        className?.match(/(^|\s)w-/) ? "min-w-0" : "w-full min-w-0",
        "h-11 appearance-none text-ellipsis rounded-[12px] bg-surface-2 bg-[length:14px] bg-[right_12px_center] bg-no-repeat pl-3.5 pr-9 text-[15px] pointer-coarse:text-[16px] text-ink outline-none focus:ring-2 focus:ring-accent/40",
        "bg-[url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%236b6966' stroke-width='2'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E\")]",
        className,
      )}
    >
      {children}
    </select>
  );
}

export function Field({ label, hint, children, className }: { label: string; hint?: string; children: ReactNode; className?: string }) {
  // Explicit label/id association (wrapping a <select> would leak its options into the accessible name).
  const id = useId();
  const child = isValidElement<{ id?: string; "aria-describedby"?: string }>(children)
    ? cloneElement(children, { id: children.props.id ?? id, "aria-describedby": hint ? `${id}-hint` : undefined })
    : children;
  const forId = isValidElement<{ id?: string }>(children) ? (children.props.id ?? id) : undefined;
  return (
    <div className={cx("flex min-w-0 flex-col gap-1.5", className)}>
      <label htmlFor={forId} className="text-[13px] font-medium text-ink-2">
        {label}
      </label>
      {child}
      {hint && (
        <span id={`${id}-hint`} className="text-[12.5px] text-ink-3">
          {hint}
        </span>
      )}
    </div>
  );
}

/** iOS-style segmented control. */
export function Segmented<T extends string>({
  value,
  options,
  onChange,
  size = "md",
  ariaLabel,
  className,
}: {
  value: T;
  options: { value: T; label: ReactNode }[];
  onChange: (v: T) => void;
  size?: "sm" | "md";
  ariaLabel?: string;
  className?: string;
}) {
  return (
    <div role="tablist" aria-label={ariaLabel} className={cx("inline-flex rounded-full bg-surface-3/80 p-[3px]", className)}>
      {options.map((o) => (
        <button
          key={o.value}
          role="tab"
          aria-selected={value === o.value}
          onClick={() => onChange(o.value)}
          className={cx(
            "tap flex-1 whitespace-nowrap rounded-full px-3.5 font-medium",
            size === "sm" ? "h-7 text-[13px]" : "h-8 text-[14px]",
            value === o.value ? "bg-thumb text-ink shadow-[0_1px_3px_rgb(0_0_0/0.1)]" : "text-ink-2 hover:text-ink",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function EmptyState({ title, children, action }: { title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="card flex flex-col items-center gap-2 px-6 py-10 text-center">
      <p className="text-[17px] font-semibold">{title}</p>
      {children && <div className="max-w-md text-[14.5px] text-ink-2">{children}</div>}
      {action && <div className="mt-3">{action}</div>}
    </div>
  );
}

export function Callout({ tone = "info", title, children }: { tone?: "info" | "warn" | "neg" | "accent"; title?: string; children: ReactNode }) {
  const t = { info: "bg-info-soft", warn: "bg-warn-soft", neg: "bg-neg-soft", accent: "bg-accent-soft" }[tone];
  const c = { info: "text-info", warn: "text-warn", neg: "text-neg", accent: "text-accent-2" }[tone];
  return (
    <div className={cx("rounded-[16px] px-4 py-3 text-[14px]", t)}>
      {title && <p className={cx("font-semibold", c)}>{title}</p>}
      <div className="text-ink-2">{children}</div>
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cx("skeleton", className)} />;
}

export function Stat({ label, value, sub, className }: { label: ReactNode; value: ReactNode; sub?: ReactNode; className?: string }) {
  return (
    <div className={cx("flex min-w-0 flex-col gap-0.5", className)}>
      <span className="text-[13px] text-ink-2">{label}</span>
      <span className="num text-[19px] font-semibold tracking-[-0.01em]">{value}</span>
      {sub && <span className="num text-[12.5px] text-ink-3">{sub}</span>}
    </div>
  );
}

/** Grouped list row (iOS settings style). */
export function Row({ href, children, right, className }: { href?: string; children: ReactNode; right?: ReactNode; className?: string }) {
  const cls = cx("flex items-center gap-3 px-5 py-3.5", href && "transition-colors hover:bg-surface-2 active:bg-surface-3", className);
  const inner = (
    <>
      <div className="min-w-0 flex-1">{children}</div>
      {right !== undefined && <div className="shrink-0 text-right">{right}</div>}
    </>
  );
  return href ? (
    <Link href={href} className={cls}>
      {inner}
    </Link>
  ) : (
    <div className={cls}>{inner}</div>
  );
}

/** Folded detail: a tappable row that opens in place. Use it for explanations, method
 *  notes and secondary figures so the first screen shows numbers, not paragraphs.
 *  `card` renders it as its own card; otherwise it sits inside another card. */
export function Disclosure({
  title,
  meta,
  children,
  card = true,
  defaultOpen = false,
  className,
  id,
}: {
  title: ReactNode;
  meta?: ReactNode;
  children: ReactNode;
  card?: boolean;
  defaultOpen?: boolean;
  className?: string;
  id?: string;
}) {
  return (
    <details id={id} open={defaultOpen} className={cx("group min-w-0", card ? "card" : "rounded-[16px] bg-surface-2", className)}>
      <summary className="tap flex cursor-pointer list-none items-center gap-3 px-5 py-4 [&::-webkit-details-marker]:hidden">
        <span className="min-w-0 flex-1 text-[15.5px] font-semibold">{title}</span>
        {meta !== undefined && <span className="num shrink-0 text-[14px] text-ink-2">{meta}</span>}
        <svg aria-hidden width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="shrink-0 text-ink-3 transition-transform duration-200 group-open:rotate-180">
          <path d="m6 9 6 6 6-6" />
        </svg>
      </summary>
      <div className="min-w-0 px-5 pb-5">{children}</div>
    </details>
  );
}

