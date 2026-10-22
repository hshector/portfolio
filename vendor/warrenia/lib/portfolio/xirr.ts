// Money-weighted return (XIRR): annual rate r such that
//   sum_i cf_i / (1 + r)^((t_i - t_0) / 365) = 0
// Cash flows from the investor's perspective: contributions negative,
// withdrawals and the final portfolio value positive.

export interface CashFlow {
  date: string; // YYYY-MM-DD
  amount: number;
}

const DAY = 86_400_000;

function years(d: string, d0: string): number {
  return (Date.parse(d + "T00:00:00Z") - Date.parse(d0 + "T00:00:00Z")) / DAY / 365;
}

function npv(rate: number, flows: CashFlow[], d0: string): number {
  return flows.reduce((s, f) => s + f.amount / Math.pow(1 + rate, years(f.date, d0)), 0);
}

export function xirr(flows: CashFlow[]): number | null {
  const fl = flows.filter((f) => Number.isFinite(f.amount) && f.amount !== 0).sort((a, b) => a.date.localeCompare(b.date));
  if (fl.length < 2) return null;
  if (!fl.some((f) => f.amount < 0) || !fl.some((f) => f.amount > 0)) return null;
  const d0 = fl[0].date;
  if (years(fl[fl.length - 1].date, d0) <= 0) return null;

  // Newton-Raphson from a reasonable guess, then bisection fallback.
  let r = 0.1;
  for (let i = 0; i < 100; i++) {
    const f = npv(r, fl, d0);
    const df = fl.reduce((s, c) => {
      const t = years(c.date, d0);
      return s - (t * c.amount) / Math.pow(1 + r, t + 1);
    }, 0);
    if (!Number.isFinite(f) || !Number.isFinite(df) || df === 0) break;
    const next = r - f / df;
    if (!Number.isFinite(next) || next <= -0.9999) break;
    if (Math.abs(next - r) < 1e-10) return next;
    r = next;
  }
  let lo = -0.9999;
  let hi = 100;
  let flo = npv(lo, fl, d0);
  const fhi = npv(hi, fl, d0);
  if (!Number.isFinite(flo) || !Number.isFinite(fhi) || flo * fhi > 0) return null;
  for (let i = 0; i < 300; i++) {
    const mid = (lo + hi) / 2;
    const fm = npv(mid, fl, d0);
    if (Math.abs(fm) < 1e-9 || hi - lo < 1e-12) return mid;
    if (flo * fm < 0) hi = mid;
    else {
      lo = mid;
      flo = fm;
    }
  }
  return (lo + hi) / 2;
}
