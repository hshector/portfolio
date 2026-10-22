// The WarrenIA demo: four screens of the real app (Inicio, Plan, Radar, Cartera), in Spanish, in its
// sage-green light theme, computed live by WarrenIA's own code on made-up data (data.ts). Plain DOM
// and SVG, no framework: it opens inside the island's glass pavilion and on the /warrenia page.

import { AS_OF, INSTRUMENTS, MONTHLY, monthPlan, portfolio, projection, radar, saleEstimate } from './data';
import type { PresetKey } from '../../vendor/warrenia/lib/market/radar';

const eur = new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0, useGrouping: 'always' } as Intl.NumberFormatOptions);
const eur2 = new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR', minimumFractionDigits: 2, maximumFractionDigits: 2, useGrouping: 'always' } as Intl.NumberFormatOptions);
const pct = (v: number | null, d = 1) => (v === null || !Number.isFinite(v) ? '—' : `${v > 0 ? '+' : ''}${(v * 100).toLocaleString('es-ES', { minimumFractionDigits: d, maximumFractionDigits: d })} %`);
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

const BLOCK: Record<string, { name: string; color: string }> = {
  core: { name: 'Núcleo', color: 'var(--w-accent)' },
  gold: { name: 'Diversificadores', color: 'var(--w-gold)' },
  momentum: { name: 'Momentum', color: 'var(--w-violet)' },
  cash: { name: 'Liquidez', color: 'var(--w-sand)' },
  other: { name: 'Otros', color: 'var(--w-ink-3)' },
};
const SECTOR: Record<string, string> = {
  Technology: 'Tecnología', Healthcare: 'Salud', Industrials: 'Industria', 'Financial Services': 'Finanzas',
  'Consumer Cyclical': 'Consumo', Energy: 'Energía', Utilities: 'Servicios públicos', 'Communication Services': 'Comunicación',
};
const ACTION: Record<string, { text: string; tone: string }> = {
  candidate: { text: 'Candidata', tone: 'pos' }, wait: { text: 'Esperar a una caída', tone: 'warn' },
  watch: { text: 'Vigilar', tone: 'info' }, avoid: { text: 'Evitar', tone: 'neg' }, none: { text: 'Sin señal', tone: 'mute' },
};
const PRESET_ES: { key: PresetKey; label: string; question: string }[] = [
  { key: 'buy', label: 'Comprar ahora', question: 'Candidatas: el 20 % más fuerte, subiendo con constancia, sin recalentar y con finanzas sólidas.' },
  { key: 'all', label: 'Ranking completo', question: 'Todo, ordenado por puntuación de momentum (también lo que ahora no es compra).' },
  { key: 'wait', label: 'Esperar a una caída', question: 'Líderes que han subido de golpe: comprar ahora sería comprar el pico.' },
];

export type Tab = 'inicio' | 'plan' | 'radar' | 'cartera';
export const TABS: { key: Tab; label: string }[] = [
  { key: 'inicio', label: 'Inicio' }, { key: 'plan', label: 'Plan' }, { key: 'radar', label: 'Radar' }, { key: 'cartera', label: 'Cartera' },
];

const MARK = `<svg viewBox="0 0 32 32" width="26" height="26" aria-hidden="true"><path d="M6 11.55v8.5a5 5 0 0 0 10 0a5 5 0 0 0 10 0V11.55" fill="none" stroke="currentColor" stroke-width="3.6" stroke-linecap="round" stroke-linejoin="round"/><rect x="4.5" y="5.15" width="3" height="3" rx="0.6" fill="var(--w-accent)"/><rect x="24.5" y="5.15" width="3" height="3" rx="0.6" fill="var(--w-accent)"/></svg>`;

export interface Demo {
  show(tab: Tab): void;
  readonly tab: Tab;
}

export function mountDemo(root: HTMLElement, opts: { closeLabel?: string; onClose?: () => void; onTab?: (t: Tab) => void } = {}): Demo {
  let tab: Tab = 'inicio';
  let years = 20, monthly = MONTHLY, preset: PresetKey = 'buy', sellId = 'core', sellQty = 10;
  root.classList.add('wdemo');
  root.innerHTML = `
    <header class="w-head">
      <span class="w-brand">${MARK}<b>WarrenIA</b></span>
      <nav class="w-tabs" role="tablist" aria-label="Secciones de la demo">
        ${TABS.map((t) => `<button type="button" role="tab" data-tab="${t.key}" aria-selected="false">${t.label}</button>`).join('')}
      </nav>
      ${opts.onClose ? `<button type="button" class="w-close" data-close>${esc(opts.closeLabel ?? 'Cerrar')}</button>` : ''}
    </header>
    <p class="w-demo-band" role="note"><i></i>Datos ficticios de demostración, calculados con el propio código de WarrenIA. No es asesoramiento financiero.</p>
    <div class="w-body" role="tabpanel" tabindex="-1"></div>`;
  const body = root.querySelector<HTMLElement>('.w-body')!;
  root.querySelector('[data-close]')?.addEventListener('click', () => opts.onClose?.());
  root.querySelector('.w-tabs')!.addEventListener('click', (e) => {
    const b = (e.target as HTMLElement).closest<HTMLElement>('[data-tab]');
    if (b) show(b.dataset.tab as Tab);
  });
  body.addEventListener('click', (e) => {
    const t = e.target as HTMLElement;
    const go = t.closest<HTMLElement>('[data-go]');
    if (go) return show(go.dataset.go as Tab);
    const y = t.closest<HTMLElement>('[data-years]');
    if (y) { years = Number(y.dataset.years); return render(); }
    const pr = t.closest<HTMLElement>('[data-preset]');
    if (pr) { preset = pr.dataset.preset as PresetKey; return render(); }
  });
  body.addEventListener('input', (e) => {
    const t = e.target as HTMLInputElement | HTMLSelectElement;
    if (t.name === 'monthly') { monthly = Number(t.value); renderFan(); }
    if (t.name === 'sell-id') { sellId = t.value; renderSale(); }
    if (t.name === 'sell-qty') { sellQty = Number(t.value); renderSale(); }
  });

  function show(t: Tab) {
    tab = t;
    root.querySelectorAll<HTMLElement>('[data-tab]').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.tab === t)));
    render();
    opts.onTab?.(t);
  }

  function render() {
    body.innerHTML = tab === 'inicio' ? inicio() : tab === 'plan' ? plan() : tab === 'radar' ? radarView() : cartera();
    if (tab === 'plan') renderFan();
    if (tab === 'cartera') renderSale();
  }

  // ------------------------------------------------------------- Inicio
  function inicio() {
    const p = portfolio(), t = p.totals;
    const last = p.series.slice(-30);
    const month = monthPlan();
    return `
      <section class="w-hero">
        <p class="w-label">Tu cartera</p>
        <p class="w-kpi">${eur.format(t.value)}</p>
        <p class="w-gain ${t.gain >= 0 ? 'pos' : 'neg'}">${t.gain >= 0 ? '+' : ''}${eur.format(t.gain)} · ${pct(t.gain / t.netContributions)} desde el inicio</p>
        ${sparkline(last.map((d) => d.value))}
        <div class="w-actions"><button type="button" data-go="cartera">Ver cartera</button><button type="button" data-go="plan">Plan del mes</button></div>
      </section>
      <div class="w-grid">
        <section class="w-card"><h3>Tu reparto</h3>${donut(p.allocation.map((a) => ({ key: a.bucket, w: a.weight })))}</section>
        <section class="w-card"><h3>Este mes</h3><p class="w-meta">Tus ${eur.format(MONTHLY)}, donde más hacen falta para volver al plan.</p>
          ${split(month)}</section>
      </div>
      <p class="w-foot">Datos al cierre del ${new Date(AS_OF).toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' })}.</p>`;
  }

  // ------------------------------------------------------------- Plan
  function plan() {
    return `
      <section class="w-card">
        <h3>Tu plan</h3>
        <p class="w-meta">Tres bloques: un núcleo indexado mundial, diversificadores (oro) y un toque de momentum.</p>
        ${bars([{ key: 'core', w: 0.75 }, { key: 'gold', w: 0.1 }, { key: 'momentum', w: 0.15 }])}
      </section>
      <section class="w-card">
        <div class="w-row"><h3>Hasta dónde podría llegar</h3><span class="w-pill">Un rango, no una promesa</span></div>
        <div class="w-seg" role="group" aria-label="Horizonte">${[10, 20, 30, 40].map((y) => `<button type="button" data-years="${y}" aria-pressed="${y === years}">${y} años</button>`).join('')}</div>
        <label class="w-slider">Aportación mensual <b data-monthly-out>${eur.format(monthly)}</b>
          <input type="range" name="monthly" min="0" max="1500" step="50" value="${monthly}" /></label>
        <div data-fan></div>
        <p class="w-meta">1.500 escenarios simulados con las rentabilidades y la volatilidad históricas de cada bloque, en euros de hoy (descontada la inflación).</p>
      </section>`;
  }
  function renderFan() {
    const host = body.querySelector<HTMLElement>('[data-fan]');
    if (!host) return;
    const pr = projection(years, monthly);
    body.querySelector<HTMLElement>('[data-monthly-out]')!.textContent = eur.format(monthly);
    const end = pr.p50.length - 1;
    host.innerHTML = `${fan(pr, Math.max(300, Math.round(host.clientWidth || 600)))}
      <dl class="w-stats three">
        <div><dt>Escenario prudente</dt><dd>${eur.format(pr.p10[end])}</dd></div>
        <div><dt>Mediana</dt><dd>${eur.format(pr.p50[end])}</dd></div>
        <div><dt>Escenario favorable</dt><dd>${eur.format(pr.p90[end])}</dd></div>
      </dl>
      <p class="w-meta">Aportarías ${eur.format(pr.contributed[end])}. Probabilidad de acabar por debajo de lo aportado: ${pct(pr.lossChance, 0).replace('+', '')}.</p>`;
  }

  // ------------------------------------------------------------- Radar
  function radarView() {
    const q = PRESET_ES.find((p) => p.key === preset)!;
    const rows = radar(preset);
    return `
      <section class="w-card">
        <div class="w-row"><h3>Radar de momentum</h3><span class="w-pill">36 empresas ficticias</span></div>
        <div class="w-seg" role="group" aria-label="Qué buscas">${PRESET_ES.map((p) => `<button type="button" data-preset="${p.key}" aria-pressed="${p.key === preset}">${p.label}</button>`).join('')}</div>
        <p class="w-meta">${q.question}</p>
        ${rows.length ? `<ol class="w-list">${rows.slice(0, 12).map((r) => {
          const a = ACTION[r.act] ?? ACTION.none;
          return `<li><span class="w-rank">${r.rank}</span><span class="w-name"><b>${esc(r.n)}</b><small>${SECTOR[r.sec ?? ''] ?? '—'}</small></span>
            <span class="w-score" title="Puntuación de momentum"><i style="width:${r.m}%"></i><em>${r.m.toFixed(0)}</em></span>
            <span class="w-ret ${(r.r6m ?? 0) >= 0 ? 'pos' : 'neg'}">${pct(r.r6m)}<small>6 meses</small></span>
            <span class="w-state ${a.tone}"><i></i>${a.text}</span></li>`;
        }).join('')}</ol>` : '<p class="w-empty">Ninguna empresa cumple esto ahora mismo.</p>'}
      </section>`;
  }

  // ------------------------------------------------------------- Cartera
  function cartera() {
    const p = portfolio(), t = p.totals;
    return `
      <dl class="w-stats">
        <div><dt>Valor</dt><dd>${eur.format(t.value)}</dd></div>
        <div><dt>Aportado</dt><dd>${eur.format(t.netContributions)}</dd></div>
        <div><dt>TIR</dt><dd>${pct(p.mwr.xirr)}</dd></div>
        <div><dt>TWR anual</dt><dd>${pct(p.twr.annualized)}</dd></div>
      </dl>
      <section class="w-card"><h3>Posiciones</h3>
        <table class="w-table"><thead><tr><th>Fondo</th><th>Bloque</th><th>Valor</th><th>Resultado</th></tr></thead><tbody>
          ${p.positions.filter((x) => x.qty > 0).map((x) => `<tr><td>${esc(x.instrument.name)}</td><td><span class="w-dot" style="--c:${BLOCK[x.instrument.bucket].color}"></span>${BLOCK[x.instrument.bucket].name}</td><td>${eur.format(x.valueEur ?? 0)}</td><td class="${(x.unrealizedEur ?? 0) >= 0 ? 'pos' : 'neg'}">${pct(x.unrealizedPct)}</td></tr>`).join('')}
        </tbody></table>
      </section>
      <section class="w-card">
        <div class="w-row"><h3>Antes de vender</h3><span class="w-pill">IRPF del ahorro</span></div>
        <p class="w-meta">Qué pagarías si vendieras hoy: lotes FIFO, tramos del ahorro y la regla de recompra de 2 meses.</p>
        <div class="w-form">
          <label>Fondo<select name="sell-id">${INSTRUMENTS.map((i) => `<option value="${i.id}" ${i.id === sellId ? 'selected' : ''}>${esc(i.name)}</option>`).join('')}</select></label>
          <label>Participaciones<input type="number" name="sell-qty" min="1" max="200" value="${sellQty}" inputmode="decimal" /></label>
        </div>
        <div data-sale aria-live="polite"></div>
      </section>`;
  }
  function renderSale() {
    const host = body.querySelector<HTMLElement>('[data-sale]');
    if (!host) return;
    try {
      const e = saleEstimate(sellId, Math.max(0.001, sellQty));
      host.innerHTML = `<dl class="w-stats three">
          <div><dt>Recibirías</dt><dd>${eur2.format(e.proceedsEur)}</dd></div>
          <div><dt>${e.gainEur >= 0 ? 'Ganancia' : 'Pérdida'}</dt><dd class="${e.gainEur >= 0 ? 'pos' : 'neg'}">${eur2.format(e.gainEur)}</dd></div>
          <div><dt>Impuesto estimado</dt><dd>${eur2.format(e.taxEur)}</dd></div>
        </dl>
        <p class="w-meta">Se venden ${e.lots.length === 1 ? '1 lote' : `${e.lots.length} lotes`}, del más antiguo al más nuevo. Neto tras impuestos y comisión: <b>${eur2.format(e.netEur)}</b>.${e.noRebuyUntil ? ` Para no perder la pérdida a efectos fiscales, no recompres hasta el ${new Date(e.noRebuyUntil).toLocaleDateString('es-ES')}.` : ''}</p>`;
    } catch (err) {
      host.innerHTML = `<p class="w-empty">${esc((err as Error).message.includes('more than') || (err as Error).message.includes('only') ? 'No tienes tantas participaciones.' : 'No se puede estimar esta venta.')}</p>`;
    }
  }

  show('inicio');
  return { show, get tab() { return tab; } };
}

// ---------------------------------------------------------------- charts (SVG)
function sparkline(v: number[]) {
  const w = 320, h = 64, lo = Math.min(...v), hi = Math.max(...v);
  const pts = v.map((x, i) => `${((i / (v.length - 1)) * w).toFixed(1)},${(h - 4 - ((x - lo) / (hi - lo || 1)) * (h - 8)).toFixed(1)}`).join(' ');
  return `<svg class="w-spark" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" role="img" aria-label="Valor de la cartera en los últimos 30 días"><polyline points="${pts}" fill="none" stroke="currentColor" stroke-width="2" vector-effect="non-scaling-stroke" stroke-linejoin="round" stroke-linecap="round"/></svg>`;
}
function donut(parts: { key: string; w: number }[]) {
  let a = -Math.PI / 2;
  const arcs = parts.filter((p) => p.w > 0.002).map((p) => {
    const a2 = a + p.w * Math.PI * 2, large = p.w > 0.5 ? 1 : 0;
    const d = `M ${50 + 40 * Math.cos(a)} ${50 + 40 * Math.sin(a)} A 40 40 0 ${large} 1 ${50 + 40 * Math.cos(a2 - 0.02)} ${50 + 40 * Math.sin(a2 - 0.02)}`;
    a = a2;
    return `<path d="${d}" fill="none" stroke="${BLOCK[p.key].color}" stroke-width="13"/>`;
  });
  return `<div class="w-donut"><svg viewBox="0 0 100 100" role="img" aria-label="Reparto por bloques">${arcs.join('')}</svg>
    <ul>${parts.filter((p) => p.w > 0.002).map((p) => `<li><span class="w-dot" style="--c:${BLOCK[p.key].color}"></span>${BLOCK[p.key].name}<b>${pct(p.w, 0).replace('+', '')}</b></li>`).join('')}</ul></div>`;
}
function split(amounts: Record<string, number>) {
  const total = Object.values(amounts).reduce((s, x) => s + x, 0) || 1;
  return `<ul class="w-split">${Object.entries(amounts).filter(([, v]) => v > 0.5).map(([k, v]) => `<li><span class="w-dot" style="--c:${BLOCK[k].color}"></span>${BLOCK[k].name}<b>${eur.format(v)}</b><i style="width:${(v / total) * 100}%;background:${BLOCK[k].color}"></i></li>`).join('')}</ul>`;
}
function bars(parts: { key: string; w: number }[]) {
  return `<div class="w-bars">${parts.map((p) => `<span style="flex:${p.w};background:${BLOCK[p.key].color}" title="${BLOCK[p.key].name}"></span>`).join('')}</div>
    <ul class="w-legend">${parts.map((p) => `<li><span class="w-dot" style="--c:${BLOCK[p.key].color}"></span>${BLOCK[p.key].name} <b>${Math.round(p.w * 100)} %</b></li>`).join('')}</ul>`;
}
/** The fan, drawn at its real width in pixels (so its labels stay at their size). */
function fan(pr: ReturnType<typeof projection>, w: number) {
  const h = 220, n = pr.years.length, hi = Math.max(...pr.p90) * 1.05;
  const x = (i: number) => (i / (n - 1)) * (w - 40) + 36, y = (v: number) => h - 22 - (v / hi) * (h - 34);
  const line = (a: number[]) => a.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
  const band = `${line(pr.p90)} ${pr.p10.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).reverse().join(' ')}`;
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => hi * f);
  return `<svg class="w-fan" viewBox="0 0 ${w} ${h}" role="img" aria-label="Abanico de escenarios a ${n - 1} años">
    ${ticks.map((v) => `<line x1="36" x2="${w - 4}" y1="${y(v)}" y2="${y(v)}" class="grid"/><text x="0" y="${y(v) + 4}" class="axis">${v >= 1e6 ? `${(v / 1e6).toLocaleString('es-ES', { maximumFractionDigits: 1 })} M` : `${Math.round(v / 1000)} k`}</text>`).join('')}
    <polygon points="${band}" class="band"/>
    <polyline points="${line(pr.contributed)}" class="paid"/>
    <polyline points="${line(pr.p50)}" class="mid"/>
    <text x="${w - 4}" y="${h - 4}" class="axis" text-anchor="end">${n - 1} años</text>
  </svg>`;
}
