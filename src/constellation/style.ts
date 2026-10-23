// How each note looks as a star, shared by the constellation (scene.ts) and the island's night sky
// (src/island/stars.ts), so the stars that fly from the island into the nebula arrive exactly as the
// nebula draws them.

import * as THREE from 'three';
import type { GraphData } from './data';

const WHITE = new THREE.Color('#ffffff');

/** The theme's colour as light: a little paler and brighter, so it glows on the night sky. */
export function glowColor(hex: string, out = new THREE.Color()) {
  return out.set(hex).offsetHSL(0, 0.08, 0.06);
}

/** Star size (CSS px at distance 100 on an 800-px-tall canvas): books are the bright stars. */
export function starSize(g: GraphData, i: number) {
  const deg = g.adjStart[i + 1] - g.adjStart[i];
  return g.kinds[i] === 0 ? 8 + Math.min(Math.sqrt(deg), 24) * 0.5 : 2.2 + Math.min(Math.sqrt(deg), 8) * 0.42;
}

/** Star colour: the theme's light, closer to white for books. */
export function starColor(g: GraphData, i: number, themeHex: string, out = new THREE.Color()) {
  return glowColor(themeHex, out).lerp(WHITE, g.kinds[i] === 0 ? 0.55 : 0.22);
}

/**
 * The star's shape, for fragment shaders: a bright core and a soft halo (d = distance from the
 * point's centre, 0…0.5). "Otros" is a hollow ring, so it never depends on colour alone.
 */
export const STAR_SHAPE = /* glsl */ `
  float starShape(float d, float ring) {
    float core = smoothstep(0.16, 0.0, d);
    float halo = smoothstep(0.5, 0.04, d);
    float dot = core * 1.4 + halo * halo * 0.55;
    float hollow = smoothstep(0.07, 0.0, abs(d - 0.28)) * 1.3 + halo * halo * 0.25;
    return mix(dot, hollow, ring);
  }
`;
