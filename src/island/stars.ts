// The island's night sky is the library: one star per note, coloured by its theme, laid on the
// sky dome from the constellation's own 3D layout (public/data/graph.*). Loaded only when the
// night begins, so it costs nothing at the start.
//
// From the observatory the same stars rearrange into the 3D constellation: each star flies from
// its place on the dome to its place in the constellation (set in front of the camera by
// setMorphTarget), growing to the size and colour it has there, so the hand-over to the
// interactive sky (src/constellation) shows the same stars in the same places.

import * as THREE from 'three';
import { loadGraph } from '../constellation/data';
import { THEMES } from '../lib/themes';
import type { Shared } from './shaders';

export async function createLibrarySky(shared: Shared, night: { value: number }) {
  const g = await loadGraph();
  const n = g.count, pos = new Float32Array(n * 3), col = new Float32Array(n * 3), size = new Float32Array(n), ph = new Float32Array(n);
  const skyCol = new Float32Array(n * 3), skySize = new Float32Array(n), ring = new Float32Array(n);
  const colorOf = THEMES.map((t) => new THREE.Color(t.color));
  const d = new THREE.Vector3(), c = new THREE.Color(), white = new THREE.Color('#eef1ff');
  for (let i = 0; i < n; i++) {
    d.fromArray(g.positions, i * 3).normalize();
    // fold onto the upper sky, never below 12° so trees and hills don't hide it all
    d.y = 0.2 + Math.abs(d.y) * 0.8;
    d.normalize().multiplyScalar(820);
    pos.set([d.x, d.y, d.z], i * 3);
    const theme = THEMES.findIndex((t) => t.name === g.themeNames[g.themes[i]]);
    const tc = theme >= 0 ? colorOf[theme] : white;
    c.copy(tc).lerp(white, 0.35); // a little paler: starlight
    col.set([c.r, c.g, c.b], i * 3);
    size[i] = g.kinds[i] === 0 ? 7 : 3.2; // books shine brighter than concepts
    ph[i] = (i * 0.6180339) % 1;
    // as in the constellation (src/constellation/scene.ts)
    const deg = g.adjStart[i + 1] - g.adjStart[i], book = g.kinds[i] === 0;
    skySize[i] = book ? 9 + Math.min(Math.sqrt(deg), 24) * 0.55 : 2.9 + Math.min(Math.sqrt(deg), 10) * 0.6;
    const k = book ? 1.15 : 1;
    skyCol.set([tc.r * k, tc.g * k, tc.b * k], i * 3);
    ring[i] = THEMES[theme]?.mark === 'ring' ? 1 : 0;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.setAttribute('size', new THREE.BufferAttribute(size, 1));
  geo.setAttribute('phase', new THREE.BufferAttribute(ph, 1));
  geo.setAttribute('skyPos', new THREE.BufferAttribute(g.positions, 3));
  geo.setAttribute('skyColor', new THREE.BufferAttribute(skyCol, 3));
  geo.setAttribute('skySize', new THREE.BufferAttribute(skySize, 1));
  geo.setAttribute('ring', new THREE.BufferAttribute(ring, 1));
  const morph = { value: 0 }, morphMatrix = { value: new THREE.Matrix4() }, morphScale = { value: 1 }, skyScale = { value: 1 };
  const mat = new THREE.ShaderMaterial({
    uniforms: { uTime: shared.time, uScale: shared.pixelScale, uNight: night, uMorph: morph, uMorphMatrix: morphMatrix, uMorphScale: morphScale, uSkyScale: skyScale },
    vertexShader: /* glsl */ `
      attribute vec3 color; attribute float size; attribute float phase;
      attribute vec3 skyPos; attribute vec3 skyColor; attribute float skySize; attribute float ring;
      uniform float uTime; uniform float uScale; uniform float uNight;
      uniform float uMorph; uniform mat4 uMorphMatrix; uniform float uMorphScale; uniform float uSkyScale;
      varying vec3 vColor; varying float vA; varying float vM; varying float vRing;
      void main() {
        // each star sets off a little after the one before (by its phase), all arrive together
        float m = smoothstep(phase * 0.45, phase * 0.45 + 0.55, uMorph);
        vM = m; vRing = ring;
        vec3 p = mix(position, (uMorphMatrix * vec4(skyPos, 1.0)).xyz, m);
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        float twinkle = 0.75 + 0.25 * sin(uTime * (1.0 + phase * 2.0) + phase * 40.0);
        vA = mix(smoothstep(0.15, 0.85, uNight) * twinkle, 1.0, m);
        vColor = mix(color, skyColor, m);
        // on the dome: a fixed size; in the constellation: the sky's own size and perspective
        float skyPx = min(skySize * uSkyScale * (100.0 * uMorphScale / -mv.z), 72.0 * uSkyScale);
        gl_PointSize = mix(size * uScale, skyPx, m);
        gl_Position = projectionMatrix * mv;
      }`,
    // the dome's soft dot becomes the constellation's star (same shape as src/constellation/scene.ts)
    fragmentShader: /* glsl */ `
      varying vec3 vColor; varying float vA; varying float vM; varying float vRing;
      void main() {
        float d = length(gl_PointCoord - 0.5);
        if (d > 0.5 || vA < 0.01) discard;
        float core = smoothstep(0.2, 0.0, d), halo = smoothstep(0.5, 0.06, d) * 0.5;
        float ringShape = smoothstep(0.08, 0.0, abs(d - 0.3)) * 1.4;
        vec3 dome = vColor * (0.7 + 1.2 * smoothstep(0.22, 0.0, d));
        vec3 sky = vColor * mix(core * 1.6 + halo, ringShape, vRing);
        gl_FragColor = vec4(mix(dome, sky, vM), mix(smoothstep(0.5, 0.05, d), max(core, halo), vM) * vA);
      }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
  });
  const points = new THREE.Points(geo, mat);
  points.frustumCulled = false;
  points.renderOrder = -1;
  return {
    points,
    count: n,
    morph,
    /**
     * Where the constellation goes: q = P + R·(p − Ps)·S, so that an island camera at P with
     * rotation Q sees it exactly as the sky's camera (at Ps, rotation Qs) sees the constellation.
     */
    setMorphTarget(P: THREE.Vector3, Q: THREE.Quaternion, Ps: THREE.Vector3, Qs: THREE.Quaternion, S: number, skyPointScale: number) {
      const R = Q.clone().multiply(Qs.clone().invert());
      morphMatrix.value.compose(new THREE.Vector3(), R, new THREE.Vector3(S, S, S))
        .premultiply(new THREE.Matrix4().makeTranslation(P.x, P.y, P.z))
        .multiply(new THREE.Matrix4().makeTranslation(-Ps.x, -Ps.y, -Ps.z));
      morphScale.value = S;
      skyScale.value = skyPointScale;
    },
  };
}
