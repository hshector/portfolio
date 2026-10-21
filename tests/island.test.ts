import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { createPrints } from '../src/island/effects';
import { GAITS, WALK_PHASE, deriveClip } from '../src/island/gaits';
import { createLightUniforms, nightAt } from '../src/island/palette';
import { createShared } from '../src/island/shaders';
import {
  DOORS, JETTY, NAME_BLOCKS, SITES, groundAt, height, routeTo, surfaceAt, walkable, type SiteId,
} from '../src/island/terrain';

const ids = Object.keys(SITES) as SiteId[];

describe('the island', () => {
  it('has every place on dry land, with its door outside the building', () => {
    for (const id of ids) {
      expect(height(SITES[id].x, SITES[id].z)).toBeGreaterThan(0.5);
      expect(walkable(DOORS[id].x, DOORS[id].z)).toBe(true);
    }
  });

  it('is surrounded by sea the bull cannot enter, except along the jetty', () => {
    expect(walkable(0, 95)).toBe(false);
    expect(walkable(90, 0)).toBe(false);
    const onDeck = (JETTY.z0 + JETTY.z1) / 2;
    expect(height(JETTY.x, onDeck)).toBeLessThan(0);
    expect(walkable(JETTY.x, onDeck)).toBe(true);
    expect(groundAt(JETTY.x, onDeck)).toBeCloseTo(JETTY.deck);
  });

  it('keeps the bull out of the stone letters of the name', () => {
    for (const b of NAME_BLOCKS) expect(walkable((b.x0 + b.x1) / 2, (b.z0 + b.z1) / 2)).toBe(false);
  });

  it('tells the ground apart for the hoof sounds', () => {
    expect(surfaceAt(JETTY.x, (JETTY.z0 + JETTY.z1) / 2)).toBe('wood');
    expect(surfaceAt(SITES.warrenia.x + 2, SITES.warrenia.z)).toBe('stone');
    expect(surfaceAt(0, 26)).toBe('path');
    // somewhere on the beach
    let beach: string | null = null;
    for (let z = 40; z < 60 && !beach; z += 0.25) { const h = height(20, z); if (h > 0.25 && h < 0.7) beach = surfaceAt(20, z); }
    expect(beach).toBe('sand');
  });

  it('is dusk at the jetty and night at the observatory, darkening on the way', () => {
    expect(nightAt(SITES.muelle.x, SITES.muelle.z)).toBe(0);
    expect(nightAt(SITES.warrenia.x, SITES.warrenia.z)).toBeLessThan(0.05);
    expect(nightAt(SITES.observatorio.x, SITES.observatorio.z)).toBe(1);
    let last = -1;
    for (let z = 44; z >= -38; z -= 2) { const n = nightAt(0, z); expect(n).toBeGreaterThanOrEqual(last); last = n; }
  });
});

describe('routes from the map', () => {
  // the jetty's top, near each door, and two spots in the fields
  const starts = [[0, 41], [-24, 9], [26, 12], [0, -30], [10, 20], [-15, -5]];
  for (const id of ids) {
    it(`reach the ${id} door from anywhere, over walkable ground`, () => {
      for (const [x, z] of starts) {
        const r = routeTo(x, z, id);
        const end = r[r.length - 1];
        expect(end).toEqual(DOORS[id]);
        // sample every metre of every leg, from the bull to the path and on to the door
        let prev = { x, z };
        for (const p of r) {
          const n = Math.ceil(Math.hypot(p.x - prev.x, p.z - prev.z));
          for (let i = 0; i <= n; i++) {
            const t = i / Math.max(1, n);
            expect(walkable(prev.x + (p.x - prev.x) * t, prev.z + (p.z - prev.z) * t)).toBe(true);
          }
          prev = p;
        }
      }
    });
  }
});

describe('gaits derived from the walk', () => {
  // a fake walk: one leg bone turning back and forth, and a spine bone
  const T = 2;
  const times = Array.from({ length: 21 }, (_, i) => (i / 20) * T);
  const swing = (t: number) => new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), 0.4 * Math.sin((t / T) * Math.PI * 2)).toArray();
  const walk = new THREE.AnimationClip('walk', T, [
    new THREE.QuaternionKeyframeTrack('front_l_standardpaw_jnt_017.quaternion', times, times.flatMap(swing)),
    new THREE.VectorKeyframeTrack('qspine_m_spine0ik_jnt_08.position', [0, T], [0, 0, 0, 0, 1, 0]),
  ]);
  const angleAt = (clip: THREE.AnimationClip, t: number) => {
    const tr = clip.tracks[0] as THREE.KeyframeTrack & { createInterpolant(): THREE.Interpolant };
    const q = new THREE.Quaternion().fromArray(tr.createInterpolant().evaluate(t) as unknown as number[]);
    return 2 * Math.atan2(q.x, q.w);
  };

  it('keep the length and the body tracks of the walk', () => {
    const trot = deriveClip(walk, 'trot', GAITS.trot);
    expect(trot.duration).toBe(T);
    expect(trot.tracks).toHaveLength(2);
    expect(Array.from(trot.tracks[1].values)).toEqual(Array.from(walk.tracks[1].values));
  });

  it('move each leg to its new moment in the cycle', () => {
    const shift = (((GAITS.trot.phase.front_l - WALK_PHASE.front_l) % 1) + 1) % 1;
    const trot = deriveClip(walk, 'trot', { ...GAITS.trot, amp: 1 }, 96);
    for (const t of [0.3, 0.9, 1.4]) {
      const before = ((t - shift * T) % T + T) % T;
      expect(angleAt(trot, t)).toBeCloseTo(angleAt(walk, before), 2);
    }
  });

  it('lengthen the stride by scaling the swing', () => {
    const gallop = deriveClip(walk, 'gallop', { phase: WALK_PHASE, amp: 1.5 }, 96);
    const peak = (clip: THREE.AnimationClip) => Math.max(...times.map((t) => Math.abs(angleAt(clip, t))));
    expect(peak(gallop) / peak(walk)).toBeCloseTo(1.5, 1);
  });
});

describe('hoofprints', () => {
  it('are washed away when the sea reaches them, and only then', () => {
    const prints = createPrints(createShared(), createLightUniforms());
    prints.stamp(0, 0.05, 50, 0, 1); // on the wet sand
    prints.stamp(0, 2.0, 30, 0, 1); // inland
    expect(prints.count()).toBe(2);
    expect(prints.wash(-0.1)).toBe(0);
    expect(prints.wash(0.1)).toBe(1);
    expect(prints.count()).toBe(1);
  });
});
