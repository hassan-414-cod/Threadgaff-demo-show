import { Injectable, computed, inject } from '@angular/core';
import { SiteSettingsService, VariantGender } from './site-settings.service';
import { variantGenderKey } from '../utils/variant-gender';

/**
 * The Men's / Women's / Unisex category of a colour variant. The API has no such field on a colour,
 * so it is kept with the other site settings, by product and colour name. A colour with none set
 * follows its product's gender.
 */
@Injectable({ providedIn: 'root' })
export class VariantGendersService {
  private readonly site = inject(SiteSettingsService);

  private readonly byKey = computed(
    () => new Map(this.site.settings().variantGenders.map((v) => [v.key, v.gender])),
  );

  /** The category set on one colour variant: 'mens', 'womens', 'unisex', or '' when it follows its product. */
  genderOf(productId: string, colourName: string): VariantGender['gender'] | '' {
    return this.byKey().get(variantGenderKey(productId, colourName)) ?? '';
  }

  /** What is saved for one product's colours, by (normalised) colour name, for the admin form. */
  async savedFor(productId: string): Promise<Map<string, string>> {
    const saved = await this.site.current();
    const prefix = `${productId}|`;
    return new Map(
      saved.variantGenders.filter((v) => v.key.startsWith(prefix)).map((v) => [v.key.slice(prefix.length), v.gender]),
    );
  }

  /** Saves the categories of one product's colours; the other products' are kept as they are. */
  async saveFor(productId: string, rows: Array<{ name: string; gender: string }>): Promise<void> {
    const base = await this.site.current();
    const prefix = `${productId}|`;
    const rest = base.variantGenders.filter((v) => !v.key.startsWith(prefix));
    const before = base.variantGenders.filter((v) => v.key.startsWith(prefix));
    const mine = rows
      .filter((r) => r.gender === 'mens' || r.gender === 'womens' || r.gender === 'unisex')
      .map((r) => ({ key: variantGenderKey(productId, r.name), gender: r.gender as VariantGender['gender'] }));
    const sig = (list: VariantGender[]) =>
      JSON.stringify([...list].sort((a, b) => a.key.localeCompare(b.key)));
    if (sig(before) === sig(mine)) return;
    await this.site.update({ variantGenders: [...rest, ...mine] });
  }
}
