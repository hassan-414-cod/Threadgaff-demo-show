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

/**
 * Quantity pricing used by the Custom Designer's tier table and by Sales desk quotations:
 * smaller runs cost a little more per unit, big runs a little less.
 */
export function quantityTierFactor(qty: number): number {
  const n = Number(qty) || 0;
  if (n >= 1000) return 0.9;
  if (n >= 500) return 1;
  if (n >= 300) return 1.05;
  return 1.12;
}

export function quantityTierLabel(qty: number): string {
  const n = Number(qty) || 0;
  if (n >= 1000) return '1000+ units';
  if (n >= 500) return '500–999 units';
  if (n >= 300) return '300–499 units';
  return 'under 300 units';
}

/** Per-unit add-on prices set on a product, keyed like "decoration:Embroidery". */
export function serviceAddOnsOf(p: Product | null | undefined): Record<string, number> {
  const out: Record<string, number> = {};
  for (const av of p?.attributeValues || []) {
    if (av.attributeDefinition?.code !== 'service_addons') continue;
    const text = (av.valueText || '').trim();
    if (!text) continue;
    try {
      const parsed = JSON.parse(text) as Record<string, unknown>;
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        for (const [k, v] of Object.entries(parsed)) {
          const n = Number(v);
          if (k && Number.isFinite(n) && n > 0) out[k] = Math.round(n * 100) / 100;
        }
      }
    } catch {
      for (const part of text.split(',')) {
        const bits = part.split('|').map((s) => s.trim());
        if (bits.length < 3) continue;
        const n = Number(bits[2]);
        if (Number.isFinite(n) && n > 0) out[`${bits[0]}:${bits[1]}`] = Math.round(n * 100) / 100;
      }
    }
  }
  return out;
}

/** Labels of a multi-value attribute on a product (e.g. its decoration methods). */
export function attributeLabelsOf(
  p: Product | null | undefined,
  code: string,
  defs: Array<{ code: string; options?: Array<{ id: string; label: string }> }> = [],
): string[] {
  const def = defs.find((d) => d.code === code);
  const out: string[] = [];
  for (const av of p?.attributeValues || []) {
    if (av.attributeDefinition?.code !== code) continue;
    const push = (s?: string | null) => {
      const v = (s || '').trim();
      if (v && !out.includes(v)) out.push(v);
    };
    push(av.option?.label);
    for (const id of av.optionIds || []) push(def?.options?.find((o) => o.id === id)?.label);
    for (const part of (av.valueText || '').split(',')) push(part);
  }
  return out;
}
