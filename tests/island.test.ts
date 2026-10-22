import { describe, expect, it } from 'vitest';
import { createPrints } from '../src/island/effects';
import { GAITS, gaitAt } from '../src/island/locomotion';
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

describe('the gait table', () => {
  it('goes from walk to trot, canter and gallop as speed rises', () => {
    expect([0.5, 2.5, 4.5, 8].map((v) => gaitAt(v).name)).toEqual(['walk', 'trot', 'canter', 'gallop']);
  });

  it('gallops faster with longer strides, not quicker steps', () => {
    // stride length = speed / frequency: from 7 to 11 m/s the stride grows ~45 %, the rate ~10 %
    const a = gaitAt(7), b = gaitAt(11);
    expect(b.f / a.f).toBeLessThan(1.12);
    expect(11 / b.f / (7 / a.f)).toBeGreaterThan(1.4);
    for (const v of [7, 9, 11]) expect(gaitAt(v).f).toBeGreaterThan(1.9), expect(gaitAt(v).f).toBeLessThan(2.25);
  });

  it('keeps the footfalls in order: lateral walk, diagonal trot, hind-then-fore gallop', () => {
    const walk = GAITS[1].off, trot = GAITS[3].off, gallop = GAITS[7].off;
    // walk: hind left, fore left, hind right, fore right, a quarter apart
    expect([walk[2], walk[0], walk[3], walk[1]]).toEqual([0, 0.25, 0.5, 0.75]);
    // trot: front left with hind right, front right with hind left
    expect(Math.abs(trot[0] - trot[3])).toBeLessThan(0.05);
    expect(Math.abs(trot[1] - trot[2])).toBeLessThan(0.05);
    // gallop: both hinds land before both fores
    expect(Math.max(gallop[2], gallop[3])).toBeLessThan(Math.min(gallop[0], gallop[1]));
  });

  it('blends offsets the short way round between rows', () => {
    for (let v = 0; v <= 11; v += 0.25) for (const o of gaitAt(v).off) { expect(o).toBeGreaterThanOrEqual(0); expect(o).toBeLessThan(1); }
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
