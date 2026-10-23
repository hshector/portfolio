// Builds the island: sky, lights, terrain, sea, grass, holm oaks, the four places, the name in the
// landscape, signposts and clouds. Everything placed at random uses a seeded generator, so the
// island is the same on every visit.

import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import nameGlyphs from './name-glyphs.json';
import { FOG_APPLY, FOG_PARS, OUT, patchMaterial, type Shared } from './shaders';
import { buildSite } from './site';
import type { LightUniforms } from './palette';
import {
  DOORS, HUB, JETTY, NAME_ANGLE, SITES, WORLD_SIZE, distToPaths, fbm, height, seeded, slopeAt, smoothstep,
} from './terrain';

export interface Quality {
  /** Grass blades built (the visible count can be lowered later). */
  grass: number;
  terrainRes: number;
  shadows: boolean;
  shadowMap: number;
}

export interface World {
  scene: THREE.Scene;
  sun: THREE.DirectionalLight;
  hemi: THREE.HemisphereLight;
  props: THREE.Group;
  grass: THREE.Mesh<THREE.InstancedBufferGeometry, THREE.ShaderMaterial>;
  grassBuilt: number;
  clouds: THREE.Sprite[];
  water: THREE.Mesh;
  /** Sea level right now (the swash): the water rises and falls on the beach. */
  seaLevel: number;
  /** Highest recent sea level: the sand below it is wet. */
  wetLevel: { value: number };
  /** Trunks, rocks, bales, walls and signposts the bull walks around. */
  obstacles: { x: number; z: number; r: number }[];
  /** Spinning things (windmill, sculpture): updated each frame. */
  update(dt: number, t: number, night: number): void;
  setGrassCount(n: number): void;
  /** 0…1: hides the light beams and clouds (going up the observatory). */
  setFade(f: number): void;
  /** Top-down picture of the island for the map (canvas, north up). */
  mapImage(): HTMLCanvasElement;
  /** The WarrenIA pavilion's screen: where it is, and its picture (redraw, then call update). */
  screen: { center: THREE.Vector3; normal: THREE.Vector3; width: number; height: number; canvas: HTMLCanvasElement; update(): void };
}

const TERRAIN = { sand: '#d8b888', wet: '#9c7f58', grassA: '#b8934a', grassB: '#93783d', rock: '#8d857c', path: '#c9a878' };

export function buildWorld(shared: Shared, light: LightUniforms, quality: Quality): World {
  const rand = seeded(20261021);
  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(light.fog.value.getHex(), light.fogDensity.value);
  const fogUniforms = { uFogColor: light.fog, uFogDensity: light.fogDensity };

  // ---------------------------------------------------------------- sky
  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(900, 32, 16),
    new THREE.ShaderMaterial({
      uniforms: { uTop: light.skyTop, uHorizon: light.skyHorizon, uBottom: light.skyBottom, uSunDir: light.sunDir, uSun: light.sun, uSunSize: light.sunSize, uNight: light.night },
      vertexShader: 'varying vec3 vD; void main(){ vD = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: /* glsl */ `
        uniform vec3 uTop; uniform vec3 uHorizon; uniform vec3 uBottom; uniform vec3 uSunDir; uniform vec3 uSun; uniform float uSunSize; uniform float uNight;
        varying vec3 vD;
        void main() {
          float y = vD.y;
          vec3 col = y > 0.0 ? mix(uHorizon, uTop, pow(smoothstep(0.0, 0.6, y), 0.7)) : mix(uHorizon, uBottom, smoothstep(0.0, -0.25, y));
          float s = max(dot(vD, uSunDir), 0.0);
          // the sun at dusk, the moon (a sharper disc with a cold halo) at night
          col += uSun * (smoothstep(1.0 - uSunSize, 1.0 - uSunSize * 0.6, s) * 2.0 + pow(s, mix(12.0, 60.0, uNight)) * 0.45 + pow(s, 3.0) * mix(0.12, 0.04, uNight));
          gl_FragColor = vec4(col, 1.0);
          ${OUT}
        }`,
      side: THREE.BackSide, depthWrite: false, fog: false,
    }),
  );
  sky.renderOrder = -2;
  scene.add(sky);

  // ---------------------------------------------------------------- lights
  const sun = new THREE.DirectionalLight(0xffffff, 3);
  sun.castShadow = quality.shadows;
  sun.shadow.mapSize.set(quality.shadowMap, quality.shadowMap);
  Object.assign(sun.shadow.camera, { left: -80, right: 80, top: 80, bottom: -80, near: 10, far: 300 });
  sun.shadow.bias = -0.0006; sun.shadow.normalBias = 0.04;
  scene.add(sun, sun.target);
  const hemi = new THREE.HemisphereLight(0xffffff, 0x000000, 0.75);
  scene.add(hemi);

  // ---------------------------------------------------------------- terrain
  const geo = new THREE.PlaneGeometry(WORLD_SIZE, WORLD_SIZE, quality.terrainRes, quality.terrainRes);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position, colors = new Float32Array(pos.count * 3);
  const C = (h: string) => new THREE.Color(h);
  const sand = C(TERRAIN.sand), wet = C(TERRAIN.wet), gA = C(TERRAIN.grassA), gB = C(TERRAIN.grassB), rock = C(TERRAIN.rock), path = C(TERRAIN.path), tmp = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i), h = height(x, z);
    pos.setY(i, h);
    const sl = slopeAt(x, z), nn = fbm(x * 0.08, z * 0.08);
    if (h < 0.15) tmp.copy(wet).lerp(sand, smoothstep(-1.2, 0.15, h));
    else if (h < 0.8) tmp.copy(sand).lerp(gA, smoothstep(0.45, 0.8, h + (nn - 0.5) * 0.4));
    else tmp.copy(gA).lerp(gB, nn);
    tmp.lerp(rock, smoothstep(0.55, 1.1, sl) * 0.9 + (h > 13 ? smoothstep(13, 16, h) : 0));
    tmp.lerp(path, smoothstep(1.7, 0.6, distToPaths(x, z)) * (h > 0.4 ? 0.9 : 0));
    tmp.multiplyScalar(0.92 + nn * 0.16);
    colors.set([tmp.r, tmp.g, tmp.b], i * 3);
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geo.computeVertexNormals();
  const wetLevel = { value: 0 };
  const terrainMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, metalness: 0 });
  // sand the waves have just washed is darker and shinier
  terrainMat.onBeforeCompile = (sh) => {
    sh.uniforms.uWet = wetLevel;
    sh.vertexShader = 'varying float vWorldY;\n' + sh.vertexShader.replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvWorldY = (modelMatrix * vec4(transformed, 1.0)).y;');
    sh.fragmentShader = 'uniform float uWet; varying float vWorldY;\n' + sh.fragmentShader
      .replace('#include <color_fragment>', '#include <color_fragment>\nfloat wetF = smoothstep(uWet + 0.04, uWet - 0.08, vWorldY) * step(vWorldY, 0.9);\ndiffuseColor.rgb *= 1.0 - 0.38 * wetF;')
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = mix(roughnessFactor, 0.35, wetF);');
  };
  terrainMat.customProgramCacheKey = () => 'island-terrain';
  const terrain = new THREE.Mesh(geo, terrainMat);
  terrain.receiveShadow = true;
  scene.add(terrain);

  // ---------------------------------------------------------------- sea
  // the water reads the ground height (a small float texture) to find the shore
  const res = 256, hd = new Float32Array(res * res);
  for (let j = 0; j < res; j++) for (let i = 0; i < res; i++) hd[j * res + i] = height((i / (res - 1) - 0.5) * WORLD_SIZE, (j / (res - 1) - 0.5) * WORLD_SIZE);
  const heightTex = new THREE.DataTexture(hd, res, res, THREE.RedFormat, THREE.FloatType);
  heightTex.magFilter = heightTex.minFilter = THREE.LinearFilter;
  heightTex.needsUpdate = true;
  const seaLevelU = { value: 0 };
  const water = new THREE.Mesh(
    new THREE.PlaneGeometry(1600, 1600),
    new THREE.ShaderMaterial({
      uniforms: {
        uTime: shared.time, uHeight: { value: heightTex }, uLevel: seaLevelU, uNight: light.night,
        uDeep: light.waterDeep, uShallow: light.waterShallow, uFoam: light.foam,
        uSunDir: light.sunDir, uSunColor: light.sunColor, ...fogUniforms,
      },
      vertexShader: `varying vec3 vW; ${FOG_PARS}
        void main() { vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; vec4 mv = viewMatrix * w; vFogDepth = -mv.z; gl_Position = projectionMatrix * mv; }`,
      fragmentShader: /* glsl */ `
        uniform float uTime; uniform sampler2D uHeight; uniform float uLevel; uniform float uNight;
        uniform vec3 uDeep; uniform vec3 uShallow; uniform vec3 uFoam; uniform vec3 uSunDir; uniform vec3 uSunColor;
        varying vec3 vW; ${FOG_PARS}
        float n(vec2 p) { return sin(p.x) * sin(p.y); }
        void main() {
          vec2 uv = vW.xz / ${WORLD_SIZE.toFixed(1)} + 0.5;
          float ground = (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) ? -8.0 : texture2D(uHeight, uv).r;
          float depth = max(0.0, uLevel - ground);
          vec3 col = mix(uShallow, uDeep, smoothstep(0.2, 6.0, depth));
          // swell, ripples and the sun's (or moon's) glitter
          vec2 p = vW.xz * 0.35;
          vec3 nrm = normalize(vec3(n(p + uTime * 0.6) * 0.18 + n(p * 2.3 - uTime * 0.9) * 0.09 + sin(vW.z * 0.08 - uTime * 0.9) * 0.08, 1.0, n(p.yx * 1.7 + uTime * 0.5) * 0.18));
          vec3 view = normalize(cameraPosition - vW);
          float spec = pow(max(dot(reflect(-uSunDir, nrm), view), 0.0), mix(140.0, 260.0, uNight));
          float fres = pow(1.0 - max(view.y, 0.0), 3.0);
          col += uSunColor * spec * 2.2 + fres * mix(0.08, 0.03, uNight);
          // foam: lines rolling in and a band on the swash edge
          float shore = smoothstep(1.4, 0.0, depth);
          float waves = smoothstep(0.55, 1.0, sin(depth * 6.0 - uTime * 1.8 + sin(vW.x * 0.3) * 1.5) * 0.5 + 0.5);
          float edge = smoothstep(0.12, 0.0, depth);
          float foam = clamp(shore * (0.3 + waves) + edge, 0.0, 1.0) * step(0.001, depth);
          col = mix(col, uFoam, foam * 0.85);
          // a fade at the very edge so the water meets the sand softly
          gl_FragColor = vec4(col, smoothstep(0.0, 0.05, depth));
          ${FOG_APPLY}
          ${OUT}
        }`,
      transparent: true,
    }),
  );
  water.rotation.x = -Math.PI / 2;
  scene.add(water);

  // ---------------------------------------------------------------- grass
  const blade = new THREE.BufferGeometry();
  const bw = 0.07;
  blade.setAttribute('position', new THREE.Float32BufferAttribute([-bw, 0, 0, bw, 0, 0, -bw * 0.7, 0.45, 0, bw * 0.7, 0.45, 0, -bw * 0.35, 0.8, 0, bw * 0.35, 0.8, 0, 0, 1, 0], 3));
  blade.setIndex([0, 1, 2, 2, 1, 3, 2, 3, 4, 4, 3, 5, 4, 5, 6]);
  const ig = new THREE.InstancedBufferGeometry();
  ig.index = blade.index;
  ig.attributes.position = blade.attributes.position;
  const N = quality.grass, off = new Float32Array(N * 3), sc = new Float32Array(N), an = new Float32Array(N), shd = new Float32Array(N);
  let k = 0;
  const siteList = Object.values(SITES);
  for (let tries = 0; k < N && tries < N * 12; tries++) {
    const x = (rand() - 0.5) * 170, z = (rand() - 0.5) * 170, h = height(x, z);
    if (h < 0.75 || h > 14 || slopeAt(x, z) > 0.75 || distToPaths(x, z) < 1.4) continue;
    if (fbm(x * 0.06 + 40, z * 0.06) < 0.32) continue;
    if (siteList.some((s) => Math.hypot(x - s.x, z - s.z) < s.r)) continue;
    off.set([x, h - 0.05, z], k * 3); sc[k] = 0.75 * (0.55 + rand() * 0.9); an[k] = rand() * Math.PI; shd[k] = rand(); k++;
  }
  ig.instanceCount = k;
  ig.setAttribute('offset', new THREE.InstancedBufferAttribute(off, 3));
  ig.setAttribute('scale', new THREE.InstancedBufferAttribute(sc, 1));
  ig.setAttribute('angle', new THREE.InstancedBufferAttribute(an, 1));
  ig.setAttribute('shade', new THREE.InstancedBufferAttribute(shd, 1));
  const grass = new THREE.Mesh(ig, new THREE.ShaderMaterial({
    uniforms: { uTime: shared.time, uBull: shared.bull, uWind: shared.wind, uBase: light.grassBase, uTip: light.grassTip, uSun: light.grassLight, ...fogUniforms },
    vertexShader: /* glsl */ `
      attribute vec3 offset; attribute float scale; attribute float angle; attribute float shade;
      uniform float uTime; uniform vec3 uBull; uniform float uWind;
      varying float vY; varying float vShade; ${FOG_PARS}
      void main() {
        vec3 p = position; float c = cos(angle), s = sin(angle);
        p = vec3(p.x * c - p.z * s, p.y * scale, p.x * s + p.z * c);
        vec3 w = offset + p;
        float bend = p.y * p.y;
        float gust = sin(uTime * 1.6 + offset.x * 0.17 + offset.z * 0.11) * 0.6 + sin(uTime * 0.7 + offset.z * 0.05) * 0.4;
        w.x += bend * uWind * (0.35 + 0.25 * gust);
        w.z += bend * uWind * 0.12 * gust;
        // the bull parts the grass as it walks through
        vec2 d = w.xz - uBull.xz; float l = length(d);
        float push = smoothstep(2.2, 0.3, l) * bend * 0.9;
        w.xz += normalize(d + 1e-4) * push; w.y -= push * 0.4;
        vY = position.y; vShade = shade;
        vec4 mv = viewMatrix * vec4(w, 1.0); vFogDepth = -mv.z;
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uBase; uniform vec3 uTip; uniform vec3 uSun;
      varying float vY; varying float vShade; ${FOG_PARS}
      void main() {
        vec3 col = mix(uBase, uTip, smoothstep(0.0, 1.0, vY)) * (0.75 + 0.5 * vShade);
        gl_FragColor = vec4(col * (0.45 + 0.55 * vY) * uSun, 1.0);
        ${FOG_APPLY}
        ${OUT}
      }`,
    side: THREE.DoubleSide,
  }));
  grass.frustumCulled = false;
  scene.add(grass);

  // ---------------------------------------------------------------- holm oaks, rocks, bales, walls, flowers
  const prand = seeded(7); // own seed: props land in the same place whatever the grass quality
  const props = new THREE.Group();
  scene.add(props);
  type Spot = { x: number; z: number; h: number };
  const place = (count: number, ok: (x: number, z: number, h: number) => boolean, minGap: number, avoidPaths = 3) => {
    const out: Spot[] = [];
    for (let t = 0; out.length < count && t < count * 60; t++) {
      const x = (prand() - 0.5) * 150, z = (prand() - 0.5) * 150, h = height(x, z);
      if (!ok(x, z, h) || distToPaths(x, z) < avoidPaths || siteList.some((s) => Math.hypot(x - s.x, z - s.z) < s.r + 3)) continue;
      if (Math.abs(x) < 17 && z > 27 && z < 37) continue; // keep the name's meadow clear
      if (out.some((p) => Math.hypot(p.x - x, p.z - z) < minGap)) continue;
      out.push({ x, z, h });
    }
    return out;
  };
  const instanced = <T extends Spot>(g: THREE.BufferGeometry, m: THREE.Material, items: T[], transform: (o: THREE.Object3D, it: T, i: number) => void) => {
    const mesh = new THREE.InstancedMesh(g, m, items.length);
    const o = new THREE.Object3D();
    items.forEach((it, i) => { o.position.set(it.x, it.h, it.z); o.rotation.set(0, prand() * 6.28, 0); o.scale.setScalar(1); transform(o, it, i); o.updateMatrix(); mesh.setMatrixAt(i, o.matrix); });
    mesh.castShadow = true; mesh.receiveShadow = true;
    props.add(mesh);
    return mesh;
  };
  // holm oaks: short dark trunk, wide flat crown of four blobs
  const trees = place(60, (x, z, h) => h > 1 && h < 11 && slopeAt(x, z) < 0.5, 7);
  instanced(new THREE.CylinderGeometry(0.22, 0.35, 2.2, 7), new THREE.MeshStandardMaterial({ color: 0x3b2c22, roughness: 1 }), trees, (o) => { o.position.y += 1.0; o.rotation.z = (prand() - 0.5) * 0.25; });
  const blobs = trees.flatMap((t) => [0, 1, 2, 3].map((j) => ({ ...t, j })));
  const crowns = instanced(new THREE.IcosahedronGeometry(1, 1), new THREE.MeshStandardMaterial({ color: 0x66733a, roughness: 0.9, flatShading: true }), blobs, (o, t) => {
    const a = t.j * 1.9 + t.x;
    o.position.add(new THREE.Vector3(Math.cos(a) * 1.3, 2.6 + (t.j % 2) * 0.35, Math.sin(a) * 1.3));
    o.scale.set(2.1, 1.05, 2.1).multiplyScalar(0.8 + prand() * 0.3);
  });
  crowns.userData.sway = true;
  const rocks = place(45, (_x, _z, h) => h > 1, 4);
  instanced(new THREE.DodecahedronGeometry(1, 0), new THREE.MeshStandardMaterial({ color: 0x9a948c, roughness: 0.95, flatShading: true }), rocks, (o) => { o.scale.set(0.8 + prand() * 0.7, 0.5 + prand() * 0.5, 0.7 + prand() * 0.7); o.position.y += 0.15; });
  const bales = place(10, (_x, _z, h) => h > 1.2 && h < 6, 9);
  instanced(new THREE.CylinderGeometry(0.7, 0.7, 1.1, 16), new THREE.MeshStandardMaterial({ color: 0xd9b45c, roughness: 1 }), bales, (o) => { o.rotation.z = Math.PI / 2; o.position.y += 0.7; });
  // dry-stone walls along two field edges, as in a real dehesa
  const wallStones: (Spot & { s: number })[] = [];
  for (const [ax, az, bx, bz] of [[-46, 30, -20, 40], [14, -2, 40, 24]]) {
    const len = Math.hypot(bx - ax, bz - az);
    for (let d = 0; d < len; d += 0.55) {
      const x = ax + ((bx - ax) * d) / len, z = az + ((bz - az) * d) / len, h = height(x, z);
      if (h < 0.8 || distToPaths(x, z) < 2.2) continue;
      for (let layer = 0; layer < 2; layer++) wallStones.push({ x: x + (prand() - 0.5) * 0.15, z: z + (prand() - 0.5) * 0.15, h: h + 0.18 + layer * 0.32, s: 0.28 + prand() * 0.12 });
    }
  }
  instanced(new THREE.DodecahedronGeometry(1, 0), new THREE.MeshStandardMaterial({ color: 0xa79e92, roughness: 1, flatShading: true }), wallStones, (o, it) => { o.scale.set(it.s * 1.4, it.s, it.s * 1.1); });
  // wild flowers along the paths
  const flowers: Spot[] = [];
  for (let i = 0; i < 520; i++) {
    const x = (prand() - 0.5) * 150, z = (prand() - 0.5) * 150, h = height(x, z), d = distToPaths(x, z);
    if (h > 0.9 && h < 10 && d > 1.3 && d < 5 && !siteList.some((s) => Math.hypot(x - s.x, z - s.z) < s.r)) flowers.push({ x, z, h });
  }
  const fm = instanced(new THREE.SphereGeometry(0.09, 6, 4), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.6 }), flowers, (o) => { o.position.y += 0.32 + prand() * 0.2; });
  const flowerColors = [0xf6d34a, 0xffffff, 0xe9785a, 0xc9a0ff].map((c) => new THREE.Color(c));
  flowers.forEach((_, i) => fm.setColorAt(i, flowerColors[i % flowerColors.length]));
  fm.castShadow = false;

  // ---------------------------------------------------------------- the four places
  const mat = (c: number, e = 0, ei = 0) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.75, emissive: e, emissiveIntensity: ei });
  const box = (w: number, h: number, d: number, m: THREE.Material, x: number, y: number, z: number, ry = 0) => {
    const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
    b.position.set(x, y, z); b.rotation.y = ry; b.castShadow = b.receiveShadow = true;
    props.add(b);
    return b;
  };
  // the jetty, out to sea: the bull can walk on it (planks and posts merged into one mesh: 1 draw, not 31)
  const wood = mat(0x6b4a2e);
  const jettyParts: THREE.BufferGeometry[] = [];
  const part = (w: number, h: number, d: number, x: number, y: number, z: number) => jettyParts.push(new THREE.BoxGeometry(w, h, d).translate(x, y, z));
  for (let i = 0; i < 18; i++) part(3, 0.18, 1.1, JETTY.x, JETTY.deck - 0.09, JETTY.z0 + 0.6 + i * 1.2 + (i % 3) * 0.02);
  for (let i = 0; i < 6; i++) for (const s of [-1.4, 1.4]) part(0.22, 2.4, 0.22, JETTY.x + s, -0.4, JETTY.z0 + 1.4 + i * 4);
  part(0.12, 1.0, 0.12, JETTY.x - 1.4, JETTY.deck + 0.5, JETTY.z1 - 0.4);
  const jetty = new THREE.Mesh(mergeGeometries(jettyParts), wood);
  jetty.castShadow = jetty.receiveShadow = true;
  props.add(jetty);
  // a small boat moored at the end
  const boat = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 0.6, 4.2, 10, 1, false, 0, Math.PI), mat(0x8a3b2a));
  boat.rotation.set(Math.PI / 2, 0, Math.PI); boat.position.set(JETTY.x + 3.2, 0.25, JETTY.z1 - 3);
  boat.castShadow = true; props.add(boat);

  // WarrenIA: a glass pavilion in the app's sage green. On its back wall, facing the door, a big
  // screen shows the app (drawn from the demo by src/warrenia-demo/screen.ts once the bull comes
  // near); beside it a slowly turning data sculpture (the momentum radar).
  const w = SITES.warrenia, wy = height(w.x, w.z);
  const frame = mat(0x22252b);
  const sage = 0x9fd1ae;
  const glass = new THREE.MeshStandardMaterial({ color: 0xcfe3d3, transparent: true, opacity: 0.22, roughness: 0.08, metalness: 0.2, depthWrite: false });
  box(10, 0.3, 7, mat(0xd8cdbb), w.x, wy + 0.15, w.z);
  const g1 = box(9.4, 4, 6.4, glass, w.x, wy + 2.3, w.z); g1.castShadow = false;
  for (const [dx, dz] of [[-4.7, -3.2], [4.7, -3.2], [-4.7, 3.2], [4.7, 3.2]]) box(0.2, 4.2, 0.2, frame, w.x + dx, wy + 2.4, w.z + dz);
  box(9.8, 0.25, 6.8, frame, w.x, wy + 4.4, w.z);
  box(6, 0.1, 3.5, mat(0x16241b, 0x8dbf9c, 0.9), w.x, wy + 0.35, w.z);
  // the screen: 5.4 × 3.2 m (the demo panel's shape), its face looking east (+x), towards the door
  const screenW = 5.4, screenH = 3.2;
  const screenCenter = new THREE.Vector3(w.x - 4.3, wy + 2.25, w.z);
  box(0.16, screenH + 0.24, screenW + 0.24, frame, screenCenter.x - 0.1, screenCenter.y, screenCenter.z);
  const screenCanvas = document.createElement('canvas');
  screenCanvas.width = 1080; screenCanvas.height = 640;
  {
    // until the demo is drawn: the app's sage nebula and its name
    const c = screenCanvas.getContext('2d')!;
    const g = c.createLinearGradient(0, 0, 1080, 640);
    g.addColorStop(0, '#cfe3d3'); g.addColorStop(1, '#9cc2aa');
    c.fillStyle = g; c.fillRect(0, 0, 1080, 640);
    c.fillStyle = '#1f3a2b'; c.font = '700 96px system-ui, sans-serif'; c.textAlign = 'center';
    c.fillText('WarrenIA', 540, 350);
  }
  const screenTex = new THREE.CanvasTexture(screenCanvas);
  screenTex.colorSpace = THREE.SRGBColorSpace;
  screenTex.anisotropy = 4;
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(screenW, screenH), new THREE.MeshBasicMaterial({ map: screenTex, toneMapped: false, fog: false }));
  screen.position.copy(screenCenter);
  screen.rotation.y = Math.PI / 2;
  props.add(screen);
  const sculpture = new THREE.Group();
  sculpture.position.set(w.x + 2.6, wy + 1.5, w.z - 1.9);
  sculpture.scale.setScalar(0.45);
  const radarN = 140, radar = new THREE.InstancedMesh(new THREE.SphereGeometry(0.07, 6, 4), new THREE.MeshStandardMaterial({ color: 0x0c1a12, emissive: sage, emissiveIntensity: 1.6 }), radarN);
  const ro = new THREE.Object3D();
  for (let i = 0; i < radarN; i++) {
    const a = (i / radarN) * Math.PI * 2 * 3, r = 0.4 + (i / radarN) * 1.6, y = Math.sin(a * 1.7) * 0.5;
    ro.position.set(Math.cos(a) * r, y, Math.sin(a) * r); ro.updateMatrix(); radar.setMatrixAt(i, ro.matrix);
  }
  sculpture.add(radar);
  for (let i = 0; i < 3; i++) {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.7 + i * 0.6, 0.015, 6, 64), new THREE.MeshStandardMaterial({ color: 0x0c1a12, emissive: sage, emissiveIntensity: 0.9 }));
    ring.rotation.x = Math.PI / 2; sculpture.add(ring);
  }
  scene.add(sculpture);

  // the next project, under construction: a concrete frame going up, scaffolding, two tower
  // cranes turning with their loads, and the site's fence with the "coming soon" board
  const t = SITES.taller, ty = height(t.x, t.z);
  const concrete = mat(0xb9b4ab), rebar = mat(0x8a4b2a);
  const site = buildSite(t.x, ty, t.z, concrete, rebar, mat);
  props.add(site.static);
  scene.add(...site.moving);

  // a windmill water pump by the workshop, turning in the wind
  const mill = new THREE.Group();
  const mx = t.x + 7, mz = t.z - 6, my = height(mx, mz);
  for (const [dx, dz] of [[-0.6, -0.6], [0.6, -0.6], [-0.6, 0.6], [0.6, 0.6]]) {
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 7.2, 5), mat(0x55504a));
    leg.position.set(mx + dx * 0.55, my + 3.5, mz + dz * 0.55); leg.rotation.set(dz * 0.08, 0, -dx * 0.08); leg.castShadow = true; mill.add(leg);
  }
  const rotor = new THREE.Group();
  rotor.position.set(mx, my + 7.1, mz + 0.3);
  for (let i = 0; i < 12; i++) {
    const bladeMesh = new THREE.Mesh(new THREE.BoxGeometry(0.22, 1.5, 0.02), mat(0xd9d3c7));
    bladeMesh.position.set(Math.cos((i / 12) * Math.PI * 2) * 0.95, Math.sin((i / 12) * Math.PI * 2) * 0.95, 0);
    bladeMesh.rotation.z = (i / 12) * Math.PI * 2 - Math.PI / 2; bladeMesh.rotation.y = 0.35; bladeMesh.castShadow = true;
    rotor.add(bladeMesh);
  }
  const vane = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.7, 1.4), mat(0xd9d3c7)); vane.position.set(mx, my + 7.1, mz - 0.9); mill.add(vane);
  mill.add(rotor); scene.add(mill);
  // and its stone trough
  box(2.4, 0.5, 0.9, mat(0xb8afa2), mx - 1.6, my + 0.25, mz + 1.4);
  box(2.2, 0.05, 0.7, new THREE.MeshStandardMaterial({ color: 0x4e8a98, roughness: 0.1 }), mx - 1.6, my + 0.48, mz + 1.4);

  // the observatory on its hill: tower, dome, the slit and a lantern by the door
  const o = SITES.observatorio, oy = height(o.x, o.z);
  const tower = new THREE.Mesh(new THREE.CylinderGeometry(3.2, 3.5, 5, 24), mat(0xf3eee4));
  tower.position.set(o.x, oy + 2.5, o.z); tower.castShadow = tower.receiveShadow = true; props.add(tower);
  const dome = new THREE.Mesh(new THREE.SphereGeometry(3.3, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0xd9d4cc, roughness: 0.35, metalness: 0.5 }));
  dome.position.set(o.x, oy + 5, o.z); dome.castShadow = true; props.add(dome);
  box(0.8, 3.4, 3, mat(0x0a0a10, 0xffd88a, 0.8), o.x, oy + 6.4, o.z + 0.6);
  box(1.4, 2.4, 0.2, mat(0x2a2018, 0xffc27a, 0.35), o.x, oy + 1.2, o.z + 3.45);

  // ---------------------------------------------------------------- light beams over each place
  const beamMat = new THREE.ShaderMaterial({
    uniforms: { uColor: { value: new THREE.Color('#ffd59a') }, uFade: { value: 1 } },
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `uniform vec3 uColor; uniform float uFade; varying vec2 vUv; void main(){ gl_FragColor = vec4(uColor, (1.0 - vUv.y) * 0.35 * uFade * smoothstep(0.0, 0.5, 0.5 - abs(vUv.x - 0.5))); ${OUT} }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false,
  });
  for (const s of [SITES.warrenia, SITES.taller, SITES.observatorio]) {
    const b = new THREE.Mesh(new THREE.CylinderGeometry(0.8, 0.8, 40, 12, 1, true), beamMat);
    b.position.set(s.x, height(s.x, s.z) + 22, s.z);
    scene.add(b);
  }

  // ---------------------------------------------------------------- the name, in stone, flanking the path
  const stone = new THREE.MeshStandardMaterial({ color: 0xe8dcc6, roughness: 0.85 });
  const word = (text: keyof typeof nameGlyphs, cx: number, cz: number, sizeM: number, ry: number) => {
    const g = nameGlyphs[text];
    const shapes = shapesFrom(g.commands as (string | number)[][]);
    const geom = new THREE.ExtrudeGeometry(shapes, { depth: 0.12, bevelEnabled: true, bevelThickness: 0.03, bevelSize: 0.012, bevelSegments: 1, curveSegments: 6 });
    geom.scale(sizeM, sizeM, sizeM / 0.5);
    geom.translate((-g.width * sizeM) / 2, 0, 0);
    const mesh = new THREE.Mesh(geom, stone);
    // on a plinth as high as the highest ground under it, so no letter sinks into the slope
    const half = (g.width * sizeM) / 2, ys = [-1, -0.5, 0, 0.5, 1].map((t) => height(cx + Math.cos(ry) * half * t, cz - Math.sin(ry) * half * t));
    const lo = Math.min(...ys), hi = Math.max(...ys);
    mesh.position.set(cx, hi + 0.15, cz);
    mesh.rotation.y = ry; // turned to the visitor arriving from the jetty
    mesh.castShadow = mesh.receiveShadow = true;
    props.add(mesh);
    box(g.width * sizeM + 0.8, hi - lo + 0.45, 0.9, mat(0xb8afa2), cx + Math.sin(ry) * 0.05, (hi + lo) / 2 - 0.05, cz + Math.cos(ry) * 0.05, ry);
  };
  word('HSorollaP', -9.6, 31, 2.1, NAME_ANGLE);

  // ---------------------------------------------------------------- signposts
  const signs: THREE.Mesh[] = [];
  const signpost = (x: number, z: number, boards: { text: string; angle: number }[]) => {
    const y = height(x, z);
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.13, 3.9, 6), wood);
    post.position.set(x, y + 1.95, z); post.castShadow = true; props.add(post);
    boards.forEach((b, i) => {
      // painted on both faces (from behind, the arrow points the other way), and faintly lit by
      // their own paint so they still read in shadow and at dusk
      const face = (back: boolean) => {
        const map = textTexture(b.text, back);
        return new THREE.MeshStandardMaterial({ map, roughness: 0.8, emissive: 0xffffff, emissiveMap: map, emissiveIntensity: 0.32 });
      };
      const m = new THREE.Mesh(new THREE.BoxGeometry(3.6, 0.82, 0.08), [wood, wood, wood, wood, face(false), face(true)]);
      m.position.set(x, y + 3.3 - i * 0.95, z);
      m.rotation.y = b.angle;
      m.translateX(1.72);
      m.castShadow = true;
      props.add(m); signs.push(m);
    });
  };
  // at the crossroads: boards point along each path (angle = direction of travel, measured from +x)
  const dir = (tx: number, tz: number) => -Math.atan2(tz - HUB.z, tx - HUB.x);
  signpost(HUB.x + 1.6, HUB.z + 1.6, [
    { text: 'Biblioteca', angle: dir(-2, -6) },
    { text: 'WarrenIA', angle: dir(-18, 10) },
    { text: 'Próximamente', angle: dir(16, 12) },
  ]);

  // ---------------------------------------------------------------- clouds
  const cloudTex = (() => {
    const c = document.createElement('canvas'); c.width = c.height = 128;
    const x = c.getContext('2d')!;
    const crand = seeded(3);
    for (let i = 0; i < 14; i++) {
      const gx = 30 + crand() * 68, gy = 50 + crand() * 28, r = 18 + crand() * 24;
      const gr = x.createRadialGradient(gx, gy, 0, gx, gy, r);
      gr.addColorStop(0, 'rgba(255,255,255,0.55)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
      x.fillStyle = gr; x.fillRect(0, 0, 128, 128);
    }
    const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  })();
  const clouds: THREE.Sprite[] = [];
  for (let i = 0; i < 14; i++) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: cloudTex, color: 0xffb08a, transparent: true, opacity: 0.85, depthWrite: false, fog: false }));
    const a = rand() * 6.28, r = 60 + rand() * 160;
    s.position.set(Math.cos(a) * r, 45 + rand() * 30, Math.sin(a) * r); s.scale.set(70, 30, 1);
    scene.add(s); clouds.push(s);
  }

  const obstacles = [
    ...trees.map((p) => ({ x: p.x, z: p.z, r: 0.55 })),
    ...rocks.map((p) => ({ x: p.x, z: p.z, r: 1.0 })),
    ...bales.map((p) => ({ x: p.x, z: p.z, r: 1.0 })),
    ...wallStones.filter((_, i) => i % 2 === 0).map((p) => ({ x: p.x, z: p.z, r: 0.45 })),
    { x: HUB.x + 1.6, z: HUB.z + 1.6, r: 0.4 },
    { x: mx, z: mz, r: 0.9 }, { x: mx - 1.6, z: mz + 1.4, r: 1.2 },
    ...site.obstacles,
  ];

  // see-through for everything that can stand between the camera and the bull; crowns also sway
  props.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (!mesh.isMesh || Array.isArray(mesh.material) || !(mesh.material as THREE.MeshStandardMaterial).isMeshStandardMaterial || (mesh.material as THREE.Material).transparent) return;
    patchMaterial(mesh, shared, { seeThrough: true, sway: !!mesh.userData.sway });
  });

  let seaLevel = 0;
  return {
    scene, sun, hemi, props, grass, grassBuilt: k, clouds, water, wetLevel, obstacles,
    get seaLevel() { return seaLevel; },
    update(dt, time, night) {
      // the swash: the sea runs up the beach and back every ~11 s
      seaLevel = 0.1 * Math.sin(time * 0.55) + 0.04 * Math.sin(time * 1.3 + 1.7);
      seaLevelU.value = seaLevel;
      wetLevel.value = Math.max(seaLevel, wetLevel.value - dt * 0.012);
      rotor.rotation.z -= dt * (1.2 + shared.wind.value * 2);
      site.update(time, night);
      sculpture.rotation.y += dt * 0.25;
      radar.position.y = Math.sin(time * 0.8) * 0.15;
      for (const c of clouds) c.position.x = ((c.position.x + dt * 1.2 + 260) % 520) - 260;
      (beamMat.uniforms.uColor.value as THREE.Color).set('#ffd59a').lerp(new THREE.Color('#9fc0ff'), night);
    },
    setGrassCount(n) { ig.instanceCount = Math.min(n, k); },
    setFade(f) {
      beamMat.uniforms.uFade.value = 1 - f;
      for (const c of clouds) { (c.material as THREE.SpriteMaterial).opacity = 0.85 * (1 - f); c.visible = f < 0.999; }
    },
    mapImage() { return drawMap(); },
    screen: { center: screenCenter, normal: new THREE.Vector3(1, 0, 0), width: screenW, height: screenH, canvas: screenCanvas, update() { screenTex.needsUpdate = true; } },
  };
}

// opentype path commands → three shapes (outer contours with their holes)
function shapesFrom(commands: (string | number)[][]) {
  const paths: THREE.Path[] = [];
  let cur: THREE.Path | null = null;
  for (const c of commands) {
    const [t, ...v] = c as [string, ...number[]];
    if (t === 'M') { cur = new THREE.Path(); cur.moveTo(v[0], v[1]); paths.push(cur); }
    else if (t === 'L') cur!.lineTo(v[0], v[1]);
    else if (t === 'Q') cur!.quadraticCurveTo(v[0], v[1], v[2], v[3]);
    else if (t === 'C') cur!.bezierCurveTo(v[0], v[1], v[2], v[3], v[4], v[5]);
  }
  // contours that turn one way are letters, the other way holes (counters of O, R…)
  // (which way is which depends on the font, so take the direction of the largest contour)
  const areas = paths.map((p) => THREE.ShapeUtils.area(p.getPoints(4)));
  const sign = Math.sign(areas.reduce((a, b) => (Math.abs(b) > Math.abs(a) ? b : a), 0));
  const outers = paths.filter((_, i) => Math.sign(areas[i]) === sign), holes = paths.filter((_, i) => Math.sign(areas[i]) !== sign);
  const outerShapes = outers.map((p) => { const s = new THREE.Shape(); s.curves = p.curves; s.currentPoint = p.currentPoint; return s; });
  for (const h of holes) {
    const pt = h.getPoints(1)[0];
    const owner = outerShapes.find((s) => inside(pt, s.getPoints(6)));
    owner?.holes.push(h);
  }
  return outerShapes;
}
function inside(p: THREE.Vector2, poly: THREE.Vector2[]) {
  let c = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    if ((poly[i].y > p.y) !== (poly[j].y > p.y) && p.x < ((poly[j].x - poly[i].x) * (p.y - poly[i].y)) / (poly[j].y - poly[i].y) + poly[i].x) c = !c;
  }
  return c;
}

/** Painted wooden board with a place name. */
/** A signpost board: dark letters on pale painted wood, the arrow on the side it points to. */
function textTexture(text: string, back = false) {
  const W = 1024, H = 233, c = document.createElement('canvas');
  c.width = W; c.height = H;
  const x = c.getContext('2d')!;
  x.fillStyle = '#efe2c6'; x.fillRect(0, 0, W, H);
  x.fillStyle = 'rgba(90,60,30,0.08)'; for (let i = 0; i < 8; i++) x.fillRect(0, 14 + i * 28, W, 3);
  x.strokeStyle = '#5a3a22'; x.lineWidth = 10; x.strokeRect(5, 5, W - 10, H - 10);
  x.fillStyle = '#2b1a0e';
  x.font = '800 138px "Bricolage Grotesque Variable", system-ui, sans-serif';
  x.textBaseline = 'middle'; x.textAlign = 'center';
  x.fillText(text, back ? W / 2 + 40 : W / 2 - 40, H / 2 + 4, W - 190);
  // the arrow
  const ax = back ? 30 : W - 30, d = back ? 1 : -1;
  x.beginPath(); x.moveTo(ax, H / 2); x.lineTo(ax + d * 80, H / 2 - 62); x.lineTo(ax + d * 80, H / 2 + 62); x.fill();
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

/** The map: terrain colours from above, paths and the sea, north up. */
function drawMap() {
  const n = 220, c = document.createElement('canvas');
  c.width = c.height = n;
  const x = c.getContext('2d')!, img = x.createImageData(n, n);
  const span = 150; // metres shown
  const sea = new THREE.Color('#24405e'), shallow = new THREE.Color('#4e8a98'), sand = new THREE.Color(TERRAIN.sand), g1 = new THREE.Color(TERRAIN.grassA), g2 = new THREE.Color(TERRAIN.grassB), path = new THREE.Color(TERRAIN.path), tmp = new THREE.Color();
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    const wx = (i / (n - 1) - 0.5) * span, wz = (j / (n - 1) - 0.5) * span, h = height(wx, wz);
    if (h < 0) tmp.copy(shallow).lerp(sea, smoothstep(0, -4, h));
    else if (h < 0.8) tmp.copy(sand);
    else tmp.copy(g1).lerp(g2, smoothstep(2, 10, h));
    if (h > 0.4 && distToPaths(wx, wz) < 1.2) tmp.copy(path);
    // a little hill shading
    const shade = 1 + (height(wx - 1, wz - 1) - h) * 0.12;
    tmp.multiplyScalar(Math.max(0.6, Math.min(1.25, shade)));
    const k = (j * n + i) * 4;
    img.data[k] = tmp.r * 255; img.data[k + 1] = tmp.g * 255; img.data[k + 2] = tmp.b * 255; img.data[k + 3] = 255;
  }
  x.putImageData(img, 0, 0);
  return c;
}

export const MAP_SPAN = 150;
export { DOORS };
