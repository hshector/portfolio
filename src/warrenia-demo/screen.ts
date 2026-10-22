// The pavilion's screen (src/island/world.ts): WarrenIA's Inicio drawn on a canvas from the same
// demo data, so the app is already on the wall as the bull walks up, and the live demo (ui.ts)
// opens exactly over it.

import { MONTHLY, monthPlan, portfolio } from './data';

const C = {
  canvas: '#f3f4f1', surface: '#ffffff', ink: '#111111', ink2: '#686b66', ink3: '#a0a39d', line: 'rgba(17,17,17,0.07)',
  accent: '#527f62', accent2: '#44705a', warnSoft: '#f5efe2', warn: '#9c7a3c', hero: '#1f3a2b',
  core: '#527f62', gold: '#c9a24a', momentum: '#7c6a98', cash: '#c4a77a',
};
const NAME: Record<string, string> = { core: 'Núcleo', gold: 'Diversificadores', momentum: 'Momentum', cash: 'Liquidez' };
const FONT = '-apple-system, BlinkMacSystemFont, "Hanken Grotesk Variable", system-ui, sans-serif';
const eur = new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0, useGrouping: 'always' } as Intl.NumberFormatOptions);

function round(c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  c.beginPath(); c.roundRect(x, y, w, h, r);
}

/** Draws the screen at the canvas's own size (designed for 1080 × 640). */
export function drawScreen(canvas: HTMLCanvasElement) {
  const c = canvas.getContext('2d')!;
  const k = canvas.width / 1080;
  c.save();
  c.scale(k, k);
  const p = portfolio(), t = p.totals, plan = monthPlan();
  c.fillStyle = C.canvas; c.fillRect(0, 0, 1080, 640);
  // top bar: the mark, the name and the tabs
  c.fillStyle = C.surface; c.fillRect(0, 0, 1080, 70);
  c.fillStyle = C.line; c.fillRect(0, 70, 1080, 1);
  c.strokeStyle = C.ink; c.lineWidth = 5; c.lineCap = 'round'; c.lineJoin = 'round';
  c.beginPath(); c.moveTo(34, 28); c.lineTo(34, 41); c.arc(41.5, 41, 7.5, Math.PI, 0, true); c.arc(56.5, 41, 7.5, Math.PI, 0, true); c.lineTo(64, 28); c.stroke();
  c.fillStyle = C.accent; c.fillRect(31.5, 18, 5, 5); c.fillRect(61.5, 18, 5, 5);
  c.fillStyle = C.ink; c.font = `700 26px ${FONT}`; c.textBaseline = 'middle'; c.fillText('WarrenIA', 80, 37);
  c.fillStyle = C.canvas; round(c, 560, 18, 360, 38, 12); c.fill();
  ['Inicio', 'Plan', 'Radar', 'Cartera'].forEach((tab, i) => {
    if (i === 0) { c.fillStyle = C.surface; round(c, 564, 22, 86, 30, 9); c.fill(); }
    c.fillStyle = i === 0 ? C.ink : C.ink2; c.font = `500 17px ${FONT}`; c.textAlign = 'center';
    c.fillText(tab, 607 + i * 88, 37);
  });
  c.textAlign = 'left';
  // the demo band
  c.fillStyle = C.warnSoft; c.fillRect(0, 71, 1080, 34);
  c.fillStyle = C.warn; c.beginPath(); c.arc(30, 88, 4, 0, Math.PI * 2); c.fill();
  c.fillStyle = '#6d5426'; c.font = `500 15px ${FONT}`; c.fillText('Datos de demostración (ficticios) · No es asesoramiento financiero', 44, 88);

  // the hero: the sage nebula behind the value
  const hx = 28, hy = 126, hw = 620, hh = 486;
  c.save(); round(c, hx, hy, hw, hh, 28); c.clip();
  const lin = c.createLinearGradient(hx, hy, hx + hw, hy + hh); lin.addColorStop(0, '#c9dfcf'); lin.addColorStop(1, '#9cc2aa');
  c.fillStyle = lin; c.fillRect(hx, hy, hw, hh);
  for (const [fx, fy, r, col] of [[0.12, 0.18, 0.7, '#cfe3d3'], [0.88, 0.1, 0.6, '#b5d3be'], [0.7, 1, 0.7, '#e6efe3'], [0.35, 0.85, 0.45, '#a9c9b5']] as const) {
    const g = c.createRadialGradient(hx + fx * hw, hy + fy * hh, 0, hx + fx * hw, hy + fy * hh, r * hw);
    g.addColorStop(0, col); g.addColorStop(1, 'rgba(255,255,255,0)');
    c.fillStyle = g; c.fillRect(hx, hy, hw, hh);
  }
  c.fillStyle = C.hero; c.globalAlpha = 0.8; c.font = `500 20px ${FONT}`; c.fillText('Tu cartera', hx + 34, hy + 50); c.globalAlpha = 1;
  c.font = `700 72px ${FONT}`; c.fillText(eur.format(t.value), hx + 32, hy + 118);
  c.font = `600 21px ${FONT}`;
  c.fillText(`${t.gain >= 0 ? '+' : ''}${eur.format(t.gain)} · ${((t.gain / t.netContributions) * 100).toLocaleString('es-ES', { maximumFractionDigits: 1 })} % desde el inicio`, hx + 34, hy + 172);
  // last 90 days
  const v = p.series.slice(-90).map((d) => d.value), lo = Math.min(...v), hi = Math.max(...v);
  const sx = hx + 34, sy = hy + 220, sw = hw - 68, sh = 170;
  c.strokeStyle = C.accent2; c.lineWidth = 4; c.beginPath();
  v.forEach((x, i) => { const px = sx + (i / (v.length - 1)) * sw, py = sy + sh - ((x - lo) / (hi - lo || 1)) * sh; i ? c.lineTo(px, py) : c.moveTo(px, py); });
  c.stroke();
  for (const [i, label] of ['Ver cartera', 'Plan del mes'].entries()) {
    const bx = hx + 34 + i * 180, by = hy + 412;
    c.fillStyle = 'rgba(255,255,255,0.93)'; round(c, bx, by, 166, 46, 23); c.fill();
    c.fillStyle = C.accent2; c.font = `600 18px ${FONT}`; c.textAlign = 'center'; c.fillText(label, bx + 83, by + 24); c.textAlign = 'left';
  }
  c.restore();

  // right: the split by block, and this month's contribution
  const card = (y: number, h: number, title: string) => {
    c.fillStyle = C.surface; round(c, 672, y, 380, h, 26); c.fill();
    c.fillStyle = C.ink; c.font = `600 21px ${FONT}`; c.fillText(title, 700, y + 38);
  };
  card(126, 236, 'Tu reparto');
  let a = -Math.PI / 2;
  for (const s of p.allocation.filter((x) => x.weight > 0.002)) {
    const a2 = a + s.weight * Math.PI * 2;
    c.strokeStyle = C[s.bucket as keyof typeof C] ?? C.ink3; c.lineWidth = 22; c.lineCap = 'butt';
    c.beginPath(); c.arc(774, 258, 58, a, a2 - 0.03); c.stroke();
    a = a2;
  }
  p.allocation.filter((x) => x.weight > 0.002).forEach((s, i) => {
    const y = 214 + i * 34;
    c.fillStyle = C[s.bucket as keyof typeof C] ?? C.ink3; round(c, 866, y - 7, 14, 14, 4); c.fill();
    c.fillStyle = C.ink; c.font = `500 17px ${FONT}`; c.fillText(NAME[s.bucket] ?? s.bucket, 890, y);
    c.font = `600 17px ${FONT}`; c.textAlign = 'right'; c.fillText(`${Math.round(s.weight * 100)} %`, 1030, y); c.textAlign = 'left';
  });
  card(376, 236, 'Este mes');
  c.fillStyle = C.ink2; c.font = `400 16px ${FONT}`; c.fillText(`Tus ${eur.format(MONTHLY)}, donde más hacen falta.`, 700, 440);
  Object.entries(plan).filter(([, x]) => x > 0.5).forEach(([key, x], i) => {
    const y = 486 + i * 46;
    c.fillStyle = C.ink; c.font = `500 18px ${FONT}`; c.fillText(NAME[key] ?? key, 700, y);
    c.font = `600 18px ${FONT}`; c.textAlign = 'right'; c.fillText(eur.format(x), 1024, y); c.textAlign = 'left';
    c.fillStyle = C[key as keyof typeof C] ?? C.ink3; round(c, 700, y + 14, 324 * (x / MONTHLY), 8, 4); c.fill();
  });
  c.restore();
}
