// The nebula: a 3D sky of every published note, with a panel beside it (src/components/ConstellationUI.astro).
// Owns the state (focus, hidden themes, tours and routes), the camera flights, the labels for each
// zoom level, picking, and what the panel shows: the library (themes, books, routes) or a star's card.

import * as THREE from 'three';
import { THEMES } from '../lib/themes';
import { loadGraph, neighbours, type GraphData } from './data';
import { noteContent, prefetchNote } from './notes';
import { ROUTES } from './routes';
import { createSky, type Sky } from './scene';
import { starColor } from './style';

// The interface is bound when the sky is mounted: on its own page, or inside the island
// (mountConstellation), where it shares the island's canvas and renderer.
let root: HTMLElement, canvas: HTMLCanvasElement, labelLayer: HTMLElement, panel: HTMLElement, home: HTMLElement, sidebar: HTMLElement;
let searchInput: HTMLInputElement, searchList: HTMLUListElement, legend: HTMLElement, debugBox: HTMLElement;
function bind(rootEl: HTMLElement, canvasEl: HTMLCanvasElement) {
  const $ = <T extends Element>(sel: string) => rootEl.querySelector<T>(sel)!;
  root = rootEl;
  canvas = canvasEl;
  labelLayer = $('#labels');
  panel = $('#panel');
  home = $('#home');
  sidebar = $('#sidebar');
  searchInput = $('#search');
  searchList = $('#search-results');
  legend = $('#legend');
  debugBox = $('#debug');
}
/** Inside the island, the sky only listens while it is showing. */
let active = true;
/** Inside the island, the URL is the island's: #observatorio and #observatorio/<note>. */
let hashPrefix = '';

const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
const debug = new URLSearchParams(location.search).has('debug');
/** ?calidad=alta keeps bloom and pulses on whatever the frame rate (to judge them on a slow machine). */
const pinnedQuality = new URLSearchParams(location.search).get('calidad') === 'alta';
const fmt = new Intl.NumberFormat('es-ES', { useGrouping: 'always' });
const DATED = /\b(1[5-9]\d\d|20[0-2]\d)\b/;

const fold = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
const ICON = {
  back: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="m15 6-6 6 6 6"/></svg>',
  play: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5.5v13l11-6.5z"/></svg>',
  chev: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="m9 6 6 6-6 6"/></svg>',
};

function webglAvailable(): boolean {
  try {
    return !!document.createElement('canvas').getContext('webgl2');
  } catch {
    return false;
  }
}

/** The stand-alone /constelacion page. */
export async function startConstellationPage() {
  bind(document.querySelector<HTMLElement>('[data-constellation]')!, document.querySelector<HTMLCanvasElement>('#sky')!);
  try {
    if (!webglAvailable()) {
      root.dataset.state = 'fallback';
      return;
    }
    const g = await loadGraph();
    const themeOf = g.themeNames.map((name) => THEMES.find((t) => t.name === name)!);
    const sky = createSky(canvas, g, themeOf.map((t) => ({ color: t.color, ring: t.mark === 'ring' })));
    new App(g, sky, themeOf).start(true);
  } catch (err) {
    console.error(err);
    root.dataset.state = 'fallback';
  }
}

export interface MountedSky {
  /** Show the sky, with its camera where cameraStart() said, and take the input. */
  enter(slug?: string): void;
  /** Hide it and give the input back to the island. */
  exit(): void;
  /** Draw one frame (the island calls this while the sky is showing). */
  frame(time: number): void;
  /** Where the sky's camera starts (for the island's morph): position, rotation and field of view. */
  cameraStart(): { position: THREE.Vector3; quaternion: THREE.Quaternion; fov: number };
  /** Point size scale the sky uses (CSS px per size unit at distance 100). */
  pointScale(): number;
  sizes: Float32Array;
  colors: THREE.Color[];
  count: number;
  positions: Float32Array;
}

/** The sky inside the island: same canvas and renderer, hidden until the visitor goes up the observatory. */
export async function mountConstellation(rootEl: HTMLElement, canvasEl: HTMLCanvasElement, renderer: THREE.WebGLRenderer): Promise<MountedSky> {
  bind(rootEl, canvasEl);
  active = false;
  hashPrefix = 'observatorio/';
  const g = await loadGraph();
  const themeOf = g.themeNames.map((name) => THEMES.find((t) => t.name === name)!);
  const sky = createSky(canvas, g, themeOf.map((t) => ({ color: t.color, ring: t.mark === 'ring' })), renderer);
  const app = new App(g, sky, themeOf);
  app.start(false);
  sky.controls.enabled = false;
  return {
    enter(slug) {
      active = true;
      sky.controls.enabled = true;
      root.hidden = false;
      // The stars arrive from the island where the sky's camera sees them with the whole screen;
      // the panel slides in afterwards and the view moves aside to make room for it.
      app.setPanel(false, true);
      requestAnimationFrame(() => (root.dataset.state = 'ready'));
      app.resetView();
      if (slug) app.selectSlug(slug);
      app.fadeGlowIn();
      setTimeout(() => active && app.setPanel(true), reducedMotion ? 0 : 450);
    },
    exit() {
      app.selectSlug(null);
      active = false;
      sky.controls.enabled = false;
      root.dataset.state = 'idle';
      root.hidden = true;
    },
    frame: (t) => app.frame(t),
    cameraStart() {
      app.setPanel(false, true);
      app.resetView();
      sky.camera.updateMatrixWorld();
      return { position: sky.camera.position.clone(), quaternion: sky.camera.quaternion.clone(), fov: sky.camera.fov };
    },
    pointScale: () => sky.scale(),
    sizes: sky.size,
    colors: [...Array(g.count).keys()].map((i) => starColor(g, i, themeOf[g.themes[i]].color)),
    count: g.count,
    positions: g.positions,
  };
}

type Box = [left: number, top: number, right: number, bottom: number];
type LabelKind = 'hover' | 'focus' | 'near' | 'nearBook' | 'book' | 'concept' | 'theme';

/** Box height and maximum width of each kind of label; the look is in ConstellationUI.astro. */
const LABEL_STYLE: Record<LabelKind, { cls: string; h: number; max: number }> = {
  theme: { cls: 'theme', h: 28, max: 260 },
  book: { cls: 'book', h: 16, max: 260 },
  nearBook: { cls: 'near book', h: 16, max: 250 },
  concept: { cls: 'concept', h: 16, max: 230 },
  near: { cls: 'near', h: 16, max: 230 },
  focus: { cls: 'focus', h: 22, max: 300 },
  hover: { cls: 'hover', h: 26, max: 300 },
};

interface Tour {
  /** A book's main ideas, or a suggested route (title). */
  book: number;
  title?: string;
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
  private ownLoop = true;
  private fpsWindow = { t: performance.now(), frames: 0, fps: 60 };
  private lastNoteMs = 0;
  private searchHits: number[] = [];
  private searchActive = -1;
  private degree: Uint32Array;
  private books: number[];
  /** Number of books each note is linked to (for concepts: in how many books it appears). */
  private bookCount: Uint16Array;
  private themeBooks: number[];
  /** Where the free part of the screen is, beside the panel (current and target, CSS px). */
  private shift = { x: 0, y: 0, tx: 0, ty: 0 };
  private lastFrame = performance.now();
  private glowFrom = 0;

  constructor(
    private g: GraphData,
    private sky: Sky,
    private themes: (typeof THEMES)[number][],
  ) {
    this.screen = new Float32Array(g.count * 3);
    this.degree = new Uint32Array(g.count);
    this.bookCount = new Uint16Array(g.count);
    for (let i = 0; i < g.count; i++) {
      this.degree[i] = g.adjStart[i + 1] - g.adjStart[i];
      for (const j of neighbours(g, i)) if (g.kinds[j] === 0) this.bookCount[i]++;
    }
    this.books = [...Array(g.count).keys()].filter((i) => g.kinds[i] === 0);
    this.themeBooks = themes.map((_, t) => this.books.filter((b) => g.themes[b] === t).length);
  }

  /** ownLoop: the stand-alone page draws its own frames; inside the island the island calls frame(). */
  start(ownLoop: boolean) {
    this.ownLoop = ownLoop;
    this.resize();
    new ResizeObserver(() => this.resize()).observe(canvas);
    this.bindPointer();
    this.bindSearch();
    this.bindLegend();
    this.bindPanel();
    this.bindKeys();
    this.sky.controls.addEventListener('start', () => {
      this.flight = null;
      this.touched = true;
      this.lastInteraction = performance.now();
    });
    window.addEventListener('hashchange', () => active && this.openFromHash());
    if (ownLoop) root.dataset.state = 'ready';
    // Widths measured before a font finished loading are wrong: measure again once it has.
    document.fonts.addEventListener('loadingdone', () => this.widths.clear());
    document.fonts.ready.then(() => this.widths.clear());
    window.addEventListener('resize', () => (this.blockedAt = 0));
    // a suggested route is shown only if every step shares ideas with the next
    root.querySelectorAll<HTMLElement>('[data-route]').forEach((el) => (el.hidden = !this.routeStops(Number(el.dataset.route))));
    if (ownLoop) this.openFromHash();
    this.applyVisibility();
    if (ownLoop) this.sky.renderer.setAnimationLoop((t) => this.frame(t));
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
        const free = this.freeArea();
        for (let i = 0; i < this.g.count; i++) {
          const x = this.screen[i * 3], y = this.screen[i * 3 + 1];
          if (this.screen[i * 3 + 2] > 0 && x >= free.left && x <= free.right && y >= free.top && y <= free.bottom) n++;
        }
        return n;
      },
      zoom: (distance: number) => {
        const { camera, controls } = this.sky;
        this.touched = true; // (as when the visitor zooms: the view stops framing the whole sky)
        camera.position.sub(controls.target).setLength(distance).add(controls.target);
      },
      quality: () => this.quality,
      panel: () => root.dataset.panel,
      starScreen: (slug: string) => {
        const i = this.g.indexOf.get(slug)!;
        return { x: this.screen[i * 3], y: this.screen[i * 3 + 1], visible: this.screen[i * 3 + 2] > 0 };
      },
    };
  }

  // ---------------------------------------------------------------- frame

  /** The camera back to its starting pose, the whole sky in view. */
  resetView() {
    this.touched = false;
    this.flight = null;
    this.intro = 1;
    this.sky.controls.target.set(0, 0, 0);
    this.sky.camera.position.set(0, 25, 155);
    this.shift.x = this.shift.tx;
    this.shift.y = this.shift.ty;
    this.resize();
    this.sky.controls.update();
  }

  /** Gas, lines and bloom light up over a second (the stars arrive first, from the island's sky). */
  fadeGlowIn() {
    this.glowFrom = performance.now();
    this.sky.setGlow(0);
  }

  selectSlug(slug: string | null) {
    this.select(slug === null ? -1 : this.g.indexOf.get(slug) ?? -1);
  }

  /** The panel open or folded away (instant: no slide, for the island's hand-over). */
  setPanel(open: boolean, instant = false) {
    root.dataset.panel = open ? 'open' : 'collapsed';
    root.querySelectorAll('[data-action="toggle-panel"]').forEach((b) => {
      b.setAttribute('aria-label', open ? 'Ocultar el panel' : 'Mostrar el panel');
      b.setAttribute('aria-expanded', String(open));
    });
    this.blockedAt = 0;
    const settle = () => {
      this.updateViewOffset();
      if (!instant) return;
      Object.assign(this.shift, { x: this.shift.tx, y: this.shift.ty });
      this.applyShift();
    };
    settle();
    // (and again once the browser has laid the panel out at its new size)
    requestAnimationFrame(settle);
  }

  frame(time: number) {
    const { controls, camera } = this.sky;
    const now = performance.now(), dt = Math.min(0.1, (now - this.lastFrame) / 1000);
    this.lastFrame = now;
    if (this.intro < 1) {
      // Galaxies light up one after another over ~1.6 s, whatever the frame rate.
      this.intro = Math.min(1, (now - this.startedAt) / 1600);
      this.applyVisibility();
    }
    if (this.flight) this.stepFlight();
    if (this.glowFrom) {
      const f = Math.min(1, (now - this.glowFrom) / 1200);
      this.sky.setGlow(f);
      if (f >= 1) this.glowFrom = 0;
    }
    // the view glides aside when the panel opens or folds
    const k = reducedMotion ? 1 : 1 - Math.exp(-dt * 9);
    if (Math.abs(this.shift.tx - this.shift.x) + Math.abs(this.shift.ty - this.shift.y) > 0.3) {
      this.shift.x += (this.shift.tx - this.shift.x) * k;
      this.shift.y += (this.shift.ty - this.shift.y) * k;
      this.applyShift();
      if (!this.touched && this.focus < 0) this.frameWholeSky();
    }
    const idle = now - this.lastInteraction > 9000;
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
      if (!pinnedQuality && now - this.startedAt > 3000 && w.fps < 45 && this.quality < 2) this.setQuality(this.quality + 1);
      if (debug) {
        const info = this.sky.renderer.info.render;
        debugBox.hidden = false;
        debugBox.textContent = `${w.fps} fps · calidad ${['alta', 'media', 'baja'][this.quality]} · ${info.calls} draw calls · DPR ${this.sky.renderer.getPixelRatio()} · última nota ${this.lastNoteMs} ms`;
      }
    }
  }

  /** Step 1: no bloom. Step 2: no pulses and (own page only) one pixel per CSS pixel. */
  private setQuality(level: number) {
    this.quality = level;
    this.sky.setBloom(level < 1);
    this.sky.setPulsesOn(level < 2 && !reducedMotion);
    if (level >= 2 && this.ownLoop) this.sky.renderer.setPixelRatio(1);
    this.resize();
  }

  private resize() {
    const w = canvas.clientWidth, h = canvas.clientHeight;
    if (w && h) this.sky.resize(w, h);
    this.updateViewOffset();
    this.applyShift();
    if (!this.touched && this.focus < 0) this.frameWholeSky();
  }

  /** The part of the screen the panel leaves free (CSS px, relative to the canvas). */
  private freeArea() {
    const w = canvas.clientWidth, h = canvas.clientHeight;
    const area = { left: 0, top: 0, right: w, bottom: h };
    if (root.hidden) return area;
    const c = canvas.getBoundingClientRect(), r = sidebar.getBoundingClientRect();
    if (!r.width) return area;
    if (r.width > w * 0.8) area.bottom = Math.max(h * 0.35, r.top - c.top); // phones: a sheet along the bottom
    else area.left = Math.min(w * 0.6, r.right - c.left);
    return area;
  }

  /** Until the visitor moves the camera, keep the whole sky in view in the free part of the screen. */
  private frameWholeSky() {
    const { camera, controls } = this.sky;
    const free = this.freeArea(), h = canvas.clientHeight || 1;
    const radius = 70; // stars reach ±60, plus a margin for their glow
    const vfov = THREE.MathUtils.degToRad(camera.fov) / 2;
    const fh = (free.bottom - free.top) / h, fw = (free.right - free.left) / h;
    const half = Math.min(Math.atan(Math.tan(vfov) * fh), Math.atan(Math.tan(vfov) * fw));
    const dist = Math.max(140, radius / Math.tan(half));
    camera.position.sub(controls.target).setLength(dist).add(controls.target);
  }

  /** Centre the view on the free part of the screen. */
  private updateViewOffset() {
    const w = canvas.clientWidth, h = canvas.clientHeight;
    const free = this.freeArea();
    this.shift.tx = -(free.left + free.right - w) / 2;
    this.shift.ty = -(free.top + free.bottom - h) / 2;
  }

  private applyShift() {
    const { camera } = this.sky;
    const w = canvas.clientWidth, h = canvas.clientHeight;
    if (!w || !h) return;
    if (Math.abs(this.shift.x) < 0.5 && Math.abs(this.shift.y) < 0.5) camera.clearViewOffset();
    else camera.setViewOffset(w, h, this.shift.x, this.shift.y, w, h);
  }

  // ---------------------------------------------------------------- focus & visibility

  private select(i: number, opts: { fly?: boolean; keepTour?: boolean } = {}) {
    if (i === this.focus && i >= 0) return;
    this.focus = i;
    if (!opts.keepTour) this.tour = null;
    this.applyVisibility();
    if (i < 0) {
      this.closePanel();
      history.replaceState(null, '', location.pathname + location.search + (hashPrefix ? `#${hashPrefix.slice(0, -1)}` : ''));
      return;
    }
    history.replaceState(null, '', `#${hashPrefix}${this.g.slugs[i]}`);
    this.touched = true;
    if (root.dataset.panel !== 'open') this.setPanel(true);
    if (opts.fly !== false) this.flyTo(i);
    this.openPanel(i);
  }

  /** The ideas the focused star is joined to by a line: a book's ten most shared ideas, or a concept's links. */
  private mainLinks(i: number) {
    const { g } = this;
    const ns = [...neighbours(g, i)].filter((j) => !this.hidden.has(g.themes[j]));
    if (g.kinds[i] === 1) return ns.slice(0, 30);
    return ns.filter((j) => g.kinds[j] === 1).sort((a, b) => this.bookCount[b] - this.bookCount[a] || this.degree[b] - this.degree[a]).slice(0, 10);
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
    this.applyLinks();
    // the pulses run out of the chosen star along its links, or over the whole (visible) network
    const ends = sky.linkEnds, list: number[] = [];
    for (let e = 0; e < ends.length / 2; e++) {
      const a = ends[e * 2], b = ends[e * 2 + 1];
      if (this.focus >= 0 ? a === this.focus || b === this.focus : this.hidden.size > 0 && !this.hidden.has(g.themes[a]) && !this.hidden.has(g.themes[b]) && g.kinds[a] === 1 && g.kinds[b] === 1) list.push(e);
    }
    sky.setPulses(list, this.focus);
  }

  /**
   * The links, as in Obsidian: all of them at rest; the chosen (or hovered) star's lit up, wider and
   * brighter, and the rest dimmed. Hidden themes take their links with them.
   */
  private linkVis = new Float32Array(0);
  private applyLinks() {
    const { g, sky } = this, ends = sky.linkEnds, m = ends.length / 2;
    if (this.linkVis.length !== m) this.linkVis = new Float32Array(m);
    const lit = this.focus >= 0 ? this.focus : this.hover;
    // a book has hundreds of links: its main ideas' are the bright ones, the rest only a little
    const main = new Set(this.focus >= 0 && g.kinds[this.focus] === 0 ? this.mainLinks(this.focus) : []);
    for (let e = 0; e < m; e++) {
      const a = ends[e * 2], b = ends[e * 2 + 1];
      let v = this.hidden.has(g.themes[a]) || this.hidden.has(g.themes[b]) ? 0 : Math.min(sky.alpha[a], sky.alpha[b], 1);
      if (v > 0 && lit >= 0) {
        if (a === lit || b === lit) v = main.size && !main.has(a === lit ? b : a) ? 1.04 : 2;
        else v = this.focus >= 0 ? 0.1 : 0.4;
      }
      this.linkVis[e] = v;
    }
    sky.setLinks(this.linkVis);
  }

  // ---------------------------------------------------------------- camera

  private flyTo(i: number) {
    const { camera, controls } = this.sky;
    const p = new THREE.Vector3().fromArray(this.g.positions, i * 3);
    const dist = this.g.kinds[i] === 0 ? 42 : 22;
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

  /** To a theme's galaxy (its card in the panel). */
  private flyToTheme(t: number) {
    const { camera, controls } = this.sky;
    if (this.focus >= 0) this.select(-1);
    if (this.hidden.has(t)) this.toggleTheme(t);
    this.touched = true;
    const c = this.sky.centroids[t];
    const dir = camera.position.clone().sub(controls.target).normalize();
    this.flyToPoint(c.clone(), c.clone().add(dir.multiplyScalar(70)));
  }

  private zoomBy(f: number) {
    const { camera, controls } = this.sky;
    this.touched = true;
    const to = camera.position.clone().sub(controls.target).multiplyScalar(f);
    to.setLength(THREE.MathUtils.clamp(to.length(), controls.minDistance, controls.maxDistance)).add(controls.target);
    this.flyToPoint(controls.target.clone(), to);
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
      if (this.focus < 0) this.applyLinks();
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
      if (!active) return;
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
      if (!active) return;
      local(e);
      this.pointer.down = true;
      this.pointer.downX = e.clientX;
      this.pointer.downY = e.clientY;
    });
    canvas.addEventListener('pointerup', (e) => {
      if (!active || !this.pointer.down) return;
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
   * Quiet labels, as in Apple's Embedding Atlas: the system face, small, with a dark halo. From afar,
   * each galaxy's theme as a pill with its number of books, and the biggest books by name; closer,
   * the books and then the ideas nearest the centre of the view; a chosen star, its name and those
   * of its main ideas. Labels never overlap each other or the interface, and they fade in and out.
   */
  private drawLabels() {
    const { g } = this;
    const dist = this.sky.camera.position.distanceTo(this.sky.controls.target);
    const now = performance.now();
    if (now - this.blockedAt > 500) this.updateBlocked(now);
    const placed: Box[] = [...this.blocked];
    const shown = new Set<string>();
    const W = canvas.clientWidth, H = canvas.clientHeight;
    const fits = (b: Box) => b[0] > 4 && b[1] > 4 && b[2] < W - 4 && b[3] < H - 4 && !placed.some((o) => b[0] < o[2] && b[2] > o[0] && b[1] < o[3] && b[3] > o[1]);

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

    if (this.hover >= 0 && this.hover !== this.focus) star(this.hover, 'hover', true);
    if (this.focus >= 0) {
      star(this.focus, 'focus', true);
      for (const j of this.mainLinks(this.focus)) star(j, 'near');
    } else {
      // The galaxies, while their names still fit the view.
      if (dist > 80) {
        const v = new THREE.Vector3();
        this.sky.centroids.forEach((c, t) => {
          if (this.hidden.has(t)) return;
          v.copy(c).project(this.sky.camera);
          if (v.z > 1) return;
          const style = LABEL_STYLE.theme, theme = this.themes[t];
          const html = `<i></i>${esc(theme.name)}<b>${this.themeBooks[t]}</b>`;
          const w = this.textWidth(html, 'label theme', true);
          const x = (v.x * 0.5 + 0.5) * W, y = (-v.y * 0.5 + 0.5) * H;
          // Two galaxies can line up from some angles: try just below, then just above.
          const box = [0, 30, -30].map((dy): Box => [x - w / 2, y + dy - style.h / 2, x + w / 2, y + dy + style.h / 2]).find(fits);
          if (!box) return;
          placed.push(box);
          shown.add(`t${t}`);
          this.showLabel(`t${t}`, theme.name, 'label theme', box[0], box[1], theme.color, w, html, theme.mark);
        });
      }
      // Books: from afar the biggest ones; closer, the ones nearest the centre of the view.
      const free = this.freeArea(), fx = (free.left + free.right) / 2, fy = (free.top + free.bottom) / 2;
      const central = (i: number) => Math.hypot(this.screen[i * 3] - fx, this.screen[i * 3 + 1] - fy) + this.screen[i * 3 + 2] * 2;
      const visibleBooks = this.books.filter((b) => this.screen[b * 3 + 2] > 0 && this.sky.alpha[b] > 0.5);
      const far = dist > 110;
      visibleBooks.sort((a, b) => (far ? this.degree[b] - this.degree[a] : central(a) - central(b)));
      for (const b of visibleBooks.slice(0, far ? (W < 720 ? 6 : 14) : dist < 60 ? 6 : 10)) star(b, 'book');
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

  private showLabel(key: string, text: string, cls: string, x: number, y: number, color: string, width: number, html?: string, mark?: string) {
    let el = this.labelEls.get(key);
    if (!el) {
      el = document.createElement('div');
      labelLayer.appendChild(el);
      this.labelEls.set(key, el);
    }
    if (html !== undefined) {
      if (el.dataset.html !== html) { el.innerHTML = html; el.dataset.html = html; }
    } else if (el.textContent !== text) el.textContent = text;
    const full = `${cls} on`;
    if (el.className !== full) el.className = full;
    if (mark) el.dataset.mark = mark;
    el.style.setProperty('--c', color);
    el.style.width = `${Math.ceil(width)}px`;
    el.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0)`;
  }

  /**
   * Natural width of a label, measured with a hidden element that has the label's own classes,
   * so font loading, letter-spacing and padding are all accounted for. Cached per text.
   */
  private textWidth(text: string, cls: string, html = false) {
    const key = `${cls}|${text}`;
    let w = this.widths.get(key);
    if (w === undefined) {
      this.measurer.className = `${cls} measure`;
      if (html) this.measurer.innerHTML = text;
      else this.measurer.textContent = text;
      w = this.measurer.getBoundingClientRect().width + 1;
      this.widths.set(key, w);
    }
    return w;
  }

  /** Screen areas labels must not cover: the panel and the floating controls. */
  private updateBlocked(now: number) {
    this.blockedAt = now;
    const c = canvas.getBoundingClientRect();
    this.blocked = ['#sidebar', '#legend', '.zoom', '.hint', '#debug']
      .flatMap((sel) => [...root.querySelectorAll<HTMLElement>(sel)])
      .filter((el) => !el.hidden && el.offsetParent !== null && getComputedStyle(el).display !== 'none')
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
    if (this.g.kinds[i] === 0) return this.bookTitle(i);
    if (full || t.length <= 30) return t;
    return t.replace(/\s*\([^()]*\)$/, '') || t;
  }

  private bookTitle(i: number) {
    const t = this.g.titles[i];
    return t.split(' - ').slice(1).join(' - ') || t;
  }

  // ---------------------------------------------------------------- the panel

  /** Books that share ideas with book b, and how many, most first. */
  private relatedBooks(b: number) {
    const count = new Map<number, number>();
    for (const c of neighbours(this.g, b)) {
      if (this.g.kinds[c] !== 1) continue;
      for (const o of neighbours(this.g, c)) if (o !== b && this.g.kinds[o] === 0) count.set(o, (count.get(o) ?? 0) + 1);
    }
    return [...count].sort((x, y) => y[1] - x[1]);
  }

  private routeStops(k: number): number[] | null {
    const r = ROUTES[k];
    if (!r) return null;
    const stops = r.books.map((s) => this.g.indexOf.get(s));
    if (stops.some((i) => i === undefined)) return null;
    for (let s = 0; s < stops.length - 1; s++) if (!this.relatedBooks(stops[s]!).some(([o]) => o === stops[s + 1])) return null;
    return stops as number[];
  }

  private openPanel(i: number) {
    const { g } = this;
    const theme = this.themes[g.themes[i]];
    const isBook = g.kinds[i] === 0;
    const slug = g.slugs[i];
    const ns = [...neighbours(g, i)];
    const concepts = ns.filter((j) => g.kinds[j] === 1).sort((a, b) => this.bookCount[b] - this.bookCount[a] || this.degree[b] - this.degree[a]);
    const linkedBooks = ns.filter((j) => g.kinds[j] === 0);
    const dot = (j: number) => `<i style="--c:${this.themes[g.themes[j]].color}" data-mark="${this.themes[g.themes[j]].mark}"></i>`;
    const link = (j: number, sub = '') =>
      `<li><a href="/biblioteca/${g.slugs[j]}" data-star="${j}">${dot(j)}<span>${esc(g.kinds[j] === 0 ? this.bookTitle(j) : g.titles[j])}${sub ? `<small>${sub}</small>` : ''}</span></a></li>`;
    const tour = this.tour;
    const info = g.bookInfo.get(i);
    let stats: [string, string][], byline: string, sections = '';
    if (isBook) {
      const related = this.relatedBooks(i);
      stats = [[fmt.format(concepts.length), 'ideas'], [fmt.format(related.length), related.length === 1 ? 'libro afín' : 'libros afines'], [fmt.format(concepts.filter((j) => DATED.test(g.titles[j])).length), 'fechas']];
      byline = [info?.author ?? g.titles[i].split(' - ')[0], info?.year].filter(Boolean).join(' · ');
      sections += `<section><h3>Ideas principales</h3><div class="ideas">${concepts.slice(0, 8).map((j) => `<a href="/biblioteca/${g.slugs[j]}" data-star="${j}">${esc(this.shortTitle(j))}</a>`).join('')}</div></section>`;
      if (related.length) sections += `<section><h3>Conectado con <span>${related.length}</span></h3><ul class="links">${related.slice(0, 6).map(([j, n]) => link(j, `${g.bookInfo.get(j)?.author ?? ''} · ${n} ${n === 1 ? 'idea' : 'ideas'} en común`)).join('')}</ul></section>`;
    } else {
      stats = [[fmt.format(linkedBooks.length), linkedBooks.length === 1 ? 'libro' : 'libros'], [fmt.format(concepts.length), 'ideas enlazadas']];
      byline = `Idea · ${theme.name}`;
      if (linkedBooks.length) sections += `<section><h3>Aparece en</h3><ul class="links">${linkedBooks.map((j) => link(j, g.bookInfo.get(j)?.author ?? '')).join('')}</ul></section>`;
    }
    const allIdeas = concepts.length
      ? `<section><h3>${isBook ? 'Todas sus ideas' : 'Ideas enlazadas'} <span>${fmt.format(concepts.length)}</span></h3><ul class="links">${concepts.slice(0, hashPrefix ? Infinity : 60).map((j) => link(j)).join('')}</ul>${!hashPrefix && concepts.length > 60 ? `<p class="more"><a href="/biblioteca/${slug}">Ver las ${fmt.format(concepts.length)} en su página</a></p>` : ''}</section>`
      : '';
    const tourTitle = tour ? (tour.title ? `«${esc(tour.title)}»` : `Ideas de «${esc(this.bookTitle(tour.book))}»`) : '';
    panel.innerHTML = `
      <button type="button" class="back-link" data-action="close" style="--c:${theme.color}">${ICON.back}Biblioteca</button>
      ${tour ? `<div class="tour"><button type="button" data-action="prev" ${tour.index === 0 ? 'disabled' : ''} aria-label="Anterior">←</button><span>${tourTitle} · ${tour.index + 1} de ${tour.stops.length}</span><button type="button" data-action="next" ${tour.index === tour.stops.length - 1 ? 'disabled' : ''} aria-label="Siguiente">→</button></div>` : ''}
      <div class="head">
        <p class="chip" data-mark="${theme.mark}" style="--c:${theme.color}"><i></i>${esc(theme.name)}</p>
        <h2 tabindex="-1">${esc(isBook ? this.bookTitle(i) : g.titles[i])}</h2>
        <p class="byline">${esc(byline)}</p>
      </div>
      <div class="stats" style="grid-template-columns:repeat(${stats.length},minmax(0,1fr))">${stats.map(([n, l]) => `<div><b>${n}</b><span>${l}</span></div>`).join('')}</div>
      <div class="actions">
        ${isBook && concepts.length ? `<button type="button" class="primary" data-action="tour">${ICON.play}Recorrer el libro</button>` : ''}
        ${hashPrefix ? '' : `<a href="/biblioteca/${slug}"${isBook ? '' : ' class="primary"'}>Abrir la página</a>`}
      </div>
      ${sections}
      <section><h3>${isBook ? 'Resumen' : 'La idea'}</h3><div class="prose" aria-busy="true"><p class="loading-text">Cargando la nota…</p></div></section>
      ${allIdeas}
    `;
    panel.querySelector('.actions')!.toggleAttribute('hidden', !panel.querySelector('.actions')!.children.length);
    home.hidden = true;
    panel.hidden = false;
    panel.scrollTop = 0;
    root.dataset.focus = '';
    this.blockedAt = 0;
    requestAnimationFrame(() => this.updateViewOffset());
    noteContent(slug)
      .then((note) => {
        if (this.focus !== i) return;
        this.lastNoteMs = note.ms;
        const prose = panel.querySelector<HTMLElement>('.prose')!;
        prose.innerHTML = note.html || '<p>Esta nota no tiene texto.</p>';
        prose.removeAttribute('aria-busy');
        // In the panel, the note's own "Aparece en" / "Conceptos relacionados" lists are already shown above.
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
    home.hidden = false;
    delete root.dataset.focus;
    this.blockedAt = 0;
    requestAnimationFrame(() => this.updateViewOffset());
  }

  private startTour(book: number) {
    const stops = this.mainLinks(book);
    if (!stops.length) return;
    this.tour = { book, stops, index: 0 };
    stops.slice(0, 3).forEach((j) => prefetchNote(this.g.slugs[j]));
    this.focus = -1;
    this.select(stops[0], { keepTour: true });
  }

  private startRoute(k: number) {
    const stops = this.routeStops(k);
    if (!stops) return;
    this.tour = { book: stops[0], title: ROUTES[k].title, stops, index: 0 };
    stops.forEach((j) => prefetchNote(this.g.slugs[j]));
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

  private bindPanel() {
    root.addEventListener('click', (e) => {
      const target = e.target as HTMLElement;
      const action = target.closest<HTMLElement>('[data-action]')?.dataset.action;
      if (action === 'toggle-panel') return this.setPanel(root.dataset.panel !== 'open');
      if (action === 'zoom-in') return this.zoomBy(0.7);
      if (action === 'zoom-out') return this.zoomBy(1 / 0.7);
      if (action === 'reset') {
        this.select(-1);
        this.touched = false;
        const { camera, controls } = this.sky;
        const to = new THREE.Vector3(0, 25, 155).setLength(camera.position.distanceTo(controls.target));
        this.flyToPoint(new THREE.Vector3(), to);
        setTimeout(() => !this.touched && this.frameWholeSky(), 1150);
        return;
      }
      if (!sidebar.contains(target)) return;
      if (action === 'close') return this.select(-1);
      if (action === 'tour') return this.startTour(this.focus);
      if (action === 'prev') return this.stepTour(-1);
      if (action === 'next') return this.stepTour(1);
      const tab = target.closest<HTMLElement>('[data-tab]')?.dataset.tab;
      if (tab) {
        root.querySelectorAll<HTMLElement>('[data-tab]').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.tab === tab)));
        root.querySelectorAll<HTMLElement>('[role="tabpanel"]').forEach((p) => (p.hidden = p.id !== `pane-${tab}`));
        return;
      }
      const theme = target.closest<HTMLElement>('[data-go-theme]')?.dataset.goTheme;
      if (theme) return this.flyToTheme(this.g.themeNames.indexOf(theme));
      const route = target.closest<HTMLElement>('[data-route]')?.dataset.route;
      if (route !== undefined) return this.startRoute(Number(route));
      // Links between notes fly to the linked star instead of leaving the sky.
      const a = target.closest<HTMLAnchorElement>('a[href^="/biblioteca/"]');
      if (!a || a.closest('.actions') || a.closest('.more') || a.closest('.foot') || e.metaKey || e.ctrlKey || e.shiftKey) return;
      const href = a.getAttribute('href')!.slice('/biblioteca/'.length);
      const j = a.dataset.star ? Number(a.dataset.star) : this.g.indexOf.get(a.dataset.slug ?? href);
      if (j === undefined) return;
      e.preventDefault();
      if (this.hidden.has(this.g.themes[j])) this.toggleTheme(this.g.themes[j]);
      this.select(j, { keepTour: !!this.tour && this.tour.stops.includes(j) });
    });
    sidebar.addEventListener('pointerover', (e) => {
      const a = (e.target as HTMLElement).closest<HTMLAnchorElement>('a[data-star]');
      if (a) prefetchNote(this.g.slugs[Number(a.dataset.star)]);
    });
    // phones: drag the sheet's grabber up or down to open or fold it
    const grabber = root.querySelector<HTMLElement>('.grabber')!;
    let startY = -1;
    grabber.addEventListener('pointerdown', (e) => { startY = e.clientY; grabber.setPointerCapture?.(e.pointerId); });
    grabber.addEventListener('pointerup', (e) => {
      if (startY < 0) return;
      const dy = e.clientY - startY;
      startY = -1;
      if (Math.abs(dy) > 24) {
        e.preventDefault();
        this.setPanel(dy < 0);
        this.swallowClick = true;
      }
    });
    grabber.addEventListener('click', (e) => {
      if (this.swallowClick) { e.stopPropagation(); this.swallowClick = false; }
    }, true);
  }
  private swallowClick = false;

  // ---------------------------------------------------------------- search, legend, keys, URL

  private bindSearch() {
    const titles = this.g.titles.map(fold);
    const render = () => {
      searchList.innerHTML = this.searchHits
        .map((i, k) => {
          const t = this.themes[this.g.themes[i]];
          return `<li role="option" id="hit-${k}" data-star="${i}" aria-selected="${k === this.searchActive}"><i class="dot" style="--c:${t.color}" data-mark="${t.mark}"></i><span>${esc(this.g.kinds[i] === 0 ? this.bookTitle(i) : this.g.titles[i])}</span><small>${this.g.kinds[i] === 0 ? 'Libro' : t.name}</small></li>`;
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
        titles.forEach((t, i) => (t.startsWith(q) || fold(this.bookTitle(i)).startsWith(q) ? starts : t.includes(q) ? contains : null)?.push(i));
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

  private toggleTheme(t: number) {
    if (this.hidden.has(t)) this.hidden.delete(t);
    else this.hidden.add(t);
    legend.querySelector(`[data-theme="${this.g.themeNames[t]}"]`)?.setAttribute('aria-pressed', String(!this.hidden.has(t)));
    if (this.focus >= 0 && this.hidden.has(this.g.themes[this.focus])) this.select(-1);
    else this.applyVisibility();
  }

  private bindLegend() {
    legend.addEventListener('click', (e) => {
      const btn = (e.target as HTMLElement).closest<HTMLButtonElement>('button[data-theme]');
      if (!btn) return;
      const t = this.g.themeNames.indexOf(btn.dataset.theme!);
      if (t >= 0) this.toggleTheme(t);
    });
  }

  private bindKeys() {
    window.addEventListener('keydown', (e) => {
      if (!active) return;
      const typing = document.activeElement === searchInput;
      if (e.key === '/' && !typing) {
        e.preventDefault();
        if (root.dataset.panel !== 'open' && innerWidth <= 720) this.setPanel(true);
        searchInput.focus();
      } else if (e.key === 'Escape' && !typing) {
        this.select(-1);
      } else if (this.tour && !typing && (e.key === 'ArrowRight' || e.key === 'ArrowLeft')) {
        this.stepTour(e.key === 'ArrowRight' ? 1 : -1);
      }
    });
  }

  private openFromHash() {
    const slug = decodeURIComponent(location.hash.slice(1)).slice(hashPrefix.length);
    if (!slug) return;
    const i = this.g.indexOf.get(slug);
    if (i !== undefined && i !== this.focus) this.select(i);
  }
}
