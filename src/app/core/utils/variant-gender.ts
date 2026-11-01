/**
 * Key of one colour variant in the site settings: its product and its colour name. (A colour's id
 * changes whenever its product is saved, so the id cannot be used.)
 */
export function variantGenderKey(productId: string, colourName: string): string {
  const name = (colourName || '').toLowerCase().replace(/\s+/g, ' ').trim();
  return `${productId}|${name}`;
}
