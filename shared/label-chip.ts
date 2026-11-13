/** Label chip colours derived from a repo label colour, per theme (issues-spec section 1). */

export type ChipTheme = 'dark' | 'light';

type Rgb = [number, number, number];

const BACKGROUND: Record<ChipTheme, Rgb> = {
  dark: [0x0d, 0x11, 0x17],
  light: [0xff, 0xff, 0xff],
};
const FILL_ALPHA: Record<ChipTheme, number> = { dark: 0.2, light: 0.22 };
const BORDER_ALPHA = 0.55;
const MIN_CONTRAST = 4.8;

export interface ChipColors {
  fill: string;
  border: string;
  text: string;
}

function parseHex(hex: string): Rgb {
  const h = /^[0-9a-f]{6}$/i.test(hex) ? hex : '6e7167';
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)) as Rgb;
}

const mix = (a: Rgb, b: Rgb, t: number): Rgb =>
  [0, 1, 2].map((i) => Math.round((a[i] ?? 0) * (1 - t) + (b[i] ?? 0) * t)) as Rgb;

const toHex = (c: Rgb): string => `#${c.map((v) => v.toString(16).padStart(2, '0')).join('')}`;

function luminance(c: Rgb): number {
  const [r, g, b] = c.map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  }) as Rgb;
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrast(a: Rgb, b: Rgb): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

/** Opaque fill, border and text for a chip, so it reads the same on a selected row. */
export function chipColors(hex: string, theme: ChipTheme): ChipColors {
  const base = parseHex(hex);
  const fill = mix(BACKGROUND[theme], base, FILL_ALPHA[theme]);
  const border = mix(fill, base, BORDER_ALPHA);
  const toward: Rgb = theme === 'dark' ? [255, 255, 255] : [0, 0, 0];
  let text = base;
  for (let step = 1; contrast(text, fill) < MIN_CONTRAST && step <= 20; step++) {
    text = mix(base, toward, step * 0.05);
  }
  return { fill: toHex(fill), border: toHex(border), text: toHex(text) };
}
