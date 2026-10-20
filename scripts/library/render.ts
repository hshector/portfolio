// Markdown → HTML for published notes: GFM, LaTeX math rendered at build time
// (KaTeX, no JavaScript in the browser) and Obsidian [[wikilinks]] as real links.

import type { Root, Text, PhrasingContent } from 'mdast';
import rehypeKatex from 'rehype-katex';
import rehypeStringify from 'rehype-stringify';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import remarkParse from 'remark-parse';
import remarkRehype from 'remark-rehype';
import { unified } from 'unified';
import { visit, SKIP } from 'unist-util-visit';
import { VFile } from 'vfile';

const WIKILINK = /\[\[([^\]|#]+)(?:#[^\]|]*)?(?:\|([^\]]*))?\]\]/g;

export interface RenderContext {
  /** Lower-cased note title → URL path. */
  resolve: (title: string) => string | undefined;
}

export interface RenderResult {
  html: string;
  /** Formulas written as `\\$…\\$` that were rendered as math anyway. */
  fixedFormulas: number;
  /** Problems found while rendering (math that KaTeX could not parse, dropped raw HTML). */
  issues: string[];
}

function remarkWikilinks(ctx: RenderContext) {
  return (tree: Root) => {
    visit(tree, 'text', (node: Text, index, parent) => {
      if (!parent || index === undefined || !node.value.includes('[[')) return;
      const out: PhrasingContent[] = [];
      let last = 0;
      for (const m of node.value.matchAll(WIKILINK)) {
        if (m.index! > last) out.push({ type: 'text', value: node.value.slice(last, m.index) });
        const target = m[1].trim();
        const label = (m[2] ?? target).trim();
        const url = ctx.resolve(target.toLowerCase());
        out.push(url ? { type: 'link', url, children: [{ type: 'text', value: label }] } : { type: 'text', value: label });
        last = m.index! + m[0].length;
      }
      if (last < node.value.length) out.push({ type: 'text', value: node.value.slice(last) });
      parent.children.splice(index, 1, ...out);
      return [SKIP, index + out.length];
    });
  };
}

/**
 * Prepares math for remark-math, which knows nothing about Obsidian's escapes:
 * - Inside math, `\$` (an escaped dollar, e.g. `$r_\$$` for "the dollar rate") becomes `\DOLLAR`,
 *   a KaTeX macro for `\$`, so the formula is not cut short.
 * - Outside math, `\$` stays a literal dollar sign, except for the slip `\$\text{…}\$`: when the text
 *   between two escaped dollars in one paragraph holds LaTeX (a command or a braced sub/superscript),
 *   it was meant as a formula.
 *   Those are rendered as math and counted in `fixedFormulas`.
 */
export function protectMathDollars(src: string): { text: string; fixedFormulas: number } {
  let out = '';
  let open: '' | '$' | '$$' = '';
  let fixedFormulas = 0;
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (c === '\\' && src[i + 1] === '$') {
      if (open) {
        out += '{\\DOLLAR}';
        i++;
        continue;
      }
      const close = src.indexOf('\\$', i + 2);
      const inner = close > 0 ? src.slice(i + 2, close) : '';
      if (close > 0 && !inner.includes('\n\n') && !/(^|[^\\])\$/.test(inner) && inner.length < 300 && /\\[A-Za-z]+|[_^]\{/.test(inner)) {
        out += `$${inner}$`;
        fixedFormulas++;
        i = close + 1;
        continue;
      }
      out += '\\$';
      i++;
      continue;
    }
    if (c === '\n' && src[i + 1] === '\n' && open === '$') open = '';
    if (c === '$') {
      let delim: '$' | '$$' = src[i + 1] === '$' ? '$$' : '$';
      if (open === '$') delim = '$'; // inside inline math only a single "$" can close it
      open = open ? '' : delim;
      out += delim;
      i += delim.length - 1;
      continue;
    }
    out += c;
  }
  return { text: out, fixedFormulas };
}

export function createRenderer(ctx: RenderContext) {
  const processor = unified()
    .use(remarkParse)
    .use(remarkGfm)
    .use(remarkMath)
    .use(remarkWikilinks, ctx)
    .use(remarkRehype)
    .use(rehypeKatex, { strict: 'ignore', output: 'html', macros: { '\\DOLLAR': '\\$' } })
    .use(rehypeStringify);

  return (markdown: string): RenderResult => {
    const issues: string[] = [];
    const { text, fixedFormulas } = protectMathDollars(markdown);
    const tree = processor.parse(text);
    visit(tree, 'html', (n: { value: string }) => {
      issues.push(`HTML descartado: ${n.value.slice(0, 60)}`);
    });
    const file = new VFile();
    const html = processor.stringify(processor.runSync(tree, file) as never) as string;
    // rehype-katex reports every formula it could not render as a message on the file.
    for (const m of file.messages) issues.push(`Fórmula no válida: ${String(m.reason).slice(0, 100)}`);
    for (const m of html.matchAll(/class="katex-error"[^>]*title="([^"]*)"/g)) issues.push(`Fórmula no válida: ${m[1].slice(0, 100)}`);
    // With throwOnError off, KaTeX paints unknown commands in its error color instead of failing.
    for (const m of html.matchAll(/color:\s*#cc0000[^>]*>([^<]*)</g)) issues.push(`Comando LaTeX desconocido: ${m[1].slice(0, 60)}`);
    return { html, issues, fixedFormulas };
  };
}
