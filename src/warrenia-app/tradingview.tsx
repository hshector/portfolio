// Price charts in the demo come from TradingView's free widget, with TradingView's own (licensed)
// data: WarrenIA's prices cannot be shown publicly (see README.md). The widget loads only when
// the visitor asks for it, since it connects the browser to tradingview.com.

import { useEffect, useRef, useState } from 'react';

// exchange (MIC, as WarrenIA stores it) → TradingView prefix
const PREFIX: Record<string, string> = { XNAS: 'NASDAQ', XNYS: 'NYSE', ARCX: 'AMEX', XASE: 'AMEX', BATS: 'CBOE' };
export const tvSymbol = (ticker: string, ex: string | null | undefined) => (ex && PREFIX[ex] ? `${PREFIX[ex]}:${ticker}` : ticker).replace('.', '_');

export function TradingViewChart({ symbols, height = 380 }: { symbols: string[]; height?: number }) {
  const [on, setOn] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = box.current;
    if (!on || !el) return;
    const dark = document.documentElement.classList.contains('dark');
    const s = document.createElement('script');
    s.src = 'https://s3.tradingview.com/external-embedding/embed-widget-advanced-chart.js';
    s.async = true;
    s.textContent = JSON.stringify({
      symbol: symbols[0],
      compareSymbols: symbols.slice(1).map((symbol) => ({ symbol, position: 'SameScale' })),
      interval: 'D',
      range: '12M',
      timezone: 'America/New_York',
      theme: dark ? 'dark' : 'light',
      style: symbols.length > 1 ? '2' : '3',
      locale: 'en',
      allow_symbol_change: false,
      hide_side_toolbar: true,
      hide_volume: true,
      save_image: false,
      backgroundColor: dark ? '#000000' : '#ffffff',
      support_host: 'https://www.tradingview.com',
      autosize: true,
    });
    el.replaceChildren(Object.assign(document.createElement('div'), { className: 'tradingview-widget-container__widget', style: 'height:100%' }), s);
    return () => el.replaceChildren();
  }, [on, symbols]);

  if (!on)
    return (
      <div className="flex flex-col items-center justify-center gap-3 px-4 text-center" style={{ height: Math.min(height, 220) }}>
        <p className="max-w-[440px] text-[14px] text-ink-2">The demo shows WarrenIA&apos;s analysis without its market prices (their licence does not allow it). The price chart comes from TradingView.</p>
        <button type="button" onClick={() => setOn(true)} className="tap rounded-full bg-accent px-5 py-2.5 text-[15px] font-semibold text-accent-ink">
          Show the price chart
        </button>
        <p className="text-[12px] text-ink-3">Loads a widget from tradingview.com.</p>
      </div>
    );
  return (
    <div className="tradingview-widget-container" ref={box} style={{ height }}>
      <p className="px-2 text-ink-3">Loading the chart…</p>
    </div>
  );
}
