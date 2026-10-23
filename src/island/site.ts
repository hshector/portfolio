// The next project, under construction (the site where the workshop was): a concrete frame two
// floors up with rebar sticking out of the third, scaffolding on its south face, two tower cranes
// slowly slewing with their loads swinging, and the site fence with the "coming soon" board facing
// the path. At night the cranes' red lights blink and a floodlight lights the frame.

import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { height } from './terrain';

type Mat = (c: number, e?: number, ei?: number) => THREE.MeshStandardMaterial;

/** The fence: x and z bounds (world), set clear of the trough by the windmill and of the door. */
const FENCE = { x0: -4.2, x1: 4.0, z0: -6.2, z1: 6.0 };

export function buildSite(cx: number, cy: number, cz: number, concrete: THREE.Material, rebar: THREE.Material, mat: Mat) {
  const stat = new THREE.Group();
  const moving: THREE.Object3D[] = [];
  const shadowy = (m: THREE.Mesh) => { m.castShadow = m.receiveShadow = true; return m; };
  const boxAt = (parts: THREE.BufferGeometry[], w: number, h: number, d: number, x: number, y: number, z: number) =>
    parts.push(new THREE.BoxGeometry(w, h, d).translate(cx + x, cy + y, cz + z));

  // ---------------------------------------------------------------- the frame: slab, columns, floors
  const frame: THREE.BufferGeometry[] = [];
  boxAt(frame, 7.4, 0.3, 6.2, 0, 0.15, 0);
  const cols = [-3.2, 0, 3.2], rows = [-2.6, 0, 2.6], floor = 2.9;
  for (const x of cols) for (const z of rows) {
    boxAt(frame, 0.4, floor * 2, 0.4, x, 0.3 + floor, z);
    // third floor: only some columns, half poured
    if ((x + z) % 2 === 0 || x === -3.2) boxAt(frame, 0.4, 1.4, 0.4, x, 0.3 + floor * 2 + 0.7, z);
  }
  boxAt(frame, 7.4, 0.25, 6.2, 0, 0.3 + floor, 0);
  boxAt(frame, 7.4, 0.25, 3.4, 0, 0.3 + floor * 2, -1.4); // the second floor, half done
  // a stair core in one corner
  boxAt(frame, 1.6, floor * 2 + 0.3, 0.2, 2.4, 0.3 + floor, -2.0);
  boxAt(frame, 0.2, floor * 2 + 0.3, 1.6, 1.6, 0.3 + floor, -2.8 + 0.8);
  stat.add(shadowy(new THREE.Mesh(mergeGeometries(frame), concrete)));
  // rebar out of the top of the columns
  const bars: THREE.BufferGeometry[] = [];
  for (const x of cols) for (const z of rows) {
    const top = (x + z) % 2 === 0 || x === -3.2 ? 0.3 + floor * 2 + 1.4 : 0.3 + floor * 2;
    for (const [dx, dz] of [[-0.12, -0.12], [0.12, -0.12], [-0.12, 0.12], [0.12, 0.12]]) {
      bars.push(new THREE.CylinderGeometry(0.02, 0.02, 1.1, 4).translate(cx + x + dx, cy + top + 0.55, cz + z + dz));
    }
  }
  stat.add(new THREE.Mesh(mergeGeometries(bars), rebar));

  // ---------------------------------------------------------------- scaffolding on the south face
  const pipes: THREE.BufferGeometry[] = [], planks: THREE.BufferGeometry[] = [];
  const sz = 3.1 + 0.3, levels = 4, lift = 1.5;
  for (let i = 0; i <= 5; i++) for (const dz of [0, 0.9]) {
    pipes.push(new THREE.CylinderGeometry(0.035, 0.035, levels * lift + 0.6, 5).translate(cx - 3.5 + i * 1.4, cy + (levels * lift + 0.6) / 2, cz + sz + dz));
  }
  for (let l = 1; l <= levels; l++) {
    for (const dz of [0, 0.9]) pipes.push(new THREE.CylinderGeometry(0.03, 0.03, 7.0, 5).rotateZ(Math.PI / 2).translate(cx, cy + l * lift, cz + sz + dz));
    pipes.push(new THREE.CylinderGeometry(0.03, 0.03, 7.0, 5).rotateZ(Math.PI / 2).translate(cx, cy + l * lift + 0.55, cz + sz + 0.9)); // guard rail
    planks.push(new THREE.BoxGeometry(7.0, 0.05, 0.85).translate(cx, cy + l * lift + 0.03, cz + sz + 0.45));
  }
  for (let i = 0; i < 5; i++) pipes.push(new THREE.CylinderGeometry(0.025, 0.025, 2.1, 4).rotateZ(Math.PI / 2 - 0.82).translate(cx - 2.8 + i * 1.4, cy + 0.75 + (i % levels) * lift, cz + sz + 0.9));
  stat.add(shadowy(new THREE.Mesh(mergeGeometries(pipes), mat(0x9aa0a6))));
  stat.add(shadowy(new THREE.Mesh(mergeGeometries(planks), mat(0x8b6a3e))));
  // safety netting on part of it
  const net = new THREE.Mesh(new THREE.PlaneGeometry(4.2, levels * lift), new THREE.MeshStandardMaterial({ color: 0xff7a2a, transparent: true, opacity: 0.38, side: THREE.DoubleSide, depthWrite: false }));
  net.position.set(cx + 1.4, cy + (levels * lift) / 2 + 0.3, cz + sz + 0.95);
  stat.add(net);

  // ---------------------------------------------------------------- the fence and the board
  const fence: THREE.BufferGeometry[] = [];
  const panel = (x0: number, z0: number, x1: number, z1: number) => {
    const len = Math.hypot(x1 - x0, z1 - z0), n = Math.ceil(len / 2.2);
    for (let i = 0; i < n; i++) {
      const a = (i + 0.5) / n, x = x0 + (x1 - x0) * a, z = z0 + (z1 - z0) * a, y = height(cx + x, cz + z);
      const g = new THREE.BoxGeometry(len / n - 0.06, 2, 0.06);
      if (x0 === x1) g.rotateY(Math.PI / 2);
      fence.push(g.translate(cx + x, y + 1, cz + z));
    }
  };
  const F = FENCE;
  panel(F.x0, F.z0, F.x1, F.z0); panel(F.x1, F.z0, F.x1, F.z1); panel(F.x0, F.z1, F.x1, F.z1);
  panel(F.x0, F.z0, F.x0, F.z1);
  stat.add(shadowy(new THREE.Mesh(mergeGeometries(fence), mat(0x2f3a33))));
  // the board, facing the path (west) on two tall posts, above the bull's head: "PRÓXIMAMENTE"
  const boardTex = comingSoon();
  const by = height(cx + F.x0, cz + 0.1);
  const board = new THREE.Mesh(new THREE.BoxGeometry(0.12, 3.5, 6.0), [
    new THREE.MeshStandardMaterial({ color: 0x1d2420 }),
    new THREE.MeshStandardMaterial({ map: boardTex, emissive: 0xffffff, emissiveMap: boardTex, emissiveIntensity: 0.4, roughness: 0.7 }),
    ...Array.from({ length: 4 }, () => new THREE.MeshStandardMaterial({ color: 0x1d2420 })),
  ]);
  board.position.set(cx + F.x0 - 0.1, by + 3.75, cz + 0.1);
  stat.add(shadowy(board));
  for (const dz of [-2.6, 2.8]) {
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.16, 5.5, 0.16), mat(0x1d2420));
    post.position.set(cx + F.x0, by + 2.75, cz + 0.1 + dz);
    stat.add(shadowy(post));
  }

  // ---------------------------------------------------------------- odds and ends
  const sand = new THREE.Mesh(new THREE.ConeGeometry(1.1, 0.8, 10), mat(0xc9a76e));
  sand.position.set(cx + 2.6, cy + 0.4, cz + 5.0); stat.add(shadowy(sand));
  const pallets: THREE.BufferGeometry[] = [];
  for (let i = 0; i < 3; i++) pallets.push(new THREE.BoxGeometry(1.2, 0.5, 0.9).translate(cx - 3.2, cy + 0.25 + i * 0.52, cz - 3.7));
  stat.add(shadowy(new THREE.Mesh(mergeGeometries(pallets), mat(0xa3a3a3))));
  const coneGeo: THREE.BufferGeometry[] = [];
  for (const z of [-2.6, -1.4, 2.6, 3.8]) coneGeo.push(new THREE.ConeGeometry(0.16, 0.5, 8).translate(cx + F.x0 - 0.7, height(cx + F.x0 - 0.7, cz + z) + 0.25, cz + z));
  stat.add(new THREE.Mesh(mergeGeometries(coneGeo), mat(0xff6a1a, 0xff6a1a, 0.15)));
  // a floodlight on a pole, on at night
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 5, 6), mat(0x55504a));
  pole.position.set(cx - 3.6, cy + 2.5, cz + 4.2); stat.add(shadowy(pole));
  const lampMat = mat(0x222222, 0xfff1c4, 0);
  const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.35, 0.2), lampMat);
  lamp.position.set(cx - 3.6, cy + 5.0, cz + 4.0); lamp.rotation.x = 0.5; stat.add(lamp);
  // (its beam is a glowing cone, not a real light: one more light would cost every pixel of the island)
  const beamMat = new THREE.MeshBasicMaterial({ color: 0xffe2b0, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false });
  const beam = new THREE.Mesh(new THREE.ConeGeometry(2.6, 6, 16, 1, true).translate(0, -3, 0), beamMat);
  beam.position.copy(lamp.position);
  beam.lookAt(cx, cy + 1, cz - 1); beam.rotateX(-Math.PI / 2);
  stat.add(beam);

  // ---------------------------------------------------------------- the cranes
  const red = new THREE.MeshStandardMaterial({ color: 0x330000, emissive: 0xff2a1a, emissiveIntensity: 0 });
  const craneA = towerCrane({ x: cx + 2.0, z: cz - 4.7, y: cy, mast: 18, jib: 15, counter: 5, red, mat, slew: 0.6 });
  const craneB = towerCrane({ x: cx - 2.4, z: cz + 5.2, y: cy, mast: 12.5, jib: 9, counter: 4, red, mat, slew: 2.6 });
  moving.push(craneA.group, craneB.group);

  return {
    static: stat,
    moving,
    /** Where the bull can't go: the fence, the board and the cranes' masts. */
    obstacles: [
      ...fencePoints(cx, cz),
      { x: craneA.group.position.x, z: craneA.group.position.z, r: 0.8 },
      { x: craneB.group.position.x, z: craneB.group.position.z, r: 0.8 },
    ],
    update(time: number, night: number) {
      craneA.update(time, 0.045, 0); craneB.update(time, -0.06, 2);
      // aviation lights: a slow blink, much brighter by night
      red.emissiveIntensity = (Math.sin(time * 2.4) > 0.2 ? 1 : 0.08) * (0.6 + 2.4 * night);
      lampMat.emissiveIntensity = 2.5 * THREE.MathUtils.smoothstep(night, 0.25, 0.6);
      beamMat.opacity = 0.16 * THREE.MathUtils.smoothstep(night, 0.25, 0.6);
    },
  };
}

function fencePoints(cx: number, cz: number) {
  const F = FENCE, out: { x: number; z: number; r: number }[] = [];
  const line = (x0: number, z0: number, x1: number, z1: number) => {
    const n = Math.ceil(Math.hypot(x1 - x0, z1 - z0) / 0.8);
    for (let i = 0; i <= n; i++) out.push({ x: cx + x0 + ((x1 - x0) * i) / n, z: cz + z0 + ((z1 - z0) * i) / n, r: 0.35 });
  };
  line(F.x0, F.z0, F.x1, F.z0); line(F.x1, F.z0, F.x1, F.z1); line(F.x0, F.z1, F.x1, F.z1); line(F.x0, F.z0, F.x0, F.z1);
  return out;
}

/** A yellow lattice, for the cranes' masts and jibs (see-through, like the real thing). */
let latticeMat: THREE.MeshStandardMaterial | null = null;
function lattice() {
  if (latticeMat) return latticeMat;
  const c = document.createElement('canvas');
  c.width = 64; c.height = 64;
  const x = c.getContext('2d')!;
  x.strokeStyle = '#e8b52a'; x.lineWidth = 7;
  x.strokeRect(3, 3, 58, 58);
  x.beginPath(); x.moveTo(3, 3); x.lineTo(61, 61); x.moveTo(61, 3); x.lineTo(3, 61); x.lineWidth = 5; x.stroke();
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  latticeMat = new THREE.MeshStandardMaterial({ map: tex, alphaTest: 0.5, transparent: false, side: THREE.DoubleSide, roughness: 0.6, metalness: 0.2 });
  return latticeMat;
}
/** A box of lattice whose texture repeats once per `cell` metres along its length (y). */
function latticeBox(w: number, h: number, d: number, cell: number) {
  const g = new THREE.BoxGeometry(w, h, d);
  const uv = g.attributes.uv as THREE.BufferAttribute, nor = g.attributes.normal as THREE.BufferAttribute;
  // the four long faces repeat the cell along their length; the end caps show one cell
  for (let i = 0; i < uv.count; i++) if (Math.abs(nor.getY(i)) < 0.5) uv.setY(i, uv.getY(i) * Math.max(1, Math.round(h / cell)));
  return g;
}

function towerCrane(o: { x: number; z: number; y: number; mast: number; jib: number; counter: number; red: THREE.Material; mat: Mat; slew: number }) {
  const group = new THREE.Group();
  group.position.set(o.x, o.y, o.z);
  const L = lattice(), yellow = o.mat(0xe8b52a);
  const base = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.6, 1.4), o.mat(0x8e8a84));
  base.position.y = 0.3; base.castShadow = base.receiveShadow = true; group.add(base);
  const mast = new THREE.Mesh(latticeBox(0.9, o.mast, 0.9, 0.9), L);
  mast.position.y = 0.6 + o.mast / 2; mast.castShadow = true; group.add(mast);
  // the slewing part: cab, jib, counter-jib with its weights, the peak and the trolley with the hook
  const top = new THREE.Group();
  top.position.y = 0.6 + o.mast;
  top.rotation.y = o.slew;
  group.add(top);
  const jib = new THREE.Mesh(latticeBox(0.7, o.jib, 0.7, 0.8).rotateZ(-Math.PI / 2), L);
  jib.position.set(o.jib / 2 + 0.45, 0.35, 0); jib.castShadow = true; top.add(jib);
  const cjib = new THREE.Mesh(latticeBox(0.7, o.counter, 0.7, 0.8).rotateZ(Math.PI / 2), L);
  cjib.position.set(-o.counter / 2 - 0.45, 0.35, 0); top.add(cjib);
  const weight = new THREE.Mesh(new THREE.BoxGeometry(1.4, 1.3, 1.0), o.mat(0x8e8a84));
  weight.position.set(-o.counter + 0.3, -0.2, 0); weight.castShadow = true; top.add(weight);
  const cab = new THREE.Mesh(new THREE.BoxGeometry(1.0, 1.0, 1.0), [yellow, yellow, yellow, yellow, o.mat(0x22303a, 0x223040, 0.2), yellow]);
  cab.position.set(0.9, -0.5, 0.75); top.add(cab);
  const peak = new THREE.Mesh(latticeBox(0.6, 3.2, 0.6, 0.8), L);
  peak.position.y = 0.7 + 1.6; top.add(peak);
  // tie bars from the peak to the jib and the counter-jib
  const tie = (tx: number) => {
    const from = new THREE.Vector3(0, 3.9, 0), to = new THREE.Vector3(tx, 0.7, 0), len = from.distanceTo(to);
    const m = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, len, 4), yellow);
    m.position.copy(from).add(to).multiplyScalar(0.5);
    m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), to.clone().sub(from).normalize());
    top.add(m);
  };
  tie(o.jib * 0.62); tie(-o.counter + 0.4);
  // lights: the top of the peak and the tip of the jib
  for (const [lx, ly] of [[0, 4.0], [o.jib + 0.45, 0.8]]) {
    const l = new THREE.Mesh(new THREE.SphereGeometry(0.14, 8, 6), o.red);
    l.position.set(lx, ly, 0); top.add(l);
  }
  // trolley, cable and load (a bundle of steel beams on two slings)
  const trolley = new THREE.Group(); top.add(trolley);
  const tbox = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.3, 0.8), o.mat(0x3a3a3a));
  trolley.add(tbox);
  const hang = new THREE.Group(); trolley.add(hang);
  const cable = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 1, 4), o.mat(0x222222));
  hang.add(cable);
  const hook = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.4, 0.25), o.mat(0xd8a020));
  hang.add(hook);
  const load = new THREE.Group();
  const beams: THREE.BufferGeometry[] = [];
  for (let i = 0; i < 3; i++) for (let j = 0; j < 2; j++) beams.push(new THREE.BoxGeometry(3.2, 0.18, 0.18).translate(0, j * 0.2, (i - 1) * 0.2));
  const beamMesh = new THREE.Mesh(mergeGeometries(beams), o.mat(0x7a4a32));
  beamMesh.castShadow = true;
  load.add(beamMesh);
  hang.add(load);
  const drop = { value: 0 };
  return {
    group,
    /** speed: slew rate (rad/s, signed); phase: so the two cranes don't move together. */
    update(time: number, speed: number, phase: number) {
      top.rotation.y = o.slew + Math.sin(time * Math.abs(speed) + phase) * 1.4 + time * speed * 0.3;
      const reach = 0.5 + 0.5 * Math.sin(time * 0.11 + phase);
      trolley.position.set(2.2 + reach * (o.jib - 3.2), 0.05, 0);
      // the load goes up and down between the ground and the top floor, swinging a little
      drop.value = THREE.MathUtils.lerp(o.mast * 0.35, o.mast * 0.8, 0.5 + 0.5 * Math.sin(time * 0.17 + phase * 1.7));
      cable.scale.y = drop.value; cable.position.y = -drop.value / 2;
      hook.position.y = -drop.value - 0.2;
      load.position.y = -drop.value - 0.75;
      hang.rotation.z = Math.sin(time * 1.1 + phase) * 0.03;
      hang.rotation.x = Math.sin(time * 0.8 + phase) * 0.025;
      load.rotation.y = Math.sin(time * 0.3 + phase) * 0.4;
    },
  };
}

/** The board on the fence: what's coming, without saying what. */
function comingSoon() {
  const W = 1024, H = 600, c = document.createElement('canvas');
  c.width = W; c.height = H;
  const x = c.getContext('2d')!;
  x.fillStyle = '#16201b'; x.fillRect(0, 0, W, H);
  // hazard stripes along the bottom
  x.save(); x.beginPath(); x.rect(0, H - 70, W, 70); x.clip();
  for (let i = -2; i < 24; i++) { x.fillStyle = i % 2 ? '#16201b' : '#f2b822'; x.beginPath(); x.moveTo(i * 50, H); x.lineTo(i * 50 + 50, H); x.lineTo(i * 50 + 120, H - 70); x.lineTo(i * 50 + 70, H - 70); x.fill(); }
  x.restore();
  x.textAlign = 'center'; x.textBaseline = 'middle';
  x.fillStyle = '#f2b822'; x.font = '700 40px "Bricolage Grotesque Variable", system-ui, sans-serif';
  x.fillText('PROYECTO III', W / 2, 110);
  x.fillStyle = '#f6efe2'; x.font = '800 128px "Bricolage Grotesque Variable", system-ui, sans-serif';
  x.fillText('PRÓXIMAMENTE', W / 2, 250, W - 80);
  x.fillStyle = 'rgba(246,239,226,0.75)'; x.font = '600 40px "Bricolage Grotesque Variable", system-ui, sans-serif';
  x.fillText('Se está construyendo. Vuelve pronto.', W / 2, 390);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}
