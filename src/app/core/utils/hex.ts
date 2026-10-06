/** Returns normalized #rrggbb or null when empty / invalid. */
export function normalizeHex(hex?: string | null): string | null {
  let s = (hex || '').trim();
  if (!s) return null;
  if (!s.startsWith('#')) s = `#${s}`;
  if (/^#[0-9A-Fa-f]{3}$/.test(s)) {
    s = `#${s[1]}${s[1]}${s[2]}${s[2]}${s[3]}${s[3]}`;
  }
  if (/^#[0-9A-Fa-f]{6}$/.test(s)) return s.toLowerCase();
  return null;
}

export function hasDisplayHex(hex?: string | null): boolean {
  return !!normalizeHex(hex);
}
