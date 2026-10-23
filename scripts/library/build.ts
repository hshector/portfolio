// Builds the library from the vault: page data for Astro, the constellation graph
// and an audit report. Run before `astro build` (npm run build does it).
//
//   VAULT_DIR=../vault-libros node scripts/library/build.ts
//
// Fails on anything that would publish a broken site: unknown books, broken links,
// duplicate URLs, books without an executive summary, formulas KaTeX cannot render.

import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { excerpt } from './excerpt.ts';
import { buildGraph } from './graph.ts';
import { createRenderer } from './render.ts';
import { readVault, warnings } from './vault.ts';

const vault = resolve(process.env.VAULT_DIR ?? 'vault');
const outDir = resolve('.generated');
const publicData = resolve('public/data');

if (!existsSync(join(vault, 'tematicas.yml'))) {
  console.error(`No encuentro el vault en ${vault}. Define VAULT_DIR o clona hshector/vault-libros en ./vault.`);
  process.exit(1);
}

const t0 = performance.now();
const lib = readVault(vault);
const urlOf = new Map(lib.notes.map((n) => [n.title.toLowerCase(), `/biblioteca/${n.slug}`]));
const render = createRenderer({ resolve: (title) => urlOf.get(title) });

const errors = [...lib.report.errors];
let fixedFormulas = 0;
const fixedIn: string[] = [];
const notes = lib.notes.map((n) => {
  const r = render(n.markdown);
  errors.push(...r.issues.map((i) => `"${n.title}": ${i}`));
  if (r.fixedFormulas) {
    fixedFormulas += r.fixedFormulas;
    fixedIn.push(n.title);
  }
  const fm = n.frontmatter;
  return {
    slug: n.slug,
    title: n.title,
    kind: n.kind,
    theme: n.theme,
    excerpt: excerpt(n.markdown),
    html: r.html,
    links: n.links,
    backlinks: n.backlinks,
    related: n.related,
    book:
      n.kind === 'book'
        ? {
            title: String(fm['título'] ?? n.title.split(' - ').slice(1).join(' - ')),
            author: String(fm.autor ?? n.title.split(' - ')[0]),
            year: fm['año'] ? Number(fm['año']) : null,
            publisher: fm.editorial ? String(fm.editorial) : null,
          }
        : null,
  };
});

if (errors.length) {
  console.error(`La biblioteca tiene ${errors.length} problema(s):\n- ${errors.slice(0, 50).join('\n- ')}`);
  process.exit(1);
}

mkdirSync(outDir, { recursive: true });
mkdirSync(publicData, { recursive: true });
const { report } = lib;
writeFileSync(join(outDir, 'library.json'), JSON.stringify({ themes: lib.themes, report, notes }));

const graph = buildGraph(lib);
writeFileSync(join(publicData, 'graph.json'), JSON.stringify(graph.meta));
writeFileSync(join(publicData, 'graph.bin'), graph.bin);

// The messages in the island's bottles: ideas that appear in three books or more, each with the first
// sentence of its definition (src/island/bottles.ts).
const firstSentence = (text: string) => {
  const m = text.match(/^(.{60,}?[.!?])\s/);
  return m ? m[1] : text;
};
const bottles = lib.notes
  .filter((n) => n.kind === 'concept' && n.related.length >= 3)
  .map((n) => ({ s: n.slug, t: n.title, d: firstSentence(excerpt(n.markdown, 280)), b: n.related.length }))
  .filter((m) => m.d.length > 40);
writeFileSync(join(publicData, 'bottles.json'), JSON.stringify(bottles));

const md = [
  '# Informe de la biblioteca',
  '',
  `- Libros: ${report.books} · Conceptos: ${report.concepts} · Conexiones: ${report.links}`,
  `- Conceptos con empate de temática (resuelto por el primer libro): ${report.ties}`,
  `- Notas sin ninguna conexión: ${report.orphans.length}${report.orphans.length ? ` (${report.orphans.join(', ')})` : ''}`,
  `- Fórmulas escritas como \\$…\\$ y mostradas como fórmula: ${fixedFormulas}${fixedIn.length ? ` en ${fixedIn.join(', ')}` : ''}`,
  ...warnings.map((w) => `- Aviso: ${w}`),
  '',
].join('\n');
writeFileSync(join(outDir, 'library-report.md'), md);

console.log(md);
console.log(
  `Generado en ${((performance.now() - t0) / 1000).toFixed(1)} s: ${notes.length} notas, grafo de ${graph.meta.nodes} nodos y ${graph.meta.edges} enlaces (${(graph.bin.byteLength / 1024).toFixed(0)} KB).`,
);
