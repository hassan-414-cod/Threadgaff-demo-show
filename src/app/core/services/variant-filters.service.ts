import { Injectable, computed, inject } from '@angular/core';
import { FilterValues, SiteSettings, SiteSettingsService } from './site-settings.service';
import { variantFilterKey } from '../utils/variant-filters';

type Values = Record<string, string[]>;

/** The Men's / Women's / Unisex list that came before: read as the Gender filter of that colour. */
const LEGACY_GENDER: Record<string, string> = { mens: "Men's", womens: "Women's", unisex: 'Unisex' };

/**
 * The filters ticked on a colour variant of a product (Material, Gender, Fit, …), and the extra ticks
 * of a product's single-value filters. The API has no such fields on a colour, and the product
 * database is left alone, so they are kept with the other site settings, by product and colour name.
 * A filter with nothing ticked on a colour follows its product.
 */
@Injectable({ providedIn: 'root' })
export class VariantFiltersService {
  private readonly site = inject(SiteSettingsService);

  private readonly byVariant = computed(() => this.variantMap(this.site.settings()));
  private readonly byProduct = computed(
    () => new Map(this.site.settings().productFilters.map((p) => [p.key, p.values])),
  );
  /** Every value ticked on any colour, by filter code (offered as options to the other colours and on the shop). */
  private readonly used = computed(() => {
    const out = new Map<string, string[]>();
    for (const values of this.byVariant().values()) {
      for (const [code, labels] of Object.entries(values)) {
        const list = out.get(code) ?? [];
        for (const l of labels) if (!list.some((x) => x.toLowerCase() === l.toLowerCase())) list.push(l);
        out.set(code, list);
      }
    }
    return out;
  });

  /** What is ticked on one colour variant, by filter code ({} when it follows its product). */
  valuesOf(productId: string, colourName: string): Values {
    return this.byVariant().get(variantFilterKey(productId, colourName)) ?? {};
  }

  /** The product's ticks of Material / Gender when it has more than one. */
  productValues(productId: string): Values {
    return this.byProduct().get(productId) ?? {};
  }

  /** Values ticked on colours for a filter (they may not be in the filter's own checklist). */
  extraOptions(code: string): string[] {
    return this.used().get(code) ?? [];
  }

  private variantMap(s: SiteSettings): Map<string, Values> {
    const map = new Map<string, Values>(s.variantFilters.map((v) => [v.key, v.values]));
    for (const g of s.variantGenders) {
      const cur = map.get(g.key);
      if (cur?.['gender']?.length) continue;
      map.set(g.key, { ...(cur ?? {}), gender: [LEGACY_GENDER[g.gender]] });
    }
    return map;
  }

  /** What is saved for one product, for the admin form: its colours (by normalised colour name) and its extras. */
  async savedFor(productId: string): Promise<{ variants: Map<string, Values>; product: Values }> {
    const s = await this.site.current();
    const prefix = `${productId}|`;
    const variants = new Map<string, Values>();
    for (const [key, values] of this.variantMap(s)) {
      if (key.startsWith(prefix)) variants.set(key.slice(prefix.length), values);
    }
    return { variants, product: s.productFilters.find((p) => p.key === productId)?.values ?? {} };
  }

  /** Saves one product's colour filters and extra ticks; the other products' are kept as they are. */
  async saveFor(
    productId: string,
    rows: Array<{ name: string; filters: Values }>,
    product: Values,
  ): Promise<void> {
    const base = await this.site.current();
    const prefix = `${productId}|`;
    const mine: FilterValues[] = rows
      .map((r) => ({ key: variantFilterKey(productId, r.name), values: this.clean(r.filters) }))
      .filter((r) => Object.keys(r.values).length);
    const own = this.clean(product);
    const variantFilters = [...base.variantFilters.filter((v) => !v.key.startsWith(prefix)), ...mine];
    const productFilters = [
      ...base.productFilters.filter((p) => p.key !== productId),
      ...(Object.keys(own).length ? [{ key: productId, values: own }] : []),
    ];
    // the older per-colour Men's / Women's / Unisex list is now part of the filters
    const variantGenders = base.variantGenders.filter((v) => !v.key.startsWith(prefix));
    const sig = (list: FilterValues[]) =>
      JSON.stringify(
        [...list]
          .sort((a, b) => a.key.localeCompare(b.key))
          .map((e) => [e.key, Object.entries(e.values).sort(([p], [q]) => p.localeCompare(q))]),
      );
    if (
      sig(variantFilters) === sig(base.variantFilters) &&
      sig(productFilters) === sig(base.productFilters) &&
      variantGenders.length === base.variantGenders.length
    ) {
      return;
    }
    await this.site.update({ variantFilters, productFilters, variantGenders });
  }

  private clean(v: Values): Values {
    const out: Values = {};
    for (const [code, list] of Object.entries(v)) {
      const seen = new Set<string>();
      const labels = list
        .map((x) => x.trim())
        .filter((x) => {
          const k = x.toLowerCase();
          if (!x || seen.has(k)) return false;
          seen.add(k);
          return true;
        });
      if (labels.length) out[code] = labels;
    }
    return out;
  }
}
