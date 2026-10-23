// WarrenIA's building: a small stock-exchange palace, modern. A three-step travertine base; four
// fluted columns with bases and brass capitals; an entablature with a sage ticker tape running
// along it, a cornice with dentils, and a pediment whose recessed tympanum carries WarrenIA's mark
// in gilded relief (its two squares glow sage). The front is stone with a pair of bronze doors:
// from outside nothing of the inside shows; the doors swing open when the visitor goes in (the
// camera walks through them to the screen on the back wall, world.ts) and close behind.
// Front faces +x. About the size of the glass pavilion it replaced: 11.2 × 8.4 m, 6.9 m high.

import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

type Mat = (c: number, e?: number, ei?: number) => THREE.MeshStandardMaterial;

/** Inside the building (local x): the front wall, the back wall's inner face, floor and ceiling. */
export const BOLSA = { front: 3.4, back: -4.5, floor: 0.36, ceiling: 4.96 };
const DOOR = { half: 1.25, top: 4.3 };

/** WarrenIA's mark as two strokes (web/components/shell/brand.tsx, a 32-unit box, y up). */
function markStrokes(): THREE.Vector2[][] {
  const arc = (cx: number, from: number, to: number) => {
    const pts: THREE.Vector2[] = [];
    for (let i = 0; i <= 24; i++) {
      const a = from + ((to - from) * i) / 24;
      pts.push(new THREE.Vector2(cx + 5 * Math.cos(a), 32 - (20.05 + 5 * Math.sin(a))));
    }
    return pts;
  };
  const line = (x: number, y0: number, y1: number) => [0, 0.25, 0.5, 0.75, 1].map((t) => new THREE.Vector2(x, 32 - (y0 + (y1 - y0) * t)));
  // down the left stem and round the first bowl; then the second bowl and up the right stem
  return [
    [...line(6, 11.55, 20.05), ...arc(11, Math.PI, 0).slice(1)],
    [...arc(21, Math.PI, 0), ...line(26, 20.05, 11.55).slice(1)],
  ];
}

/** Travertine: warm stone with pores, faint veins and the joints of its courses (0.45 m), one tile per 0.9 m. */
function travertineTexture() {
  const N = 512, c = document.createElement('canvas');
  c.width = c.height = N;
  const g = c.getContext('2d')!;
  let seed = 7;
  const r = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  g.fillStyle = '#ece3d3'; g.fillRect(0, 0, N, N);
  for (let i = 0; i < 70; i++) {
    // veins: long, soft, nearly horizontal strokes
    g.strokeStyle = `rgba(${150 + r() * 40},${130 + r() * 30},${100 + r() * 30},${0.05 + r() * 0.07})`;
    g.lineWidth = 1 + r() * 3;
    const y = r() * N;
    g.beginPath(); g.moveTo(-20, y);
    for (let x = 0; x <= N + 20; x += 32) g.lineTo(x, y + Math.sin(x * 0.02 + i) * 4 + (r() - 0.5) * 3);
    g.stroke();
  }
  for (let i = 0; i < 2600; i++) {
    // pores
    g.fillStyle = `rgba(110,90,62,${0.08 + r() * 0.18})`;
    g.beginPath(); g.ellipse(r() * N, r() * N, 0.6 + r() * 2.2, 0.4 + r() * 0.9, 0, 0, Math.PI * 2); g.fill();
  }
  // joints: two courses per tile, the vertical joints staggered
  g.fillStyle = 'rgba(120,104,82,0.55)';
  for (const y of [0, N / 2]) g.fillRect(0, y, N, 2);
  for (const [x, y] of [[N * 0.3, 0], [N * 0.8, N / 2]]) g.fillRect(x, y, 2, N / 2);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 8;
  return t;
}

/** A box whose texture keeps its real size on every face (TILE metres per repeat). */
const TILE = 0.9;
function stoneBox(w: number, h: number, d: number) {
  const g = new THREE.BoxGeometry(w, h, d);
  const uv = g.attributes.uv as THREE.BufferAttribute;
  // faces in order +x, -x, +y, -y, +z, -z; 4 vertices each
  const size = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]];
  for (let f = 0; f < 6; f++) for (let v = 0; v < 4; v++) {
    const i = f * 4 + v;
    uv.setXY(i, (uv.getX(i) * size[f][0]) / TILE, (uv.getY(i) * size[f][1]) / TILE);
  }
  return g;
}

/** A fluted column shaft (24 flutes), slightly tapered. */
function flutedShaft(r0: number, r1: number, h: number) {
  const g = new THREE.CylinderGeometry(r1, r0, h, 96, 1, true);
  const p = g.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), z = p.getZ(i), a = Math.atan2(z, x);
    const k = 1 - 0.045 * Math.pow(Math.max(0, Math.cos(a * 24)), 0.6);
    p.setXYZ(i, x * k, p.getY(i), z * k);
  }
  g.computeVertexNormals();
  return g;
}

export function buildBolsa(cx: number, cy: number, cz: number, mat: Mat) {
  const group = new THREE.Group();
  group.position.set(cx, cy, cz);
  const shadowy = <T extends THREE.Mesh>(m: T) => { m.castShadow = m.receiveShadow = true; return m; };
  const at = (parts: THREE.BufferGeometry[], g: THREE.BufferGeometry, x: number, y: number, z: number) => parts.push(g.translate(x, y, z));

  // (a little light of their own: the front faces east, into its own shadow at sunset)
  const travertine = new THREE.MeshStandardMaterial({ map: travertineTexture(), roughness: 0.82, emissive: 0xe6dccb, emissiveIntensity: 0.12 });
  const white = new THREE.MeshStandardMaterial({ color: 0xf5f0e7, roughness: 0.55, emissive: 0xf5f0e7, emissiveIntensity: 0.14 });
  // (half-metallic: the island has no environment map, so fully metallic surfaces would look black)
  const brass = new THREE.MeshStandardMaterial({ color: 0xd4b46c, roughness: 0.32, metalness: 0.35, emissive: 0x6b5222, emissiveIntensity: 0.45 });
  const bronze = new THREE.MeshStandardMaterial({ color: 0x7a5c3e, roughness: 0.45, metalness: 0.3, emissive: 0x2a1c10, emissiveIntensity: 0.5 });
  const sage = mat(0x0c1a12, 0x8dbf9c, 1.6);

  const stone: THREE.BufferGeometry[] = [], marble: THREE.BufferGeometry[] = [], trims: THREE.BufferGeometry[] = [];
  const front = BOLSA.front, wallH = BOLSA.ceiling - BOLSA.floor, wallY = BOLSA.floor + wallH / 2;

  // ---------------------------------------------------------------- base: three steps all round
  at(stone, stoneBox(11.2, 0.12, 8.4), 0.3, 0.06, 0);
  at(stone, stoneBox(10.8, 0.12, 8.0), 0.3, 0.18, 0);
  at(stone, stoneBox(10.4, 0.12, 7.6), 0.3, 0.3, 0);

  // ---------------------------------------------------------------- walls: back, sides, and the front with its doorway
  const x0 = BOLSA.back - 0.3, len = front + 0.15 - x0;
  at(stone, stoneBox(0.3, wallH, 7.2), BOLSA.back - 0.15, wallY, 0);
  for (const s of [-1, 1]) at(stone, stoneBox(len, wallH, 0.3), x0 + len / 2, wallY, s * 3.45);
  const side = 3.6 - DOOR.half;
  for (const s of [-1, 1]) at(stone, stoneBox(0.3, wallH, side), front, wallY, s * (DOOR.half + side / 2));
  at(stone, stoneBox(0.3, BOLSA.ceiling - DOOR.top, DOOR.half * 2), front, (DOOR.top + BOLSA.ceiling) / 2, 0);
  // a plinth course round the walls, and shallow pilasters with sage slits of light between them
  const glow: THREE.BufferGeometry[] = [];
  for (const s of [-1, 1]) at(stone, stoneBox(len + 0.1, 0.32, 0.38), x0 + len / 2, BOLSA.floor + 0.16, s * 3.47);
  at(stone, stoneBox(0.38, 0.32, 7.3), x0 - 0.04, BOLSA.floor + 0.16, 0);
  const pil = [-4.75, -2.7, -0.65, 1.4];
  for (const s of [-1, 1]) for (const x of pil) at(stone, stoneBox(0.5, wallH - 0.32, 0.1), x, wallY + 0.16, s * 3.64);
  for (const z of [-3.45, -1.15, 1.15, 3.45]) at(stone, stoneBox(0.1, wallH - 0.32, 0.5), x0 - 0.05, wallY + 0.16, z);
  for (const s of [-1, 1]) for (let i = 0; i < pil.length - 1; i++) at(glow, new THREE.BoxGeometry(0.05, 2.6, 0.02), (pil[i] + pil[i + 1]) / 2, wallY + 0.25, s * 3.61);
  for (const z of [-2.3, 0, 2.3]) at(glow, new THREE.BoxGeometry(0.02, 2.6, 0.05), x0 - 0.01, wallY + 0.25, z);
  // the doorway's brass architrave
  for (const s of [-1, 1]) at(trims, new THREE.BoxGeometry(0.06, DOOR.top - BOLSA.floor + 0.12, 0.12), front + 0.17, (DOOR.top + BOLSA.floor) / 2 + 0.06, s * (DOOR.half + 0.06));
  at(trims, new THREE.BoxGeometry(0.06, 0.12, DOOR.half * 2 + 0.24), front + 0.17, DOOR.top + 0.06, 0);

  // ---------------------------------------------------------------- roof, entablature, cornice with dentils
  at(stone, stoneBox(10, 0.3, 7.6), 0.25, BOLSA.ceiling + 0.15, 0);
  at(stone, stoneBox(0.62, 0.34, 7.6), 4.75, 4.79, 0); // architrave over the columns
  const corniceY = BOLSA.ceiling + 0.3;
  at(stone, stoneBox(10.2, 0.1, 7.8), 0.3, corniceY + 0.05, 0);
  at(stone, stoneBox(10.4, 0.08, 8.0), 0.35, corniceY + 0.14, 0);
  for (let z = -3.8; z <= 3.81; z += 0.2) at(stone, stoneBox(0.09, 0.09, 0.09), 5.12, corniceY - 0.05, z);
  // a fine sage line under the cornice, all round
  at(glow, new THREE.BoxGeometry(0.02, 0.025, 7.8), 5.31, corniceY + 0.005, 0);
  for (const s of [-1, 1]) at(glow, new THREE.BoxGeometry(10.2, 0.025, 0.02), 0.3, corniceY + 0.005, s * 3.91);

  // ---------------------------------------------------------------- pediment: recessed tympanum, raking cornices
  const span = 7.6, rise = 1.4, base = corniceY + 0.18;
  const tri = new THREE.Shape([new THREE.Vector2(-span / 2, 0), new THREE.Vector2(span / 2, 0), new THREE.Vector2(0, rise)]);
  const ped = new THREE.ExtrudeGeometry(tri, { depth: 0.5, bevelEnabled: false });
  ped.rotateY(Math.PI / 2).translate(4.55, base, 0); // the tympanum's face at x = 5.05
  group.add(shadowy(new THREE.Mesh(ped, white)));
  const slope = Math.atan2(rise, span / 2), edge = Math.hypot(rise, span / 2) + 0.35;
  for (const s of [-1, 1]) {
    const rake = stoneBox(0.62, 0.16, edge);
    rake.rotateX(s * slope);
    at(stone, rake, 4.95, base + rise / 2 + 0.07, (s * span) / 4);
    const top = new THREE.BoxGeometry(0.66, 0.03, edge);
    top.rotateX(s * slope);
    at(trims, top, 4.95, base + rise / 2 + 0.17, (s * span) / 4);
  }

  // ---------------------------------------------------------------- the mark, carved in the tympanum and gilded
  const s = 0.05, mark = new THREE.Group();
  const toLocal = (p: THREE.Vector2) => new THREE.Vector3(0, (p.y - 18.5) * s, -(p.x - 16) * s);
  for (const stroke of markStrokes()) {
    const curve = new THREE.CatmullRomCurve3(stroke.map(toLocal), false, 'centripetal');
    mark.add(shadowy(new THREE.Mesh(new THREE.TubeGeometry(curve, 96, 1.8 * s, 16, false), brass)));
    for (const end of [stroke[0], stroke[stroke.length - 1]]) {
      const cap = new THREE.Mesh(new THREE.SphereGeometry(1.8 * s, 16, 12), brass);
      cap.position.copy(toLocal(end));
      mark.add(cap);
    }
  }
  for (const u of [6, 26]) {
    const sq = new THREE.Mesh(new THREE.BoxGeometry(0.06, 3 * s, 3 * s), sage);
    sq.position.copy(toLocal(new THREE.Vector2(u, 32 - 6.65)));
    mark.add(sq);
  }
  mark.position.set(5.08, base + 0.6, 0);
  group.add(mark);

  // ---------------------------------------------------------------- columns: plinth, torus, fluted shaft, capital
  const shaftY0 = BOLSA.floor + 0.16, shaftY1 = 4.48, shaftH = shaftY1 - shaftY0;
  for (const z of [-3.0, -1.15, 1.15, 3.0]) {
    at(marble, stoneBox(0.58, 0.1, 0.58), 4.75, BOLSA.floor + 0.05, z);
    at(marble, new THREE.TorusGeometry(0.24, 0.05, 12, 48).rotateX(Math.PI / 2), 4.75, BOLSA.floor + 0.13, z);
    at(marble, flutedShaft(0.225, 0.19, shaftH), 4.75, shaftY0 + shaftH / 2, z);
    at(marble, new THREE.CylinderGeometry(0.27, 0.19, 0.08, 48), 4.75, shaftY1 + 0.04, z);
    at(trims, new THREE.BoxGeometry(0.6, 0.07, 0.6), 4.75, shaftY1 + 0.115, z);
  }

  // ---------------------------------------------------------------- the doors: bronze, with brass panels; they open inwards
  const doors: THREE.Group[] = [];
  for (const sgn of [1, -1]) {
    const hinge = new THREE.Group();
    hinge.position.set(front + 0.1, 0, sgn * DOOR.half);
    const leaf: THREE.BufferGeometry[] = [], panels: THREE.BufferGeometry[] = [];
    const h = DOOR.top - BOLSA.floor;
    at(leaf, new THREE.BoxGeometry(0.08, h, DOOR.half), 0, BOLSA.floor + h / 2, -sgn * DOOR.half / 2);
    for (const [y, ph] of [[BOLSA.floor + 0.35 + 0.7, 1.4], [BOLSA.floor + 2.0 + 0.85, 1.7]] as const) {
      // a raised panel framed in brass
      at(leaf, new THREE.BoxGeometry(0.03, ph - 0.12, DOOR.half - 0.42), 0.055, y, -sgn * DOOR.half / 2);
      for (const dy of [-1, 1]) at(panels, new THREE.BoxGeometry(0.02, 0.03, DOOR.half - 0.36), 0.075, y + (dy * ph) / 2 - dy * 0.03, -sgn * DOOR.half / 2);
      for (const dz of [-1, 1]) at(panels, new THREE.BoxGeometry(0.02, ph, 0.03), 0.075, y, -sgn * DOOR.half / 2 + (dz * (DOOR.half - 0.36)) / 2);
    }
    at(panels, new THREE.BoxGeometry(0.05, 1.1, 0.04), 0.09, BOLSA.floor + 1.6, -sgn * (DOOR.half - 0.14)); // pull
    hinge.add(shadowy(new THREE.Mesh(mergeGeometries(leaf), bronze)), new THREE.Mesh(mergeGeometries(panels), brass));
    group.add(hinge);
    doors.push(hinge);
  }
  // the light inside, seen past the doors as they open: a sage line along the meeting edge
  at(glow, new THREE.BoxGeometry(0.02, DOOR.top - BOLSA.floor - 0.2, 0.02), front + 0.05, (DOOR.top + BOLSA.floor) / 2, 0);

  // ---------------------------------------------------------------- inside: dark floor with sage lines
  const floor = new THREE.Mesh(new THREE.BoxGeometry(front - BOLSA.back, 0.02, 6.6), mat(0x1c2420));
  floor.position.set((front + BOLSA.back) / 2, BOLSA.floor + 0.01, 0);
  floor.receiveShadow = true;
  group.add(floor);
  for (const sd of [-1, 1]) at(glow, new THREE.BoxGeometry(front - BOLSA.back - 0.6, 0.012, 0.06), (front + BOLSA.back) / 2, BOLSA.floor + 0.03, sd * 2.2);

  group.add(shadowy(new THREE.Mesh(mergeGeometries(stone), travertine)));
  group.add(shadowy(new THREE.Mesh(mergeGeometries(marble), white)));
  group.add(shadowy(new THREE.Mesh(mergeGeometries(trims), brass)));
  group.add(new THREE.Mesh(mergeGeometries(glow), sage));

  // ---------------------------------------------------------------- the ticker tape along the architrave
  const tape = document.createElement('canvas');
  tape.width = 4096; tape.height = 96;
  const c = tape.getContext('2d')!;
  c.fillStyle = '#0b120e'; c.fillRect(0, 0, tape.width, tape.height);
  c.font = '600 54px ui-monospace, "JetBrains Mono Variable", monospace'; c.textBaseline = 'middle';
  const words = ['WARRENIA', 'MOMENTUM RADAR', 'PLAN', 'PORTFOLIO', 'BEFORE YOU SELL', 'ALERTS'];
  let x = 30;
  for (let i = 0; x < tape.width; i++) {
    const w = words[i % words.length];
    c.fillStyle = '#a6d8b5'; c.fillText(w, x, 50);
    x += c.measureText(w).width + 40;
    c.fillStyle = '#5fa877'; c.fillText('▲', x, 50);
    x += 90;
  }
  const tapeTex = new THREE.CanvasTexture(tape);
  tapeTex.colorSpace = THREE.SRGBColorSpace;
  tapeTex.wrapS = THREE.RepeatWrapping;
  tapeTex.anisotropy = 8;
  tapeTex.repeat.set(1, 1);
  const ticker = new THREE.Mesh(new THREE.PlaneGeometry(7.3, 0.2), new THREE.MeshBasicMaterial({ map: tapeTex, toneMapped: false }));
  ticker.rotation.y = Math.PI / 2;
  ticker.position.set(5.065, 4.79, 0);
  group.add(ticker);

  let open = 0, target = 0;
  return {
    group,
    /** Doors open (the visitor goes in) or closed. */
    setDoors(on: boolean) { target = on ? 1 : 0; },
    update(dt: number) {
      tapeTex.offset.x = (tapeTex.offset.x + dt * 0.02) % 1;
      if (open === target) return;
      open = target > open ? Math.min(target, open + dt / 0.7) : Math.max(target, open - dt / 0.9);
      const a = (1 - Math.cos(Math.PI * open)) / 2 * 1.75; // eased, to ~100°
      doors[0].rotation.y = a;
      doors[1].rotation.y = -a;
    },
  };
}
