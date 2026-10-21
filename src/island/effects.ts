// Hoofprints, dust puffs and the motes in the air (golden dust at dusk, fireflies at night).

import * as THREE from 'three';
import { FOG_APPLY, FOG_PARS, OUT, type Shared } from './shaders';
import type { LightUniforms } from './palette';
import { height, seeded, SITES } from './terrain';

// ---------------------------------------------------------------- hoofprints
export function createPrints(shared: Shared, light: LightUniforms) {
  const MAX = 700, LIFE = 22;
  const g = new THREE.InstancedBufferGeometry();
  const plane = new THREE.PlaneGeometry(0.34, 0.42);
  plane.rotateX(-Math.PI / 2);
  g.index = plane.index;
  g.attributes.position = plane.attributes.position;
  g.attributes.uv = plane.attributes.uv;
  const pos = new Float32Array(MAX * 3), rot = new Float32Array(MAX), birth = new Float32Array(MAX).fill(-999);
  const aPos = new THREE.InstancedBufferAttribute(pos, 3), aRot = new THREE.InstancedBufferAttribute(rot, 1), aBirth = new THREE.InstancedBufferAttribute(birth, 1);
  for (const a of [aPos, aRot, aBirth]) a.setUsage(THREE.DynamicDrawUsage);
  g.setAttribute('ipos', aPos); g.setAttribute('irot', aRot); g.setAttribute('ibirth', aBirth);
  g.instanceCount = MAX;
  const mat = new THREE.ShaderMaterial({
    uniforms: { uTime: shared.time, uLife: { value: LIFE }, uNight: light.night, uFogColor: light.fog, uFogDensity: light.fogDensity },
    vertexShader: /* glsl */ `
      attribute vec3 ipos; attribute float irot; attribute float ibirth; uniform float uTime; uniform float uLife;
      varying vec2 vUv; varying float vA; ${FOG_PARS}
      void main() {
        vUv = uv; float c = cos(irot), s = sin(irot);
        vec3 p = vec3(position.x * c + position.z * s, position.y, -position.x * s + position.z * c) + ipos;
        vA = 1.0 - smoothstep(uLife * 0.5, uLife, uTime - ibirth);
        vec4 mv = viewMatrix * vec4(p, 1.0); vFogDepth = -mv.z; gl_Position = projectionMatrix * mv;
      }`,
    // a cloven hoof: two half-ovals with a gap between them; at night the prints glow faintly
    fragmentShader: /* glsl */ `
      uniform float uNight; varying vec2 vUv; varying float vA; ${FOG_PARS}
      void main() {
        vec2 p = vUv - 0.5; vec2 q = vec2(abs(p.x) - 0.11, p.y + 0.02);
        float claw = length(q / vec2(0.1, 0.19));
        float a = smoothstep(1.0, 0.8, claw) * smoothstep(0.015, 0.03, abs(p.x)) * vA;
        if (a < 0.01) discard;
        float glow = smoothstep(0.5, 1.0, uNight);
        vec3 col = mix(vec3(0.23, 0.165, 0.094), vec3(0.45, 0.85, 1.0), glow);
        gl_FragColor = vec4(col, a * mix(0.55, 0.7, glow));
        ${FOG_APPLY}
        ${OUT}
      }`,
    transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4,
  });
  const mesh = new THREE.Mesh(g, mat);
  mesh.frustumCulled = false;
  let head = 0;
  return {
    mesh,
    stamp(x: number, y: number, z: number, heading: number, now: number) {
      pos.set([x, y + 0.04, z], head * 3); rot[head] = heading; birth[head] = now;
      aPos.needsUpdate = aRot.needsUpdate = aBirth.needsUpdate = true;
      head = (head + 1) % MAX;
    },
    /** The sea washes away prints it reaches. Returns how many it erased. */
    wash(seaLevel: number) {
      let n = 0;
      for (let i = 0; i < MAX; i++) if (birth[i] > -999 && pos[i * 3 + 1] - 0.04 < seaLevel + 0.03) { birth[i] = -999; n++; }
      if (n) aBirth.needsUpdate = true;
      return n;
    },
    count() { let n = 0; for (let i = 0; i < MAX; i++) if (birth[i] > -999) n++; return n; },
  };
}
export type Prints = ReturnType<typeof createPrints>;

// ---------------------------------------------------------------- dust puffs from the hooves
export function createDust(shared: Shared) {
  const MAX = 320;
  const pos = new Float32Array(MAX * 3), vel = new Float32Array(MAX * 3), birth = new Float32Array(MAX).fill(-999);
  const g = new THREE.BufferGeometry();
  const aPos = new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage);
  const aBirth = new THREE.BufferAttribute(birth, 1).setUsage(THREE.DynamicDrawUsage);
  g.setAttribute('position', aPos); g.setAttribute('birth', aBirth);
  const mat = new THREE.ShaderMaterial({
    uniforms: { uTime: shared.time, uColor: { value: new THREE.Color('#d9b27a') }, uScale: shared.pixelScale },
    vertexShader: 'attribute float birth; uniform float uTime; uniform float uScale; varying float vA; void main(){ float age = uTime - birth; vA = (1.0 - smoothstep(0.0, 1.4, age)) * step(0.0, age); vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_PointSize = min((20.0 + age * 40.0) * uScale * (6.0 / -mv.z), 90.0 * uScale); gl_Position = projectionMatrix * mv; }',
    fragmentShader: `uniform vec3 uColor; varying float vA; void main(){ float d = length(gl_PointCoord - 0.5); if (d > 0.5) discard; gl_FragColor = vec4(uColor, smoothstep(0.5, 0.1, d) * vA * 0.35); ${OUT} }`,
    transparent: true, depthWrite: false,
  });
  const points = new THREE.Points(g, mat);
  points.frustumCulled = false;
  let head = 0;
  return {
    points,
    /** strength: 1 walking, up to 4 galloping; sand and paths raise more dust than grass. */
    puff(x: number, y: number, z: number, now: number, strength: number) {
      for (let i = 0; i < Math.round(2 * strength); i++) {
        pos.set([x + (Math.random() - 0.5) * 0.4, y + 0.1, z + (Math.random() - 0.5) * 0.4], head * 3);
        birth[head] = now;
        vel.set([(Math.random() - 0.5) * 0.8, 0.4 + Math.random() * 0.6, (Math.random() - 0.5) * 0.8], head * 3);
        head = (head + 1) % MAX;
      }
      aBirth.needsUpdate = true;
    },
    step(dt: number, now: number, night: number) {
      for (let i = 0; i < MAX; i++) {
        if (now - birth[i] > 1.5) continue;
        pos[i * 3] += vel[i * 3] * dt; pos[i * 3 + 1] += vel[i * 3 + 1] * dt; pos[i * 3 + 2] += vel[i * 3 + 2] * dt;
      }
      aPos.needsUpdate = true;
      (mat.uniforms.uColor.value as THREE.Color).set('#d9b27a').lerp(new THREE.Color('#5b6280'), night);
    },
  };
}
export type Dust = ReturnType<typeof createDust>;

// ---------------------------------------------------------------- motes in the air
type Motion = 'float' | 'blink';
function motes(shared: Shared, n: number, spread: number, centre: [number, number], yMin: number, yMax: number, color: string, size: number, motion: Motion, seed: number) {
  const rand = seeded(seed);
  const p = new Float32Array(n * 3), ph = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const x = centre[0] + (rand() - 0.5) * spread, z = centre[1] + (rand() - 0.5) * spread;
    p.set([x, Math.max(0, height(x, z)) + yMin + rand() * (yMax - yMin), z], i * 3);
    ph[i] = rand();
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(p, 3));
  g.setAttribute('phase', new THREE.BufferAttribute(ph, 1));
  const opacity = { value: 1 };
  const mat = new THREE.ShaderMaterial({
    uniforms: { uTime: shared.time, uColor: { value: new THREE.Color(color) }, uSize: { value: size }, uScale: shared.pixelScale, uOpacity: opacity },
    vertexShader: /* glsl */ `
      attribute float phase; uniform float uTime; uniform float uSize; uniform float uScale; uniform float uOpacity; varying float vA;
      void main() {
        vec3 p = position;
        ${motion === 'float'
          ? 'p += vec3(sin(uTime * 0.4 + phase * 6.0), sin(uTime * 0.7 + phase * 4.0) * 0.5, cos(uTime * 0.35 + phase * 5.0)) * 1.6; vA = 0.55 + 0.45 * sin(uTime * 2.0 + phase * 20.0);'
          : 'p += vec3(sin(uTime * 0.5 + phase * 6.0), sin(uTime * 0.9 + phase * 3.0) * 0.4, cos(uTime * 0.45 + phase * 7.0)) * 1.2; vA = smoothstep(0.55, 1.0, sin(uTime * 1.7 + phase * 31.0));'}
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_PointSize = min(uSize * uScale * (40.0 / -mv.z), 26.0 * uScale);
        vA *= smoothstep(1.0, 4.0, -mv.z) * uOpacity; // fade motes right in front of the camera
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: `uniform vec3 uColor; varying float vA; void main(){ float d = length(gl_PointCoord - 0.5); if (d > 0.5 || vA < 0.01) discard; gl_FragColor = vec4(uColor * (0.6 + 0.8 * smoothstep(0.25, 0.0, d)), smoothstep(0.5, 0.0, d) * vA); ${OUT} }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  });
  const pts = new THREE.Points(g, mat);
  pts.frustumCulled = false;
  return { points: pts, opacity };
}

export function createAmbient(shared: Shared) {
  const o = SITES.observatorio;
  const dust = motes(shared, 700, 150, [0, 0], 0.5, 9, '#ffd9a0', 2.2, 'float', 11);
  const fireflies = motes(shared, 360, 70, [o.x, o.z + 12], 0.4, 3.2, '#d8ff7a', 3.2, 'blink', 12);
  const group = new THREE.Group();
  group.add(dust.points, fireflies.points);
  return {
    group,
    setNight(night: number) {
      dust.opacity.value = 1 - night;
      fireflies.opacity.value = night;
      dust.points.visible = night < 0.99;
      fireflies.points.visible = night > 0.01;
    },
  };
}
