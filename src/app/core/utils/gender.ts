/** Shared gender loop: Unisex ↔ Men's ↔ Women's for catalog display. */

export type GenderKey = 'unisex' | 'mens' | 'womens' | 'kids' | '';

export function normalizeGender(value: string | null | undefined): GenderKey {
  const n = String(value || '')
    .toLowerCase()
    .replace(/[’']/g, '')
    .replace(/[^a-z0-9]+/g, '');
  if (!n) return '';
  if (n.includes('uni')) return 'unisex';
  if (n.includes('women') || n.includes('womenswear')) return 'womens';
  if (n.includes('men') || n.includes('menswear')) return 'mens';
  if (n.includes('kid')) return 'kids';
  return '';
}

/**
 * When a gender chip/filter is clicked, expand to related genders so products show correctly:
 * - Unisex → Unisex (belongs in both Men's and Women's views)
 * - Men's → Men's + Unisex
 * - Women's → Women's + Unisex
 */
export function expandGenderFilter(selected: string): string[] {
  const key = normalizeGender(selected);
  if (key === 'mens') return ["Men's", 'Unisex'];
  if (key === 'womens') return ["Women's", 'Unisex'];
  if (key === 'unisex') return ['Unisex'];
  return selected.trim() ? [selected.trim()] : [];
}

/** True if a product's gender should appear under the selected filter (with the Unisex loop). */
export function genderMatchesFilter(
  productGender: string | null | undefined,
  selectedFilter: string,
): boolean {
  if (!selectedFilter.trim()) return true;
  const productKey = normalizeGender(productGender);
  if (!productKey) return false;
  const wanted = new Set(
    expandGenderFilter(selectedFilter)
      .map((v) => normalizeGender(v))
      .filter(Boolean),
  );
  if (wanted.has(productKey)) return true;
  // Unisex products always appear in Men's and Women's
  if (productKey === 'unisex' && (wanted.has('mens') || wanted.has('womens'))) {
    return true;
  }
  return false;
}

export function genderLabelForKey(key: GenderKey): string {
  switch (key) {
    case 'unisex':
      return 'Unisex';
    case 'mens':
      return "Men's";
    case 'womens':
      return "Women's";
    case 'kids':
      return 'Kidswear';
    default:
      return '';
  }
}
