import { Injectable, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { CatalogService, SITE_SETTINGS_SLUG } from './catalog.service';
import { Product } from '../models/catalog.models';

/** Texts the admin can change on the Site Outlook page. */
export interface SiteSettings {
  bannerVisible: boolean;
  bannerText: string;
  heroTagline: string;
  shopHeading: string;
  shopIntro: string;
  contactEmail: string;
  /** Attribute codes of filters switched off on the shop (set on the Filters page). */
  hiddenFilters: string[];
}

export const DEFAULT_SITE_SETTINGS: SiteSettings = {
  bannerVisible: true,
  bannerText: 'Private Label Manufacturing • MOQ From 150 Units • Worldwide Shipping',
  heroTagline: 'Custom colours. Custom labels. Your brand.',
  shopHeading: 'Featured Collection',
  shopIntro: 'Browse our collections, then open a style to customise it in the designer.',
  contactEmail: 'hello@threadgaff.com',
  hiddenFilters: [],
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
      },
      error: () => {
        /* nothing saved yet: keep the defaults */
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
