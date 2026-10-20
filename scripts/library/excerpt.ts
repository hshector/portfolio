/** First paragraph of a note as plain text, cut at a word boundary. Used for descriptions and lists. */
export function excerpt(markdown: string, max = 190): string {
  const para = markdown.split(/\n\s*\n/).find((p) => p.trim() && !/^\s*(#|[-*] |\|)/.test(p)) ?? '';
  const text = para
    .replace(/\$\$?[^$]*\$\$?/g, '…')
    .replace(/\[\[([^\]|]+)\|([^\]]+)\]\]/g, '$2')
    .replace(/\[\[([^\]]+)\]\]/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/[*_`>]/g, '')
    .replace(/\\\$/g, '$')
    .replace(/\s+/g, ' ')
    .trim();
  if (text.length <= max) return text;
  const cut = text.slice(0, max);
  return cut.slice(0, cut.lastIndexOf(' ')).replace(/[,;:.\s]+$/, '') + '…';
}
