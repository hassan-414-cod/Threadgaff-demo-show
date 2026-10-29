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
