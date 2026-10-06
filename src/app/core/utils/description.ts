import { Product, ProductColor } from '../models/catalog.models';

/** Packed merch blobs are not marketing copy — hide them on the storefront. */
export function isPackedMerchText(text: string | null | undefined): boolean {
  return /^(Material|Gender|Fit|Price range|CategoryIds|Decoration|Sustainability|GSM|Placement|Private label|ServiceAddOns):/i.test(
    (text || '').trim(),
  );
}

function cleanCopy(text: string | null | undefined): string {
  const t = (text || '').replace(/\s+/g, ' ').trim();
  if (!t || isPackedMerchText(t)) return '';
  return t;
}

/** Prefer selected variant description, then product short/long marketing copy. */
export function cardDescription(
  p: Product | null | undefined,
  colorId?: string | null,
): string {
  if (!p) return '';
  const colors = p.colors || [];
  const color =
    (colorId && colors.find((c) => c.id === colorId)) ||
    colors.find((c) => c.isDefault) ||
    colors[0];
  return (
    cleanCopy((color as ProductColor & { description?: string | null })?.description) ||
    cleanCopy(p.shortDescription) ||
    cleanCopy(p.description)
  );
}
