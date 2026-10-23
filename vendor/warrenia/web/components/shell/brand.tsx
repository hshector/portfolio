/** Brand mark: a rounded double U (W) in the current text colour, with two small
 *  sage squares over its outer stems; the whole mark is centred in the 32 box.
 *  Same geometry as scripts/icons.mjs, which generates the app icons from it. */
export function BrandMark({ size = 26 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden>
      <path d="M6 11.55v8.5a5 5 0 0 0 10 0a5 5 0 0 0 10 0V11.55" fill="none" stroke="currentColor" strokeWidth="3.6" strokeLinecap="round" strokeLinejoin="round" />
      <rect x="4.5" y="5.15" width="3" height="3" rx="0.6" fill="var(--accent)" />
      <rect x="24.5" y="5.15" width="3" height="3" rx="0.6" fill="var(--accent)" />
    </svg>
  );
}

export function Wordmark() {
  return (
    <span className="flex items-center gap-2 text-ink">
      <BrandMark />
      <span className="text-[17px] font-bold tracking-[-0.02em]">WarrenIA</span>
    </span>
  );
}
