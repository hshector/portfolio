// The constellation page: a 3D sky of every published note. Owns the state (focus, filters,
// tour), the camera flights, the labels for each zoom level, picking and the reading panel.

import * as THREE from 'three';
import { THEMES } from '../lib/themes';
import { loadGraph, neighbours, type GraphData } from './data';
import { noteContent, prefetchNote } from './notes';
import { createSky, type Sky } from './scene';

const $ = <T extends Element>(sel: string) => document.querySelector<T>(sel)!;
const root = $<HTMLElement>('[data-constellation]');
const canvas = $<HTMLCanvasElement>('#sky');
const labelLayer = $<HTMLElement>('#labels');
const panel = $<HTMLElement>('#panel');
const searchInput = $<HTMLInputElement>('#search');
const searchList = $<HTMLUListElement>('#search-results');
const legend = $<HTMLElement>('#legend');
const debugBox = $<HTMLElement>('#debug');

const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
const debug = new URLSearchParams(location.search).has('debug');
const fmt = new Intl.NumberFormat('es-ES', { useGrouping: 'always' });

const fold = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

function webglAvailable(): boolean {
  try {
    return !!document.createElement('canvas').getContext('webgl2');
  } catch {
    return false;
  }
}

async function main() {
  if (!webglAvailable()) {
    root.dataset.state = 'fallback';
    return;
  }
  const g = await loadGraph();
  const themeOf = g.themeNames.map((name) => THEMES.find((t) => t.name === name)!);
  const sky = createSky(canvas, g, themeOf.map((t) => ({ color: t.color, ring: t.mark === 'ring' })));
  new App(g, sky, themeOf).start();
}

type Box = [left: number, top: number, right: number, bottom: number];
type LabelKind = 'hover' | 'focus' | 'near' | 'nearBook' | 'book' | 'concept' | 'theme';

/** Box height and maximum width of each kind of label; the look is in constelacion.astro. */
const LABEL_STYLE: Record<LabelKind, { cls: string; h: number; max: number }> = {
  theme: { cls: 'theme', h: 16, max: 400 },
  book: { cls: 'book', h: 16, max: 280 },
  nearBook: { cls: 'near book', h: 15, max: 270 },
  concept: { cls: 'concept', h: 14, max: 250 },
  near: { cls: 'near', h: 14, max: 250 },
  focus: { cls: 'focus', h: 24, max: 300 },
  hover: { cls: 'hover', h: 22, max: 280 },
};

interface Tour {
  book: number;
  stops: number[];
  index: number;
}

class App {
  private focus = -1;
  private hover = -1;
  private hidden = new Set<number>();
  private tour: Tour | null = null;
  private pointer = { x: 0, y: 0, inside: false, moved: false, downX: 0, downY: 0, down: false };
  private flight: { t: number; start: number; from: THREE.Vector3; to: THREE.Vector3; camFrom: THREE.Vector3; camTo: THREE.Vector3 } | null = null;
  private screen = new Float32Array(0);
  private labelEls = new Map<string, HTMLElement>();
  private widths = new Map<string, number>();
  private measurer = labelLayer.appendChild(document.createElement('div'));
  private blocked: Box[] = [];
  private blockedAt = 0;
  private lastInteraction = performance.now();
  private touched = false;
  private intro = reducedMotion ? 1 : 0;
  private startedAt = performance.now();
  private quality = 0;
  private fpsWindow = { t: performance.now(), frames: 0, fps: 60 };
  private lastNoteMs = 0;
  private searchHits: number[] = [];
  private searchActive = -1;
  private degree: Uint32Array;
  private books: number[];

  constructor(
    private g: GraphData,
    private sky: Sky,
    private themes: (typeof THEMES)[number][],
  ) {
    this.screen = new Float32Array(g.count * 3);
    this.degree = new Uint32Array(g.count);
    for (let i = 0; i < g.count; i++) this.degree[i] = g.adjStart[i + 1] - g.adjStart[i];
    this.books = [...Array(g.count).keys()].filter((i) => g.kinds[i] === 0);
  }

  start() {
    this.resize();
    new ResizeObserver(() => this.resize()).observe(canvas);
    this.bindPointer();
    this.bindSearch();
    this.bindLegend();
    this.bindKeys();
    this.sky.controls.addEventListener('start', () => {
      this.flight = null;
      this.touched = true;
      this.lastInteraction = performance.now();
    });
    window.addEventListener('hashchange', () => this.openFromHash());
    root.dataset.state = 'ready';
    // Widths measured before a font finished loading are wrong: measure again once it has.
    document.fonts.addEventListener('loadingdone', () => this.widths.clear());
    document.fonts.ready.then(() => this.widths.clear());
    window.addEventListener('resize', () => (this.blockedAt = 0));
    this.openFromHash();
    this.applyVisibility();
    this.sky.renderer.setAnimationLoop((t) => this.frame(t));
    (window as unknown as { __constellation: unknown }).__constellation = {
      focus: () => (this.focus >= 0 ? this.g.slugs[this.focus] : null),
      select: (slug: string) => this.select(this.g.indexOf.get(slug) ?? -1),
      visibleStars: () => this.sky.alpha.reduce((n, a) => n + (a > 0.5 ? 1 : 0), 0),
      fps: () => this.fpsWindow.fps,
      labels: () =>
        [...this.labelEls.values()]
          .filter((el) => el.classList.contains('on'))
          .map((el) => ({ text: el.textContent, kind: el.className.replace(/\b(label|on)\b/g, '').trim(), rect: el.getBoundingClientRect().toJSON() })),
      onScreen: () => {
        let n = 0;
        const w = canvas.clientWidth, h = canvas.clientHeight;
        for (let i = 0; i < this.g.count; i++) {
          const x = this.screen[i * 3], y = this.screen[i * 3 + 1];
          if (this.screen[i * 3 + 2] > 0 && x >= 0 && x <= w && y >= 0 && y <= h) n++;
        }
        return n;
      },
      zoom: (distance: number) => {
        const { camera, controls } = this.sky;
        camera.position.sub(controls.target).setLength(distance).add(controls.target);
      },
      quality: () => this.quality,
      starScreen: (slug: string) => {
        const i = this.g.indexOf.get(slug)!;
        return { x: this.screen[i * 3], y: this.screen[i * 3 + 1], visible: this.screen[i * 3 + 2] > 0 };
      },
    };
  }

  // ---------------------------------------------------------------- frame

  private frame(time: number) {
    const { controls, camera } = this.sky;
    if (this.intro < 1) {
      // Galaxies light up one after another over ~1.6 s, whatever the frame rate.
      this.intro = Math.min(1, (performance.now() - this.startedAt) / 1600);
      this.applyVisibility();
    }
    if (this.flight) this.stepFlight();
    const idle = performance.now() - this.lastInteraction > 9000;
    controls.autoRotate = idle && this.focus < 0 && !reducedMotion;
    controls.autoRotateSpeed = 0.25;
    controls.update();
    this.sky.render();
    this.project();
    if (this.pointer.moved) this.pick();
    this.drawLabels();
    this.measure(time);
    camera.updateMatrixWorld();
  }

  private measure(_time: number) {
    const w = this.fpsWindow;
    w.frames++;
    const now = performance.now();
    if (now - w.t > 1000) {
      w.fps = Math.round((w.frames * 1000) / (now - w.t));
      w.t = now;
      w.frames = 0;
      // Adaptive quality: after the intro, step down while the device stays under 45 fps.
      if (now - this.startedAt > 3000 && w.fps < 45 && this.quality < 2) this.setQuality(this.quality + 1);
      if (debug) {
        const info = this.sky.renderer.info.render;
        debugBox.hidden = false;
        debugBox.textContent = `${w.fps} fps · calidad ${['alta', 'media', 'baja'][this.quality]} · ${info.calls} draw calls · DPR ${this.sky.renderer.getPixelRatio()} · última nota ${this.lastNoteMs} ms`;
      }
    }
  }

  private setQuality(level: number) {
    this.quality = level;
    if (level >= 1) this.sky.renderer.setPixelRatio(1);
    this.resize();
    this.applyVisibility();
  }

  private resize() {
    const w = canvas.clientWidth, h = canvas.clientHeight;
    if (w && h) this.sky.resize(w, h);
    this.updateViewOffset();
    if (!this.touched && this.focus < 0) this.frameWholeSky();
  }

  /** Until the visitor moves the camera, keep the whole sky in view whatever the screen shape. */
  private frameWholeSky() {
    const { camera, controls } = this.sky;
    const radius = 78; // stars reach ±60 plus the glow of the theme nebulae
    const vfov = THREE.MathUtils.degToRad(camera.fov) / 2;
    const hfov = Math.atan(Math.tan(vfov) * camera.aspect);
    const dist = Math.max(155, radius / Math.tan(Math.min(vfov, hfov)));
    camera.position.sub(controls.target).setLength(dist).add(controls.target);
  }

  /** Centre the view on the part of the screen the reading panel leaves free. */
  private updateViewOffset() {
    const { camera } = this.sky;
    const w = canvas.clientWidth, h = canvas.clientHeight;
    if (panel.hidden || !w || !h) {
      camera.clearViewOffset();
      return;
    }
    const r = panel.getBoundingClientRect();
    const sheet = r.width > w * 0.8; // phones: the panel is a bottom sheet
    camera.setViewOffset(w, h, sheet ? 0 : r.width / 2, sheet ? Math.min(r.height, h * 0.6) / 2 : 0, w, h);
  }

  // ---------------------------------------------------------------- focus & visibility

  private select(i: number, opts: { fly?: boolean; keepTour?: boolean } = {}) {
    if (i === this.focus && i >= 0) return;
    this.focus = i;
    if (!opts.keepTour) this.tour = null;
    this.applyVisibility();
    if (i < 0) {
      this.closePanel();
      history.replaceState(null, '', location.pathname + location.search);
      return;
    }
    history.replaceState(null, '', `#${this.g.slugs[i]}`);
    this.touched = true;
    if (opts.fly !== false) this.flyTo(i);
    this.openPanel(i);
  }

  private applyVisibility() {
    const { g, sky } = this;
    const near = new Set<number>();
    if (this.focus >= 0) {
      near.add(this.focus);
      for (const j of neighbours(g, this.focus)) near.add(j);
    }
    for (let i = 0; i < g.count; i++) {
      let a = this.hidden.has(g.themes[i]) ? 0 : 1;
      if (a && this.focus >= 0 && !near.has(i)) a = 0.07;
      if (this.intro < 1) a *= THREE.MathUtils.clamp(this.intro * 2.2 - g.themes[i] * 0.18, 0, 1);
      sky.alpha[i] = a;
    }
    sky.commitAlpha();
    const baseOpacity = this.quality >= 2 ? 0.06 : 0.11;
    sky.setEdgeVisibility(
      (a, b) => (this.hidden.has(g.themes[a]) || this.hidden.has(g.themes[b]) ? 0 : 1) * this.intro,
      this.focus >= 0 ? 0.025 : baseOpacity,
    );
    if (this.focus >= 0) sky.setHighlight(this.focus, [...neighbours(g, this.focus)].filter((j) => !this.hidden.has(g.themes[j])));
    else sky.setHighlight(-1, []);
  }

  // ---------------------------------------------------------------- camera

  private flyTo(i: number) {
    const { camera, controls } = this.sky;
    const p = new THREE.Vector3().fromArray(this.g.positions, i * 3);
    const dist = this.g.kinds[i] === 0 ? 42 : 20;
    const dir = camera.position.clone().sub(controls.target).normalize();
    this.flyToPoint(p, p.clone().add(dir.multiplyScalar(dist)));
  }

  private flyToPoint(target: THREE.Vector3, camPos: THREE.Vector3) {
    const { camera, controls } = this.sky;
    this.flight = { t: 0, start: performance.now(), from: controls.target.clone(), to: target, camFrom: camera.position.clone(), camTo: camPos };
    if (reducedMotion) this.flight.t = 1;
    this.lastInteraction = performance.now();
    this.stepFlight();
  }

  private stepFlight() {
    const f = this.flight!;
    f.t = reducedMotion ? 1 : Math.min(1, (performance.now() - f.start) / 1100);
    const e = f.t < 0.5 ? 4 * f.t ** 3 : 1 - (-2 * f.t + 2) ** 3 / 2;
    this.sky.controls.target.lerpVectors(f.from, f.to, e);
    this.sky.camera.position.lerpVectors(f.camFrom, f.camTo, e);
    if (f.t >= 1) this.flight = null;
  }

  // ---------------------------------------------------------------- picking

  /** Screen position (CSS px) of every star, and whether it is in front of the camera. */
  private project() {
    const { camera } = this.sky;
    const w = canvas.clientWidth, h = canvas.clientHeight;
    const m = new THREE.Matrix4().multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse).elements;
    const pos = this.g.positions;
    for (let i = 0; i < this.g.count; i++) {
      const x = pos[i * 3], y = pos[i * 3 + 1], z = pos[i * 3 + 2];
      const cw = m[3] * x + m[7] * y + m[11] * z + m[15];
      const cx = (m[0] * x + m[4] * y + m[8] * z + m[12]) / cw;
      const cy = (m[1] * x + m[5] * y + m[9] * z + m[13]) / cw;
      this.screen[i * 3] = (cx * 0.5 + 0.5) * w;
      this.screen[i * 3 + 1] = (-cy * 0.5 + 0.5) * h;
      this.screen[i * 3 + 2] = cw > 0 && Math.abs(cx) < 1.1 && Math.abs(cy) < 1.1 ? cw : -1;
    }
  }

  private starRadius(i: number) {
    const depth = this.screen[i * 3 + 2];
    const px = (this.sky.size[i] * Math.max(320, canvas.clientHeight)) / 800 * (100 / depth);
    return THREE.MathUtils.clamp(px * 0.5, 7, 26);
  }

  private pick() {
    this.pointer.moved = false;
    let best = -1, bestD = Infinity;
    if (this.pointer.inside) {
      for (let i = 0; i < this.g.count; i++) {
        if (this.sky.alpha[i] < 0.5 || this.screen[i * 3 + 2] < 0) continue;
        const dx = this.screen[i * 3] - this.pointer.x, dy = this.screen[i * 3 + 1] - this.pointer.y;
        const d = Math.hypot(dx, dy);
        if (d < this.starRadius(i) && d - (this.g.kinds[i] === 0 ? 4 : 0) < bestD) {
          best = i;
          bestD = d;
        }
      }
    }
    if (best !== this.hover) {
      this.hover = best;
      canvas.style.cursor = best >= 0 ? 'pointer' : '';
      if (best >= 0) window.setTimeout(() => this.hover === best && prefetchNote(this.g.slugs[best]), 150);
    }
  }

  private bindPointer() {
    const local = (e: PointerEvent) => {
      const r = canvas.getBoundingClientRect();
      this.pointer.x = e.clientX - r.left;
      this.pointer.y = e.clientY - r.top;
    };
    canvas.addEventListener('pointermove', (e) => {
      local(e);
      this.pointer.inside = true;
      this.pointer.moved = true;
      this.lastInteraction = performance.now();
    });
    canvas.addEventListener('pointerleave', () => {
      this.pointer.inside = false;
      this.pointer.moved = true;
    });
    canvas.addEventListener('pointerdown', (e) => {
      local(e);
      this.pointer.down = true;
      this.pointer.downX = e.clientX;
      this.pointer.downY = e.clientY;
    });
    canvas.addEventListener('pointerup', (e) => {
      if (!this.pointer.down) return;
      this.pointer.down = false;
      if (Math.hypot(e.clientX - this.pointer.downX, e.clientY - this.pointer.downY) > 6) return;
      local(e);
      this.pointer.inside = true;
      this.pick();
      this.select(this.hover);
    });
  }

  // ---------------------------------------------------------------- labels (zoom levels)

  /**
   * Labels follow a star atlas: theme names in spaced small capitals at the centre of each galaxy,
   * star names set beside their star in the colour of their theme. Each zoom level shows its own
   * kind of label, labels never overlap each other or the interface, and they fade in and out.
   */
  private drawLabels() {
    const { g } = this;
    const dist = this.sky.camera.position.distanceTo(this.sky.controls.target);
    const now = performance.now();
    if (now - this.blockedAt > 500) this.updateBlocked(now);
    const placed: Box[] = [...this.blocked];
    const shown = new Set<string>();
    const fits = (b: Box) => b[0] > 4 && b[1] > 4 && b[2] < canvas.clientWidth - 4 && b[3] < canvas.clientHeight - 4 && !placed.some((o) => b[0] < o[2] && b[2] > o[0] && b[1] < o[3] && b[3] > o[1]);

    /** A star label sits to the right of its star, vertically centred on it. */
    const star = (i: number, kind: LabelKind, force = false) => {
      if (this.screen[i * 3 + 2] <= 0 || this.sky.alpha[i] < 0.5) return;
      const key = `s${i}`;
      if (shown.has(key)) return;
      const x = this.screen[i * 3], y = this.screen[i * 3 + 1];
      const text = this.shortTitle(i, kind === 'focus' || kind === 'hover');
      const style = LABEL_STYLE[g.kinds[i] === 0 && kind !== 'focus' && kind !== 'hover' ? (kind === 'near' ? 'nearBook' : 'book') : kind];
      const w = Math.min(this.textWidth(text, `label ${style.cls}`), style.max);
      const gap = Math.min(this.starRadius(i) * 0.55, 11) + 5;
      const box: Box = [x + gap, y - style.h / 2, x + gap + w, y + style.h / 2];
      if (!force && !fits(box)) return;
      placed.push(box);
      shown.add(key);
      this.showLabel(key, text, `label ${style.cls}`, box[0], box[1], this.themes[g.themes[i]].color, w);
    };

    if (this.hover >= 0) star(this.hover, 'hover', true);
    if (this.focus >= 0) {
      star(this.focus, 'focus', true);
      const ns = [...neighbours(g, this.focus)].sort((a, b) => g.kinds[a] - g.kinds[b] || this.degree[b] - this.degree[a]);
      for (const j of ns.slice(0, 30)) star(j, 'near');
    } else {
      // Level 1 (far): the galaxies by name. Level 2: their books. Level 3 (close): concepts.
      if (dist > 95) {
        const v = new THREE.Vector3();
        this.sky.centroids.forEach((c, t) => {
          if (this.hidden.has(t)) return;
          v.copy(c).project(this.sky.camera);
          if (v.z > 1) return;
          const style = LABEL_STYLE.theme;
          const text = this.themes[t].name.toUpperCase();
          const w = this.textWidth(text, 'label theme');
          const x = (v.x * 0.5 + 0.5) * canvas.clientWidth, y = (-v.y * 0.5 + 0.5) * canvas.clientHeight;
          // Two galaxies can line up from some angles: try just below, then just above.
          const box = [0, 20, -20]
            .map((dy): Box => [x - w / 2, y + dy - style.h / 2, x + w / 2, y + dy + style.h / 2])
            .find(fits);
          if (!box) return;
          placed.push(box);
          shown.add(`t${t}`);
          this.showLabel(`t${t}`, text, 'label theme', box[0], box[1], this.themes[t].color, w);
        });
      }
      const cx = canvas.clientWidth / 2, cy = canvas.clientHeight / 2;
      const central = (i: number) => Math.hypot(this.screen[i * 3] - cx, this.screen[i * 3 + 1] - cy) + this.screen[i * 3 + 2] * 2;
      if (dist < 125) {
        const books = this.books.filter((b) => this.screen[b * 3 + 2] > 0 && this.sky.alpha[b] > 0.5).sort((a, b) => central(a) - central(b));
        for (const b of books.slice(0, dist < 60 ? 6 : 10)) star(b, 'book');
      }
      if (dist < 55) {
        const cand: number[] = [];
        for (let i = 0; i < g.count; i++) if (g.kinds[i] === 1 && this.screen[i * 3 + 2] > 0 && this.sky.alpha[i] > 0.5) cand.push(i);
        cand.sort((a, b) => central(a) - central(b));
        for (const i of cand.slice(0, 40)) star(i, 'concept');
      }
    }

    // Fade out labels that are no longer shown; drop them once they have faded.
    for (const [key, el] of this.labelEls) {
      if (shown.has(key)) continue;
      if (el.classList.contains('on')) {
        el.classList.remove('on');
        el.dataset.off = String(now);
      } else if (now - Number(el.dataset.off) > 600) {
        el.remove();
        this.labelEls.delete(key);
      }
    }
  }

  private showLabel(key: string, text: string, cls: string, x: number, y: number, color: string, width: number) {
    let el = this.labelEls.get(key);
    if (!el) {
      el = document.createElement('div');
      labelLayer.appendChild(el);
      this.labelEls.set(key, el);
    }
    if (el.textContent !== text) el.textContent = text;
    const full = `${cls} on`;
    if (el.className !== full) el.className = full;
    el.style.setProperty('--c', color);
    el.style.width = `${Math.ceil(width)}px`;
    el.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0)`;
  }

  /**
   * Natural width of a label, measured with a hidden element that has the label's own classes,
   * so font loading, letter-spacing and padding are all accounted for. Cached per text.
   */
  private textWidth(text: string, cls: string) {
    const key = `${cls}|${text}`;
    let w = this.widths.get(key);
    if (w === undefined) {
      this.measurer.className = `${cls} measure`;
      this.measurer.textContent = text;
      w = this.measurer.getBoundingClientRect().width + 1;
      this.widths.set(key, w);
    }
    return w;
  }

  /** Screen areas labels must not cover: the top bar, the legend, the hint and the panel. */
  private updateBlocked(now: number) {
    this.blockedAt = now;
    const c = canvas.getBoundingClientRect();
    this.blocked = ['.bar > *', '#legend button', '.hint', '#panel', '#debug']
      .flatMap((sel) => [...document.querySelectorAll<HTMLElement>(sel)])
      .filter((el) => !el.hidden && el.offsetParent !== null)
      .map((el) => el.getBoundingClientRect())
      .filter((r) => r.width && r.height)
      .map((r): Box => [r.left - c.left - 8, r.top - c.top - 6, r.right - c.left + 8, r.bottom - c.top + 6]);
  }

  /**
   * Name shown on the sky. Books are stored as "Author - Title": the title alone reads better.
   * Long concept names drop a trailing "(…)" gloss, e.g. "Ley de Reforma Fiscal de 1986 (Tax Reform Act)".
   * Hover, focus and the panel always show the full name.
   */
  private shortTitle(i: number, full = false) {
    const t = this.g.titles[i];
    if (this.g.kinds[i] === 0) return t.split(' - ').slice(1).join(' - ') || t;
    if (full || t.length <= 30) return t;
    return t.replace(/\s*\([^()]*\)$/, '') || t;
  }

  // ---------------------------------------------------------------- reading panel

  private openPanel(i: number) {
    const { g } = this;
    const theme = this.themes[g.themes[i]];
    const isBook = g.kinds[i] === 0;
    const slug = g.slugs[i];
    const ns = [...neighbours(g, i)];
    const linkedBooks = ns.filter((j) => g.kinds[j] === 0);
    const linkedConcepts = ns.filter((j) => g.kinds[j] === 1).sort((a, b) => this.degree[b] - this.degree[a]);
    const item = (j: number) =>
      `<li><a href="/biblioteca/${g.slugs[j]}" data-star="${j}"><i style="--c:${this.themes[g.themes[j]].color}" data-mark="${this.themes[g.themes[j]].mark}"></i>${esc(g.titles[j])}</a></li>`;
    const tour = this.tour;
    panel.innerHTML = `
      <div class="panel-top">
        <span class="kind">${isBook ? 'Libro' : 'Concepto'}</span>
        <button type="button" class="close" data-action="close" aria-label="Cerrar">✕</button>
      </div>
      ${tour ? `<div class="tour"><button type="button" data-action="prev" ${tour.index === 0 ? 'disabled' : ''} aria-label="Anterior">←</button><span>Recorrido de «${esc(g.titles[tour.book].split(' - ').slice(1).join(' - '))}» · ${tour.index + 1} de ${tour.stops.length}</span><button type="button" data-action="next" ${tour.index === tour.stops.length - 1 ? 'disabled' : ''} aria-label="Siguiente">→</button></div>` : ''}
      <h2 tabindex="-1">${esc(isBook ? g.titles[i].split(' - ').slice(1).join(' - ') : g.titles[i])}</h2>
      ${isBook ? `<p class="byline">${esc(g.titles[i].split(' - ')[0])}</p>` : ''}
      <p class="chip" data-mark="${theme.mark}" style="--c:${theme.color}"><i></i>${esc(theme.name)}</p>
      <div class="actions">
        <a href="/biblioteca/${slug}">Abrir la página</a>
        ${isBook && linkedConcepts.length ? `<button type="button" data-action="tour">Recorrer este libro</button>` : ''}
      </div>
      <div class="prose" aria-busy="true"><p class="loading-text">Cargando la nota…</p></div>
      ${linkedBooks.length ? `<section><h3>${isBook ? 'Libros' : 'Aparece en'}</h3><ul class="links">${linkedBooks.map(item).join('')}</ul></section>` : ''}
      ${linkedConcepts.length ? `<section><h3>${isBook ? 'Conceptos de este libro' : 'Conexiones'} <span>${fmt.format(linkedConcepts.length)}</span></h3><ul class="links">${linkedConcepts.slice(0, 40).map(item).join('')}</ul>${linkedConcepts.length > 40 ? `<p class="more"><a href="/biblioteca/${slug}">Ver las ${fmt.format(linkedConcepts.length)} en la página</a></p>` : ''}</section>` : ''}
    `;
    panel.hidden = false;
    root.dataset.panel = 'open';
    this.blockedAt = 0;
    this.updateViewOffset();
    noteContent(slug)
      .then((note) => {
        if (this.focus !== i) return;
        this.lastNoteMs = note.ms;
        const prose = panel.querySelector<HTMLElement>('.prose')!;
        prose.innerHTML = note.html || '<p>Esta nota no tiene texto.</p>';
        prose.removeAttribute('aria-busy');
        // In the panel, Obsidian's "Aparece en" / "Conceptos relacionados" lists are already shown as stars.
        prose.querySelectorAll('h2').forEach((h) => {
          if (/^(Aparece en|Conceptos relacionados)$/.test(h.textContent ?? '')) {
            const list = h.nextElementSibling;
            if (list?.tagName === 'UL') list.remove();
            h.remove();
          }
        });
      })
      .catch(() => {
        const prose = panel.querySelector<HTMLElement>('.prose')!;
        prose.innerHTML = `<p>No se ha podido cargar la nota. <a href="/biblioteca/${slug}">Ábrela en su página</a>.</p>`;
        prose.removeAttribute('aria-busy');
      });
  }

  private closePanel() {
    panel.hidden = true;
    panel.innerHTML = '';
    delete root.dataset.panel;
    this.blockedAt = 0;
    this.updateViewOffset();
  }

  private startTour(book: number) {
    const stops = [...neighbours(this.g, book)].filter((j) => this.g.kinds[j] === 1).sort((a, b) => this.degree[b] - this.degree[a]).slice(0, 10);
    if (!stops.length) return;
    this.tour = { book, stops, index: 0 };
    stops.slice(0, 3).forEach((j) => prefetchNote(this.g.slugs[j]));
    this.focus = -1;
    this.select(stops[0], { keepTour: true });
  }

  private stepTour(delta: number) {
    const t = this.tour;
    if (!t) return;
    const next = t.index + delta;
    if (next < 0 || next >= t.stops.length) return;
    t.index = next;
    if (t.stops[next + 1] !== undefined) prefetchNote(this.g.slugs[t.stops[next + 1]]);
    this.select(t.stops[next], { keepTour: true });
  }

  // ---------------------------------------------------------------- search, legend, keys, URL

  private bindSearch() {
    const titles = this.g.titles.map(fold);
    const render = () => {
      searchList.innerHTML = this.searchHits
        .map((i, k) => {
          const t = this.themes[this.g.themes[i]];
          return `<li role="option" id="hit-${k}" data-star="${i}" aria-selected="${k === this.searchActive}"><i style="--c:${t.color}" data-mark="${t.mark}"></i><span>${esc(this.g.titles[i])}</span><small>${this.g.kinds[i] === 0 ? 'Libro' : t.name}</small></li>`;
        })
        .join('');
      searchList.hidden = this.searchHits.length === 0;
      searchInput.setAttribute('aria-expanded', String(this.searchHits.length > 0));
      if (this.searchActive >= 0) searchInput.setAttribute('aria-activedescendant', `hit-${this.searchActive}`);
      else searchInput.removeAttribute('aria-activedescendant');
    };
    const choose = (i: number) => {
      this.searchHits = [];
      this.searchActive = -1;
      render();
      searchInput.value = '';
      searchInput.blur();
      this.select(i);
    };
    searchInput.addEventListener('input', () => {
      const q = fold(searchInput.value.trim());
      if (q.length < 2) {
        this.searchHits = [];
      } else {
        const starts: number[] = [], contains: number[] = [];
        titles.forEach((t, i) => (t.startsWith(q) ? starts : t.includes(q) ? contains : null)?.push(i));
        const byKind = (a: number, b: number) => this.g.kinds[a] - this.g.kinds[b] || this.degree[b] - this.degree[a];
        this.searchHits = [...starts.sort(byKind), ...contains.sort(byKind)].slice(0, 8);
      }
      this.searchActive = this.searchHits.length ? 0 : -1;
      render();
    });
    searchInput.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        if (!this.searchHits.length) return;
        this.searchActive = (this.searchActive + (e.key === 'ArrowDown' ? 1 : -1) + this.searchHits.length) % this.searchHits.length;
        render();
      } else if (e.key === 'Enter' && this.searchActive >= 0) {
        e.preventDefault();
        choose(this.searchHits[this.searchActive]);
      } else if (e.key === 'Escape') {
        searchInput.value = '';
        this.searchHits = [];
        render();
      }
    });
    searchList.addEventListener('pointerdown', (e) => {
      const li = (e.target as HTMLElement).closest<HTMLElement>('[data-star]');
      if (!li) return;
      e.preventDefault();
      choose(Number(li.dataset.star));
    });
  }

  private bindLegend() {
    legend.addEventListener('click', (e) => {
      const btn = (e.target as HTMLElement).closest<HTMLButtonElement>('button[data-theme]');
      if (!btn) return;
      const t = this.g.themeNames.indexOf(btn.dataset.theme!);
      if (t < 0) return;
      if (this.hidden.has(t)) this.hidden.delete(t);
      else this.hidden.add(t);
      btn.setAttribute('aria-pressed', String(!this.hidden.has(t)));
      if (this.focus >= 0 && this.hidden.has(this.g.themes[this.focus])) this.select(-1);
      else this.applyVisibility();
    });
    panel.addEventListener('click', (e) => {
      const target = e.target as HTMLElement;
      const action = target.closest<HTMLElement>('[data-action]')?.dataset.action;
      if (action === 'close') return this.select(-1);
      if (action === 'tour') return this.startTour(this.focus);
      if (action === 'prev') return this.stepTour(-1);
      if (action === 'next') return this.stepTour(1);
      // Links between notes fly to the linked star instead of leaving the sky.
      const a = target.closest<HTMLAnchorElement>('a[href^="/biblioteca/"]');
      if (!a || a.closest('.actions') || a.closest('.more') || e.metaKey || e.ctrlKey || e.shiftKey) return;
      const j = a.dataset.star ? Number(a.dataset.star) : this.g.indexOf.get(a.getAttribute('href')!.slice('/biblioteca/'.length));
      if (j === undefined) return;
      e.preventDefault();
      if (this.hidden.has(this.g.themes[j])) {
        this.hidden.delete(this.g.themes[j]);
        legend.querySelector(`[data-theme="${this.g.themeNames[this.g.themes[j]]}"]`)?.setAttribute('aria-pressed', 'true');
      }
      this.select(j, { keepTour: !!this.tour && this.tour.stops.includes(j) });
    });
    panel.addEventListener('pointerover', (e) => {
      const a = (e.target as HTMLElement).closest<HTMLAnchorElement>('a[data-star]');
      if (a) prefetchNote(this.g.slugs[Number(a.dataset.star)]);
    });
  }

  private bindKeys() {
    window.addEventListener('keydown', (e) => {
      const typing = document.activeElement === searchInput;
      if (e.key === '/' && !typing) {
        e.preventDefault();
        searchInput.focus();
      } else if (e.key === 'Escape' && !typing) {
        this.select(-1);
      } else if (this.tour && !typing && (e.key === 'ArrowRight' || e.key === 'ArrowLeft')) {
        this.stepTour(e.key === 'ArrowRight' ? 1 : -1);
      }
    });
  }

  private openFromHash() {
    const slug = decodeURIComponent(location.hash.slice(1));
    if (!slug) return;
    const i = this.g.indexOf.get(slug);
    if (i !== undefined && i !== this.focus) this.select(i);
  }
}

main().catch((err) => {
  console.error(err);
  root.dataset.state = 'fallback';
});
