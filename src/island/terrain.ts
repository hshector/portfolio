// The island's shape: height field, paths between the four places, ground surfaces and routes.
// Pure functions with no three.js, so they are unit-tested (tests/island.test.ts) and shared by
// the renderer, the bull's movement, the hoof sounds and the map.

export type SiteId = 'muelle' | 'warrenia' | 'taller' | 'observatorio';

export interface Site {
  id: SiteId;
  x: number;
  z: number;
  /** Radius of the flat plaza around the building. */
  r: number;
  label: string;
}

// Map: the jetty to the south (+z), WarrenIA to the west, the workshop to the east, the
// observatory on its hill to the north.
export const SITES: Record<SiteId, Site> = {
  muelle: { id: 'muelle', x: 0, z: 44, r: 6, label: 'Muelle' },
  warrenia: { id: 'warrenia', x: -32, z: 6, r: 8, label: 'Pabellón WarrenIA' },
  taller: { id: 'taller', x: 32, z: 10, r: 6, label: 'En obras' },
  observatorio: { id: 'observatorio', x: 0, z: -38, r: 7, label: 'Observatorio' },
};

/** The crossroads where the four paths meet. */
export const HUB = { x: -4, z: 14 };

export const PATHS: [number, number][][] = [
  [[0, 44], [0, 26], [HUB.x, HUB.z]],
  [[HUB.x, HUB.z], [-18, 10], [-32, 6]],
  [[HUB.x, HUB.z], [16, 12], [32, 10]],
  [[HUB.x, HUB.z], [-2, -6], [0, -24], [0, -38]],
];

/** Where each place is entered from: a little in front of the building, on its path. */
export const DOORS: Record<SiteId, { x: number; z: number }> = {
  muelle: { x: 0, z: 36 },
  warrenia: { x: -25, z: 7.5 },
  taller: { x: 25.5, z: 10.8 }, // outside the site's fence
  observatorio: { x: 0, z: -31 },
};

/** Size of the terrain mesh, centred on the origin. */
export const WORLD_SIZE = 260;

// ------------------------------------------------------------------ noise
const fract = (x: number) => x - Math.floor(x);
const hash = (x: number, y: number) => fract(Math.sin(x * 127.1 + y * 311.7) * 43758.5453);
const ease = (t: number) => t * t * (3 - 2 * t);
function vnoise(x: number, y: number) {
  const ix = Math.floor(x), iy = Math.floor(y), fx = ease(x - ix), fy = ease(y - iy);
  const a = hash(ix, iy), b = hash(ix + 1, iy), c = hash(ix, iy + 1), d = hash(ix + 1, iy + 1);
  return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy;
}
export function fbm(x: number, y: number) {
  let v = 0, amp = 0.5, f = 1;
  for (let o = 0; o < 4; o++) { v += amp * vnoise(x * f, y * f); f *= 2.03; amp *= 0.5; }
  return v / 0.9375;
}
export const smoothstep = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
export const mix = (a: number, b: number, t: number) => a + (b - a) * t;

/** A seeded random generator (mulberry32), so the island is the same on every visit. */
export function seeded(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ------------------------------------------------------------------ height
export function distToPaths(x: number, z: number) {
  let best = 1e9;
  for (const p of PATHS) for (let i = 0; i < p.length - 1; i++) {
    const [ax, az] = p[i], [bx, bz] = p[i + 1];
    const dx = bx - ax, dz = bz - az;
    const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz)));
    best = Math.min(best, Math.hypot(x - ax - dx * t, z - az - dz * t));
  }
  return best;
}

function baseHeight(x: number, z: number) {
  const r = Math.hypot(x, z) / 70;
  const coast = r + (fbm(x * 0.018 + 3.1, z * 0.018 - 1.7) - 0.5) * 0.35;
  const mask = 1 - smoothstep(0.62, 1.02, coast);
  const hills = fbm(x * 0.03 + 7, z * 0.03 + 11);
  let h = mask * (1.6 + hills * 6.5);
  h += mask * 8 * Math.exp(-(x * x + (z + 38) ** 2) / (2 * 12 * 12)); // the observatory's hill
  return h - (1 - mask) * 7 - 0.9;
}
const plazas = Object.values(SITES).filter((s) => s.id !== 'muelle').map((s) => ({ ...s, h: baseHeight(s.x, s.z) }));

/** Ground height in metres; the sea is at 0. */
export function height(x: number, z: number) {
  let h = baseHeight(x, z);
  for (const s of plazas) h = mix(h, s.h, smoothstep(s.r + 5, s.r, Math.hypot(x - s.x, z - s.z)));
  // paths are worn a little into the ground
  h -= 0.12 * smoothstep(1.8, 0.4, distToPaths(x, z)) * (h > 0.5 ? 1 : 0);
  return h;
}

export const slopeAt = (x: number, z: number) =>
  Math.hypot(height(x + 0.5, z) - height(x - 0.5, z), height(x, z + 0.5) - height(x, z - 0.5));

// ------------------------------------------------------------------ the jetty
/** Where the shore meets the sea along the jetty's line (x = 0). */
export const SHORE_Z = (() => {
  for (let z = 20; z < 90; z += 0.25) if (height(0, z) < -0.3) return z;
  return 50;
})();
export const JETTY = { x: 0, halfWidth: 1.5, z0: SHORE_Z - 4.6, z1: SHORE_Z - 4.6 + 18 * 1.2, deck: 0.64 };
export const onJetty = (x: number, z: number) =>
  Math.abs(x - JETTY.x) < JETTY.halfWidth - 0.2 && z > JETTY.z0 && z < JETTY.z1;

/** Height the bull stands on: the jetty's deck or the ground. */
export const groundAt = (x: number, z: number) =>
  onJetty(x, z) ? Math.max(JETTY.deck, height(x, z)) : height(x, z);

// ------------------------------------------------------------------ surfaces (hoof sounds)
export type Surface = 'wood' | 'stone' | 'path' | 'sand' | 'grass';

export function surfaceAt(x: number, z: number): Surface {
  if (onJetty(x, z) && height(x, z) < JETTY.deck) return 'wood';
  for (const s of plazas) if (Math.hypot(x - s.x, z - s.z) < s.r) return 'stone';
  if (distToPaths(x, z) < 1.4) return 'path';
  if (height(x, z) < 0.8) return 'sand';
  return 'grass';
}

// ------------------------------------------------------------------ where the bull may go
/** Buildings the bull walks around (centre and radius). */
export const BLOCKERS = [
  { x: SITES.warrenia.x, z: SITES.warrenia.z, r: 6.2 },
  { x: SITES.taller.x, z: SITES.taller.z, r: 4 },
  { x: SITES.observatorio.x, z: SITES.observatorio.z, r: 4.5 },
];

/** The stone name on its plinth, beside the path, turned towards the jetty (see world.ts). */
export const NAME_ANGLE = 0.5;
const nameEnd = (t: number) => ({ x: -9.6 + Math.cos(NAME_ANGLE) * 5.5 * t, z: 31 - Math.sin(NAME_ANGLE) * 5.5 * t });
/** Where the bull can't go: a segment along the name, and how far from it. */
export const NAME_BLOCKS = [{ x0: nameEnd(-1).x, z0: nameEnd(-1).z, x1: nameEnd(1).x, z1: nameEnd(1).z, r: 0.9 }];

function distToSegment(x: number, z: number, x0: number, z0: number, x1: number, z1: number) {
  const dx = x1 - x0, dz = z1 - z0, t = Math.max(0, Math.min(1, ((x - x0) * dx + (z - z0) * dz) / (dx * dx + dz * dz)));
  return Math.hypot(x - x0 - dx * t, z - z0 - dz * t);
}

export function walkable(x: number, z: number) {
  if (onJetty(x, z)) return true;
  if (height(x, z) < 0.2) return false;
  if (NAME_BLOCKS.some((b) => distToSegment(x, z, b.x0, b.z0, b.x1, b.z1) < b.r)) return false;
  return BLOCKERS.every((b) => Math.hypot(x - b.x, z - b.z) > b.r);
}

// ------------------------------------------------------------------ routes along the paths
type P = { x: number; z: number };
/** Waypoints from (x, z) to a place's door, following the paths (shortest way through the hub). */
export function routeTo(x: number, z: number, id: SiteId): P[] {
  // the path graph is a star around the hub; each arm runs hub → … → site
  const arm = (site: SiteId) => {
    const s = SITES[site];
    const p = PATHS.find((path) => {
      const [ex, ez] = path[0][0] === HUB.x && path[0][1] === HUB.z ? path[path.length - 1] : path[0];
      return ex === s.x && ez === s.z;
    })!;
    const pts = p.map(([px, pz]) => ({ x: px, z: pz }));
    return pts[0].x === HUB.x && pts[0].z === HUB.z ? pts : pts.reverse(); // hub first
  };
  // which arm is the bull nearest to, and how far along it
  let best = { site: 'muelle' as SiteId, seg: 0, d: Infinity, t: 0 };
  for (const id2 of Object.keys(SITES) as SiteId[]) {
    const pts = arm(id2);
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i], b = pts[i + 1], dx = b.x - a.x, dz = b.z - a.z;
      const t = Math.max(0, Math.min(1, ((x - a.x) * dx + (z - a.z) * dz) / (dx * dx + dz * dz)));
      const d = Math.hypot(x - a.x - dx * t, z - a.z - dz * t);
      if (d < best.d) best = { site: id2, seg: i, d, t };
    }
  }
  const door = DOORS[id];
  const from = arm(best.site);
  const onPath = { x: from[best.seg].x + (from[best.seg + 1].x - from[best.seg].x) * best.t, z: from[best.seg].z + (from[best.seg + 1].z - from[best.seg].z) * best.t };
  const out: P[] = [onPath];
  if (best.site === id) {
    // same arm: walk along it towards the site
    for (let i = best.seg + 1; i < from.length; i++) out.push(from[i]);
  } else {
    for (let i = best.seg; i >= 0; i--) out.push(from[i]); // back to the hub
    out.push(...arm(id).slice(1));
  }
  out[out.length - 1] = door; // stop at the door, not inside the building
  // drop points that are (almost) the same, but always keep the door
  return out.filter((p, i) => i === 0 || i === out.length - 1 || Math.hypot(p.x - out[i - 1].x, p.z - out[i - 1].z) > 0.5);
}
