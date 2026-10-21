// Outlines of the name written in the island's landscape, from Bricolage Grotesque ExtraBold
// (SIL Open Font License 1.1). Writes src/island/name-glyphs.json: one list of path commands per
// word, in em units (1 = font size), y up. The island extrudes them into stone letters.
import { readFileSync, writeFileSync } from 'node:fs';
import opentype from 'opentype.js';

const file = 'node_modules/@fontsource/bricolage-grotesque/files/bricolage-grotesque-latin-800-normal.woff';
const buf = readFileSync(file);
const font = opentype.parse(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
const words = ['HÉCTOR', 'SANCHIS'];
const out: Record<string, { width: number; commands: (string | number)[][] }> = {};
for (const w of words) {
  // glyph by glyph (font.getPath trips on a contextual-substitution table opentype.js can't read)
  const path = new opentype.Path();
  let x = 0;
  const glyphs = [...w].map((ch) => font.charToGlyph(ch));
  glyphs.forEach((g, i) => {
    path.extend(g.getPath(x, 0, 1)); // size 1: coordinates in em
    x += (g.advanceWidth ?? 0) / font.unitsPerEm;
    if (i < glyphs.length - 1) x += font.getKerningValue(g, glyphs[i + 1]) / font.unitsPerEm;
  });
  const r = (v: number) => Math.round(v * 1000) / 1000;
  // opentype's y grows downwards; flip so letters stand up
  const commands = path.commands.map((c) => {
    if (c.type === 'Z') return ['Z'];
    if (c.type === 'M' || c.type === 'L') return [c.type, r(c.x), r(-c.y)];
    if (c.type === 'Q') return ['Q', r(c.x1), r(-c.y1), r(c.x), r(-c.y)];
    return ['C', r(c.x1), r(-c.y1), r(c.x2), r(-c.y2), r(c.x), r(-c.y)];
  });
  out[w] = { width: r(x), commands };
}
writeFileSync('src/island/name-glyphs.json', JSON.stringify(out));
console.log(Object.entries(out).map(([w, v]) => `${w}: ${v.commands.length} commands, ${v.width} em`).join('\n'));
