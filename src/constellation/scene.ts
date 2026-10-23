// The nebula: every note a star (one draw), each theme a cloud of coloured gas around its stars
// (one instanced draw), lines from the focused star to its main ideas, and a bloom pass that
// makes the brightest stars glow.
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
  commitAlpha(): void;
  /** Lines from a star to some others (its main ideas); -1 clears them. */
  setHighlight(center: number, others: ArrayLike<number>): void;
  /** Gas of each theme on or off (hidden themes), and dimmed while a star is focused. */
  setGas(visible: (theme: number) => boolean, dim: boolean): void;
  setBloom(on: boolean): void;
  render(): void;
  /** Point size scale: CSS px per size unit at distance 100, times the pixel ratio. */
  scale(): number;
  /** Fades the gas, lines, bloom and far dust (0…1); the stars are not affected. */
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

// The gas: camera-facing quads (one instanced draw, so close-up clouds are not limited by the
// maximum point size), each a soft cloud texture in its theme's colour.
const gasVertex = /* glsl */ `
  attribute vec3 offset;
  attribute float scale;
  attribute float spin;
  attribute vec3 tint;
  attribute float theme;
  uniform float uThemeOn[6];
  varying vec2 vUv;
  varying vec3 vTint;
  varying float vOn;
  void main() {
    vUv = uv; vTint = tint;
    int t = int(theme + 0.5);
    float on = 1.0;
    for (int k = 0; k < 6; k++) if (k == t) on = uThemeOn[k];
    vOn = on;
    vec4 mv = modelViewMatrix * vec4(offset, 1.0);
    float c = cos(spin), s = sin(spin);
    mv.xy += mat2(c, s, -s, c) * position.xy * scale;
    gl_Position = projectionMatrix * mv;
  }
`;
const gasFragment = /* glsl */ `
  uniform sampler2D uTex;
  uniform float uOpacity;
  varying vec2 vUv;
  varying vec3 vTint;
  varying float vOn;
  void main() {
    float a = texture2D(uTex, vUv).a * uOpacity * vOn;
    if (a < 0.002) discard;
    gl_FragColor = vec4(vTint, a); // (additive blending multiplies by alpha)
  }
`;

/** A soft, irregular cloud: overlapping blobs, faded out towards the edge (seeded: always the same). */
function cloudTexture(): THREE.Texture {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const ctx = c.getContext('2d')!;
  let seed = 9;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 26; i++) {
    const x = 128 + (rnd() - 0.5) * 110, y = 128 + (rnd() - 0.5) * 110, r = 30 + rnd() * 70;
    const grad = ctx.createRadialGradient(x, y, 0, x, y, r);
    grad.addColorStop(0, `rgba(255,255,255,${0.08 + rnd() * 0.1})`);
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 256, 256);
  }
  const edge = ctx.createRadialGradient(128, 128, 60, 128, 128, 128);
  edge.addColorStop(0, 'rgba(0,0,0,0)');
  edge.addColorStop(1, 'rgba(0,0,0,1)');
  ctx.globalCompositeOperation = 'destination-out';
  ctx.fillStyle = edge;
  ctx.fillRect(0, 0, 256, 256);
  return new THREE.CanvasTexture(c);
}

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

  // ---- stars
  const size = new Float32Array(n);
  const color = new Float32Array(n * 3);
  const ring = new Float32Array(n);
  const alpha = new Float32Array(n).fill(1);
  const c = new THREE.Color();
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

  // ---- gas: about one cloud per six notes, around the notes themselves
  const puffs: number[] = [];
  for (let i = 0; i < n; i++) if (rnd() < 0.16) puffs.push(i);
  const gasGeo = new THREE.InstancedBufferGeometry();
  const quad = new THREE.PlaneGeometry(1, 1);
  gasGeo.index = quad.index;
  gasGeo.setAttribute('position', quad.getAttribute('position'));
  gasGeo.setAttribute('uv', quad.getAttribute('uv'));
  const off = new Float32Array(puffs.length * 3), scl = new Float32Array(puffs.length), spin = new Float32Array(puffs.length);
  const tint = new Float32Array(puffs.length * 3), tIdx = new Float32Array(puffs.length);
  puffs.forEach((i, k) => {
    off.set([g.positions[i * 3] + (rnd() - 0.5) * 4, g.positions[i * 3 + 1] + (rnd() - 0.5) * 4, g.positions[i * 3 + 2] + (rnd() - 0.5) * 4], k * 3);
    scl[k] = 9 + rnd() * 16;
    spin[k] = rnd() * Math.PI * 2;
    const theme = themes[g.themes[i]];
    glowColor(theme?.color ?? '#888888', c).multiplyScalar(theme?.ring ? 0.6 : 1);
    tint.set([c.r, c.g, c.b], k * 3);
    tIdx[k] = g.themes[i];
  });
  gasGeo.setAttribute('offset', new THREE.InstancedBufferAttribute(off, 3));
  gasGeo.setAttribute('scale', new THREE.InstancedBufferAttribute(scl, 1));
  gasGeo.setAttribute('spin', new THREE.InstancedBufferAttribute(spin, 1));
  gasGeo.setAttribute('tint', new THREE.InstancedBufferAttribute(tint, 3));
  gasGeo.setAttribute('theme', new THREE.InstancedBufferAttribute(tIdx, 1));
  gasGeo.instanceCount = puffs.length;
  const cloud = cloudTexture();
  const gasOn = { value: [1, 1, 1, 1, 1, 1] };
  const gasOpacity = { value: 0.03 };
  const gasMat = new THREE.ShaderMaterial({
    uniforms: { uTex: { value: cloud }, uOpacity: gasOpacity, uThemeOn: gasOn },
    vertexShader: gasVertex,
    fragmentShader: gasFragment,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const gas = new THREE.Mesh(gasGeo, gasMat);
  gas.frustumCulled = false;
  gas.renderOrder = 1;
  scene.add(gas);

  // ---- lines from the focused star to its main ideas
  const hlMat = new THREE.LineBasicMaterial({ color: 0xfff1f6, transparent: true, opacity: 0.32, depthWrite: false, blending: THREE.AdditiveBlending });
  const highlight = new THREE.LineSegments(new THREE.BufferGeometry(), hlMat);
  highlight.frustumCulled = false;
  highlight.visible = false;
  scene.add(highlight);

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
  const dustMat = new THREE.PointsMaterial({ color: 0xaab0c8, size: 1.2, sizeAttenuation: false, transparent: true, opacity: 0.45, depthWrite: false });
  scene.add(new THREE.Points(dustGeo, dustMat));

  // ---- bloom: the brightest stars and the densest gas glow
  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.8, 0.55, 0.12);
  composer.addPass(bloom);
  composer.addPass(new OutputPass());
  // (the composer always draws, bloom or not, so colours are the same either way: the output pass
  // turns the linear colours into sRGB)
  bloom.enabled = !params.has('nobloom');

  let glowF = 1, gasBase = 0.03;
  const applyGas = () => (gasOpacity.value = gasBase * glowF);

  return {
    renderer,
    scene,
    camera,
    controls,
    alpha,
    size,
    centroids,
    commitAlpha() {
      alphaAttr.needsUpdate = true;
    },
    setGlow(f) {
      glowF = f;
      applyGas();
      hlMat.opacity = 0.32 * f;
      dustMat.opacity = 0.45 * f;
      bloom.strength = 0.8 * f;
    },
    setGas(visible, dim) {
      for (let t = 0; t < 6; t++) gasOn.value[t] = visible(t) ? 1 : 0;
      gasBase = dim ? 0.012 : 0.03;
      applyGas();
    },
    setBloom(on) {
      bloom.enabled = on;
    },
    setHighlight(center, others) {
      highlight.geometry.dispose();
      const geo = new THREE.BufferGeometry();
      highlight.visible = center >= 0 && others.length > 0;
      if (highlight.visible) {
        const p = new Float32Array(others.length * 6);
        for (let k = 0; k < others.length; k++) {
          p.set(g.positions.subarray(center * 3, center * 3 + 3), k * 6);
          p.set(g.positions.subarray(others[k] * 3, others[k] * 3 + 3), k * 6 + 3);
        }
        geo.setAttribute('position', new THREE.BufferAttribute(p, 3));
      }
      highlight.geometry = geo;
    },
    render() {
      // the island draws with filmic tone mapping and its own exposure; the sky is drawn as on its page
      const tm = renderer.toneMapping, ex = renderer.toneMappingExposure;
      if (shared) renderer.toneMapping = THREE.NoToneMapping;
      composer.render();
      if (shared) { renderer.toneMapping = tm; renderer.toneMappingExposure = ex; }
    },
    scale: () => uScale.value,
    resize(width, height) {
      if (!shared) renderer.setSize(width, height, false);
      composer.setPixelRatio(renderer.getPixelRatio());
      composer.setSize(width, height);
      camera.aspect = width / Math.max(1, height);
      camera.updateProjectionMatrix();
      uScale.value = (Math.max(320, height) / 800) * renderer.getPixelRatio();
    },
    dispose() {
      controls.dispose();
      cloud.dispose();
      composer.dispose();
      if (!shared) renderer.dispose();
    },
  };
}
