// Loads the precomputed constellation (public/data/graph.json + graph.bin, see scripts/library/graph.ts).

export interface GraphData {
  count: number;
  slugs: string[];
  titles: string[];
  /** 0 = book, 1 = concept */
  kinds: Uint8Array;
  themes: Uint8Array;
  themeNames: string[];
  /** World-space positions, xyz per node. */
  positions: Float32Array;
  /** Node index pairs. */
  edges: Uint16Array | Uint32Array;
  /** Neighbours in CSR form: neighbours of i are adj[adjStart[i] .. adjStart[i + 1]). */
  adjStart: Uint32Array;
  adj: Uint32Array;
  indexOf: Map<string, number>;
}

interface GraphMeta {
  version: 1;
  nodes: number;
  edges: number;
  edgeIndex: 'uint16' | 'uint32';
  themes: string[];
  list: [string, string, 0 | 1, number][];
}

export const WORLD_RADIUS = 60;

export async function loadGraph(base = '/data'): Promise<GraphData> {
  const [meta, buf] = await Promise.all([
    fetch(`${base}/graph.json`).then((r) => {
      if (!r.ok) throw new Error(`graph.json: ${r.status}`);
      return r.json() as Promise<GraphMeta>;
    }),
    fetch(`${base}/graph.bin`).then((r) => {
      if (!r.ok) throw new Error(`graph.bin: ${r.status}`);
      return r.arrayBuffer();
    }),
  ]);
  const n = meta.nodes;
  const q = new Int16Array(buf, 0, n * 3);
  const positions = Float32Array.from(q, (v) => (v / 32767) * WORLD_RADIUS);
  const edgeBytes = buf.slice(n * 6);
  const edges = meta.edgeIndex === 'uint32' ? new Uint32Array(edgeBytes) : new Uint16Array(edgeBytes);

  const degree = new Uint32Array(n);
  for (let e = 0; e < edges.length; e++) degree[edges[e]]++;
  const adjStart = new Uint32Array(n + 1);
  for (let i = 0; i < n; i++) adjStart[i + 1] = adjStart[i] + degree[i];
  const fill = adjStart.slice(0, n);
  const adj = new Uint32Array(edges.length);
  for (let e = 0; e < edges.length; e += 2) {
    const a = edges[e], b = edges[e + 1];
    adj[fill[a]++] = b;
    adj[fill[b]++] = a;
  }

  return {
    count: n,
    slugs: meta.list.map((l) => l[0]),
    titles: meta.list.map((l) => l[1]),
    kinds: Uint8Array.from(meta.list, (l) => l[2]),
    themes: Uint8Array.from(meta.list, (l) => l[3]),
    themeNames: meta.themes,
    positions,
    edges,
    adjStart,
    adj,
    indexOf: new Map(meta.list.map((l, i) => [l[0], i])),
  };
}

export const neighbours = (g: GraphData, i: number) => g.adj.subarray(g.adjStart[i], g.adjStart[i + 1]);
