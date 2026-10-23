// A secret: a bottle washed up somewhere on the beach, glinting now and then. When the bull reaches
// it, a message comes out: an idea from the library (one that appears in three books or more, from
// /data/bottles.json, made by scripts/library/build.ts), with a way up to see it in the sky. Then,
// a while later, another bottle washes up somewhere else. Nothing announces them.

import * as THREE from 'three';
import { JETTY, SHORE_Z, height, walkable } from './terrain';

export interface BottleMessage { s: string; t: string; d: string; b: number }

/** Spots on the wet sand all round the island where the bull can stand, away from the jetty. */
export function shoreSpots(): { x: number; z: number }[] {
  const out: { x: number; z: number }[] = [];
  for (let i = 0; i < 72; i++) {
    const a = (i / 72) * Math.PI * 2, dx = Math.sin(a), dz = Math.cos(a);
    let spot: { x: number; z: number } | null = null;
    for (let r = 15; r < 100; r += 0.5) {
      const x = dx * r, z = dz * r, h = height(x, z);
      if (h < 0.3) break;
      if (h < 0.7 && walkable(x, z)) spot = { x, z };
    }
    // (not by the jetty and the ship)
    if (spot && !(Math.abs(spot.x - JETTY.x) < 14 && spot.z > SHORE_Z - 14)) out.push(spot);
  }
  return out;
}

function bottleMesh() {
  const g = new THREE.Group();
  // the glass: a lathe profile, green and translucent
  const prof = [[0, 0], [0.09, 0], [0.1, 0.02], [0.1, 0.26], [0.08, 0.31], [0.035, 0.36], [0.03, 0.44], [0.034, 0.46], [0, 0.46]].map(([r, y]) => new THREE.Vector2(r, y));
  const glass = new THREE.Mesh(new THREE.LatheGeometry(prof, 16), new THREE.MeshStandardMaterial({ color: 0x6fae8a, transparent: true, opacity: 0.55, roughness: 0.08, metalness: 0.1, emissive: 0x1d3a2a, emissiveIntensity: 0.4 }));
  const cork = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.024, 0.05, 8), new THREE.MeshStandardMaterial({ color: 0x9b7448, roughness: 0.9 }));
  cork.position.y = 0.47;
  const paper = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.2, 10), new THREE.MeshStandardMaterial({ color: 0xf1e3c2, roughness: 0.9, emissive: 0xf1e3c2, emissiveIntensity: 0.2 }));
  paper.position.y = 0.15;
  g.add(glass, cork, paper);
  g.scale.setScalar(2.2); // (a little big, so it can be found)
  return g;
}

/** A soft four-pointed star, for the glint. */
function glintTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const x = c.getContext('2d')!;
  const gr = x.createRadialGradient(32, 32, 0, 32, 32, 30);
  gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.25, 'rgba(255,250,220,0.5)'); gr.addColorStop(1, 'rgba(255,250,220,0)');
  x.fillStyle = gr; x.fillRect(0, 0, 64, 64);
  x.fillStyle = 'rgba(255,255,255,0.9)';
  x.fillRect(31, 2, 2, 60); x.fillRect(2, 31, 60, 2);
  return new THREE.CanvasTexture(c);
}

export function createBottles(scene: THREE.Scene, spots: { x: number; z: number }[], seed = Date.now()) {
  const bottle = bottleMesh();
  const glint = new THREE.Sprite(new THREE.SpriteMaterial({ map: glintTexture(), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0 }));
  glint.scale.setScalar(2.4);
  scene.add(bottle, glint);
  let rnd = seed % 2147483647 || 1;
  const random = () => ((rnd = (rnd * 16807) % 2147483647) / 2147483647);
  let at: { x: number; z: number } | null = null, wait = 0, tilt = 0;
  let messages: Promise<BottleMessage[]> | null = null;

  function place(awayFrom?: { x: number; z: number }) {
    const far = awayFrom ? spots.filter((s) => Math.hypot(s.x - awayFrom.x, s.z - awayFrom.z) > 30) : spots;
    const list = far.length ? far : spots;
    at = list[Math.floor(random() * list.length)];
    tilt = random() * Math.PI * 2;
    bottle.visible = glint.visible = true;
  }
  place();

  const load = (): Promise<BottleMessage[]> =>
    (messages ??= fetch('/data/bottles.json')
      .then((r) => (r.ok ? (r.json() as Promise<BottleMessage[]>) : []))
      .catch(() => { messages = null; return []; }));

  /** A message not shown yet in this browser (remembered, when storage allows). */
  async function message(): Promise<BottleMessage | null> {
    const all = await load();
    if (!all.length) return null;
    let read: string[] = [];
    try { read = JSON.parse(localStorage.getItem('isla:botellas') ?? '[]'); } catch { /* no storage */ }
    const fresh = all.filter((m) => !read.includes(m.s));
    const m = (fresh.length ? fresh : all)[Math.floor(Math.random() * (fresh.length || all.length))];
    try { localStorage.setItem('isla:botellas', JSON.stringify([...read.filter((s) => s !== m.s), m.s].slice(-150))); } catch { /* fine */ }
    return m;
  }

  return {
    get at() { return at; },
    /** Each frame. Returns true the moment the bull reaches the bottle (then call open()). */
    update(dt: number, time: number, bull: { x: number; z: number }, seaLevel: number) {
      if (!at) {
        wait -= dt;
        if (wait <= 0) place(bull);
        return false;
      }
      const d = Math.hypot(bull.x - at.x, bull.z - at.z);
      if (d < 40) load(); // (fetch the messages before they are needed)
      const y = Math.max(height(at.x, at.z), seaLevel) + 0.07;
      // lying on its side, rocked by the swash
      bottle.position.set(at.x, y, at.z);
      bottle.rotation.set(Math.PI / 2 - 0.12, tilt, Math.sin(time * 1.3) * 0.08);
      // a glint every few seconds, catching the eye from far away
      const ph = (time * 0.33 + tilt) % 1;
      (glint.material as THREE.SpriteMaterial).opacity = ph < 0.1 ? Math.sin((ph / 0.1) * Math.PI) : 0;
      glint.position.set(at.x, y + 0.35, at.z);
      if (d < 1.7) {
        at = null;
        bottle.visible = glint.visible = false;
        wait = 35; // (the next one washes up a while later, somewhere else)
        return true;
      }
      return false;
    },
    message,
  };
}
