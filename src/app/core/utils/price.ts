import { Product } from '../models/catalog.models';

/** Numeric unit price: colour override wins over product basePrice. */
export function effectiveUnitPrice(
  p: Product | null | undefined,
  colorId?: string | null,
): number {
  if (!p) return 0;
  const colors = p.colors || [];
  const color =
    (colorId && colors.find((c) => c.id === colorId)) ||
    colors.find((c) => c.isDefault) ||
    colors[0];
  const override = Number(color?.priceOverride);
  if (Number.isFinite(override) && override > 0) return override;
  const base = Number(p.basePrice);
  return Number.isFinite(base) && base > 0 ? base : 0;
}

/** Lowest positive price across base + colour overrides (for “From £…” cards). */
export function lowestUnitPrice(p: Product | null | undefined): number {
  if (!p) return 0;
  const candidates: number[] = [];
  const base = Number(p.basePrice);
  if (Number.isFinite(base) && base > 0) candidates.push(base);
  for (const c of p.colors || []) {
    const n = Number(c.priceOverride);
    if (Number.isFinite(n) && n > 0) candidates.push(n);
  }
  return candidates.length ? Math.min(...candidates) : 0;
}

export function formatGbp(amount: number): string {
  return `£${amount.toFixed(2)}`;
}

export function priceRangeLabel(p: Product | null | undefined): string {
  if (!p) return '';
  for (const av of p.attributeValues || []) {
    const code = av.attributeDefinition?.code;
    if (code === 'price_range' || code === 'priceRange') {
      return (av.option?.label || av.valueText || '').trim();
    }
  }
  return '';
}

/**
 * Storefront / admin display string.
 * Prefer colour override → base → price range attribute → fallback.
 */
export function priceLabel(
  p: Product | null | undefined,
  colorId?: string | null,
  opts?: { from?: boolean; fallback?: string },
): string {
  const unit = colorId
    ? effectiveUnitPrice(p, colorId)
    : lowestUnitPrice(p) || effectiveUnitPrice(p);
  if (unit > 0) {
    const money = formatGbp(unit);
    return opts?.from && !colorId ? `From ${money}` : money;
  }
  const range = priceRangeLabel(p);
  if (range) return range;
  return opts?.fallback ?? 'Quote on request';
}

export function estimatedTotal(
  p: Product | null | undefined,
  qty: number,
  colorId?: string | null,
): number {
  const unit = effectiveUnitPrice(p, colorId);
  const n = Math.max(0, Number(qty) || 0);
  return unit > 0 && n > 0 ? unit * n : 0;
}
