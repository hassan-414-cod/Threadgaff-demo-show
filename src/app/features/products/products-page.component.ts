import {
  Component,
  DestroyRef,
  HostListener,
  OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { AttributeDefinition, CatalogService } from '../../core/services/catalog.service';
import { AttributeImagesService } from '../../core/services/attribute-images.service';
import { SiteSettingsService } from '../../core/services/site-settings.service';
import { FadeInDirective } from '../../shared/fade-in.directive';
import { Category, Product } from '../../core/models/catalog.models';
import { genderMatchesFilter } from '../../core/utils/gender';
import { priceLabel as formatProductPrice } from '../../core/utils/price';
import {
  BUILTIN_FILTERS,
  customFilterDefinitions,
  filterOptionLabels,
  filterTitle,
} from '../../core/utils/filters';

/** One checklist in the filter panel. */
interface FilterGroup {
  code: string;
  title: string;
  options: string[];
}

interface FilterChip {
  code: string;
  title: string;
  value: string;
}

/** The extra built-in checklists the shop has always had besides the three managed filters. */
const EXTRA_FILTERS = [
  { code: 'fit', title: 'Fit' },
  { code: 'sleeve', title: 'Sleeve' },
  { code: 'style', title: 'Style' },
];

/** A catalogue's variants, in the order of the admin list. */
interface Section {
  key: string;
  title: string;
  items: Product[];
}

/** An attribute value that has a picture (shown when the customer clicks it). */
interface Pill {
  key: string;
  title: string;
  label: string;
  url: string;
}

/** One picture in the viewer. */
interface Shot {
  url: string;
  label: string;
  colorId: string | null;
}

/**
 * The shop. Home sends a customer here by catalogue; this page lists the variants of each
 * catalogue in the admin order, each as one picture (the main image chosen in the admin) with
 * its name, price and colours. Everything else (the other colours, models, web shoot photos and
 * angles) is in the Custom Designer, which a click on a variant or a colour opens. Attribute
 * values that have a picture show it when clicked. Catalogue tabs, filters and sort are here too.
 */
@Component({
  selector: 'tg-products-page',
  standalone: true,
  imports: [RouterLink, FadeInDirective],
  template: `
    <div class="shop">
      <nav class="shop-tabs" aria-label="Catalogues">
        <div class="shop-tabs-inner">
          <div class="tab-row" role="tablist">
            <button
              type="button"
              role="tab"
              class="tab"
              [class.on]="!selectedSlug()"
              [attr.aria-selected]="!selectedSlug()"
              (click)="selectCollection(null)"
            >
              All
            </button>
            @for (c of collections(); track c.id) {
              <button
                type="button"
                role="tab"
                class="tab"
                [class.on]="selectedSlug() === c.slug"
                [attr.aria-selected]="selectedSlug() === c.slug"
                (click)="selectCollection(c)"
              >
                {{ c.name }}
              </button>
            }
          </div>
          <button
            type="button"
            class="tab tab-filter"
            [class.on]="filtersOpen()"
            [attr.aria-expanded]="filtersOpen()"
            aria-controls="shopFilters"
            (click)="toggleFilters()"
          >
            <svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 6h16M7 12h10M10 18h4"/></svg>
            Filters
            @if (chips().length) {
              <span class="tab-count">{{ chips().length }}</span>
            }
          </button>
        </div>
      </nav>

      @if (filtersOpen()) {
        <section id="shopFilters" class="shop-filters" aria-label="Filters">
          <div class="shop-filters-inner">
            @for (g of groups(); track g.code) {
              <fieldset class="fgroup">
                <legend>{{ g.title }}</legend>
                <div class="fopts">
                  @for (opt of g.options; track opt) {
                    <label class="fopt" [class.on]="isPicked(g.code, opt)">
                      <input type="checkbox" [checked]="isPicked(g.code, opt)" (change)="toggleOption(g.code, opt, $event)" />
                      <span>{{ opt }}</span>
                    </label>
                  }
                </div>
              </fieldset>
            } @empty {
              <p class="fnote">No filters have been set up yet.</p>
            }
          </div>
        </section>
      }

      <header class="shop-head">
        <span class="kicker">Wholesale apparel manufacturing</span>
        <h1>{{ rangeTitle() }}</h1>
        <p class="lede">Each variant with its main picture and its colours. Open one to see all its models and photos in the Custom Designer.</p>
      </header>

      <section class="shop-body">
        <div class="shop-toolbar">
          <span class="count" aria-live="polite">
            @if (loading()) {
              Loading variants…
            } @else {
              {{ filtered().length }} {{ filtered().length === 1 ? 'variant' : 'variants' }}
              @if (chips().length && filtered().length !== products().length) {
                <span class="of">of {{ products().length }}</span>
              }
            }
            @if (attrPending() && chips().length) {
              <span class="of">· loading filter details…</span>
            }
          </span>
          <label class="sort"
            >Sort by
            <select [value]="sort()" (change)="onSort($event)">
              <option value="featured">Default order</option>
              <option value="price-asc">Price: low to high</option>
              <option value="price-desc">Price: high to low</option>
              <option value="name">Name A–Z</option>
            </select>
          </label>
        </div>

        @if (chips().length) {
          <div class="chips" aria-label="Active filters">
            @for (chip of chips(); track chip.code + chip.value) {
              <button type="button" class="chip" (click)="removeChip(chip)" [attr.title]="'Remove ' + chip.title + ': ' + chip.value">
                <span class="chip-type">{{ chip.title }}</span>
                <span class="chip-val">{{ chip.value }}</span>
                <span aria-hidden="true">×</span>
              </button>
            }
            <button type="button" class="chip-reset" (click)="resetFilters()">Reset all</button>
          </div>
        }

        @if (error()) {
          <div class="alert alert-error">{{ error() }}</div>
        }

        @if (!loading() && !filtered().length && !error()) {
          <p class="empty">
            @if (chips().length) {
              No variants match these filters.
              <button type="button" class="link" (click)="resetFilters()">Reset filters</button>
            } @else {
              No variants in this catalogue yet.
            }
          </p>
        }

        @for (sec of sections(); track sec.key) {
          <section class="cat-sec" [attr.data-cat]="sec.key">
            @if (!selectedSlug()) {
              <h2 class="cat-title">{{ sec.title }}</h2>
            }
            <div class="grid">
              @for (p of sec.items; track p.id) {
                <article class="prod" [id]="'p-' + p.id" [class.flash]="flashId() === p.id">
                  <a
                    class="prod-pic"
                    [routerLink]="['/designer']"
                    [queryParams]="designerParams(p)"
                    [attr.aria-label]="'Customise ' + p.name"
                    (pointerenter)="catalog.prefetchProduct(p.id)"
                    (touchstart)="catalog.prefetchProduct(p.id)"
                  >
                    <span class="prod-frame">
                      @if (mainOf(p)) {
                        <img tgFadeIn [src]="mainOf(p)" [alt]="p.name" loading="lazy" decoding="async" />
                      } @else {
                        <span class="prod-empty">No picture yet</span>
                      }
                    </span>
                  </a>
                  <h3 class="prod-name">
                    <a [routerLink]="['/designer']" [queryParams]="designerParams(p)">{{ p.name }}</a>
                  </h3>
                  <div class="prod-price">{{ priceLabel(p) }}</div>

                  @if (swatchesOf(p).length) {
                    <div class="swatches" aria-label="Colours">
                      @for (c of swatchesOf(p); track c.id) {
                        <a
                          class="sw"
                          [routerLink]="['/designer']"
                          [queryParams]="designerParams(p, c.id)"
                          [style.background]="c.hex"
                          [attr.title]="c.name"
                          [attr.aria-label]="c.name + ' — customise in this colour'"
                        ></a>
                      }
                    </div>
                  }

                  @if (pillsOf(p).length) {
                    <div class="pills" aria-label="Attributes">
                      @for (pl of pillsOf(p); track pl.key) {
                        <button type="button" class="pill" (click)="openAttribute(p, pl)" [attr.aria-label]="pl.title + ': ' + pl.label + ' — show picture'">
                          <img [src]="pl.url" alt="" loading="lazy" decoding="async" />
                          <span><b>{{ pl.title }}</b> {{ pl.label }}</span>
                        </button>
                      }
                    </div>
                  }
                </article>
              }
            </div>
          </section>
        }
      </section>

      @if (viewer(); as v) {
        <div class="lb" role="dialog" aria-modal="true" [attr.aria-label]="v.product.name" (click)="closeViewer()">
          <div class="lb-panel" (click)="$event.stopPropagation()">
            <button type="button" class="lb-close" (click)="closeViewer()" aria-label="Close">×</button>
            <div class="lb-stage">
              @if (v.list.length > 1) {
                <button type="button" class="lb-nav lb-prev" (click)="step(-1)" aria-label="Previous picture">‹</button>
              }
              <img tgFadeIn [src]="v.list[v.index].url" [alt]="v.product.name + ' ' + v.list[v.index].label" decoding="async" />
              @if (v.list.length > 1) {
                <button type="button" class="lb-nav lb-next" (click)="step(1)" aria-label="Next picture">›</button>
              }
            </div>
            <div class="lb-cap">
              <div>
                <strong>{{ v.product.name }}</strong>
                <span>{{ v.list[v.index].label }}</span>
                @if (v.list.length > 1) {
                  <em>{{ v.index + 1 }} / {{ v.list.length }}</em>
                }
              </div>
              <a class="pc-mini pc-mini-fill" [routerLink]="['/designer']" [queryParams]="designerParams(v.product, v.list[v.index].colorId)" (click)="closeViewer()">
                Customise in the designer →
              </a>
            </div>
          </div>
        </div>
      }
    </div>
  `,
  styles: `
    .shop { background: var(--paper); min-height: 60vh; }

    /* tab bar: jump between catalogues, switch the filters on and off */
    .shop-tabs {
      position: sticky;
      top: 0;
      z-index: 20;
      background: color-mix(in srgb, var(--paper) 94%, transparent);
      backdrop-filter: blur(8px);
      border-bottom: 1px solid var(--line);
    }
    .shop-tabs-inner {
      max-width: 1360px;
      margin: 0 auto;
      padding: 10px 28px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 14px;
    }
    .tab-row { display: flex; gap: 8px; overflow-x: auto; scrollbar-width: none; flex: 1; min-width: 0; padding: 2px 0; }
    .tab-row::-webkit-scrollbar { display: none; }
    .tab {
      flex: none;
      display: inline-flex;
      align-items: center;
      gap: 7px;
      border: 1px solid var(--line);
      background: var(--panel);
      color: var(--ink);
      border-radius: 999px;
      padding: 8px 16px;
      font-family: 'Montserrat', sans-serif;
      font-size: 0.68rem;
      font-weight: 700;
      letter-spacing: 0.06em;
      text-transform: uppercase;
      cursor: pointer;
      transition: background 0.2s, color 0.2s, border-color 0.2s;
    }
    .tab:hover { border-color: var(--forest); }
    .tab.on { background: var(--forest); border-color: var(--forest); color: #fff; }
    .tab-filter { flex: none; }
    .tab-count {
      background: #fff;
      color: var(--forest);
      border-radius: 999px;
      min-width: 18px;
      padding: 1px 6px;
      font-size: 0.62rem;
      text-align: center;
    }
    .tab:not(.on) .tab-count { background: var(--forest); color: #fff; }

    /* filter panel */
    .shop-filters { background: var(--forest-tint); border-bottom: 1px solid var(--line); animation: shopOpen 0.25s ease both; }
    @keyframes shopOpen { from { opacity: 0; transform: translateY(-6px); } to { opacity: 1; transform: none; } }
    .shop-filters-inner {
      max-width: 1360px;
      margin: 0 auto;
      padding: 18px 28px 22px;
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
      gap: 18px 28px;
    }
    .fgroup { border: 0; margin: 0; padding: 0; min-width: 0; }
    .fgroup legend {
      padding: 0 0 9px;
      font-family: 'Montserrat', sans-serif;
      font-size: 0.64rem;
      font-weight: 700;
      letter-spacing: 0.1em;
      text-transform: uppercase;
      color: var(--ink);
    }
    .fopts { display: flex; flex-wrap: wrap; gap: 7px; }
    .fopt {
      display: inline-flex;
      align-items: center;
      border: 1px solid var(--line);
      background: var(--panel);
      border-radius: 999px;
      padding: 6px 12px;
      font-size: 0.74rem;
      cursor: pointer;
      transition: background 0.15s, border-color 0.15s, color 0.15s;
    }
    .fopt input { position: absolute; opacity: 0; pointer-events: none; }
    .fopt:hover { border-color: var(--forest); }
    .fopt.on { background: var(--forest); border-color: var(--forest); color: #fff; }
    .fopt:has(input:focus-visible) { outline: 2px solid var(--forest); outline-offset: 2px; }
    .fnote { margin: 0; color: var(--muted); font-size: 0.8rem; }

    .shop-head { max-width: 1360px; margin: 0 auto; padding: 34px 28px 8px; }
    .kicker {
      display: block;
      font-family: 'Montserrat', sans-serif;
      font-size: 0.62rem;
      font-weight: 700;
      letter-spacing: 0.2em;
      text-transform: uppercase;
      color: var(--muted);
      margin-bottom: 10px;
    }
    .shop-head h1 {
      font-family: 'Cormorant Garamond', Georgia, serif;
      font-weight: 600;
      font-size: clamp(2.2rem, 4.2vw, 3.6rem);
      letter-spacing: -0.02em;
      text-transform: none;
      line-height: 1.04;
      margin: 0 0 10px;
    }
    .lede { margin: 0; color: var(--muted); font-size: 0.88rem; max-width: 60ch; }

    .shop-body { max-width: 1360px; margin: 0 auto; padding: 14px 28px 72px; }
    .shop-toolbar { display: flex; align-items: center; justify-content: space-between; gap: 16px; flex-wrap: wrap; margin: 6px 0 14px; }
    .count { font-size: 0.74rem; color: var(--muted); }
    .count .of { margin-left: 4px; }
    .sort { display: inline-flex; align-items: center; gap: 10px; font-size: 0.72rem; color: var(--muted); }
    .sort select {
      font: inherit;
      color: var(--ink);
      background: var(--panel);
      border: 1px solid var(--line);
      border-radius: 4px;
      padding: 6px 10px;
    }
    .chips { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; margin: 0 0 16px; }
    .chip {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      border: 1px solid var(--line);
      background: var(--panel);
      color: var(--ink);
      border-radius: 999px;
      padding: 5px 10px;
      font: inherit;
      font-size: 0.72rem;
      cursor: pointer;
    }
    .chip:hover { border-color: var(--forest); }
    .chip-type { font-weight: 700; font-size: 0.6rem; letter-spacing: 0.05em; text-transform: uppercase; color: var(--muted); }
    .chip-val { font-weight: 600; }
    .chip-reset, .link { background: none; border: 0; padding: 0; font: inherit; font-size: 0.72rem; color: var(--muted); text-decoration: underline; cursor: pointer; }
    .empty { color: var(--muted); font-size: 0.9rem; margin: 28px 0; }

    /* the pictures: no boxes, catalogue by catalogue, variant by variant */
    .cat-sec { margin-top: 42px; }
    .cat-sec:first-of-type { margin-top: 18px; }
    .cat-title {
      font-family: 'Cormorant Garamond', Georgia, serif;
      font-weight: 600;
      font-size: clamp(1.9rem, 3vw, 2.7rem);
      letter-spacing: -0.01em;
      text-transform: none;
      line-height: 1.05;
      margin: 0 0 22px;
      padding-bottom: 10px;
      border-bottom: 1px solid var(--line);
    }
    /* the catalogue: one main picture per variant, five across, name / price / colours underneath */
    .grid { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 46px 26px; }
    .prod { display: flex; flex-direction: column; align-items: center; min-width: 0; text-align: center; }
    .prod-pic { display: block; width: 100%; }
    .prod-frame { display: block; aspect-ratio: 1 / 1; overflow: hidden; background: #ececee; }
    .prod-frame img {
      width: 100%;
      height: 100%;
      display: block;
      object-fit: cover;
      object-position: 50% 22%;
      transition: transform 0.35s ease, opacity 0.4s ease;
    }
    .prod-frame img.tg-pending { opacity: 0; }
    .prod-frame:has(img.tg-pending) {
      background: linear-gradient(100deg, #e8e8ea 30%, #f4f4f5 50%, #e8e8ea 70%) 0 0 / 220% 100%;
      animation: shotShimmer 1.4s linear infinite;
    }
    @keyframes shotShimmer { to { background-position: -120% 0; } }
    .prod-pic:hover img { transform: scale(1.04); }
    .prod-pic:focus-visible { outline: 2px solid var(--forest); outline-offset: 4px; }
    .prod-empty { display: grid; place-items: center; height: 100%; color: var(--muted); font-size: 0.78rem; }
    .prod-name {
      margin: 16px 0 0;
      padding: 2px 6px;
      font-family: 'Montserrat', sans-serif;
      font-size: 0.92rem;
      font-weight: 400;
      letter-spacing: 0.02em;
      text-transform: uppercase;
      line-height: 1.3;
      overflow-wrap: anywhere;
      border-radius: 6px;
      transition: background 0.4s ease;
    }
    .prod-name a { color: inherit; text-decoration: none; }
    .prod-name a:hover { text-decoration: underline; text-underline-offset: 3px; }
    .prod.flash .prod-name { background: color-mix(in srgb, var(--forest) 14%, transparent); }
    .prod-price { margin-top: 8px; font-size: 0.82rem; color: var(--ink); }
    .swatches { display: flex; flex-wrap: wrap; justify-content: center; gap: 3px; max-width: 100%; margin-top: 14px; }
    .sw { display: block; width: 13px; height: 13px; border: 1px solid rgba(0, 0, 0, 0.16); transition: transform 0.15s ease; }
    .sw:hover, .sw:focus-visible { transform: scale(1.35); border-color: var(--ink); outline: none; }

    .pills { display: flex; flex-wrap: wrap; justify-content: center; gap: 8px; margin: 14px 0 0; }
    .pill {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      border: 1px solid var(--line);
      background: var(--panel);
      color: var(--ink);
      border-radius: 999px;
      padding: 4px 14px 4px 4px;
      font: inherit;
      font-size: 0.74rem;
      cursor: pointer;
      transition: border-color 0.15s, box-shadow 0.15s;
    }
    .pill:hover { border-color: var(--forest); box-shadow: 0 2px 8px rgba(40, 36, 28, 0.1); }
    .pill img { width: 28px; height: 28px; border-radius: 50%; object-fit: cover; flex: none; }
    .pill b { font-family: 'Montserrat', sans-serif; font-size: 0.6rem; letter-spacing: 0.06em; text-transform: uppercase; color: var(--muted); margin-right: 4px; }


    /* viewer */
    .lb {
      position: fixed;
      inset: 0;
      z-index: 200;
      background: rgba(20, 22, 16, 0.78);
      display: grid;
      place-items: center;
      padding: 24px;
      animation: lbIn 0.2s ease both;
      overscroll-behavior: contain;
    }
    @keyframes lbIn { from { opacity: 0; } to { opacity: 1; } }
    .lb-panel { position: relative; width: min(960px, 100%); max-height: 100%; display: flex; flex-direction: column; background: var(--panel); border-radius: 16px; overflow: hidden; }
    .lb-close {
      position: absolute;
      top: 10px;
      right: 10px;
      z-index: 3;
      width: 36px;
      height: 36px;
      border-radius: 50%;
      border: 1px solid var(--line);
      background: rgba(255, 255, 255, 0.92);
      font-size: 1.4rem;
      line-height: 1;
      cursor: pointer;
    }
    .lb-stage { position: relative; background: #fff; display: grid; place-items: center; min-height: 280px; padding: 14px; flex: 1; min-height: 0; }
    .lb-stage img { max-width: 100%; max-height: min(70vh, 720px); object-fit: contain; transition: opacity 0.3s ease; }
    .lb-stage img.tg-pending { opacity: 0; }
    .lb-nav {
      position: absolute;
      top: 50%;
      transform: translateY(-50%);
      width: 42px;
      height: 42px;
      border-radius: 50%;
      border: 1px solid var(--line);
      background: rgba(255, 255, 255, 0.92);
      font-size: 1.7rem;
      line-height: 1;
      cursor: pointer;
      z-index: 2;
    }
    .lb-prev { left: 12px; }
    .lb-next { right: 12px; }
    .lb-nav:hover, .lb-close:hover { border-color: var(--forest); }
    .lb-cap { display: flex; align-items: center; justify-content: space-between; gap: 14px; flex-wrap: wrap; padding: 14px 18px; border-top: 1px solid var(--line); }
    .lb-cap div { display: flex; align-items: baseline; gap: 10px; flex-wrap: wrap; }
    .lb-cap strong { font-size: 0.95rem; }
    .lb-cap span { color: var(--muted); font-size: 0.82rem; }
    .lb-cap em { font-style: normal; color: var(--muted); font-size: 0.74rem; }

    @media (max-width: 900px) {
      .shop-tabs-inner, .shop-head, .shop-body, .shop-filters-inner { padding-left: 18px; padding-right: 18px; }
      .grid { grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 32px 14px; }
    }
    @media (max-width: 560px) {
      .grid { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 26px 10px; }
      .prod-name { font-size: 0.8rem; }
    }
    @media (prefers-reduced-motion: reduce) {
      .shop-filters, .lb { animation: none; }
      .prod-frame:has(img.tg-pending) { animation: none; }
    }
  `,
})
export class ProductsPageComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);
  private readonly attrImages = inject(AttributeImagesService);
  readonly catalog = inject(CatalogService);
  readonly site = inject(SiteSettingsService);

  readonly collections = signal<Category[]>([]);
  readonly selectedSlug = signal<string | null>(null);
  readonly products = signal<Product[]>([]);
  readonly loading = signal(true);
  readonly error = signal('');
  readonly attrDefs = signal<AttributeDefinition[]>([]);
  readonly filtersOpen = signal(false);
  readonly sort = signal('featured');
  /** Ticked checklist items, by filter code. */
  readonly picked = signal<Record<string, Set<string>>>({});
  /** True while the attribute details the filters need are still being fetched. */
  readonly attrPending = signal(false);

  /** The picture open in the viewer (an attribute picture). */
  readonly viewer = signal<{ product: Product; list: Shot[]; index: number } | null>(null);
  /** The variant just jumped to from an address (?product=…), highlighted for a moment. */
  readonly flashId = signal<string | null>(null);

  /** The products whose full record (attributes) has been fetched. */
  private readonly detailed = new Map<string, Product>();
  private loadedSlug: string | null | undefined;
  private wantedProduct: string | null = null;
  private hydrateTimer: ReturnType<typeof setTimeout> | null = null;
  private hydrating = false;

  readonly rangeTitle = computed(() => {
    const slug = this.selectedSlug();
    const cat = slug ? this.collections().find((c) => c.slug === slug) : null;
    return cat ? cat.name : 'Our product range';
  });

  /** The checklists: the managed filters (unless hidden), fit / sleeve / style, and added ones. */
  readonly groups = computed<FilterGroup[]>(() => {
    const defs = this.attrDefs();
    const labels = (code: string) => filterOptionLabels(defs.find((d) => d.code === code));
    const out: FilterGroup[] = [];
    for (const b of BUILTIN_FILTERS) {
      if (this.site.isFilterHidden(b.code)) continue;
      const options = labels(b.code);
      if (options.length) out.push({ code: b.code, title: b.title, options });
    }
    for (const e of EXTRA_FILTERS) {
      const options = labels(e.code);
      if (options.length) out.push({ code: e.code, title: e.title, options });
    }
    for (const d of customFilterDefinitions(defs)) {
      if (this.site.isFilterHidden(d.code)) continue;
      const options = filterOptionLabels(d);
      if (options.length) out.push({ code: d.code, title: d.name, options });
    }
    return out;
  });

  readonly chips = computed<FilterChip[]>(() => {
    const out: FilterChip[] = [];
    for (const g of this.groups()) {
      for (const value of this.picked()[g.code] || []) out.push({ code: g.code, title: g.title, value });
    }
    return out;
  });

  readonly filtered = computed<Product[]>(() => {
    let list = [...this.products()];
    for (const g of this.groups()) {
      const wanted = [...(this.picked()[g.code] || [])];
      if (!wanted.length) continue;
      list = list.filter((p) =>
        g.code === 'gender'
          ? wanted.some((sel) => genderMatchesFilter(this.attrLabels(p, 'gender')[0] || '', sel))
          : this.matches(this.attrLabels(p, g.code), wanted),
      );
    }
    switch (this.sort()) {
      case 'price-asc':
        return list.sort((a, b) => Number(a.basePrice) - Number(b.basePrice));
      case 'price-desc':
        return list.sort((a, b) => Number(b.basePrice) - Number(a.basePrice));
      case 'name':
        return list.sort((a, b) => a.name.localeCompare(b.name));
      default:
        // the order of the admin list (the drag order)
        return list.sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
    }
  });

  /**
   * Catalogue by catalogue, in the order the catalogues have in the admin, with each variant in
   * its admin order inside. A variant counts under the catalogue it is in (or the catalogue that
   * contains its sub-category); anything else goes last.
   */
  readonly sections = computed<Section[]>(() => {
    const cols = this.collections();
    const owner = new Map<string, Category>();
    const walk = (c: Category, root: Category) => {
      owner.set(c.id, root);
      (c.children || []).forEach((k) => walk(k, root));
    };
    cols.forEach((c) => walk(c, c));
    const groups = new Map<string, Product[]>();
    const rest: Product[] = [];
    for (const p of this.filtered()) {
      const root = owner.get(p.categoryId || p.category?.id || '');
      if (!root) {
        rest.push(p);
        continue;
      }
      const bucket = groups.get(root.id) ?? [];
      bucket.push(p);
      groups.set(root.id, bucket);
    }
    const out: Section[] = cols
      .filter((c) => groups.has(c.id))
      .map((c) => ({ key: c.slug, title: c.name, items: groups.get(c.id)! }));
    if (rest.length) out.push({ key: 'more', title: cols.length ? 'More' : 'All products', items: rest });
    return out;
  });

  /** The main picture of each shown variant (the one chosen in the admin). */
  private readonly mains = computed(
    () => new Map(this.filtered().map((p) => [p.id, this.catalog.mainImageUrl(p)])),
  );

  /** The colours of each shown variant, in the admin order. */
  private readonly swatches = computed(
    () =>
      new Map(
        this.filtered().map((p) => [
          p.id,
          [...(p.colors || [])]
            .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))
            .map((c) => ({ id: c.id, name: c.name || 'Colour', hex: /^#[0-9a-f]{3,8}$/i.test(c.hex || '') ? c.hex : '#9ca3af' })),
        ]),
      ),
  );

  /** The attribute values of each shown variant that have a picture. */

  private readonly pills = computed(() => {
    const defs = [...this.attrDefs()].sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
    const out = new Map<string, Pill[]>();
    for (const p of this.filtered()) {
      const list: Pill[] = [];
      for (const def of defs) {
        for (const label of this.attrLabels(p, def.code)) {
          const url = this.attrImages.imageFor(def.code, label);
          if (url) list.push({ key: `${def.code}:${label}`, title: filterTitle(def), label, url });
        }
      }
      out.set(p.id, list);
    }
    return out;
  });

  mainOf(p: Product): string {
    return this.mains().get(p.id) ?? '';
  }

  swatchesOf(p: Product) {
    return this.swatches().get(p.id) ?? [];
  }

  pillsOf(p: Product): Pill[] {
    return this.pills().get(p.id) ?? [];
  }

  @HostListener('document:keydown', ['$event'])
  onKey(event: KeyboardEvent) {
    if (!this.viewer()) return;
    if (event.key === 'Escape') this.closeViewer();
    else if (event.key === 'ArrowRight') this.step(1);
    else if (event.key === 'ArrowLeft') this.step(-1);
  }

  ngOnInit() {
    this.site.load();
    this.catalog.getAttributes().subscribe({
      next: (defs) => this.attrDefs.set(defs.filter((d) => d.isActive !== false)),
    });
    this.catalog.getCollectionCategories().subscribe({
      next: (cats) => {
        this.collections.set(cats);
        this.applySlug(this.route.snapshot.queryParamMap.get('collection'));
      },
      error: () => {
        this.error.set('Could not load the catalogues. Check the API connection.');
        this.applySlug(this.route.snapshot.queryParamMap.get('collection'));
      },
    });
    this.wantedProduct = this.route.snapshot.queryParamMap.get('product');
    this.route.queryParamMap.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((params) => {
      if (this.collections().length || this.error()) this.applySlug(params.get('collection'));
    });
    this.destroyRef.onDestroy(() => this.hydrateTimer && clearTimeout(this.hydrateTimer));
  }

  selectCollection(cat: Category | null) {
    this.router.navigate([], {
      relativeTo: this.route,
      queryParams: cat ? { collection: cat.slug } : {},
      replaceUrl: true,
    });
    this.applySlug(cat?.slug ?? null);
  }

  private applySlug(slug: string | null) {
    if (this.loadedSlug === slug) return;
    this.loadedSlug = slug;
    this.selectedSlug.set(slug);
    this.closeViewer();
    this.loadProducts(slug);
  }

  private loadProducts(slug: string | null) {
    const cat = slug ? this.collections().find((c) => c.slug === slug) : null;
    this.loading.set(true);
    this.catalog
      .getProducts({ limit: 100, isActive: true, categoryId: cat?.id, includeDescendants: true })
      .subscribe({
        next: (res) => {
          const live = (res.items || []).filter((p) => p.isActive !== false);
          // Products already fetched in full keep their details when the list changes.
          this.products.set(live.map((p) => this.detailed.get(p.id) ?? p));
          this.loading.set(false);
          this.error.set('');
          this.scheduleDetails();
          this.jumpToWanted();
        },
        error: () => {
          this.loading.set(false);
          this.error.set('Could not load the variants. Check the API connection.');
        },
      });
  }

  /** Scrolls to the variant named in the address (?product=…), once the list is there. */
  private jumpToWanted() {
    const id = this.wantedProduct;
    if (!id) return;
    this.wantedProduct = null;
    if (!this.products().some((p) => p.id === id)) return;
    setTimeout(() => {
      document.getElementById('p-' + id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      this.flashId.set(id);
      setTimeout(() => this.flashId.set(null), 2500);
    }, 200);
  }

  // ───── filters ─────
  toggleFilters() {
    const next = !this.filtersOpen();
    this.filtersOpen.set(next);
    // The filters need each variant's attributes: fetch them now rather than wait.
    if (next) this.fetchDetails(5);
  }

  isPicked(code: string, opt: string): boolean {
    return !!this.picked()[code]?.has(opt);
  }

  toggleOption(code: string, opt: string, event: Event) {
    const checked = (event.target as HTMLInputElement).checked;
    this.picked.update((all) => {
      const next = new Set(all[code] || []);
      if (checked) next.add(opt);
      else next.delete(opt);
      return { ...all, [code]: next };
    });
    this.fetchDetails(5);
  }

  removeChip(chip: FilterChip) {
    this.picked.update((all) => {
      const next = new Set(all[chip.code] || []);
      next.delete(chip.value);
      return { ...all, [chip.code]: next };
    });
  }

  resetFilters() {
    this.picked.set({});
    this.sort.set('featured');
  }

  onSort(event: Event) {
    this.sort.set((event.target as HTMLSelectElement).value);
  }

  /** Fetches the attribute details quietly a moment after the list is shown. */
  private scheduleDetails() {
    if (this.hydrateTimer) clearTimeout(this.hydrateTimer);
    this.hydrateTimer = setTimeout(() => this.fetchDetails(3), 1200);
  }

  /** The list has no attributes; the full record of each variant has them. A few at a time. */
  private fetchDetails(concurrency: number) {
    if (this.hydrating) return;
    const need = this.products().filter((p) => !this.detailed.has(p.id));
    if (!need.length) return;
    this.hydrating = true;
    this.attrPending.set(true);
    let n = 0;
    const flush = () =>
      this.products.update((list) => list.map((p) => this.detailed.get(p.id) ?? p));
    this.catalog
      .hydrateProducts(need, concurrency)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (full) => {
          const base = this.products().find((p) => p.id === full.id);
          this.detailed.set(full.id, { ...(base ?? full), ...full, sortOrder: base?.sortOrder ?? full.sortOrder });
          if (++n % 3 === 0) flush();
        },
        complete: () => {
          flush();
          this.hydrating = false;
          this.attrPending.set(false);
          // variants that arrived (another catalogue) while this ran
          if (this.products().some((p) => !this.detailed.has(p.id))) this.fetchDetails(concurrency);
        },
        error: () => {
          this.hydrating = false;
          this.attrPending.set(false);
        },
      });
  }

  private normalize(v: string): string {
    return v.toLowerCase().replace(/[’']/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
  }

  private matches(productLabels: string[], wanted: string[]): boolean {
    if (!productLabels.length) return false;
    return wanted.some((sel) =>
      productLabels.some((pl) => {
        const a = this.normalize(pl);
        const b = this.normalize(sel);
        return !!a && !!b && (a === b || a.includes(b) || b.includes(a));
      }),
    );
  }

  /** The values a variant has for one attribute (by code). */
  private attrLabels(p: Product, code: string): string[] {
    const out: string[] = [];
    const push = (raw: string | null | undefined) => {
      const v = (raw || '').trim();
      if (v && !out.some((x) => this.normalize(x) === this.normalize(v))) out.push(v);
    };
    const def = this.attrDefs().find((d) => d.code === code);
    for (const av of p.attributeValues || []) {
      const matchesDef =
        av.attributeDefinition?.code === code ||
        (!!def && (av.attributeDefinitionId === def.id || av.attributeDefinition?.id === def.id));
      if (!matchesDef) continue;
      push(av.option?.label);
      push(av.valueText);
      for (const id of [...(av.optionIds || []), ...(av.optionId ? [av.optionId] : [])]) {
        push(def?.options?.find((o) => o.id === id)?.label);
      }
    }
    if (code === 'sustainability' && p.ecoTag) push(p.ecoTag);
    return out;
  }

  // ───── viewer ─────
  openAttribute(p: Product, pill: Pill) {
    this.viewer.set({
      product: p,
      list: [{ url: pill.url, label: `${pill.title} · ${pill.label}`, colorId: null }],
      index: 0,
    });
  }

  closeViewer() {
    this.viewer.set(null);
  }

  step(dir: 1 | -1) {
    this.viewer.update((v) => {
      if (!v || v.list.length < 2) return v;
      return { ...v, index: (v.index + dir + v.list.length) % v.list.length };
    });
  }

  priceLabel(p: Product): string {
    return formatProductPrice(p, null, { from: true });
  }

  /** Opens the Custom Designer on this variant (and colour). */
  designerParams(p: Product, colorId?: string | null): Record<string, string> {
    const color = colorId || p.colors?.find((c) => c.isDefault)?.id || p.colors?.[0]?.id || '';
    return { product: p.id, name: p.name, category: p.template || '', color };
  }
}
