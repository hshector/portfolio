// Note content for the reading panel. Each note already exists as a static page
// (/biblioteca/<slug>); the panel fetches it and keeps only the article body, so no extra
// files are published and the panel shows exactly what the page shows.

export interface NoteContent {
  title: string;
  byline: string | null;
  html: string;
  ms: number;
}

const cache = new Map<string, Promise<NoteContent>>();

async function load(slug: string): Promise<NoteContent> {
  const t0 = performance.now();
  const res = await fetch(`/biblioteca/${slug}`);
  if (!res.ok) throw new Error(`/biblioteca/${slug}: ${res.status}`);
  const doc = new DOMParser().parseFromString(await res.text(), 'text/html');
  const prose = doc.querySelector('article .prose');
  return {
    title: doc.querySelector('article h1')?.textContent?.trim() ?? slug,
    byline: doc.querySelector('article .byline')?.textContent?.replace(/\s+/g, ' ').trim() ?? null,
    html: prose?.innerHTML ?? '',
    ms: Math.round(performance.now() - t0),
  };
}

export function noteContent(slug: string): Promise<NoteContent> {
  let p = cache.get(slug);
  if (!p) {
    p = load(slug);
    p.catch(() => cache.delete(slug));
    cache.set(slug, p);
  }
  return p;
}

/** Start loading a note the visitor is likely to open (hover, tour). */
export const prefetchNote = (slug: string) => void noteContent(slug).catch(() => undefined);
