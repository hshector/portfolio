// The night sky: stars (one points draw), links (one line draw), highlighted links for the
// focused star, and a soft nebula per theme.
//
// Renderer choice (measured, see docs/CONSTELLATION.md): the classic WebGLRenderer. In tests it
// ran 15–60× faster than WebGPURenderer's WebGL 2 fallback with the same scene, works on every
// WebGL 2 browser, and avoids a WebGPU incompatibility of three.js r186 with Chromium < 143.

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import type { GraphData } from './data';

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
  setEdgeVisibility(visible: (a: number, b: number) => number, opacity: number): void;
  setHighlight(center: number, others: ArrayLike<number>): void;
  render(): void;
  resize(width: number, height: number): void;
  dispose(): void;
}

const SKY = 0x05060d;

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
    gl_PointSize = min(size * uScale * (100.0 / -mv.z), 72.0 * uScale);
    gl_Position = projectionMatrix * mv;
  }
`;
const starFragment = /* glsl */ `
  varying vec3 vColor;
  varying float vAlpha;
  varying float vRing;
  void main() {
    float d = length(gl_PointCoord - 0.5);
    if (d > 0.5 || vAlpha < 0.01) discard;
    float core = smoothstep(0.2, 0.0, d);
    float halo = smoothstep(0.5, 0.06, d) * 0.5;
    // "Otros" is drawn as a hollow ring so it never depends on color alone.
    float ringShape = smoothstep(0.08, 0.0, abs(d - 0.3)) * 1.4;
    float shape = mix(core * 1.6 + halo, ringShape, vRing);
    gl_FragColor = vec4(vColor * shape, max(core, halo) * vAlpha);
  }
`;

function radialTexture(): THREE.Texture {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const ctx = c.getContext('2d')!;
  const grad = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.4, 'rgba(255,255,255,0.35)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 128, 128);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function createSky(canvas: HTMLCanvasElement, g: GraphData, themes: SkyTheme[]): Sky {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: !new URLSearchParams(location.search).has('noaa'), powerPreference: 'high-performance' });
  renderer.setClearColor(SKY, 1);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));

  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(SKY, 0.0045);
  const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 2000);
  camera.position.set(0, 25, 155);
  const controls = new OrbitControls(camera, canvas);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.minDistance = 3;
  controls.maxDistance = 320;
  controls.zoomSpeed = 0.9;

  const n = g.count;
  const colors = themes.map((t) => new THREE.Color(t.color));

  // ---- stars
  const size = new Float32Array(n);
  const color = new Float32Array(n * 3);
  const ring = new Float32Array(n);
  const alpha = new Float32Array(n).fill(1);
  for (let i = 0; i < n; i++) {
    const deg = g.adjStart[i + 1] - g.adjStart[i];
    const book = g.kinds[i] === 0;
    size[i] = book ? 9 + Math.min(Math.sqrt(deg), 24) * 0.55 : 2.9 + Math.min(Math.sqrt(deg), 10) * 0.6;
    const c = colors[g.themes[i]] ?? new THREE.Color('#ffffff');
    const k = book ? 1.15 : 1.0;
    color.set([c.r * k, c.g * k, c.b * k], i * 3);
    ring[i] = themes[g.themes[i]]?.ring ? 1 : 0;
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
  scene.add(stars);

  // ---- links between concepts. Book↔concept links are drawn only for the focused star:
  // they are long lines across the whole sky that turn it into a hairball and cost the most to draw.
  const baseEdges: number[] = [];
  for (let e = 0; e < g.edges.length / 2; e++) if (g.kinds[g.edges[e * 2]] === 1 && g.kinds[g.edges[e * 2 + 1]] === 1) baseEdges.push(e);
  const edgeCount = baseEdges.length;
  const ePos = new Float32Array(edgeCount * 6);
  const eCol = new Float32Array(edgeCount * 8);
  const eA = new Uint32Array(edgeCount), eB = new Uint32Array(edgeCount);
  for (let k = 0; k < edgeCount; k++) {
    const src = baseEdges[k], e = k;
    const a = g.edges[src * 2], b = g.edges[src * 2 + 1];
    eA[k] = a;
    eB[k] = b;
    ePos.set(g.positions.subarray(a * 3, a * 3 + 3), e * 6);
    ePos.set(g.positions.subarray(b * 3, b * 3 + 3), e * 6 + 3);
    const ca = colors[g.themes[a]], cb = colors[g.themes[b]];
    eCol.set([ca.r, ca.g, ca.b, 1, cb.r, cb.g, cb.b, 1], e * 8);
  }
  const edgeGeo = new THREE.BufferGeometry();
  edgeGeo.setAttribute('position', new THREE.BufferAttribute(ePos, 3));
  const edgeColor = new THREE.BufferAttribute(eCol, 4);
  edgeColor.setUsage(THREE.DynamicDrawUsage);
  edgeGeo.setAttribute('color', edgeColor);
  const edgeMat = new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.11, depthWrite: false, blending: THREE.AdditiveBlending });
  const edges = new THREE.LineSegments(edgeGeo, edgeMat);
  edges.frustumCulled = false;
  scene.add(edges);

  const hlMat = new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.85, depthWrite: false, blending: THREE.AdditiveBlending });
  const highlight = new THREE.LineSegments(new THREE.BufferGeometry(), hlMat);
  highlight.frustumCulled = false;
  highlight.visible = false;
  scene.add(highlight);

  // ---- nebulae: one soft cloud per theme at the centre of its stars
  const centroids = themes.map(() => new THREE.Vector3());
  const counts = new Uint32Array(themes.length);
  for (let i = 0; i < n; i++) {
    const t = g.themes[i];
    centroids[t].x += g.positions[i * 3];
    centroids[t].y += g.positions[i * 3 + 1];
    centroids[t].z += g.positions[i * 3 + 2];
    counts[t]++;
  }
  const glow = radialTexture();
  const nebulae: THREE.Sprite[] = [];
  centroids.forEach((c, t) => {
    if (!counts[t]) return;
    c.divideScalar(counts[t]);
    const m = new THREE.SpriteMaterial({ map: glow, color: colors[t], transparent: true, opacity: 0.1, depthWrite: false, blending: THREE.AdditiveBlending, fog: false });
    const s = new THREE.Sprite(m);
    s.position.copy(c);
    s.scale.setScalar(22 + Math.sqrt(counts[t]) * 1.5);
    nebulae.push(s);
    scene.add(s);
  });

  // ---- distant dust for depth
  const dust = new Float32Array(1800 * 3);
  for (let i = 0; i < dust.length; i += 3) {
    const r = 260 + Math.random() * 500, th = Math.random() * Math.PI * 2, ph = Math.acos(2 * Math.random() - 1);
    dust.set([r * Math.sin(ph) * Math.cos(th), r * Math.cos(ph), r * Math.sin(ph) * Math.sin(th)], i);
  }
  const dustGeo = new THREE.BufferGeometry();
  dustGeo.setAttribute('position', new THREE.BufferAttribute(dust, 3));
  const dustMat = new THREE.PointsMaterial({ color: 0x8c93bf, size: 1.4, sizeAttenuation: false, transparent: true, opacity: 0.5, depthWrite: false, fog: false });
  scene.add(new THREE.Points(dustGeo, dustMat));

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
    setEdgeVisibility(visible, opacity) {
      for (let e = 0; e < edgeCount; e++) {
        const v = visible(eA[e], eB[e]);
        eCol[e * 8 + 3] = v;
        eCol[e * 8 + 7] = v;
      }
      edgeColor.needsUpdate = true;
      edgeMat.opacity = opacity;
      for (const s of nebulae) (s.material as THREE.SpriteMaterial).opacity = opacity < 0.1 ? 0.04 : 0.1;
    },
    setHighlight(center, others) {
      highlight.geometry.dispose();
      const geo = new THREE.BufferGeometry();
      highlight.visible = center >= 0 && others.length > 0;
      if (highlight.visible) {
        const p = new Float32Array(others.length * 6), c = new Float32Array(others.length * 8);
        const ca = colors[g.themes[center]];
        for (let k = 0; k < others.length; k++) {
          const j = others[k], cb = colors[g.themes[j]];
          p.set(g.positions.subarray(center * 3, center * 3 + 3), k * 6);
          p.set(g.positions.subarray(j * 3, j * 3 + 3), k * 6 + 3);
          c.set([ca.r, ca.g, ca.b, 1, cb.r, cb.g, cb.b, 1], k * 8);
        }
        geo.setAttribute('position', new THREE.BufferAttribute(p, 3));
        geo.setAttribute('color', new THREE.BufferAttribute(c, 4));
      }
      highlight.geometry = geo;
    },
    render() {
      renderer.render(scene, camera);
    },
    resize(width, height) {
      renderer.setSize(width, height, false);
      camera.aspect = width / Math.max(1, height);
      camera.updateProjectionMatrix();
      uScale.value = (Math.max(320, height) / 800) * renderer.getPixelRatio();
    },
    dispose() {
      controls.dispose();
      glow.dispose();
      renderer.dispose();
    },
  };
}
