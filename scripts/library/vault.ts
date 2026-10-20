// Reads the Obsidian vault and turns it into the library model the site publishes.
//
// What gets published is decided by tematicas.yml in the vault:
//   - books: metadata + the "Resumen ejecutivo" section only (chapter notes stay private)
//   - concepts: the whole note
// Every [[wikilink]] must resolve to a published note; anything else is a build error.

import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parse as parseYaml } from 'yaml';
import { slugify } from './slug.ts';

export type Kind = 'book' | 'concept';

export interface RawNote {
  title: string;
  kind: Kind;
  frontmatter: Record<string, unknown>;
  /** Markdown that will be published (already cut down for books). */
  markdown: string;
  /** Titles of the books a concept appears in, in the order the note lists them. */
  appearsIn: string[];
}

export interface Note extends Omit<RawNote, 'appearsIn'> {
  slug: string;
  theme: string;
  /** Slugs this note links to (unique, in order of first appearance). */
  links: string[];
  /** Slugs of notes that link here. */
  backlinks: string[];
  /** For concepts: slugs of their books. For books: slugs of their concepts. */
  related: string[];
}

export interface Library {
  notes: Note[];
  bySlug: Map<string, Note>;
  themes: string[];
  report: AuditReport;
}

export interface AuditReport {
  books: number;
  concepts: number;
  links: number;
  orphans: string[];
  ties: number;
  errors: string[];
}

const FRONTMATTER = /^---\n([\s\S]*?)\n---\n?/;
const WIKILINK = /\[\[([^\]|#]+)(?:#[^\]|]*)?(?:\|[^\]]*)?\]\]/g;

/** Frontmatter problems Obsidian tolerates but strict YAML rejects; reported, never fatal. */
export const warnings: string[] = [];

function splitFrontmatter(text: string, title = ''): { frontmatter: Record<string, unknown>; body: string } {
  const m = FRONTMATTER.exec(text);
  if (!m) return { frontmatter: {}, body: text };
  const body = text.slice(m[0].length);
  try {
    return { frontmatter: (parseYaml(m[1]) ?? {}) as Record<string, unknown>, body };
  } catch {
    // Obsidian accepts "\$" inside double quotes (an escaped dollar); YAML does not.
    warnings.push(`"${title}": el frontmatter no es YAML válido; se ha leído tratando \\$ como $.`);
    return { frontmatter: (parseYaml(m[1].replace(/\\\$/g, '$')) ?? {}) as Record<string, unknown>, body };
  }
}

/** The body of a "## Heading" section, without the heading line. */
export function section(body: string, heading: string): string | null {
  const lines = body.split('\n');
  const start = lines.findIndex((l) => l.trim() === `## ${heading}`);
  if (start < 0) return null;
  const end = lines.findIndex((l, i) => i > start && /^#{1,2} /.test(l));
  return lines.slice(start + 1, end < 0 ? undefined : end).join('\n').trim();
}

/** Drops a leading "# Title" line that only repeats the note title. */
function dropTitleHeading(body: string, title: string): string {
  const m = /^\s*# (.+)\n/.exec(body);
  return m && m[1].trim().toLowerCase().startsWith(title.toLowerCase().split(' - ').pop()!.toLowerCase().slice(0, 12))
    ? body.slice(m[0].length)
    : body;
}

export function readBook(title: string, text: string): RawNote {
  const { frontmatter, body } = splitFrontmatter(text, title);
  const summary = section(body, 'Resumen ejecutivo');
  return { title, kind: 'book', frontmatter, markdown: summary ?? '', appearsIn: [] };
}

export function readConcept(title: string, text: string): RawNote {
  const { frontmatter, body } = splitFrontmatter(text, title);
  const appears = section(body, 'Aparece en') ?? '';
  const appearsIn = [...appears.matchAll(WIKILINK)].map((m) => m[1].trim());
  return { title, kind: 'concept', frontmatter, markdown: dropTitleHeading(body, title).trim(), appearsIn };
}

export interface ThemesConfig {
  tematicas: string[];
  libros: Record<string, string | null>;
}

export function buildLibrary(raw: RawNote[], config: ThemesConfig): Library {
  const errors: string[] = [];
  const byTitle = new Map<string, RawNote>();
  for (const n of raw) byTitle.set(n.title.toLowerCase(), n);

  // Slugs must be unique: they are the URLs.
  const slugOf = new Map<RawNote, string>();
  const taken = new Map<string, string>();
  for (const n of raw) {
    const s = slugify(n.title);
    if (!s) errors.push(`"${n.title}" no produce una URL válida.`);
    else if (taken.has(s)) errors.push(`"${n.title}" y "${taken.get(s)}" tendrían la misma URL /biblioteca/${s}.`);
    taken.set(s, n.title);
    slugOf.set(n, s);
  }

  // Themes: each book from tematicas.yml, each concept from its books (tie → first listed book).
  const themeOf = new Map<RawNote, string>();
  let ties = 0;
  for (const n of raw.filter((r) => r.kind === 'book')) {
    const t = config.libros[n.title];
    if (t === undefined) errors.push(`El libro "${n.title}" no está en tematicas.yml.`);
    else if (!t || !config.tematicas.includes(t)) errors.push(`El libro "${n.title}" tiene una temática desconocida: ${t}.`);
    else themeOf.set(n, t);
  }
  for (const n of raw.filter((r) => r.kind === 'concept')) {
    const themes = n.appearsIn.map((b) => config.libros[b]).filter((t): t is string => !!t);
    if (!themes.length) {
      errors.push(`El concepto "${n.title}" no aparece en ningún libro con temática.`);
      continue;
    }
    const votes = new Map<string, number>();
    for (const t of themes) votes.set(t, (votes.get(t) ?? 0) + 1);
    const best = Math.max(...votes.values());
    const tied = [...votes].filter(([, v]) => v === best).map(([t]) => t);
    if (tied.length > 1) ties++;
    themeOf.set(n, themes.find((t) => tied.includes(t))!);
  }

  // Links, resolved case-insensitively like Obsidian.
  const notes: Note[] = raw.map((n) => {
    const links: string[] = [];
    for (const m of n.markdown.matchAll(WIKILINK)) {
      const target = byTitle.get(m[1].trim().toLowerCase());
      if (!target) {
        errors.push(`"${n.title}" enlaza a "${m[1].trim()}", que no existe o no se publica.`);
        continue;
      }
      const s = slugOf.get(target)!;
      if (s !== slugOf.get(n) && !links.includes(s)) links.push(s);
    }
    return {
      title: n.title,
      kind: n.kind,
      frontmatter: n.frontmatter,
      markdown: n.markdown,
      slug: slugOf.get(n)!,
      theme: themeOf.get(n) ?? '',
      links,
      backlinks: [],
      related: n.appearsIn.map((b) => byTitle.get(b.toLowerCase())).filter(Boolean).map((b) => slugOf.get(b!)!),
    };
  });
  const bySlug = new Map(notes.map((n) => [n.slug, n]));
  for (const n of notes) for (const s of n.links) bySlug.get(s)?.backlinks.push(n.slug);
  for (const n of notes) if (n.kind === 'concept') for (const b of n.related) bySlug.get(b)?.related.push(n.slug);
  for (const n of notes) {
    if (n.kind === 'book') n.related.sort((a, b) => bySlug.get(a)!.title.localeCompare(bySlug.get(b)!.title, 'es'));
    if (n.kind === 'book' && !n.markdown) errors.push(`El libro "${n.title}" no tiene sección "## Resumen ejecutivo".`);
  }

  const undirected = new Set<string>();
  for (const n of notes) for (const s of [...n.links, ...n.related]) undirected.add([n.slug, s].sort().join('\u0000'));
  const orphans = notes.filter((n) => !n.links.length && !n.backlinks.length && !n.related.length).map((n) => n.title);

  return {
    notes,
    bySlug,
    themes: config.tematicas,
    report: {
      books: notes.filter((n) => n.kind === 'book').length,
      concepts: notes.filter((n) => n.kind === 'concept').length,
      links: undirected.size,
      orphans,
      ties,
      errors,
    },
  };
}

export function readVault(dir: string): Library {
  const config = parseYaml(readFileSync(join(dir, 'tematicas.yml'), 'utf8')) as ThemesConfig;
  const read = (folder: string, fn: (title: string, text: string) => RawNote) =>
    readdirSync(join(dir, folder))
      .filter((f) => f.endsWith('.md'))
      .sort()
      .map((f) => fn(f.slice(0, -3).normalize('NFC'), readFileSync(join(dir, folder, f), 'utf8').replace(/\r\n/g, '\n')));
  return buildLibrary([...read('Books', readBook), ...read('Concepts', readConcept)], config);
}
