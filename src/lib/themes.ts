// The library's themes and their colors. Book → theme assignments live in the
// vault repo (tematicas.yml); this file only says how each theme looks.
//
// The five main colors were validated as a set on the night-sky surface
// (OKLCH L 0.48–0.67, chroma ≥ 0.10, contrast ≥ 3:1, all-pairs normal-vision
// ΔE ≥ 15 and colorblind ΔE ≥ 8). tests/themes.test.ts re-checks this on every
// change. "Otros" is a deliberate neutral and is never identified by color
// alone: it is drawn as a hollow ring.

export type ThemeId = 'economia' | 'finanzas' | 'geopolitica' | 'negocio' | 'ai' | 'otros';

export interface Theme {
  id: ThemeId;
  name: string;
  color: string;
  mark: 'star' | 'ring';
}

export const SKY = '#05060d';

export const THEMES: readonly Theme[] = [
  { id: 'economia', name: 'Economía', color: '#c48800', mark: 'star' },
  { id: 'finanzas', name: 'Finanzas', color: '#248860', mark: 'star' },
  { id: 'geopolitica', name: 'Geopolítica', color: '#d26a97', mark: 'star' },
  { id: 'negocio', name: 'Negocio', color: '#6a96d8', mark: 'star' },
  { id: 'ai', name: 'AI', color: '#894ed6', mark: 'star' },
  { id: 'otros', name: 'Otros', color: '#8a8f9c', mark: 'ring' },
];

export const themeByName = (name: string): Theme | undefined => THEMES.find((t) => t.name === name);
