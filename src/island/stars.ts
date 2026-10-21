// The island's night sky is the library: one star per note, coloured by its theme, laid on the
// sky dome from the constellation's own 3D layout (public/data/graph.*). Loaded only when the
// night begins, so it costs nothing at the start.

import * as THREE from 'three';
import { loadGraph } from '../constellation/data';
import { THEMES } from '../lib/themes';
import { OUT, type Shared } from './shaders';

export async function createLibrarySky(shared: Shared, night: { value: number }) {
  const g = await loadGraph();
  const n = g.count, pos = new Float32Array(n * 3), col = new Float32Array(n * 3), size = new Float32Array(n), ph = new Float32Array(n);
  const colorOf = THEMES.map((t) => new THREE.Color(t.color));
  const d = new THREE.Vector3(), c = new THREE.Color(), white = new THREE.Color('#eef1ff');
  for (let i = 0; i < n; i++) {
    d.fromArray(g.positions, i * 3).normalize();
    // fold onto the upper sky, never below 12° so trees and hills don't hide it all
    d.y = 0.2 + Math.abs(d.y) * 0.8;
    d.normalize().multiplyScalar(820);
    pos.set([d.x, d.y, d.z], i * 3);
    const theme = THEMES.findIndex((t) => t.name === g.themeNames[g.themes[i]]);
    c.copy(theme >= 0 ? colorOf[theme] : white).lerp(white, 0.35); // a little paler: starlight
    col.set([c.r, c.g, c.b], i * 3);
    size[i] = g.kinds[i] === 0 ? 7 : 3.2; // books shine brighter than concepts
    ph[i] = (i * 0.6180339) % 1;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.setAttribute('size', new THREE.BufferAttribute(size, 1));
  geo.setAttribute('phase', new THREE.BufferAttribute(ph, 1));
  const mat = new THREE.ShaderMaterial({
    uniforms: { uTime: shared.time, uScale: shared.pixelScale, uNight: night },
    vertexShader: /* glsl */ `
      attribute vec3 color; attribute float size; attribute float phase;
      uniform float uTime; uniform float uScale; uniform float uNight; varying vec3 vColor; varying float vA;
      void main() {
        vColor = color;
        vA = smoothstep(0.15, 0.85, uNight) * (0.75 + 0.25 * sin(uTime * (1.0 + phase * 2.0) + phase * 40.0));
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        gl_PointSize = size * uScale;
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: `varying vec3 vColor; varying float vA; void main(){ float d = length(gl_PointCoord - 0.5); if (d > 0.5 || vA < 0.01) discard; gl_FragColor = vec4(vColor * (0.7 + 1.2 * smoothstep(0.22, 0.0, d)), smoothstep(0.5, 0.05, d) * vA); ${OUT} }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
  });
  const points = new THREE.Points(geo, mat);
  points.frustumCulled = false;
  points.renderOrder = -1;
  return { points, count: n };
}
