// Things with wings: flocks of small birds that peck in the meadows and take off when the bull
// comes close, gulls circling over the sea, and butterflies over the flowers (only by daylight).
// All drawn as one instanced mesh each: a body and two wings that flap in the vertex shader.

import * as THREE from 'three';
import { FOG_APPLY, FOG_PARS, OUT, type Shared } from './shaders';
import type { LightUniforms } from './palette';
import { distToPaths, height, seeded, JETTY } from './terrain';

function wingedMaterial(shared: Shared, light: LightUniforms) {
  return new THREE.ShaderMaterial({
    uniforms: { uTime: shared.time, uSun: light.sunColor, uNight: light.night, uFogColor: light.fog, uFogDensity: light.fogDensity },
    vertexShader: /* glsl */ `
      attribute float wing; attribute vec3 flap; // flap: amplitude, speed, phase
      uniform float uTime;
      varying vec3 vColor; varying float vLit; ${FOG_PARS}
      void main() {
        vec3 p = position;
        // wings rotate about the body's long axis (z)
        float a = wing * (sin(uTime * flap.y + flap.z * 6.283) * flap.x + 0.15);
        float c = cos(a), s = sin(a);
        if (wing != 0.0) p = vec3(p.x * c - p.y * s, p.x * s + p.y * c, p.z);
        vColor = instanceColor; vLit = 0.75 + 0.25 * sin(a);
        vec4 mv = viewMatrix * modelMatrix * instanceMatrix * vec4(p, 1.0);
        vFogDepth = -mv.z;
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uSun; uniform float uNight; varying vec3 vColor; varying float vLit; ${FOG_PARS}
      void main() { gl_FragColor = vec4(vColor * vLit * mix(uSun * 0.55, vec3(0.35), uNight), 1.0); ${FOG_APPLY} ${OUT} }`,
    side: THREE.DoubleSide,
  });
}

/** Body (a thin diamond) and two wings; wingSpan and length in metres. */
function wingedGeometry(span: number, length: number) {
  const h = span / 2, l = length / 2;
  // x: across, y: up, z: forward
  const v = [
    0, 0, l, 0.04 * span, 0, 0, 0, 0, -l, -0.04 * span, 0, 0, // body
    0, 0, l * 0.5, h, 0, 0, 0, 0, -l * 0.4, // right wing
    0, 0, l * 0.5, -h, 0, 0, 0, 0, -l * 0.4, // left wing
  ];
  const wing = [0, 0, 0, 0, 0, 1, 0, 0, -1, 0];
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(v, 3));
  g.setAttribute('wing', new THREE.Float32BufferAttribute(wing, 1));
  g.setIndex([0, 1, 2, 0, 2, 3, 4, 5, 6, 7, 8, 9]);
  return g;
}

interface Flyer {
  pos: THREE.Vector3; vel: THREE.Vector3;
  state: 'perched' | 'flying' | 'landing';
  home: THREE.Vector3; target: THREE.Vector3;
  timer: number; flap: number;
}

export function createBirds(shared: Shared, light: LightUniforms) {
  const rand = seeded(91);
  const group = new THREE.Group();
  const mat = wingedMaterial(shared, light);

  // --- small birds in flocks of 7 on open meadows
  const meadows: THREE.Vector3[] = [];
  for (let t = 0; meadows.length < 6 && t < 400; t++) {
    const x = (rand() - 0.5) * 110, z = (rand() - 0.5) * 110, h = height(x, z);
    if (h > 1.2 && h < 8 && distToPaths(x, z) > 3 && distToPaths(x, z) < 14 && meadows.every((m) => m.distanceTo(new THREE.Vector3(x, h, z)) > 18)) meadows.push(new THREE.Vector3(x, h, z));
  }
  const birds: Flyer[] = [];
  const perFlock = 7, flocks = 3;
  for (let f = 0; f < flocks; f++) for (let i = 0; i < perFlock; i++) {
    const m = meadows[f];
    const p = new THREE.Vector3(m.x + (rand() - 0.5) * 3, 0, m.z + (rand() - 0.5) * 3);
    p.y = height(p.x, p.z);
    birds.push({ pos: p, vel: new THREE.Vector3(), state: 'perched', home: p.clone(), target: p.clone(), timer: rand() * 3, flap: 0 });
  }
  const birdMesh = new THREE.InstancedMesh(wingedGeometry(0.42, 0.26), mat, birds.length);
  const flapB = new Float32Array(birds.length * 3);
  birdMesh.geometry.setAttribute('flap', new THREE.InstancedBufferAttribute(flapB, 3));
  birds.forEach((_, i) => { birdMesh.setColorAt(i, new THREE.Color(rand() < 0.5 ? 0x3a2c22 : 0x5a4634)); flapB[i * 3 + 2] = rand(); });
  birdMesh.frustumCulled = false;
  group.add(birdMesh);

  // --- gulls circling over the sea off the jetty
  const gulls = Array.from({ length: 6 }, (_, i) => ({ r: 14 + rand() * 12, h: 11 + rand() * 7, w: 0.18 + rand() * 0.12, a: (i / 6) * 6.28, cx: JETTY.x + (rand() - 0.5) * 10, cz: JETTY.z1 + rand() * 8 }));
  const gullMesh = new THREE.InstancedMesh(wingedGeometry(1.3, 0.5), mat, gulls.length);
  const flapG = new Float32Array(gulls.length * 3);
  gullMesh.geometry.setAttribute('flap', new THREE.InstancedBufferAttribute(flapG, 3));
  gulls.forEach((_, i) => { gullMesh.setColorAt(i, new THREE.Color(0xf2efe8)); flapG.set([0.35, 5, rand()], i * 3); });
  gullMesh.frustumCulled = false;
  group.add(gullMesh);

  // --- butterflies over the flowers by the paths
  const flutter = Array.from({ length: 36 }, () => {
    let x = 0, z = 0;
    for (let t = 0; t < 50; t++) { x = (rand() - 0.5) * 120; z = (rand() - 0.5) * 120; const d = distToPaths(x, z); if (height(x, z) > 1 && d > 1.5 && d < 5) break; }
    return { x, z, ph: rand() * 100, sp: 0.6 + rand() * 0.6 };
  });
  const flyMesh = new THREE.InstancedMesh(wingedGeometry(0.16, 0.06), mat, flutter.length);
  const flapF = new Float32Array(flutter.length * 3);
  flyMesh.geometry.setAttribute('flap', new THREE.InstancedBufferAttribute(flapF, 3));
  const flyColors = [0xffd84a, 0xffffff, 0xff9a4a, 0xb9a4ff];
  flutter.forEach((_, i) => { flyMesh.setColorAt(i, new THREE.Color(flyColors[i % 4])); flapF.set([1.1, 22, rand()], i * 3); });
  flyMesh.frustumCulled = false;
  group.add(flyMesh);

  const o = new THREE.Object3D(), tmp = new THREE.Vector3(), away = new THREE.Vector3();
  let scared = 0;
  return {
    group,
    /** Where flocks are pecking right now: the centre of each flock that is all on the ground (for tests). */
    perched() {
      const out: { x: number; z: number }[] = [];
      for (let f = 0; f < flocks; f++) {
        const flock = birds.slice(f * perFlock, (f + 1) * perFlock);
        if (flock.every((b) => b.state === 'perched')) out.push({ x: flock.reduce((s, b) => s + b.pos.x, 0) / perFlock, z: flock.reduce((s, b) => s + b.pos.z, 0) / perFlock });
      }
      return out;
    },
    /** How many times a flock has taken off because of the bull (for tests). */
    get scared() { return scared; },
    update(dt: number, t: number, bull: THREE.Vector3, night: number) {
      // small birds
      for (let f = 0; f < flocks; f++) {
        const flock = birds.slice(f * perFlock, (f + 1) * perFlock);
        const perched = flock.filter((b) => b.state === 'perched');
        const centre = perched.reduce((c, b) => c.add(b.pos), tmp.set(0, 0, 0)).divideScalar(Math.max(1, perched.length));
        if (perched.length && Math.hypot(centre.x - bull.x, centre.z - bull.z) < 9) {
          scared++;
          // the flock takes off, away from the bull, and circles until it lands on another meadow
          const next = meadows[(meadows.indexOf(meadows.find((m) => m.distanceTo(flock[0].home) < 6) ?? meadows[f]) + 1 + Math.floor(Math.random() * 4)) % meadows.length];
          for (const b of perched) {
            away.set(b.pos.x - bull.x, 0, b.pos.z - bull.z).normalize();
            b.vel.set(away.x * 6 + (Math.random() - 0.5) * 2, 5 + Math.random() * 2, away.z * 6 + (Math.random() - 0.5) * 2);
            b.state = 'flying'; b.timer = 5 + Math.random() * 3;
            b.home.set(next.x + (Math.random() - 0.5) * 3, 0, next.z + (Math.random() - 0.5) * 3);
            b.home.y = height(b.home.x, b.home.z);
          }
        }
      }
      birds.forEach((b, i) => {
        if (b.state === 'perched') {
          // hop and peck now and then
          b.timer -= dt;
          if (b.timer < 0) { b.timer = 0.6 + Math.random() * 2.4; b.vel.set((Math.random() - 0.5) * 0.8, 0, (Math.random() - 0.5) * 0.8); }
          b.pos.addScaledVector(b.vel, dt); b.vel.multiplyScalar(Math.exp(-dt * 6));
          b.pos.y = height(b.pos.x, b.pos.z) + Math.abs(Math.sin(t * 9 + i)) * 0.03;
          b.flap = 0;
        } else {
          b.timer -= dt;
          // fly in a loop, then glide down to the new meadow
          if (b.state === 'flying') {
            b.target.set(b.home.x + Math.cos(t * 0.6 + i) * 12, b.home.y + 9, b.home.z + Math.sin(t * 0.6 + i) * 12);
            if (b.timer < 0) b.state = 'landing';
          } else b.target.copy(b.home);
          tmp.subVectors(b.target, b.pos);
          const dist = tmp.length();
          b.vel.lerp(tmp.normalize().multiplyScalar(b.state === 'landing' ? Math.min(7, dist * 1.2 + 0.5) : 8), 1 - Math.exp(-dt * 1.4));
          b.pos.addScaledVector(b.vel, dt);
          b.flap = b.state === 'landing' && dist < 4 ? 0.4 : 1;
          if (b.state === 'landing' && dist < 0.25) { b.state = 'perched'; b.pos.copy(b.home); b.vel.set(0, 0, 0); b.timer = 1; }
        }
        o.position.copy(b.pos);
        if (b.vel.lengthSq() > 0.05) o.lookAt(tmp.copy(b.pos).add(b.vel)); else o.rotation.set(0, i, 0);
        o.updateMatrix();
        birdMesh.setMatrixAt(i, o.matrix);
        flapB[i * 3] = b.flap * 0.9; flapB[i * 3 + 1] = 24;
      });
      birdMesh.instanceMatrix.needsUpdate = true;
      (birdMesh.geometry.getAttribute('flap') as THREE.InstancedBufferAttribute).needsUpdate = true;

      // gulls
      gulls.forEach((g, i) => {
        const a = g.a + t * g.w;
        o.position.set(g.cx + Math.cos(a) * g.r, g.h + Math.sin(t * 0.7 + i) * 1.2, g.cz + Math.sin(a) * g.r);
        o.lookAt(g.cx + Math.cos(a + 0.1) * g.r, o.position.y, g.cz + Math.sin(a + 0.1) * g.r);
        o.rotateZ(-0.35); // banking into the turn
        o.updateMatrix();
        gullMesh.setMatrixAt(i, o.matrix);
        flapG[i * 3] = Math.sin(t * 0.5 + i) > 0.3 ? 0.4 : 0.05; // flap a while, glide a while
      });
      gullMesh.instanceMatrix.needsUpdate = true;
      (gullMesh.geometry.getAttribute('flap') as THREE.InstancedBufferAttribute).needsUpdate = true;
      gullMesh.visible = night < 0.85;

      // butterflies: erratic little loops over their patch, gone at night
      flutter.forEach((f, i) => {
        const tt = t * f.sp + f.ph;
        o.position.set(f.x + Math.sin(tt * 1.3) * 1.6 + Math.sin(tt * 3.1) * 0.4, height(f.x, f.z) + 0.6 + Math.abs(Math.sin(tt * 2.2)) * 0.7, f.z + Math.cos(tt * 1.1) * 1.6);
        o.rotation.set(0, tt * 1.3, 0);
        o.scale.setScalar(1 - night);
        o.updateMatrix();
        flyMesh.setMatrixAt(i, o.matrix);
      });
      flyMesh.instanceMatrix.needsUpdate = true;
      flyMesh.visible = night < 0.95;
      o.scale.setScalar(1);
    },
  };
}
