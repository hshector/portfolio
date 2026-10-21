// The two lights of the island. The dehesa at sunset by the jetty, moonlit night at the
// observatory; in between they blend with the bull's distance to the observatory ("de día
// construyes, de noche lees").

import * as THREE from 'three';
import { SITES, smoothstep } from './terrain';

export interface Light {
  skyTop: string; skyHorizon: string; skyBottom: string;
  sun: string; sunSize: number; sunDir: [number, number, number];
  sunColor: string; sunIntensity: number;
  hemiSky: string; hemiGround: string; hemiIntensity: number;
  fog: string; fogDensity: number;
  exposure: number;
  waterDeep: string; waterShallow: string; foam: string;
  grassBase: string; grassTip: string; grassLight: number;
  cloud: string;
}

export const DUSK: Light = {
  skyTop: '#2a2453', skyHorizon: '#ff9a62', skyBottom: '#f6c38f',
  sun: '#ffb56b', sunSize: 0.012, sunDir: [-0.75, 0.22, -0.45],
  sunColor: '#ffc48a', sunIntensity: 3.1,
  hemiSky: '#ffd0a0', hemiGround: '#4a3a22', hemiIntensity: 0.75,
  fog: '#e49a72', fogDensity: 0.0052,
  exposure: 1.0,
  waterDeep: '#24405e', waterShallow: '#4e8a98', foam: '#fff0da',
  grassBase: '#5c4a1c', grassTip: '#f0cf78', grassLight: 1.05,
  cloud: '#ffb08a',
};

export const NIGHT: Light = {
  skyTop: '#02030b', skyHorizon: '#1a2250', skyBottom: '#0a0d22',
  // the moon takes the sun's place, high in the north
  sun: '#dfe6ff', sunSize: 0.006, sunDir: [0.25, 0.62, -0.74],
  sunColor: '#aebfff', sunIntensity: 1.9,
  hemiSky: '#3d4f9c', hemiGround: '#14131f', hemiIntensity: 0.95,
  fog: '#0b1026', fogDensity: 0.0062,
  exposure: 1.45,
  waterDeep: '#040d1c', waterShallow: '#0d2a40', foam: '#a9c2ff',
  grassBase: '#121b20', grassTip: '#5d7a86', grassLight: 1.0,
  cloud: '#2b3460',
};

/** 0 at sunset (the jetty, WarrenIA, the workshop), 1 at night (the observatory). */
export function nightAt(x: number, z: number) {
  const o = SITES.observatorio;
  return smoothstep(56, 16, Math.hypot(x - o.x, z - o.z));
}

/** Live values shared by every material; updated each frame by blend(). */
export function createLightUniforms() {
  const c = (h: string) => new THREE.Color(h);
  return {
    night: { value: 0 },
    skyTop: { value: c(DUSK.skyTop) }, skyHorizon: { value: c(DUSK.skyHorizon) }, skyBottom: { value: c(DUSK.skyBottom) },
    sun: { value: c(DUSK.sun) }, sunSize: { value: DUSK.sunSize }, sunDir: { value: new THREE.Vector3(...DUSK.sunDir).normalize() },
    sunColor: { value: c(DUSK.sunColor) },
    fog: { value: c(DUSK.fog) }, fogDensity: { value: DUSK.fogDensity },
    waterDeep: { value: c(DUSK.waterDeep) }, waterShallow: { value: c(DUSK.waterShallow) }, foam: { value: c(DUSK.foam) },
    grassBase: { value: c(DUSK.grassBase) }, grassTip: { value: c(DUSK.grassTip) }, grassLight: { value: c(DUSK.sunColor) },
  };
}
export type LightUniforms = ReturnType<typeof createLightUniforms>;

const A = new THREE.Color(), B = new THREE.Color();
const lerpC = (out: THREE.Color, a: string, b: string, t: number) => out.copy(A.set(a)).lerp(B.set(b), t);

/** Writes the blend of DUSK and NIGHT for night = t into the uniforms. Returns the scalar values. */
export function blend(u: LightUniforms, t: number) {
  u.night.value = t;
  lerpC(u.skyTop.value, DUSK.skyTop, NIGHT.skyTop, t);
  lerpC(u.skyHorizon.value, DUSK.skyHorizon, NIGHT.skyHorizon, t);
  lerpC(u.skyBottom.value, DUSK.skyBottom, NIGHT.skyBottom, t);
  lerpC(u.sun.value, DUSK.sun, NIGHT.sun, t);
  u.sunSize.value = DUSK.sunSize + (NIGHT.sunSize - DUSK.sunSize) * t;
  u.sunDir.value.set(...DUSK.sunDir).normalize().lerp(new THREE.Vector3(...NIGHT.sunDir).normalize(), t).normalize();
  lerpC(u.sunColor.value, DUSK.sunColor, NIGHT.sunColor, t);
  lerpC(u.fog.value, DUSK.fog, NIGHT.fog, t);
  u.fogDensity.value = DUSK.fogDensity + (NIGHT.fogDensity - DUSK.fogDensity) * t;
  lerpC(u.waterDeep.value, DUSK.waterDeep, NIGHT.waterDeep, t);
  lerpC(u.waterShallow.value, DUSK.waterShallow, NIGHT.waterShallow, t);
  lerpC(u.foam.value, DUSK.foam, NIGHT.foam, t);
  lerpC(u.grassBase.value, DUSK.grassBase, NIGHT.grassBase, t);
  lerpC(u.grassTip.value, DUSK.grassTip, NIGHT.grassTip, t);
  lerpC(u.grassLight.value, DUSK.sunColor, NIGHT.sunColor, t).multiplyScalar(DUSK.grassLight + (NIGHT.grassLight - DUSK.grassLight) * t);
  const k = (a: number, b: number) => a + (b - a) * t;
  return {
    sunIntensity: k(DUSK.sunIntensity, NIGHT.sunIntensity),
    hemiIntensity: k(DUSK.hemiIntensity, NIGHT.hemiIntensity),
    exposure: k(DUSK.exposure, NIGHT.exposure),
    hemiSky: lerpC(new THREE.Color(), DUSK.hemiSky, NIGHT.hemiSky, t),
    hemiGround: lerpC(new THREE.Color(), DUSK.hemiGround, NIGHT.hemiGround, t),
    cloud: lerpC(new THREE.Color(), DUSK.cloud, NIGHT.cloud, t),
  };
}
