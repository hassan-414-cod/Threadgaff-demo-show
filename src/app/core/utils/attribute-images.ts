/**
 * Pictures can be attached to an attribute value (for example "Fabric: Fleece" or
 * "Decoration: Embroidery"). They are looked up by the attribute's code and the value's label,
 * ignoring capital letters, quotes and extra spaces, so "Men's" and "mens" are the same value.
 */
export function attributeImageKey(code: string, label: string): string {
  const clean = (label || '')
    .toLowerCase()
    .replace(/[’']/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
  return `${(code || '').trim().toLowerCase()}:${clean}`;
}
