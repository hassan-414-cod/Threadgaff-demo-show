/** A colour can carry more than one shade (a two-tone garment): its main one plus up to this many extra ones. */
export const MAX_EXTRA_TONES = 3;

/** '#rgb' or '#rrggbb' (with or without the #) as lowercase '#rrggbb'; null when it is not a colour code. */
export function normTone(raw: string | null | undefined): string | null {
  let v = (raw || '').trim().replace(/^#/, '');
  if (/^[0-9a-f]{3}$/i.test(v)) v = v.split('').map((c) => c + c).join('');
  return /^[0-9a-f]{6}$/i.test(v) ? '#' + v.toLowerCase() : null;
}

/** The extra shades cleaned up: valid codes only, no repeats, at most MAX_EXTRA_TONES. */
export function cleanTones(list: Array<string | null | undefined>): string[] {
  const out: string[] = [];
  for (const raw of list) {
    const n = normTone(raw);
    if (n && !out.includes(n)) out.push(n);
    if (out.length >= MAX_EXTRA_TONES) break;
  }
  return out;
}

/**
 * The CSS background of a swatch: one shade is a plain colour, several are split into equal slices on a slant
 * (two-tone: half and half). The list holds the main shade first.
 */
export function toneBackground(shades: string[]): string {
  const list = shades.filter((s) => !!s);
  if (list.length <= 1) return list[0] || '';
  const step = 100 / list.length;
  const stops = list.map((c, i) => `${c} ${+(i * step).toFixed(2)}% ${+((i + 1) * step).toFixed(2)}%`);
  return `linear-gradient(135deg, ${stops.join(', ')})`;
}
