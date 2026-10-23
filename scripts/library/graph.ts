// Precomputed 3D layout for the constellation (phase F2 draws it).
// Done once per build so visitors download ready-made positions instead of
// simulating thousands of nodes in their browser.
//
// graph.bin layout (little-endian):
//   Int16 x, y, z per node (positions scaled to ±32767), then
//   Uint16 a, b per edge (node indexes; Uint32 if there are 65,536 nodes or more).
// graph.json holds the node list (slug, title, kind, theme index) in the same order, and each
// book's author and year (for the book cards).

import createGraph from 'ngraph.graph';
import createLayout from 'ngraph.forcelayout';
import type { Library } from './vault.ts';

export interface GraphFiles {
  meta: {
    version: 1;
    nodes: number;
    edges: number;
    edgeIndex: 'uint16' | 'uint32';
    themes: string[];
    list: [slug: string, title: string, kind: 0 | 1, theme: number][];
    books: [node: number, author: string, year: number | null][];
  };
  bin: Uint8Array;
}

const ANCHOR_RADIUS = 120;

export function buildGraph(lib: Library, iterations = 900): GraphFiles {
  const index = new Map(lib.notes.map((n, i) => [n.slug, i]));
  const edges = new Set<string>();
  for (const n of lib.notes)
    for (const s of [...n.links, ...n.related]) {
      const [a, b] = [index.get(n.slug)!, index.get(s)!].sort((x, y) => x - y);
      if (a !== b) edges.add(`${a},${b}`);
    }

  // Each theme gets an invisible anchor, spread evenly on a sphere, that its notes are pulled
  // towards: themes become separate "galaxies" and most links stay short. Measured on the real
  // vault (Oct 2026): median intra-theme link 24.9 → 7.2 units, theme centres 7.6 → 42.7 apart.
  const g = createGraph();
  lib.notes.forEach((_, i) => g.addNode(i));
  for (const e of edges) {
    const [a, b] = e.split(',').map(Number);
    g.addLink(a, b);
  }
  const T = lib.themes.length;
  lib.notes.forEach((n, i) => g.addLink(i, `theme:${lib.themes.indexOf(n.theme)}`, { anchor: true }));
  const springCoefficient = 0.003;
  const layout = createLayout(g, {
    dimensions: 3,
    springLength: 3,
    springCoefficient,
    gravity: -0.6,
    theta: 0.9,
    dragCoefficient: 0.05,
    timeStep: 0.5,
    springTransform: (link: { data?: { anchor?: boolean } }, spring: { length: number; coefficient: number }) => {
      if (link.data?.anchor) {
        spring.length = ANCHOR_RADIUS * 0.35;
        spring.coefficient = springCoefficient * 6;
      }
    },
  } as Parameters<typeof createLayout>[1]);
  for (let t = 0; t < T; t++) {
    const node = g.getNode(`theme:${t}`);
    if (!node) continue;
    const phi = Math.acos(1 - (2 * (t + 0.5)) / T), theta = Math.PI * (1 + Math.sqrt(5)) * t;
    layout.setNodePosition(node.id, ANCHOR_RADIUS * Math.sin(phi) * Math.cos(theta), ANCHOR_RADIUS * Math.cos(phi), ANCHOR_RADIUS * Math.sin(phi) * Math.sin(theta));
    layout.pinNode(node, true);
  }
  for (let i = 0; i < iterations; i++) layout.step();

  const N = lib.notes.length;
  const pos = new Float32Array(N * 3);
  let max = 1e-9;
  for (let i = 0; i < N; i++) {
    const p = layout.getNodePosition(i) as { x: number; y: number; z: number };
    pos.set([p.x, p.y, p.z], i * 3);
    max = Math.max(max, Math.abs(p.x), Math.abs(p.y), Math.abs(p.z));
  }
  const q = Int16Array.from(pos, (v) => Math.round((v / max) * 32767));
  const wide = N >= 65536;
  const e = wide ? new Uint32Array(edges.size * 2) : new Uint16Array(edges.size * 2);
  let k = 0;
  for (const s of edges) for (const v of s.split(',')) e[k++] = Number(v);

  const bin = new Uint8Array(q.byteLength + e.byteLength);
  bin.set(new Uint8Array(q.buffer), 0);
  bin.set(new Uint8Array(e.buffer), q.byteLength);

  return {
    meta: {
      version: 1,
      nodes: N,
      edges: edges.size,
      edgeIndex: wide ? 'uint32' : 'uint16',
      themes: lib.themes,
      list: lib.notes.map((n) => [n.slug, n.title, n.kind === 'book' ? 0 : 1, lib.themes.indexOf(n.theme)]),
      books: lib.notes.flatMap((n, i): [number, string, number | null][] => {
        if (n.kind !== 'book') return [];
        const fm = n.frontmatter, year = Number(fm['año']);
        return [[i, String(fm.autor ?? n.title.split(' - ')[0]), Number.isFinite(year) && year > 0 ? year : null]];
      }),
    },
    bin,
  };
}
