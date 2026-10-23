// The network: every note a star (one draw), every link a line with the gradient between its two
// notes' colours (one instanced draw of screen-space quads, so lines have a real width and soft edges),
// small pulses of light travelling along the links (one draw), and a bloom pass that makes the
// stars and pulses glow. The links are drawn after the bloom so the web stays sharp.
//
// Renderer choice (measured, see docs/CONSTELLATION.md): the classic WebGLRenderer. In tests it
// ran 15–60× faster than WebGPURenderer's WebGL 2 fallback with the same scene, works on every
// WebGL 2 browser, and avoids a WebGPU incompatibility of three.js r186 with Chromium < 143.

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import type { GraphData } from './data';
import { STAR_SHAPE, glowColor, starColor, starSize } from './style';

export interface SkyTheme {
  color: string;
  ring: boolean;
}

export interface Sky {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  controls: OrbitControls;
  /** Per-star opacity (0–1); call commitAlpha() after changing it. */
  alpha: Float32Array;
  /** Per-star size: CSS pixels at distance 100 on an 800-px-tall canvas. */
  size: Float32Array;
  centroids: THREE.Vector3[];
  /** The links as node pairs (a, b), in the order setLinks() expects. */
  linkEnds: Uint32Array;
  commitAlpha(): void;
  /**
   * How each link shows: 0 hidden, 1 at rest, up to 2 lit (the chosen or hovered star's links:
   * brighter and wider). One value per link, in linkEnds order.
   */
  setLinks(vis: Float32Array): void;
  /** The pulses run along these links (link indexes), out from `from`; an empty list spreads them over the network. */
  setPulses(links: ArrayLike<number>, from?: number): void;
  setBloom(on: boolean): void;
  setPulsesOn(on: boolean): void;
  render(): void;
  /** Point size scale: CSS px per size unit at distance 100, times the pixel ratio. */
  scale(): number;
  /** Fades the links, pulses, bloom and far dust (0…1); the stars are not affected. */
  setGlow(f: number): void;
  resize(width: number, height: number): void;
  dispose(): void;
}

const SKY = 0x030409;

const starVertex = /* glsl */ `
  attribute float size;
  attribute float alpha;
  attribute float ring;
  attribute vec3 color;
  uniform float uScale;   // canvas height / 800 × device pixel ratio
  varying vec3 vColor;
  varying float vAlpha;
  varying float vRing;
  void main() {
    vColor = color; vAlpha = alpha; vRing = ring;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_PointSize = min(size * uScale * (100.0 / -mv.z), 80.0 * uScale);
    gl_Position = projectionMatrix * mv;
  }
`;
const starFragment = /* glsl */ `
  varying vec3 vColor;
  varying float vAlpha;
  varying float vRing;
  ${STAR_SHAPE}
  void main() {
    float d = length(gl_PointCoord - 0.5);
    if (d > 0.5 || vAlpha < 0.01) discard;
    float s = starShape(d, vRing);
    gl_FragColor = vec4(vColor * s, min(1.0, s) * vAlpha);
  }
`;

// Links: a quad per link, stretched between its two ends on screen and widened across by a number
// of pixels; the colour runs from one end's to the other's, and the edges are soft.
const linkVertex = /* glsl */ `
  attribute vec3 aPos;
  attribute vec3 bPos;
  attribute vec3 aCol;
  attribute vec3 bCol;
  attribute float base;   // its opacity at rest
  attribute float vis;    // 0 hidden, 1 at rest, 2 lit
  uniform vec2 uRes;      // drawing-buffer size in pixels
  uniform float uPx;      // device pixels per CSS pixel
  uniform float uGlow;
  varying vec3 vCol;
  varying float vA;
  varying float vAcross;
  void main() {
    vec4 ca = projectionMatrix * viewMatrix * vec4(aPos, 1.0);
    vec4 cb = projectionMatrix * viewMatrix * vec4(bPos, 1.0);
    float lit = clamp(vis - 1.0, 0.0, 1.0);
    vA = mix(base * min(vis, 1.0), 0.85, lit) * uGlow;
    if (ca.w <= 0.0 || cb.w <= 0.0 || vA < 0.002) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); return; }
    vec2 sa = ca.xy / ca.w * uRes * 0.5, sb = cb.xy / cb.w * uRes * 0.5;
    vec2 dir = sb - sa;
    float len = length(dir);
    dir = len > 0.0001 ? dir / len : vec2(1.0, 0.0);
    vec2 nrm = vec2(-dir.y, dir.x);
    float t = position.x;
    vec4 c = mix(ca, cb, t);
    float width = (1.2 + 1.2 * lit) * uPx;
    c.xy += nrm * position.y * width / uRes * 2.0 * c.w;
    gl_Position = c;
    vCol = mix(aCol, bCol, t);
    vAcross = position.y;
  }
`;
const linkFragment = /* glsl */ `
  varying vec3 vCol;
  varying float vA;
  varying float vAcross;
  void main() {
    float edge = 1.0 - smoothstep(0.35, 1.0, abs(vAcross));
    gl_FragColor = vec4(vCol, vA * edge);
  }
`;

// Pulses: points that run along a link, brightest half-way.
const pulseVertex = /* glsl */ `
  attribute vec3 aPos;
  attribute vec3 bPos;
  attribute vec3 col;
  attribute float speed;
  attribute float offset;
  uniform float uTime;
  uniform float uScale;
  uniform float uOn;
  varying vec3 vCol;
  varying float vA;
  void main() {
    float t = fract(uTime * speed + offset);
    vec3 p = mix(aPos, bPos, t);
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    vA = sin(3.14159 * t) * uOn;
    vCol = col;
    gl_PointSize = clamp(3.2 * uScale * (100.0 / -mv.z), 1.5 * uScale, 7.0 * uScale);
    gl_Position = projectionMatrix * mv;
  }
`;
const pulseFragment = /* glsl */ `
  varying vec3 vCol;
  varying float vA;
  void main() {
    float d = length(gl_PointCoord - 0.5);
    if (d > 0.5 || vA < 0.01) discard;
    float s = smoothstep(0.5, 0.0, d);
    gl_FragColor = vec4(vCol * (0.6 + s), s * vA);
  }
`;

const PULSES = 700;

/** shared: draw with another renderer (the island's), on its canvas, without changing its settings. */
export function createSky(canvas: HTMLCanvasElement, g: GraphData, themes: SkyTheme[], shared?: THREE.WebGLRenderer): Sky {
  const params = new URLSearchParams(location.search);
  const renderer = shared ?? new THREE.WebGLRenderer({ canvas, antialias: !params.has('noaa'), powerPreference: 'high-performance' });
  if (!shared) {
    renderer.setClearColor(SKY, 1);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  }
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(SKY);
  const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 2000);
  camera.position.set(0, 25, 155);
  const controls = new OrbitControls(camera, canvas);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.minDistance = 3;
  controls.maxDistance = 320;
  controls.zoomSpeed = 0.9;

  const n = g.count;
  let seed = 3;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const c = new THREE.Color();

  // ---- stars
  const size = new Float32Array(n);
  const color = new Float32Array(n * 3);
  const ring = new Float32Array(n);
  const alpha = new Float32Array(n).fill(1);
  for (let i = 0; i < n; i++) {
    const theme = themes[g.themes[i]];
    size[i] = starSize(g, i);
    starColor(g, i, theme?.color ?? '#ffffff', c);
    color.set([c.r, c.g, c.b], i * 3);
    ring[i] = theme?.ring ? 1 : 0;
  }
  const starGeo = new THREE.BufferGeometry();
  starGeo.setAttribute('position', new THREE.BufferAttribute(g.positions, 3));
  starGeo.setAttribute('size', new THREE.BufferAttribute(size, 1));
  starGeo.setAttribute('color', new THREE.BufferAttribute(color, 3));
  starGeo.setAttribute('ring', new THREE.BufferAttribute(ring, 1));
  const alphaAttr = new THREE.BufferAttribute(alpha, 1);
  alphaAttr.setUsage(THREE.DynamicDrawUsage);
  starGeo.setAttribute('alpha', alphaAttr);
  const uScale = { value: 1 };
  const starMat = new THREE.ShaderMaterial({
    uniforms: { uScale },
    vertexShader: starVertex,
    fragmentShader: starFragment,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const stars = new THREE.Points(starGeo, starMat);
  stars.frustumCulled = false;
  stars.renderOrder = 2;
  scene.add(stars);

  // ---- links
  const m = g.edges.length / 2;
  const linkEnds = Uint32Array.from(g.edges);
  const nodeCol = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    glowColor(themes[g.themes[i]]?.color ?? '#888888', c);
    nodeCol.set([c.r, c.g, c.b], i * 3);
  }
  const aPos = new Float32Array(m * 3), bPos = new Float32Array(m * 3), aCol = new Float32Array(m * 3), bCol = new Float32Array(m * 3);
  const base = new Float32Array(m), vis = new Float32Array(m).fill(1);
  const warm = new THREE.Color('#fff4dc');
  for (let e = 0; e < m; e++) {
    const a = linkEnds[e * 2], b = linkEnds[e * 2 + 1];
    aPos.set(g.positions.subarray(a * 3, a * 3 + 3), e * 3);
    bPos.set(g.positions.subarray(b * 3, b * 3 + 3), e * 3);
    const cross = g.themes[a] !== g.themes[b], toBook = g.kinds[a] === 0 || g.kinds[b] === 0;
    // links between two themes are the bridges: a little warmer and brighter, so they stand out
    for (const [arr, i] of [[aCol, a], [bCol, b]] as const) {
      c.fromArray(nodeCol, i * 3);
      if (cross) c.lerp(warm, 0.25);
      arr.set([c.r, c.g, c.b], e * 3);
    }
    // a book's links cross its whole galaxy: kept fainter so they don't cover the rest
    base[e] = toBook ? 0.06 : cross ? 0.22 : 0.14;
  }
  const quad = new THREE.InstancedBufferGeometry();
  quad.setAttribute('position', new THREE.Float32BufferAttribute([0, -1, 0, 1, -1, 0, 1, 1, 0, 0, 1, 0], 3));
  quad.setIndex([0, 1, 2, 0, 2, 3]);
  quad.setAttribute('aPos', new THREE.InstancedBufferAttribute(aPos, 3));
  quad.setAttribute('bPos', new THREE.InstancedBufferAttribute(bPos, 3));
  quad.setAttribute('aCol', new THREE.InstancedBufferAttribute(aCol, 3));
  quad.setAttribute('bCol', new THREE.InstancedBufferAttribute(bCol, 3));
  quad.setAttribute('base', new THREE.InstancedBufferAttribute(base, 1));
  const visAttr = new THREE.InstancedBufferAttribute(vis, 1);
  visAttr.setUsage(THREE.DynamicDrawUsage);
  quad.setAttribute('vis', visAttr);
  quad.instanceCount = m;
  const uRes = { value: new THREE.Vector2(1, 1) }, uPx = { value: 1 }, uGlow = { value: 1 };
  const linkMat = new THREE.ShaderMaterial({
    uniforms: { uRes, uPx, uGlow },
    vertexShader: linkVertex,
    fragmentShader: linkFragment,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const links = new THREE.Mesh(quad, linkMat);
  links.frustumCulled = false;
  links.renderOrder = 1;
  // (drawn after the bloom, in their own pass: thousands of overlapping lines would bloom into a blur)
  const linkScene = new THREE.Scene();
  linkScene.add(links);

  // ---- pulses
  const pA = new Float32Array(PULSES * 3), pB = new Float32Array(PULSES * 3), pC = new Float32Array(PULSES * 3);
  const speed = new Float32Array(PULSES), offset = new Float32Array(PULSES);
  for (let k = 0; k < PULSES; k++) { speed[k] = 0.12 + rnd() * 0.22; offset[k] = rnd(); }
  const pulseGeo = new THREE.BufferGeometry();
  pulseGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(PULSES * 3), 3)); // (placed in the shader)
  const pAAttr = new THREE.BufferAttribute(pA, 3), pBAttr = new THREE.BufferAttribute(pB, 3), pCAttr = new THREE.BufferAttribute(pC, 3);
  pulseGeo.setAttribute('aPos', pAAttr);
  pulseGeo.setAttribute('bPos', pBAttr);
  pulseGeo.setAttribute('col', pCAttr);
  pulseGeo.setAttribute('speed', new THREE.BufferAttribute(speed, 1));
  pulseGeo.setAttribute('offset', new THREE.BufferAttribute(offset, 1));
  const uTime = { value: 0 }, uOn = { value: 1 };
  const pulseMat = new THREE.ShaderMaterial({
    uniforms: { uTime, uScale, uOn },
    vertexShader: pulseVertex,
    fragmentShader: pulseFragment,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const pulses = new THREE.Points(pulseGeo, pulseMat);
  pulses.frustumCulled = false;
  pulses.renderOrder = 3;
  scene.add(pulses);
  let pulsesOn = !params.has('nopulse') && !matchMedia('(prefers-reduced-motion: reduce)').matches;
  uOn.value = pulsesOn ? 1 : 0;
  // at rest the pulses run along links between ideas (a book's links are long and faint)
  const restLinks: number[] = [];
  for (let e = 0; e < m; e++) if (g.kinds[linkEnds[e * 2]] === 1 && g.kinds[linkEnds[e * 2 + 1]] === 1) restLinks.push(e);
  function assignPulses(list: ArrayLike<number>, from = -1) {
    const pool = list.length ? list : restLinks;
    for (let k = 0; k < PULSES; k++) {
      const e = pool[Math.floor(rnd() * pool.length)];
      // out from the chosen star, or either way along the link
      const flip = from >= 0 ? linkEnds[e * 2 + 1] === from : rnd() < 0.5;
      const a = linkEnds[e * 2 + (flip ? 1 : 0)], b = linkEnds[e * 2 + (flip ? 0 : 1)];
      pA.set(g.positions.subarray(a * 3, a * 3 + 3), k * 3);
      pB.set(g.positions.subarray(b * 3, b * 3 + 3), k * 3);
      c.fromArray(nodeCol, b * 3).lerp(warm, 0.45);
      pC.set([c.r, c.g, c.b], k * 3);
    }
    pAAttr.needsUpdate = pBAttr.needsUpdate = pCAttr.needsUpdate = true;
  }
  assignPulses([]);

  // ---- centre of each theme's galaxy (for its label and to fly there)
  const centroids = themes.map(() => new THREE.Vector3());
  const counts = new Uint32Array(themes.length);
  for (let i = 0; i < n; i++) {
    const t = g.themes[i];
    centroids[t].x += g.positions[i * 3];
    centroids[t].y += g.positions[i * 3 + 1];
    centroids[t].z += g.positions[i * 3 + 2];
    counts[t]++;
  }
  centroids.forEach((v, t) => counts[t] && v.divideScalar(counts[t]));

  // ---- distant stars for depth
  const dust = new Float32Array(2400 * 3);
  for (let i = 0; i < dust.length; i += 3) {
    const r = 300 + rnd() * 500, th = rnd() * Math.PI * 2, ph = Math.acos(2 * rnd() - 1);
    dust.set([r * Math.sin(ph) * Math.cos(th), r * Math.cos(ph), r * Math.sin(ph) * Math.sin(th)], i);
  }
  const dustGeo = new THREE.BufferGeometry();
  dustGeo.setAttribute('position', new THREE.BufferAttribute(dust, 3));
  const dustMat = new THREE.PointsMaterial({ color: 0xaab0c8, size: 1.2, sizeAttenuation: false, transparent: true, opacity: 0.4, depthWrite: false });
  scene.add(new THREE.Points(dustGeo, dustMat));

  // ---- bloom: the stars and the pulses glow; the links are drawn on top afterwards, sharp. The
  // composer always draws, bloom or not, so colours are the same either way (its output pass turns
  // linear colours into sRGB).
  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.55, 0.45, 0.22);
  composer.addPass(bloom);
  const linkPass = new RenderPass(linkScene, camera);
  linkPass.clear = false;
  composer.addPass(linkPass);
  composer.addPass(new OutputPass());
  bloom.enabled = !params.has('nobloom');
  const t0 = performance.now();

  return {
    renderer,
    scene,
    camera,
    controls,
    alpha,
    size,
    centroids,
    linkEnds,
    commitAlpha() {
      alphaAttr.needsUpdate = true;
    },
    setLinks(v) {
      vis.set(v);
      visAttr.needsUpdate = true;
    },
    setPulses(list, from) {
      assignPulses(list, from);
    },
    setGlow(f) {
      uGlow.value = f;
      uOn.value = pulsesOn ? f : 0;
      dustMat.opacity = 0.4 * f;
      bloom.strength = 0.55 * f;
    },
    setBloom(on) {
      bloom.enabled = on;
    },
    setPulsesOn(on) {
      pulsesOn = on;
      uOn.value = on ? uGlow.value : 0;
    },
    render() {
      uTime.value = (performance.now() - t0) / 1000;
      // the island draws with filmic tone mapping and its own exposure; the sky is drawn as on its page
      const tm = renderer.toneMapping, ex = renderer.toneMappingExposure;
      if (shared) renderer.toneMapping = THREE.NoToneMapping;
      // count the draw calls of every pass, not just the last one (the ?debug line shows them)
      const auto = renderer.info.autoReset;
      renderer.info.autoReset = false;
      renderer.info.reset();
      composer.render();
      renderer.info.autoReset = auto;
      if (shared) { renderer.toneMapping = tm; renderer.toneMappingExposure = ex; }
    },
    scale: () => uScale.value,
    resize(width, height) {
      if (!shared) renderer.setSize(width, height, false);
      const pr = renderer.getPixelRatio();
      composer.setPixelRatio(pr);
      composer.setSize(width, height);
      camera.aspect = width / Math.max(1, height);
      camera.updateProjectionMatrix();
      uScale.value = (Math.max(320, height) / 800) * pr;
      uRes.value.set(width * pr, height * pr);
      uPx.value = pr;
    },
    dispose() {
      controls.dispose();
      composer.dispose();
      if (!shared) renderer.dispose();
    },
  };
}
