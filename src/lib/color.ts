// Small color-science helpers used to keep the theme palette honest.
// OKLab (Ottosson 2020), WCAG 2 contrast, and Machado et al. (2009) full-severity
// protanopia/deuteranopia simulation in linear sRGB.

type Vec3 = [number, number, number];

const hexToSrgb = (hex: string): Vec3 => {
  const h = hex.replace('#', '');
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255) as Vec3;
};
const toLinear = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const linear = (hex: string): Vec3 => hexToSrgb(hex).map(toLinear) as Vec3;
const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

function oklabFromLinear([r, g, b]: Vec3): Vec3 {
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
}

export const oklch = (hex: string) => {
  const [L, a, b] = oklabFromLinear(linear(hex));
  return { L, C: Math.hypot(a, b) };
};

export function contrast(a: string, b: string): number {
  const lum = (hex: string) => {
    const [r, g, bl] = linear(hex);
    return 0.2126 * r + 0.7152 * g + 0.0722 * bl;
  };
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

const CVD: Record<'protan' | 'deutan', number[][]> = {
  protan: [
    [0.152286, 1.052583, -0.204868],
    [0.114503, 0.786281, 0.099216],
    [-0.003882, -0.048116, 1.051998],
  ],
  deutan: [
    [0.367322, 0.860646, -0.227968],
    [0.280085, 0.672501, 0.047413],
    [-0.01182, 0.04294, 0.968881],
  ],
};

/** OKLab distance ×100 between two colors, optionally as seen with a color-vision deficiency. */
export function deltaE(a: string, b: string, vision: 'normal' | 'protan' | 'deutan' = 'normal'): number {
  const view = (hex: string): Vec3 => {
    const rgb = linear(hex);
    if (vision === 'normal') return oklabFromLinear(rgb);
    const m = CVD[vision];
    return oklabFromLinear(m.map((row) => clamp01(row[0] * rgb[0] + row[1] * rgb[1] + row[2] * rgb[2])) as Vec3);
  };
  const [p, q] = [view(a), view(b)];
  return Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]) * 100;
}
