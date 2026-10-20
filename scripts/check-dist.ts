// Checks the built site in dist/ before it is deployed:
//   1. every internal link points to a page or file that exists;
//   2. book pages publish only the executive summary, never the private chapter notes;
//   3. the site fits Cloudflare's free plan (20,000 files per version, 25 MiB per file).
// Needs VAULT_DIR for check 2. Exits with 1 on any failure.

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { section } from './library/vault.ts';
import { slugify } from './library/slug.ts';

const dist = resolve('dist');
const vault = resolve(process.env.VAULT_DIR ?? 'vault');
const failures: string[] = [];

const files: string[] = [];
(function walk(dir: string) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) walk(p);
    else files.push(p);
  }
})(dist);

// 3. Hosting limits
const MAX_FILES = 20_000;
const MAX_BYTES = 25 * 1024 * 1024;
if (files.length > MAX_FILES) failures.push(`${files.length} ficheros: el plan gratuito de Cloudflare admite ${MAX_FILES}.`);
for (const f of files) if (statSync(f).size > MAX_BYTES) failures.push(`${relative(dist, f)} pesa más de 25 MiB.`);

// 1. Internal links
const exists = (path: string) => {
  const p = decodeURIComponent(path).replace(/^\//, '');
  if (p === '') return existsSync(join(dist, 'index.html'));
  return existsSync(join(dist, p)) && statSync(join(dist, p)).isFile()
    ? true
    : existsSync(join(dist, `${p}.html`)) || existsSync(join(dist, p, 'index.html'));
};
const html = files.filter((f) => f.endsWith('.html'));
let checked = 0;
const broken = new Map<string, string[]>();
for (const f of html) {
  const page = '/' + relative(dist, f).replace(/(index)?\.html$/, '');
  for (const m of readFileSync(f, 'utf8').matchAll(/<a\s[^>]*href="([^"]+)"/g)) {
    const href = m[1].replace(/&amp;/g, '&');
    if (!href.startsWith('/') || href.startsWith('//')) continue;
    const path = href.split(/[?#]/)[0];
    checked++;
    if (!exists(path)) broken.set(path, [...(broken.get(path) ?? []), page]);
  }
}
for (const [path, pages] of broken) failures.push(`Enlace roto ${path} (en ${pages.slice(0, 3).join(', ')}${pages.length > 3 ? ` y ${pages.length - 3} más` : ''})`);

// 2. Private chapter notes never reach a book page
let probes = 0;
if (existsSync(join(vault, 'Books'))) {
  const conceptTitles = readdirSync(join(vault, 'Concepts')).map((f) => f.slice(0, -3).normalize('NFC')).join(' | ');
  const norm = (s: string) => s.replace(/<[^>]+>/g, ' ').replace(/[*_`>#]/g, '').replace(/\s+/g, ' ').trim();
  for (const file of readdirSync(join(vault, 'Books')).filter((f) => f.endsWith('.md'))) {
    const text = readFileSync(join(vault, 'Books', file), 'utf8').replace(/\r\n/g, '\n');
    const summary = section(text.replace(/^---\n[\s\S]*?\n---\n?/, ''), 'Resumen ejecutivo') ?? '';
    const page = join(dist, 'biblioteca', `${slugify(file.slice(0, -3).normalize('NFC'))}.html`);
    if (!existsSync(page)) {
      failures.push(`Falta la página del libro ${file}.`);
      continue;
    }
    const published = norm(readFileSync(page, 'utf8'));
    // Text that may legitimately appear on the page: the summary, the front matter and every
    // concept title (the page lists the book's concepts, and the private notes mention them too).
    const allowed = norm(summary + ' ' + text.slice(0, text.indexOf('\n---', 4) + 1) + ' ' + conceptTitles);
    const privateLines = text
      .split('\n')
      .filter((l) => l.length > 120 && !summary.includes(l) && !l.startsWith('---') && !/^[a-zñ_]+:/.test(l))
      .map((l) => norm(l).slice(20, 90));
    for (const probe of privateLines) {
      probes++;
      if (probe.length > 40 && published.includes(probe) && !allowed.includes(probe)) {
        failures.push(`La página de "${file.slice(0, -3)}" contiene texto de las notas privadas: «${probe}».`);
        break;
      }
    }
  }
} else {
  failures.push(`No encuentro el vault en ${vault} para comprobar que no se publican las notas privadas.`);
}

const heavy = html.map((f) => [relative(dist, f), statSync(f).size] as const).sort((a, b) => b[1] - a[1]).slice(0, 3);
console.log(`dist: ${files.length} ficheros, ${html.length} páginas HTML.`);
console.log(`Enlaces internos comprobados: ${checked}. Fragmentos privados comprobados: ${probes}.`);
console.log(`Páginas más pesadas: ${heavy.map(([f, s]) => `${f} (${(s / 1024).toFixed(0)} KB)`).join(', ')}`);
if (failures.length) {
  console.error(`\n${failures.length} problema(s):\n- ${failures.join('\n- ')}`);
  process.exit(1);
}
console.log('Todo correcto.');
