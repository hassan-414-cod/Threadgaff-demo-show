import { Injectable, computed, inject } from '@angular/core';
import { HiddenSwatches, SiteSettingsService } from './site-settings.service';

/** Where a product's colour swatches can be hidden. */
export type SwatchPlace = 'shop' | 'designer';

/**
 * Whether a product shows its colour swatches: the round colour dots under its tile on the products
 * page, and the Garment Colour swatches in the Custom Designer. Each can be switched off per product
 * in the admin. The choice is kept with the site settings; nothing about the product changes.
 */
@Injectable({ providedIn: 'root' })
export class SwatchVisibilityService {
  private readonly site = inject(SiteSettingsService);

  private readonly byKey = computed(
    () => new Map<string, HiddenSwatches>(this.site.settings().hiddenSwatches.map((h) => [h.key, h])),
  );

  /** True when the swatches are hidden under this product's tile on the products page. */
  hiddenOnShop(productId: string): boolean {
    return !!this.byKey().get(productId)?.shop;
  }

  /** True when the Garment Colour swatches are hidden in the Custom Designer for this product. */
  hiddenInDesigner(productId: string): boolean {
    return !!this.byKey().get(productId)?.designer;
  }

  /** True when this product's colour variants all show on the products page from the start (a visitor can still collapse them). */
  showAllByDefault(productId: string): boolean {
    return this.site.settings().openVariants.includes(productId);
  }

  isHidden(productId: string, place: SwatchPlace): boolean {
    return place === 'shop' ? this.hiddenOnShop(productId) : this.hiddenInDesigner(productId);
  }

  /** Hides (or shows again) one product's swatches in one place. The page updates at once and the change is undone if saving fails. */
  async set(productId: string, place: SwatchPlace, hidden: boolean): Promise<void> {
    const list = this.site.settings().hiddenSwatches;
    const now = list.find((h) => h.key === productId) ?? { key: productId, shop: false, designer: false };
    const next: HiddenSwatches = { ...now, [place]: hidden };
    const rest = list.filter((h) => h.key !== productId);
    await this.site.update({ hiddenSwatches: next.shop || next.designer ? [...rest, next] : rest });
  }

  /** Makes a product start opened (every colour variant as its own tile on the products page) or collapsed. */
  async setShowAll(productId: string, on: boolean): Promise<void> {
    const list = this.site.settings().openVariants.filter((id) => id !== productId);
    await this.site.update({ openVariants: on ? [...list, productId] : list });
  }
}
