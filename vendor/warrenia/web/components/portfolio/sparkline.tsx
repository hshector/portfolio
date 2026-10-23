import type { DailyPoint } from "@/lib/portfolio/engine";

/** Bare value line for the home card: no axes, no labels, no JS. Drawn in the
 *  card's ink so it works on the pastel hero in light and dark.
 *
 *  A new portfolio has one or two points (and days before the first price that
 *  read as zero). So the line starts at the first real value, keeps a minimum
 *  vertical range so cent-level moves don't look like cliffs. `window` reserves room for that many days: the line grows
 *  in from the right as history builds up, with a faint dashed lead-in. */
export function Sparkline({ series, window = 0, className }: { series: DailyPoint[]; window?: number; className?: string }) {
  const first = series.findIndex((p) => p.value > 0.005);
  if (first < 0) return null;
  // A manually priced holding has no history: it sits flat at its purchase price
  // until the next known price. Drop that flat run (keep its last day) so it shows
  // as the dashed lead-in, not as a long line that jumps on the last pixel.
  const v0 = series[first].value;
  const moves = series.findIndex((p, i) => i > first && Math.abs(p.value - v0) > 0.01);
  const real = series.slice(moves < 0 ? series.length - 1 : moves - 1);
  // ~120 points is plenty for a 360px-wide line and keeps the HTML small.
  const step = Math.max(1, Math.ceil(real.length / 120));
  const pts = real.filter((_, i) => i % step === 0 || i === real.length - 1).map((p) => p.value);

  const lo = Math.min(...pts);
  const hi = Math.max(...pts);
  const mid = (lo + hi) / 2;
  // At least ±4% of the value around the middle: a flat or nearly flat line sits
  // in the middle of the card instead of swinging edge to edge.
  const half = Math.max((hi - lo) / 2, mid * 0.04, 0.01);
  const W = 100;
  const H = 40;
  const PAD = 6;
  const y = (v: number) => H - PAD - ((v - (mid - half)) / (2 * half)) * (H - 2 * PAD);

  const slots = Math.max(pts.length, window);
  const x = (i: number) => (slots <= 1 ? W : ((slots - pts.length + i) / (slots - 1)) * W);
  const xy: [number, number][] = pts.length === 1 ? [[window ? x(0) : 0, y(pts[0])], [W, y(pts[0])]] : pts.map((v, i) => [x(i), y(v)]);

  const line = xy.map(([px, py], i) => `${i ? "L" : "M"}${px.toFixed(2)},${py.toFixed(2)}`).join("");
  const [x0, y0] = xy[0];
  const [x1] = xy[xy.length - 1];
  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-hidden className={className}>
      <defs>
        <linearGradient id="spark-fill" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor="currentColor" stopOpacity="0.16" />
          <stop offset="1" stopColor="currentColor" stopOpacity="0" />
        </linearGradient>
      </defs>
      {x0 > 0 && <path d={`M0,${y0.toFixed(2)}L${x0.toFixed(2)},${y0.toFixed(2)}`} stroke="currentColor" strokeOpacity="0.5" strokeWidth="1.5" strokeDasharray="3 5" vectorEffect="non-scaling-stroke" />}
      <path d={`${line}L${x1},${H}L${x0},${H}Z`} fill="url(#spark-fill)" />
      <path d={line} fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}
