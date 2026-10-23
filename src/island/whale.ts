// A secret: if the bull stands still at the end of the jetty, looking out to sea, a humpback whale
// may surface far out. Two blows, then it breaches (rises, rolls onto its back, falls in a burst of
// spray) and dives, flukes up. Nothing announces it. The first time it always comes; after that,
// one wait in two, and not twice within a minute. Built here (a lathe body, fins, flukes, spray as
// points): no model to license.

import * as THREE from 'three';

const LEN = 11; // (before scaling: see whaleMesh)

function whaleMesh() {
  const g = new THREE.Group();
  const dark = new THREE.Color(0x3a4650), belly = new THREE.Color(0xd9dee2);
  // the body: a lathe along its length (y), then laid along z with the head forward
  const pts: THREE.Vector2[] = [];
  for (let i = 0; i <= 24; i++) {
    const t = i / 24;
    const r = 1.35 * Math.pow(Math.sin(Math.PI * Math.min(1, t * 1.15) ** 0.62), 0.9) * (1 - 0.72 * t ** 2) + 0.06;
    pts.push(new THREE.Vector2(r, t * LEN));
  }
  const body = new THREE.LatheGeometry(pts, 24);
  body.scale(1, 1, 0.82); // a little flatter than round
  body.rotateX(-Math.PI / 2).translate(0, 0, LEN * 0.42); // head at +z
  const pos = body.attributes.position as THREE.BufferAttribute, col: number[] = [];
  for (let i = 0; i < pos.count; i++) {
    const c = dark.clone().lerp(belly, THREE.MathUtils.smoothstep(-pos.getY(i), 0.2, 1.0));
    col.push(c.r, c.g, c.b);
  }
  body.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  body.computeVertexNormals();
  const skin = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.45, metalness: 0.05 });
  g.add(new THREE.Mesh(body, skin));
  // the long pectoral fins, pale underneath like a humpback's
  const finMat = new THREE.MeshStandardMaterial({ color: 0x9aa4ab, roughness: 0.5 });
  for (const s of [-1, 1]) {
    // long, thin and tapered: a flattened ellipsoid from the shoulder out
    const fin = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 8).scale(1.8, 0.07, 0.42).translate(1.7 * s, 0, 0), finMat);
    fin.position.set(s * 1.0, -0.55, LEN * 0.22);
    fin.rotation.set(0, s * 0.55, s * -0.35);
    g.add(fin);
  }
  // a small dorsal fin
  const dorsal = new THREE.Mesh(new THREE.ConeGeometry(0.25, 0.5, 6), skin);
  dorsal.position.set(0, 0.95, -LEN * 0.18);
  g.add(dorsal);
  // the flukes
  const shape = new THREE.Shape();
  shape.moveTo(0, 0);
  shape.bezierCurveTo(0.8, 0.2, 1.8, 0.6, 2.2, 1.3);
  shape.bezierCurveTo(1.6, 1.0, 0.8, 1.0, 0, 0.55);
  shape.bezierCurveTo(-0.8, 1.0, -1.6, 1.0, -2.2, 1.3);
  shape.bezierCurveTo(-1.8, 0.6, -0.8, 0.2, 0, 0);
  const flukes = new THREE.ExtrudeGeometry(shape, { depth: 0.12, bevelEnabled: false });
  flukes.rotateX(Math.PI / 2).translate(0, 0.06, -LEN * 0.58 + 0.2).scale(1, 1, 1);
  const fl = new THREE.Mesh(flukes, new THREE.MeshStandardMaterial({ color: 0x2a323c, roughness: 0.5, side: THREE.DoubleSide }));
  fl.rotation.x = Math.PI; // trailing edge backwards
  fl.position.z = -LEN * 1.16 + 0.4;
  g.add(fl);
  g.traverse((o) => { o.castShadow = false; });
  g.scale.setScalar(1.35); // (about 15 m long, a grown humpback)
  return g;
}

/** A soft round droplet. */
function dropTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 32;
  const x = c.getContext('2d')!, g = x.createRadialGradient(16, 16, 0, 16, 16, 15);
  g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.5, 'rgba(255,255,255,0.7)'); g.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = g; x.fillRect(0, 0, 32, 32);
  return new THREE.CanvasTexture(c);
}

/** Spray: white droplets thrown up and falling back. */
function spray(n: number) {
  const pos = new Float32Array(n * 3), vel = new Float32Array(n * 3), life = new Float32Array(n);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  // (big, soft droplets: at 20 m small ones vanish against the bright evening sky)
  const pts = new THREE.Points(geo, new THREE.PointsMaterial({ color: 0xeef3f6, map: dropTexture(), size: 1.1, transparent: true, opacity: 0.95, depthWrite: false }));
  pts.frustumCulled = false;
  let next = 0;
  return {
    pts,
    /** n droplets from (x, y, z), up at `up` m/s and out at `out` m/s. */
    burst(k: number, x: number, y: number, z: number, up: number, out: number, ttl: number) {
      for (let i = 0; i < k; i++) {
        const j = next++ % n, a = Math.random() * Math.PI * 2, o = out * (0.3 + Math.random() * 0.7);
        pos.set([x, y, z], j * 3);
        vel.set([Math.cos(a) * o, up * (0.6 + Math.random() * 0.5), Math.sin(a) * o], j * 3);
        life[j] = ttl * (0.6 + Math.random() * 0.4);
      }
    },
    step(dt: number) {
      for (let j = 0; j < n; j++) {
        if (life[j] <= 0) { pos[j * 3 + 1] = -50; continue; }
        life[j] -= dt;
        vel[j * 3 + 1] -= 9.8 * dt;
        for (let k = 0; k < 3; k++) pos[j * 3 + k] += vel[j * 3 + k] * dt;
        if (pos[j * 3 + 1] < -0.2) life[j] = 0;
      }
      geo.attributes.position.needsUpdate = true;
    },
  };
}

export function createWhale(scene: THREE.Scene, at: THREE.Vector3, sound?: { blow(): void; splash(): void }) {
  const whale = whaleMesh(), drops = spray(700);
  whale.visible = false;
  whale.rotation.order = 'YXZ'; // (heading, then pitch, then roll)
  scene.add(whale, drops.pts);
  let t = -1, seen = 0, lastEnd = -Infinity, still = 0;
  const DUR = 14, YAW = 1.45; // swimming across the view from the jetty, so the breach is seen side-on
  const f = new THREE.Vector3(Math.sin(YAW), 0, Math.cos(YAW));
  const events = new Set<string>();
  const once = (key: string, fn: () => void) => { if (!events.has(key)) { events.add(key); fn(); } };
  const along = (d: number, y: number) => whale.position.set(at.x + f.x * d, y, at.z + f.z * d);
  const head = (d: number) => [at.x + f.x * d, at.z + f.z * d] as const;

  function start() {
    t = 0; seen++; events.clear();
    whale.visible = true;
  }

  return {
    get state() { return t < 0 ? 'hidden' : 'surfacing'; },
    get seen() { return seen; },
    /** Called each frame with whether the bull is standing still at the jetty's end, facing the sea. */
    update(dt: number, nowMs: number, watching: boolean) {
      drops.step(dt);
      if (t < 0) {
        still = watching ? still + dt : 0;
        // (the first time it always comes; then one wait in two, and never twice within a minute)
        if (still > 3 && nowMs - lastEnd > 60_000) {
          still = -6; // (a wait that comes to nothing: try again after a while)
          if (seen === 0 || Math.random() < 0.5) start();
        }
        return;
      }
      t += dt;
      // two blows at the surface, the back just showing as it swims
      if (t < 5) {
        along(-8 + t * 0.8, -0.95 + 0.25 * Math.sin(t * 1.3));
        whale.rotation.set(0, YAW, 0);
        const [bx, bz] = head(-8 + t * 0.8 + LEN * 0.35);
        if (t > 0.6) once('blow1', () => { drops.burst(140, bx, 0.9, bz, 8, 0.9, 1.7); sound?.blow(); });
        if (t > 3.2) once('blow2', () => { drops.burst(140, bx, 0.9, bz, 8, 0.9, 1.7); sound?.blow(); });
        return;
      }
      // the breach: out of the water nose first, fins out, rolling onto its back, and down with a crash
      if (t < 8.2) {
        const k = (t - 5) / 3.2;
        along(-2 + 6 * k, -6 + 14 * k - 12 * k * k);
        whale.rotation.set(-1.25 * (1 - k) + 0.3 * k, YAW, Math.PI * 0.85 * THREE.MathUtils.smoothstep(k, 0.15, 0.85));
        const [ox, oz] = head(-2);
        once('out', () => { drops.burst(180, ox, 0.3, oz, 7, 3.5, 2); sound?.splash(); });
        const [fx, fz] = head(4);
        if (k > 0.86) once('fall', () => { drops.burst(320, fx, 0.4, fz, 10, 6, 2.4); sound?.splash(); });
        return;
      }
      // under for a moment, turned away from the jetty, then the flukes rise and slip under (seen from
      // behind, so their underside shows, as in the photographs)
      if (t < 10.5) { whale.position.y = -14; return; }
      if (t < DUR) {
        const k = (t - 10.5) / (DUR - 10.5), dx = at.x + 6, dz = at.z + 4;
        whale.rotation.set(1.3, 0.12, 0);
        whale.position.set(dx, -11.5 + 4.4 * Math.sin(Math.PI * k), dz + 6);
        if (k > 0.85) once('dive', () => drops.burst(120, dx, 0.2, dz, 4, 1.5, 1.4));
        return;
      }
      whale.visible = false;
      t = -1;
      lastEnd = nowMs;
    },
  };
}
