import { describe, expect, it } from 'vitest';
import { contrast, deltaE, oklch } from '../src/lib/color';
import { SKY, THEMES } from '../src/lib/themes';

const stars = THEMES.filter((t) => t.mark === 'star');
const pairs = stars.flatMap((a, i) => stars.slice(i + 1).map((b) => [a, b] as const));

describe('theme palette on the night sky', () => {
  it('has the six themes chosen for the library, in a fixed order', () => {
    expect(THEMES.map((t) => t.name)).toEqual(['Economía', 'Finanzas', 'Geopolítica', 'Negocio', 'AI', 'Otros']);
  });

  it.each(stars)('$name sits in the dark lightness band and is not gray', ({ color }) => {
    const { L, C } = oklch(color);
    expect(L).toBeGreaterThanOrEqual(0.48);
    expect(L).toBeLessThanOrEqual(0.67);
    expect(C).toBeGreaterThanOrEqual(0.1);
  });

  it.each(THEMES)('$name has at least 3:1 contrast against the sky', ({ color }) => {
    expect(contrast(color, SKY)).toBeGreaterThanOrEqual(3);
  });

  it.each(pairs)('%o and %o are distinguishable', (a, b) => {
    expect(deltaE(a.color, b.color)).toBeGreaterThanOrEqual(15);
    expect(Math.min(deltaE(a.color, b.color, 'protan'), deltaE(a.color, b.color, 'deutan'))).toBeGreaterThanOrEqual(8);
  });

  it('identifies the neutral theme by shape, not only by color', () => {
    for (const t of THEMES) if (oklch(t.color).C < 0.1) expect(t.mark).toBe('ring');
  });
});
