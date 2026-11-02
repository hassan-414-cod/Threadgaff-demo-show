import { Injectable, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { CatalogService, SITE_SETTINGS_SLUG } from './catalog.service';
import { Product } from '../models/catalog.models';

/** A big card on the home page. It opens the products page on one catalogue (a collection). */
export interface HomeCatalogue {
  id: string;
  /** Slug of the collection it opens; empty opens all products. */
  slug: string;
  name: string;
  imageUrl: string;
}

/** A picture in the home page slider. */
export interface HomeSlide {
  id: string;
  /** Slug of the collection it opens; empty opens all products. */
  slug: string;
  title: string;
  imageUrl: string;
}

/** A picture attached to an attribute value (see attributeImageKey). */
export interface AttributeImage {
  key: string;
  imageUrl: string;
}

/** The Men's / Women's / Unisex category of one colour variant (see variantGenderKey). */
export interface VariantGender {
  key: string;
  gender: 'mens' | 'womens' | 'unisex';
}

/** Ticked filter values by filter code, for one colour variant (key = product + colour name) or one product (key = product id). */
export interface FilterValues {
  key: string;
  values: Record<string, string[]>;
}

/** A picture of the garment from one angle (front, back, …) for an attribute option. */
export interface TemplateView {
  angle: string;
  imageUrl: string;
}

/** The template of an attribute option (see attributeImageKey): the pictures the designer shows when it is picked. */
export interface AttributeTemplate {
  key: string;
  views: TemplateView[];
}

/** A product whose colour swatches are hidden (key = product id): on the products page, in the Custom Designer, or both. */
export interface HiddenSwatches {
  key: string;
  shop: boolean;
  designer: boolean;
}

/** Texts the admin can change on the Site Outlook page, plus the home page pictures. */
export interface SiteSettings {
  bannerVisible: boolean;
  bannerText: string;
  heroTagline: string;
  shopHeading: string;
  shopIntro: string;
  contactEmail: string;
  /** Attribute codes of filters switched off on the shop (set on the Filters page). */
  hiddenFilters: string[];
  /** Home page catalogue cards. null = not set up yet: the collections are shown as they are. */
  homeCatalogues: HomeCatalogue[] | null;
  /** Home page slider. null = not set up yet: the collections are shown as they are. */
  homeSlides: HomeSlide[] | null;
  /** Pictures attached to attribute values; shown when a customer clicks that value. */
  attributeImages: AttributeImage[];
  /** Templates of attribute options (Sleeve, Style, …): garment pictures per angle, shown in the designer when picked. */
  attributeTemplates: AttributeTemplate[];
  /** Older list of Men's / Women's / Unisex set on single colours; now read as part of variantFilters. */
  variantGenders: VariantGender[];
  /** The filters ticked on single colour variants; a filter with none ticked follows the product. */
  variantFilters: FilterValues[];
  /** Extra ticks of the single-value filters (Material, Gender) on a product: its own attribute holds one value. */
  productFilters: FilterValues[];
  /** Products whose colour swatches are hidden on the products page and / or in the Custom Designer. */
  hiddenSwatches: HiddenSwatches[];
}

export const DEFAULT_SITE_SETTINGS: SiteSettings = {
  bannerVisible: true,
  bannerText: 'Private Label Manufacturing • MOQ From 150 Units • Worldwide Shipping',
  heroTagline: 'Custom colours. Custom labels. Your brand.',
  shopHeading: 'Featured Collection',
  shopIntro: 'Browse our collections, then open a style to customise it in the designer.',
  contactEmail: 'hello@threadgaff.com',
  hiddenFilters: [],
  homeCatalogues: null,
  homeSlides: null,
  attributeImages: [],
  attributeTemplates: [],
  variantGenders: [],
  variantFilters: [],
  productFilters: [],
  hiddenSwatches: [],
};

const CACHE_KEY = 'tg_site_settings';

/**
 * Site-wide texts (top banner, home headings, footer email).
 *
 * The API has no settings endpoint, so they are kept as JSON on one small hidden system
 * product (slug "site-settings") that the public API already serves. The last values are
 * cached in the browser so the page does not flash the defaults on reload.
 */
@Injectable({ providedIn: 'root' })
export class SiteSettingsService {
  private readonly catalog = inject(CatalogService);
  readonly settings = signal<SiteSettings>(this.fromCache());
  /** True once the server has answered (or failed): the saved home pictures are then known. */
  readonly ready = signal(false);
  private loaded = false;
  /** Id of the hidden settings product once known (saves skip the lookup). */
  private productId: string | null = null;
  /** Last values known to be saved on the server. */
  private saved: SiteSettings | null = null;
  /** Saves run one after another so quick successive clicks cannot overwrite each other. */
  private queue: Promise<unknown> = Promise.resolve();

  /** True when the filter was hidden on the Filters page. */
  isFilterHidden(code: string): boolean {
    return this.settings().hiddenFilters.includes(code);
  }

  /** Loads the saved texts once (safe to call from several components). */
  load(force = false): void {
    if (this.loaded && !force) return;
    this.loaded = true;
    this.catalog.getProductBySlug(SITE_SETTINGS_SLUG).subscribe({
      next: (p) => {
        const parsed = this.parse(p);
        this.productId = p?.id || this.productId;
        this.saved = parsed;
        this.apply(parsed);
        this.ready.set(true);
      },
      error: () => {
        /* nothing saved yet: keep the defaults */
        this.ready.set(true);
      },
    });
  }

  /** Saves new texts (admin). Creates the hidden settings product on first use. */
  async save(next: SiteSettings): Promise<void> {
    await this.persist(next);
    this.apply(next);
  }

  /** Writes the settings to the server without touching what the page currently shows. */
  private async persist(next: SiteSettings): Promise<void> {
    const description = JSON.stringify(next);
    const id = this.productId || (await this.find())?.id || null;
    if (id) {
      this.productId = id;
      await firstValueFrom(this.catalog.updateProduct(id, { description }));
    } else {
      const created = await firstValueFrom(
        this.catalog.createProduct({
          name: 'Site settings (system, do not delete)',
          slug: SITE_SETTINGS_SLUG,
          description,
          // Inactive products are invisible to the public API, so this one stays active
          // (it is hidden from every product list in the app).
          isActive: true,
          isStandalone: true,
          categoryId: null,
          extraCategoryIds: [],
          tagIds: [],
          sizes: [],
          attributes: [],
        }),
      );
      this.productId = created?.id || null;
    }
    this.saved = next;
  }

  /**
   * Changes only some settings, keeping the rest as saved. The page updates at once; the save
   * runs in the background and the change is undone if it fails.
   */
  async update(patch: Partial<SiteSettings>): Promise<void> {
    const before = this.settings();
    this.apply({ ...before, ...patch });
    const run = this.queue.then(async () => {
      const base = this.saved ?? (await this.current());
      await this.persist({ ...base, ...patch });
    });
    this.queue = run.catch(() => undefined);
    try {
      await run;
    } catch (err) {
      this.apply(this.saved ?? before);
      throw err;
    }
  }

  /** The saved values (or the defaults) for the admin form. */
  async current(): Promise<SiteSettings> {
    const existing = await this.find();
    const value = existing ? this.parse(existing) : { ...DEFAULT_SITE_SETTINGS };
    this.productId = existing?.id || this.productId;
    this.saved = value;
    return value;
  }

  private async find(): Promise<Product | null> {
    return (
      (await firstValueFrom(this.catalog.getProductBySlug(SITE_SETTINGS_SLUG)).catch(() => null)) ||
      // The public route skips inactive rows; the admin list does not.
      (await firstValueFrom(this.catalog.getProducts({ limit: 100, isActive: false }, true))
        .then((r) => (r.items || []).find((p) => p.slug === SITE_SETTINGS_SLUG) || null)
        .catch(() => null))
    );
  }

  private parse(p: Product | null | undefined): SiteSettings {
    try {
      const raw = JSON.parse(p?.description || '{}') as Partial<SiteSettings>;
      const pick = <K extends keyof SiteSettings>(k: K): SiteSettings[K] =>
        typeof raw[k] === typeof DEFAULT_SITE_SETTINGS[k] ? (raw[k] as SiteSettings[K]) : DEFAULT_SITE_SETTINGS[k];
      const hidden = Array.isArray(raw.hiddenFilters)
        ? raw.hiddenFilters.filter((c): c is string => typeof c === 'string')
        : [];
      return {
        homeCatalogues: this.parseCards<HomeCatalogue>(raw.homeCatalogues, true),
        homeSlides: this.parseCards<HomeSlide>(raw.homeSlides, false),
        attributeImages: this.parseAttributeImages(raw.attributeImages),
        attributeTemplates: this.parseTemplates(raw.attributeTemplates),
        variantGenders: this.parseVariantGenders(raw.variantGenders),
        variantFilters: this.parseFilterValues(raw.variantFilters),
        productFilters: this.parseFilterValues(raw.productFilters),
        hiddenSwatches: this.parseHiddenSwatches(raw.hiddenSwatches),
        bannerVisible: pick('bannerVisible'),
        bannerText: pick('bannerText'),
        heroTagline: pick('heroTagline'),
        shopHeading: pick('shopHeading'),
        shopIntro: pick('shopIntro'),
        contactEmail: pick('contactEmail'),
        hiddenFilters: hidden,
      };
    } catch {
      return { ...DEFAULT_SITE_SETTINGS };
    }
  }

  private parseHiddenSwatches(raw: unknown): HiddenSwatches[] {
    if (!Array.isArray(raw)) return [];
    const out: HiddenSwatches[] = [];
    for (const entry of raw) {
      if (!entry || typeof entry !== 'object') continue;
      const r = entry as Record<string, unknown>;
      const key = typeof r['key'] === 'string' ? r['key'].slice(0, 120) : '';
      const shop = r['shop'] === true;
      const designer = r['designer'] === true;
      if (key && (shop || designer) && !out.some((x) => x.key === key)) out.push({ key, shop, designer });
      if (out.length >= 1000) break;
    }
    return out;
  }

  private parseTemplates(raw: unknown): AttributeTemplate[] {
    if (!Array.isArray(raw)) return [];
    const out: AttributeTemplate[] = [];
    for (const entry of raw) {
      if (!entry || typeof entry !== 'object') continue;
      const r = entry as Record<string, unknown>;
      const key = typeof r['key'] === 'string' ? r['key'].slice(0, 160) : '';
      if (!key || !Array.isArray(r['views'])) continue;
      const views: TemplateView[] = [];
      for (const v of r['views'] as unknown[]) {
        if (!v || typeof v !== 'object') continue;
        const o = v as Record<string, unknown>;
        const angle = typeof o['angle'] === 'string' ? o['angle'].slice(0, 40) : '';
        const imageUrl = typeof o['imageUrl'] === 'string' ? o['imageUrl'].slice(0, 500) : '';
        if (angle && imageUrl && !views.some((x) => x.angle === angle)) views.push({ angle, imageUrl });
      }
      if (views.length) out.push({ key, views: views.slice(0, 12) });
      if (out.length >= 400) break;
    }
    return out;
  }

  private parseAttributeImages(raw: unknown): AttributeImage[] {
    if (!Array.isArray(raw)) return [];
    return raw
      .filter((i): i is Record<string, unknown> => !!i && typeof i === 'object')
      .map((i) => ({
        key: typeof i['key'] === 'string' ? i['key'].slice(0, 160) : '',
        imageUrl: typeof i['imageUrl'] === 'string' ? i['imageUrl'].slice(0, 500) : '',
      }))
      .filter((i) => i.key && i.imageUrl)
      .slice(0, 400);
  }

  private parseFilterValues(raw: unknown): FilterValues[] {
    if (!Array.isArray(raw)) return [];
    const out: FilterValues[] = [];
    for (const entry of raw) {
      if (!entry || typeof entry !== 'object') continue;
      const r = entry as Record<string, unknown>;
      const key = typeof r['key'] === 'string' ? r['key'].slice(0, 200) : '';
      const src = r['values'];
      if (!key || !src || typeof src !== 'object' || Array.isArray(src)) continue;
      const values: Record<string, string[]> = {};
      for (const [code, list] of Object.entries(src as Record<string, unknown>)) {
        if (!Array.isArray(list)) continue;
        const labels = list
          .filter((x): x is string => typeof x === 'string' && !!x.trim())
          .map((x) => x.trim().slice(0, 80));
        if (labels.length) values[code.slice(0, 80)] = [...new Set(labels)].slice(0, 60);
      }
      if (Object.keys(values).length) out.push({ key, values });
      if (out.length >= 2000) break;
    }
    return out;
  }

  private parseVariantGenders(raw: unknown): VariantGender[] {
    if (!Array.isArray(raw)) return [];
    return raw
      .filter((v): v is Record<string, unknown> => !!v && typeof v === 'object')
      .map((v) => ({ key: typeof v['key'] === 'string' ? v['key'].slice(0, 200) : '', gender: v['gender'] }))
      .filter((v): v is VariantGender => !!v.key && (v.gender === 'mens' || v.gender === 'womens' || v.gender === 'unisex'))
      .slice(0, 2000);
  }

  /** A saved list of home cards, cleaned up; null when none was ever saved. */
  private parseCards<T extends { id: string; slug: string; imageUrl: string }>(
    raw: unknown,
    withName: boolean,
  ): T[] | null {
    if (!Array.isArray(raw)) return null;
    const str = (v: unknown, max: number) => (typeof v === 'string' ? v.slice(0, max) : '');
    return raw
      .filter((c): c is Record<string, unknown> => !!c && typeof c === 'object')
      .slice(0, 24)
      .map((c, i) => {
        const base = {
          id: str(c['id'], 40) || 'c' + i,
          slug: str(c['slug'], 120),
          imageUrl: str(c['imageUrl'], 500),
        };
        return (withName ? { ...base, name: str(c['name'], 80) } : { ...base, title: str(c['title'], 80) }) as unknown as T;
      });
  }

  private apply(s: SiteSettings): void {
    this.settings.set(s);
    try {
      localStorage.setItem(CACHE_KEY, JSON.stringify(s));
    } catch {
      /* private mode etc. */
    }
  }

  private fromCache(): SiteSettings {
    try {
      const raw = JSON.parse(localStorage.getItem(CACHE_KEY) || 'null') as Partial<SiteSettings> | null;
      if (raw) return { ...DEFAULT_SITE_SETTINGS, ...raw };
    } catch {
      /* ignore */
    }
    return { ...DEFAULT_SITE_SETTINGS };
  }
}
