// The pavilion's screen (src/island/world.ts): WarrenIA's Radar drawn on a canvas from the same public
// extract the app reads (/warrenia-app/data/), with the companies' logos, so the app is already on
// the wall as the bull walks up, and the app (warrenia.ts) opens exactly over it.

import type { Radar, RadarRow } from '../../vendor/warrenia/web/lib/market/types';

const DATA = '/warrenia-app/data/';
const C = {
  canvas: '#f3f4f1', surface: '#ffffff', ink: '#111111', ink2: '#686b66', ink3: '#a0a39d', line: 'rgba(17,17,17,0.07)',
  accent: '#527f62', pos: '#2f8a57', posSoft: '#e8f2eb', thumb: '#ffffff', seg: '#e8eae5',
  av: ['#e6eee8', '#efe9dc', '#e7e4ef', '#f3e6e1', '#e3ecf0', '#ecebe3'],
};
const ACTION: Record<string, [string, string, string]> = {
  candidate: ['Buy candidate', '#e8f2eb', '#2f8a57'],
  wait: ['Wait for a dip', '#f5efe2', '#9c7a3c'],
  watch: ['Watch', '#e8eae5', '#686b66'],
  avoid: ['Avoid', '#f7ebe8', '#b5564b'],
  none: ['No signal', '#e8eae5', '#686b66'],
};
const FONT = '-apple-system, BlinkMacSystemFont, "Inter Variable", system-ui, sans-serif';
const pct = (v: number | null) => (v === null ? '—' : `${v >= 0 ? '+' : '−'}${Math.abs(v * 100).toFixed(1)}%`);

function round(c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  c.beginPath(); c.roundRect(x, y, w, h, r);
}

const image = (src: string) => new Promise<HTMLImageElement | null>((ok) => {
  const im = new Image();
  im.onload = () => ok(im);
  im.onerror = () => ok(null);
  im.src = src;
});

/** WarrenIA's mark: a rounded double U with two sage squares (web/components/shell/brand.tsx). */
export function drawMark(c: CanvasRenderingContext2D, x: number, y: number, size: number, ink: string, accent: string) {
  const k = size / 32;
  c.save(); c.translate(x, y); c.scale(k, k);
  c.strokeStyle = ink; c.lineWidth = 3.6; c.lineCap = 'round'; c.lineJoin = 'round';
  c.beginPath(); c.moveTo(6, 11.55); c.lineTo(6, 20.05); c.arc(11, 20.05, 5, Math.PI, 0, true); c.arc(21, 20.05, 5, Math.PI, 0, true); c.lineTo(26, 11.55); c.stroke();
  c.fillStyle = accent; round(c, 4.5, 5.15, 3, 3, 0.6); c.fill(); round(c, 24.5, 5.15, 3, 3, 0.6); c.fill();
  c.restore();
}

/** Draws the screen at the canvas's own size (designed for 1080 × 640). */
export async function drawScreen(canvas: HTMLCanvasElement) {
  const [radar, index] = await Promise.all([
    fetch(DATA + 'radar.json').then((r) => (r.ok ? (r.json() as Promise<Radar>) : null)),
    fetch(DATA + 'logos/index.json').then((r) => (r.ok ? (r.json() as Promise<{ have: string[] }>) : { have: [] })).catch(() => ({ have: [] })),
  ]);
  if (!radar) throw new Error('no data');
  const rows: RadarRow[] = radar.rows.filter((r) => r.cls === 'stock' && r.act === 'candidate').sort((a, b) => a.rank - b.rank).slice(0, 6);
  const have = new Set(index.have);
  const logos = await Promise.all(rows.map((r) => (have.has(r.t) ? image(`${DATA}logos/${encodeURIComponent(r.t)}.png`) : Promise.resolve(null))));

  const c = canvas.getContext('2d')!;
  const k = canvas.width / 1080;
  c.save();
  c.scale(k, k);
  c.fillStyle = C.canvas; c.fillRect(0, 0, 1080, 640);
  // top bar: the mark, the name and the tabs (Radar)
  c.fillStyle = C.surface; c.fillRect(0, 0, 1080, 70);
  c.fillStyle = C.line; c.fillRect(0, 70, 1080, 1);
  drawMark(c, 28, 19, 34, C.ink, C.accent);
  c.fillStyle = C.ink; c.font = `700 25px ${FONT}`; c.textBaseline = 'middle'; c.textAlign = 'left'; c.fillText('WarrenIA', 70, 37);
  c.fillStyle = C.seg; round(c, 470, 17, 450, 40, 20); c.fill();
  ['Home', 'Plan', 'Radar', 'Portfolio', 'Settings'].forEach((tab, i) => {
    const x = 516 + i * 88;
    if (tab === 'Radar') { c.fillStyle = C.thumb; round(c, x - 40, 21, 80, 32, 16); c.fill(); }
    c.fillStyle = tab === 'Radar' ? C.ink : C.ink2; c.font = `500 16px ${FONT}`; c.textAlign = 'center';
    c.fillText(tab, x, 37);
  });
  // title
  c.textAlign = 'left';
  c.fillStyle = C.ink; c.font = `700 38px ${FONT}`; c.fillText('Radar', 44, 112);
  c.fillStyle = C.ink2; c.font = `400 17px ${FONT}`;
  c.fillText(`Buy candidates · close of ${new Date(radar.asof + 'T12:00:00Z').toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}`, 44, 146);
  // the list
  c.fillStyle = C.surface; round(c, 44, 170, 992, 440, 24); c.fill();
  rows.forEach((r, i) => {
    const y = 210 + i * 70;
    if (i) { c.fillStyle = C.line; c.fillRect(64, y - 35, 952, 1); }
    c.fillStyle = C.ink3; c.font = `500 16px ${FONT}`; c.textAlign = 'center'; c.fillText(String(r.rank), 82, y);
    // avatar: logo on white, or initials on a soft tint
    c.save(); c.beginPath(); c.arc(132, y, 22, 0, Math.PI * 2); c.clip();
    const logo = logos[i];
    let h = 0; for (const ch of r.t) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
    c.fillStyle = logo ? '#fff' : C.av[h % C.av.length]; c.fillRect(110, y - 22, 44, 44);
    if (logo) c.drawImage(logo, 110, y - 22, 44, 44);
    else { c.fillStyle = 'rgba(17,17,17,0.75)'; c.font = `700 12px ${FONT}`; c.fillText(r.t.slice(0, 4), 132, y + 1); }
    c.restore();
    c.textAlign = 'left';
    c.fillStyle = C.ink; c.font = `600 19px ${FONT}`;
    let name = r.n;
    while (c.measureText(name).width > 430 && name.length > 4) name = name.slice(0, -2);
    c.fillText(name === r.n ? name : name.trimEnd() + '…', 172, y - 10);
    c.fillStyle = C.ink2; c.font = `400 15px ${FONT}`; c.fillText(r.t, 172, y + 14);
    const [label, bg, fg] = ACTION[r.act] ?? ACTION.none;
    c.font = `500 14px ${FONT}`;
    const w = c.measureText(label).width + 34;
    c.fillStyle = bg; round(c, 640, y - 15, w, 30, 15); c.fill();
    c.fillStyle = fg; c.beginPath(); c.arc(656, y, 3.5, 0, Math.PI * 2); c.fill();
    c.fillText(label, 666, y + 1);
    c.fillStyle = C.posSoft; round(c, 852, y - 15, 86, 30, 15); c.fill();
    c.fillStyle = C.pos; c.font = `600 15px ${FONT}`; c.textAlign = 'center'; c.fillText(pct(r.r6m), 895, y + 1);
    c.fillStyle = C.ink; c.font = `700 22px ${FONT}`; c.textAlign = 'right'; c.fillText(String(Math.round(r.ov)), 1006, y + 1);
  });
  c.restore();
}
