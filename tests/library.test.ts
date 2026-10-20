import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { excerpt } from '../scripts/library/excerpt.ts';
import { buildGraph } from '../scripts/library/graph.ts';
import { createRenderer, protectMathDollars } from '../scripts/library/render.ts';
import { slugify } from '../scripts/library/slug.ts';
import { buildLibrary, readVault, warnings, type RawNote } from '../scripts/library/vault.ts';

const fixture = join(import.meta.dirname, 'fixtures/vault');
const lib = readVault(fixture);
const note = (slug: string) => lib.bySlug.get(slug)!;

describe('reading the vault', () => {
  it('reads books and concepts without errors', () => {
    expect(lib.report).toMatchObject({ books: 2, concepts: 2, errors: [] });
  });

  it('publishes only the executive summary of a book', () => {
    const book = note('autora-uno-libro-de-economia');
    expect(book.markdown).toContain('Un resumen propio');
    expect(book.markdown).not.toContain('TEXTO PRIVADO');
  });

  it('tolerates the escaped dollar Obsidian allows in front matter, and reports it', () => {
    expect(note('autora-uno-libro-de-economia').frontmatter['título']).toBe('Libro de Economía: de $0 a $100');
    expect(warnings.some((w) => w.includes('Autora Uno'))).toBe(true);
  });

  it('gives each concept the theme of its books, breaking ties with the first one listed', () => {
    expect(note('inflacion').theme).toBe('Economía');
    expect(note('tipo-de-interes-real').theme).toBe('Finanzas');
    expect(lib.report.ties).toBe(2);
  });

  it('resolves links case-insensitively and builds backlinks and book lists', () => {
    expect(note('inflacion').links).toEqual(['tipo-de-interes-real', 'autora-uno-libro-de-economia', 'autor-dos-libro-de-finanzas']);
    expect(note('tipo-de-interes-real').backlinks).toEqual(['inflacion']);
    expect(note('autor-dos-libro-de-finanzas').related).toEqual(['inflacion', 'tipo-de-interes-real']);
  });
});

describe('library errors that must stop the build', () => {
  const raw = (title: string, kind: RawNote['kind'], markdown = '', appearsIn: string[] = []): RawNote => ({ title, kind, frontmatter: {}, markdown, appearsIn });
  const config = { tematicas: ['Economía'], libros: { 'A - Libro': 'Economía' } };

  it('a link to a note that does not exist', () => {
    const r = buildLibrary([raw('A - Libro', 'book', 'resumen'), raw('X', 'concept', 'ver [[Nada]]', ['A - Libro'])], config);
    expect(r.report.errors).toEqual(['"X" enlaza a "Nada", que no existe o no se publica.']);
  });

  it('a book missing from tematicas.yml', () => {
    const r = buildLibrary([raw('B - Otro', 'book', 'resumen')], config);
    expect(r.report.errors[0]).toContain('no está en tematicas.yml');
  });

  it('two notes that would share a URL', () => {
    const r = buildLibrary([raw('A - Libro', 'book', 'r'), raw('Ética', 'concept', '', ['A - Libro']), raw('Etica', 'concept', '', ['A - Libro'])], config);
    expect(r.report.errors.some((e) => e.includes('misma URL /biblioteca/etica'))).toBe(true);
  });

  it('a book without an executive summary', () => {
    const r = buildLibrary([raw('A - Libro', 'book', '')], config);
    expect(r.report.errors).toContain('El libro "A - Libro" no tiene sección "## Resumen ejecutivo".');
  });
});

describe('rendering notes', () => {
  const render = createRenderer({ resolve: (t) => ({ 'tipo de interés real': '/biblioteca/tipo-de-interes-real' })[t] });

  it('turns wikilinks into links, keeping the alias text', () => {
    const { html } = render('Ver [[Tipo de interés real|el tipo real]] y [[Inexistente]].');
    expect(html).toContain('<a href="/biblioteca/tipo-de-interes-real">el tipo real</a>');
    expect(html).toContain('Inexistente');
    expect(html).not.toContain('[[');
  });

  it('renders formulas at build time, including escaped dollars inside them', () => {
    const r = render('El tipo $r_\\$ - r_{stock}$ y $$\\frac{a}{b}$$');
    expect(r.issues).toEqual([]);
    expect(r.html.match(/class="katex"/g)).toHaveLength(2);
  });

  it('keeps escaped dollars as money, and rescues formulas written between escaped dollars', () => {
    const r = render('Cuesta \\$5 y \\$10, y el índice es \\$\\text{IPC}_t\\$.');
    expect(r.html).toContain('Cuesta $5 y $10');
    expect(r.html).toContain('class="katex"');
    expect(r.fixedFormulas).toBe(1);
  });

  it('reports formulas KaTeX cannot render', () => {
    expect(render('mal: $\\frac{1}{$').issues.length).toBeGreaterThan(0);
  });

  it('protectMathDollars only rewrites dollars inside math', () => {
    expect(protectMathDollars('a \\$1 $x_\\$$ b').text).toBe('a \\$1 $x_{\\DOLLAR}$ b');
  });
});

describe('helpers', () => {
  it('slugify', () => {
    expect(slugify('Patrón oro (1933)')).toBe('patron-oro-1933');
    expect(slugify('-Pan con pan- (falsa diversificación)')).toBe('pan-con-pan-falsa-diversificacion');
    expect(slugify('M&A')).toBe('m-y-a');
  });

  it('excerpt takes the first paragraph as plain text', () => {
    expect(excerpt('# T\n\nTexto con [[Enlace|alias]] y **negrita**.\n\nOtro')).toBe('Texto con alias y negrita.');
    expect(excerpt('palabra '.repeat(60), 40).endsWith('…')).toBe(true);
  });
});

describe('constellation graph', () => {
  it('stores every node and each undirected link once', () => {
    const g = buildGraph(lib, 50);
    expect(g.meta.nodes).toBe(4);
    expect(g.meta.edges).toBe(lib.report.links);
    expect(g.bin.byteLength).toBe(4 * 3 * 2 + g.meta.edges * 2 * 2);
  });

  it('is deterministic, so builds do not reshuffle the sky', () => {
    expect(buildGraph(lib, 50).bin).toEqual(buildGraph(lib, 50).bin);
  });
});
