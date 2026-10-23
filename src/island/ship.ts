// A pirate ship moored alongside the jetty: a curved wooden hull with a gun-port band and cannons, a
// stern castle with lit windows and a lantern, three masts with weathered square sails, a jib on
// the bowsprit, rigging, and the black flag flying from the mainmast. It rocks gently on the swell.
// Bow along +z (out to sea). About 15 m long, 4 m wide, 13 m to the masthead. Everything is built
// here, no model to license.

import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const L = 14.5, B = 4.0;
const lerp = THREE.MathUtils.lerp, smooth = THREE.MathUtils.smoothstep;

/** Half-width, keel depth and deck height along the hull (u: 0 stern → 1 bow). */
function hullAt(u: number) {
  const half = (B / 2) * (u < 0.7 ? lerp(0.82, 1, smooth(u, 0, 0.35)) : Math.sqrt(Math.max(0, 1 - ((u - 0.7) / 0.3) ** 2)) * 0.98 + 0.02);
  const keel = lerp(1.0, 1.55, Math.sin(Math.PI * Math.min(1, u * 1.05)));
  const deck = 1.25 + 0.9 * (u - 0.55) ** 2 * 2.2 + (u < 0.18 ? 0.0 : 0);
  return { half, keel, deck };
}

/** The hull as a loft of U-shaped sections, coloured per vertex (dark planks, an ochre band, a black wale). */
function hullGeometry() {
  const NU = 40, NT = 18, pos: number[] = [], col: number[] = [], idx: number[] = [];
  const dark = new THREE.Color(0x3a281b), plank = new THREE.Color(0x4f3624), band = new THREE.Color(0xb98a3c), wale = new THREE.Color(0x15100b);
  for (let i = 0; i <= NU; i++) {
    const u = i / NU, { half, keel, deck } = hullAt(u), z = (u - 0.5) * L;
    for (let j = 0; j <= NT; j++) {
      const t = j / NT, s = Math.sin(Math.PI * t);
      const x = half * Math.cos(Math.PI * t) * (0.55 + 0.45 * Math.pow(1 - s, 0.35));
      const y = deck - (deck + keel) * Math.pow(s, 0.75);
      pos.push(x, y, z);
      // height above the waterline decides the paint
      const c = y > deck - 0.35 ? plank : y > deck - 0.75 ? band : y > deck - 0.9 ? wale : dark;
      col.push(c.r, c.g, c.b);
    }
  }
  for (let i = 0; i < NU; i++) for (let j = 0; j < NT; j++) {
    const a = i * (NT + 1) + j, b = a + NT + 1;
    idx.push(a, b, a + 1, b, b + 1, a + 1);
  }
  // the transom: close the stern
  const c0 = pos.length / 3;
  const st = hullAt(0);
  pos.push(0, (st.deck - st.keel) / 2, -L / 2); col.push(dark.r, dark.g, dark.b);
  for (let j = 0; j < NT; j++) idx.push(c0, j + 1, j);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/** The deck: planks between the two gunwales. */
function deckGeometry() {
  const NU = 40, pos: number[] = [], idx: number[] = [], uv: number[] = [];
  for (let i = 0; i <= NU; i++) {
    const u = i / NU, { half, deck } = hullAt(u), z = (u - 0.5) * L;
    pos.push(-half * 0.97, deck - 0.12, z, half * 0.97, deck - 0.12, z);
    uv.push(0, u * 8, 1, u * 8);
  }
  for (let i = 0; i < NU; i++) { const a = i * 2; idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/** Weathered canvas: off-white with stains and seams, the bottom edge ragged (cut out by alphaTest). */
function sailTexture(seed: number) {
  const W = 256, H = 256, c = document.createElement('canvas');
  c.width = W; c.height = H;
  const g = c.getContext('2d')!;
  let s = seed;
  const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  g.fillStyle = '#e9dfc6'; g.fillRect(0, 0, W, H);
  for (let i = 0; i < 6; i++) { g.fillStyle = 'rgba(120,96,60,0.12)'; g.fillRect((i + 1) * (W / 7), 0, 2, H); }
  for (let i = 0; i < 14; i++) {
    const gr = g.createRadialGradient(r() * W, r() * H, 0, r() * W, r() * H, 20 + r() * 40);
    gr.addColorStop(0, 'rgba(110,86,52,0.18)'); gr.addColorStop(1, 'rgba(110,86,52,0)');
    g.fillStyle = gr; g.fillRect(0, 0, W, H);
  }
  // ragged bottom and a couple of tears
  g.globalCompositeOperation = 'destination-out';
  g.beginPath(); g.moveTo(0, H);
  for (let x = 0; x <= W; x += 8) g.lineTo(x, H - 4 - r() * 18);
  g.lineTo(W, H); g.fill();
  for (let i = 0; i < 2; i++) { const x = 40 + r() * (W - 80), y = 60 + r() * 120; g.beginPath(); g.ellipse(x, y, 3 + r() * 5, 9 + r() * 14, r(), 0, Math.PI * 2); g.fill(); }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

/** The Jolly Roger: a skull over crossed bones on black. */
function flagTexture() {
  const W = 256, H = 170, c = document.createElement('canvas');
  c.width = W; c.height = H;
  const g = c.getContext('2d')!;
  g.fillStyle = '#0d0d0f'; g.fillRect(0, 0, W, H);
  g.fillStyle = '#f2ede2'; g.strokeStyle = '#f2ede2'; g.lineCap = 'round';
  // bones
  g.lineWidth = 14;
  for (const s of [-1, 1]) {
    g.beginPath(); g.moveTo(W / 2 - 62, H / 2 + 8 + s * 40); g.lineTo(W / 2 + 62, H / 2 + 8 - s * 40); g.stroke();
    for (const e of [-1, 1]) { g.beginPath(); g.arc(W / 2 + e * 66, H / 2 + 8 + (s * e > 0 ? -1 : 1) * -42, 11, 0, Math.PI * 2); g.fill(); }
  }
  // skull
  g.beginPath(); g.ellipse(W / 2, H / 2 - 12, 34, 32, 0, 0, Math.PI * 2); g.fill();
  g.fillRect(W / 2 - 20, H / 2 + 8, 40, 20);
  g.fillStyle = '#0d0d0f';
  for (const e of [-1, 1]) { g.beginPath(); g.ellipse(W / 2 + e * 13, H / 2 - 12, 9, 10, 0, 0, Math.PI * 2); g.fill(); }
  g.beginPath(); g.moveTo(W / 2, H / 2 + 1); g.lineTo(W / 2 - 5, H / 2 + 9); g.lineTo(W / 2 + 5, H / 2 + 9); g.fill();
  for (let i = -1; i <= 1; i++) g.fillRect(W / 2 + i * 10 - 1.5, H / 2 + 16, 3, 12);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

export function buildShip(x: number, z: number) {
  const group = new THREE.Group();
  group.position.set(x, 0, z);
  const body = new THREE.Group(); // (what rocks)
  group.add(body);
  const shadowy = <T extends THREE.Object3D>(m: T) => { m.traverse((o) => { o.castShadow = o.receiveShadow = true; }); return m; };

  const wood = new THREE.MeshStandardMaterial({ color: 0x5a3e28, roughness: 0.85 });
  const darkWood = new THREE.MeshStandardMaterial({ color: 0x2c1f15, roughness: 0.9 });
  const iron = new THREE.MeshStandardMaterial({ color: 0x1b1b1e, roughness: 0.5, metalness: 0.4 });
  const gold = new THREE.MeshStandardMaterial({ color: 0xc8a14e, roughness: 0.35, metalness: 0.5, emissive: 0x3a2a10, emissiveIntensity: 0.4 });
  const warm = new THREE.MeshStandardMaterial({ color: 0x2a1a08, emissive: 0xffb85a, emissiveIntensity: 1.4 });

  body.add(shadowy(new THREE.Mesh(hullGeometry(), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.82 }))));
  const deckTex = (() => {
    const c = document.createElement('canvas'); c.width = 64; c.height = 256;
    const g = c.getContext('2d')!;
    g.fillStyle = '#8a6a45'; g.fillRect(0, 0, 64, 256);
    for (let i = 0; i < 8; i++) { g.fillStyle = 'rgba(40,25,10,0.5)'; g.fillRect(i * 8, 0, 1, 256); }
    for (let i = 0; i < 12; i++) { g.fillStyle = 'rgba(40,25,10,0.35)'; g.fillRect(((i * 37) % 8) * 8, i * 21, 8, 1); }
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapT = THREE.RepeatWrapping; return t;
  })();
  body.add(shadowy(new THREE.Mesh(deckGeometry(), new THREE.MeshStandardMaterial({ map: deckTex, roughness: 0.9 }))));

  // gunwales: a rail along each side, on posts
  const rails: THREE.BufferGeometry[] = [];
  for (const side of [-1, 1]) {
    const pts: THREE.Vector3[] = [];
    for (let i = 0; i <= 30; i++) { const u = i / 30, h = hullAt(u); pts.push(new THREE.Vector3(side * h.half * 0.97, h.deck + 0.5, (u - 0.5) * L)); }
    rails.push(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 60, 0.06, 6, false));
    for (let i = 1; i < 30; i += 2) { const p = pts[i]; rails.push(new THREE.BoxGeometry(0.08, 0.5, 0.08).translate(p.x, p.y - 0.25, p.z)); }
  }
  body.add(shadowy(new THREE.Mesh(mergeGeometries(rails), darkWood)));

  // cannons out of the gun-port band, both sides
  const guns: THREE.BufferGeometry[] = [];
  for (const side of [-1, 1]) for (const u of [0.32, 0.45, 0.58, 0.71]) {
    const h = hullAt(u);
    guns.push(new THREE.CylinderGeometry(0.11, 0.14, 1.0, 10).rotateZ(Math.PI / 2).translate(side * (h.half + 0.25), h.deck - 0.55, (u - 0.5) * L));
    guns.push(new THREE.BoxGeometry(0.06, 0.34, 0.34).translate(side * (h.half + 0.01), h.deck - 0.55, (u - 0.5) * L));
  }
  body.add(shadowy(new THREE.Mesh(mergeGeometries(guns), iron)));

  // the stern castle: a raised cabin with lit windows, gilded trim and a lantern
  const st = hullAt(0.08), sz = -L / 2 + 1.7;
  const castle = new THREE.Mesh(new THREE.BoxGeometry(st.half * 1.8, 1.5, 3.2), wood);
  castle.position.set(0, st.deck + 0.6, sz);
  body.add(shadowy(castle));
  const roof = new THREE.Mesh(new THREE.BoxGeometry(st.half * 1.95, 0.12, 3.5), darkWood);
  roof.position.set(0, st.deck + 1.4, sz);
  body.add(shadowy(roof));
  const windows: THREE.BufferGeometry[] = [];
  for (let k = -2; k <= 2; k++) windows.push(new THREE.BoxGeometry(0.42, 0.42, 0.04).translate(k * 0.62, st.deck + 0.7, -L / 2 + 0.06));
  for (const side of [-1, 1]) for (const k of [-0.8, 0.4]) windows.push(new THREE.BoxGeometry(0.04, 0.36, 0.5).translate(side * (st.half * 0.9 + 0.02), st.deck + 0.75, sz + k));
  body.add(new THREE.Mesh(mergeGeometries(windows), warm));
  const trim: THREE.BufferGeometry[] = [new THREE.BoxGeometry(st.half * 1.9, 0.08, 0.06).translate(0, st.deck + 1.25, -L / 2 + 0.08), new THREE.BoxGeometry(st.half * 1.9, 0.08, 0.06).translate(0, st.deck + 0.15, -L / 2 + 0.08)];
  body.add(new THREE.Mesh(mergeGeometries(trim), gold));
  const lantern = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.12, 0.42, 8), warm);
  lantern.position.set(0, st.deck + 1.95, -L / 2 + 0.2);
  body.add(lantern);
  const lanternPost = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.5, 6), iron);
  lanternPost.position.set(0, st.deck + 1.6, -L / 2 + 0.2);
  body.add(lanternPost);

  // masts, yards and sails
  const spars: THREE.BufferGeometry[] = [], sails: THREE.Mesh[] = [];
  const masts = [{ u: 0.28, h: 9.5, yards: [4.2, 7.4] }, { u: 0.52, h: 11.5, yards: [4.6, 8.4] }, { u: 0.76, h: 9.8, yards: [4.3, 7.6] }];
  const sailMats = [11, 23, 37, 41, 53, 67].map((seed) => new THREE.MeshStandardMaterial({ map: sailTexture(seed), alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.95 }));
  let k = 0;
  for (const m of masts) {
    const h = hullAt(m.u), mz = (m.u - 0.5) * L, base = h.deck - 0.1;
    spars.push(new THREE.CylinderGeometry(0.11, 0.17, m.h, 10).translate(0, base + m.h / 2, mz));
    // the fighting top
    spars.push(new THREE.CylinderGeometry(0.5, 0.5, 0.1, 12).translate(0, base + m.yards[1] - 0.5, mz));
    m.yards.forEach((y, i) => {
      // (half-widths that keep the yards clear of the jetty)
      const w = (i === 0 ? 2.7 : 2.1) * (m.u === 0.52 ? 1.1 : 1);
      spars.push(new THREE.CylinderGeometry(0.07, 0.07, w * 2, 8).rotateZ(Math.PI / 2).translate(0, base + y, mz + 0.18));
      // a square sail hanging from the yard, bellied forward by the wind
      const sh = (i === 0 ? 2.9 : 2.3), g = new THREE.PlaneGeometry(w * 1.9, sh, 12, 8);
      const p = g.attributes.position as THREE.BufferAttribute;
      for (let v = 0; v < p.count; v++) {
        const px = p.getX(v) / w, py = (p.getY(v) + sh / 2) / sh;
        p.setZ(v, 0.55 * (1 - px * px * 0.8) * Math.sin(Math.PI * Math.min(1, 1 - py * 0.85)));
      }
      g.computeVertexNormals();
      const sail = new THREE.Mesh(g, sailMats[k++ % sailMats.length]);
      sail.position.set(0, base + y - sh / 2 - 0.08, mz + 0.26);
      sail.castShadow = true;
      sails.push(sail);
      body.add(sail);
    });
  }
  // the bowsprit and its jib
  const bow = hullAt(0.98);
  spars.push(new THREE.CylinderGeometry(0.06, 0.12, 5.2, 8).rotateX(Math.PI / 2 - 0.32).translate(0, bow.deck + 0.9, L / 2 + 1.7));
  body.add(shadowy(new THREE.Mesh(mergeGeometries(spars), darkWood)));
  const fore = masts[2], fh = hullAt(fore.u);
  const jib = new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(0, fh.deck + fore.h - 1.2, (fore.u - 0.5) * L + 0.2),
    new THREE.Vector3(0, bow.deck + 1.6, L / 2 + 3.8),
    new THREE.Vector3(0, fh.deck + 0.6, (fore.u - 0.5) * L + 0.4),
  ]);
  jib.setAttribute('uv', new THREE.Float32BufferAttribute([0.5, 0.95, 1, 0.5, 0, 0.5], 2));
  jib.computeVertexNormals();
  body.add(new THREE.Mesh(jib, sailMats[5]));

  // rigging: shrouds from each masthead to the gunwales, stays between the masts
  const rig: THREE.Vector3[] = [];
  for (const m of masts) {
    const h = hullAt(m.u), mz = (m.u - 0.5) * L, top = h.deck - 0.1 + m.h - 0.3;
    for (const side of [-1, 1]) for (const dz of [-0.9, -0.3, 0.3]) rig.push(new THREE.Vector3(0, top, mz), new THREE.Vector3(side * h.half, h.deck + 0.45, mz + dz));
  }
  for (let i = 0; i < masts.length - 1; i++) {
    const a = masts[i], b = masts[i + 1];
    rig.push(new THREE.Vector3(0, hullAt(a.u).deck + a.h - 0.4, (a.u - 0.5) * L), new THREE.Vector3(0, hullAt(b.u).deck + b.yards[1] - 0.6, (b.u - 0.5) * L));
  }
  rig.push(new THREE.Vector3(0, fh.deck + fore.h - 0.4, (fore.u - 0.5) * L), new THREE.Vector3(0, bow.deck + 1.7, L / 2 + 4.2));
  body.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(rig), new THREE.LineBasicMaterial({ color: 0x1a120c })));

  // the flag, flying from the mainmast
  const main = masts[1], mh = hullAt(main.u);
  const flagGeo = new THREE.PlaneGeometry(1.8, 1.2, 12, 6);
  flagGeo.translate(0.9, 0, 0);
  const flag = new THREE.Mesh(flagGeo, new THREE.MeshStandardMaterial({ map: flagTexture(), side: THREE.DoubleSide, roughness: 0.9 }));
  flag.position.set(0, mh.deck - 0.1 + main.h - 0.2, (main.u - 0.5) * L);
  flag.rotation.y = Math.PI / 2; // streams aft, with the wind from the sea
  body.add(flag);
  const flat = (flagGeo.attributes.position as THREE.BufferAttribute).array.slice();

  // mooring lines to the jetty's posts
  const lines: THREE.Vector3[] = [];
  for (const u of [0.12, 0.88]) { const h = hullAt(u); lines.push(new THREE.Vector3(-h.half, h.deck + 0.4, (u - 0.5) * L), new THREE.Vector3(-x + 1.4, 0.9, (u - 0.5) * L + (u < 0.5 ? -1.5 : 1.5))); }
  group.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(lines), new THREE.LineBasicMaterial({ color: 0x6b5236 })));

  return {
    group,
    update(t: number) {
      // a slow roll and pitch on the swell, and the flag flapping
      body.position.y = Math.sin(t * 0.7) * 0.07 - 0.05;
      body.rotation.z = Math.sin(t * 0.55) * 0.025;
      body.rotation.x = Math.sin(t * 0.43 + 1) * 0.012;
      const p = flagGeo.attributes.position as THREE.BufferAttribute;
      for (let i = 0; i < p.count; i++) {
        const fx = flat[i * 3];
        p.setZ(i, Math.sin(fx * 3.2 - t * 5) * 0.12 * (fx / 1.8));
      }
      p.needsUpdate = true;
    },
  };
}
