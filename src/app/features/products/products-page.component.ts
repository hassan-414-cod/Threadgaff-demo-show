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
import { SiteSettingsService } from '../../core/services/site-settings.service';
import { PortraitFitDirective } from '../../shared/portrait-fit.directive';
import { FadeInDirective } from '../../shared/fade-in.directive';
import { Category, Product, ProductColor } from '../../core/models/catalog.models';
import { genderMatchesFilter } from '../../core/utils/gender';
import { priceLabel as formatProductPrice } from '../../core/utils/price';
import { cardDescription } from '../../core/utils/description';
import { BUILTIN_FILTERS, customFilterDefinitions, filterOptionLabels } from '../../core/utils/filters';

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

/** How many cards fit on one row (the grid and the expand panel both follow this). */
function columnsFor(width: number): number {
  if (width >= 1500) return 5;
  if (width >= 1200) return 4;
  if (width >= 900) return 3;
  if (width >= 600) return 2;
  return 1;
}

/**
 * The shop. Home sends a customer here by catalogue; this page lists that catalogue's variants
 * (each with its own main image), and a variant expands to show its colours and models.
 * Everything needed to narrow the list (catalogue tabs, filters, sort) is on this one page.
 */
@Component({
  selector: 'tg-products-page',
  standalone: true,
  imports: [RouterLink, PortraitFitDirective, FadeInDirective],
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
        <p class="lede">Open a variant to see its colours and models, then take it into the Custom Designer.</p>
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

        <div class="vgrid" [style.--cols]="cols()">
          @for (p of filtered(); track p.id; let i = $index) {
            <article class="pc vc" [class.is-open]="openId() === p.id">
              <button
                type="button"
                class="pc-media vc-media"
                [attr.aria-expanded]="openId() === p.id"
                [attr.aria-label]="(openId() === p.id ? 'Close ' : 'Open ') + p.name"
                (click)="toggle(p)"
                (pointerenter)="catalog.prefetchProduct(p.id)"
                (touchstart)="catalog.prefetchProduct(p.id)"
              >
                @if (p.badge) {
                  <span class="pc-badge">{{ p.badge }}</span>
                }
                <img tgPortraitFit [src]="catalog.mainImageUrl(p)" [alt]="p.name" loading="lazy" decoding="async" />
              </button>
              <div class="pc-body">
                <h3 class="pc-name">{{ p.name }}</h3>
                <div class="pc-price">{{ priceLabel(p) }}</div>
                @if (p.sku) {
                  <div class="pc-sku">{{ p.sku }}</div>
                }
                <div class="pc-foot">
                  @if (descriptionFor(p)) {
                    <p class="pc-desc">{{ descriptionFor(p) }}</p>
                  } @else {
                    <span class="pc-desc" aria-hidden="true"></span>
                  }
                  <div class="pc-actions">
                    <button type="button" class="pc-mini" (click)="toggle(p)" [attr.aria-expanded]="openId() === p.id">
                      {{ openId() === p.id ? 'Close' : 'Expand' }}
                    </button>
                    <a
                      class="pc-mini pc-mini-fill"
                      [routerLink]="['/designer']"
                      [queryParams]="designerParams(p)"
                      (pointerenter)="catalog.prefetchProduct(p.id)"
                    >
                      Customise
                    </a>
                  </div>
                </div>
              </div>
            </article>

            @if (panelAfter(i); as open) {
              <section class="vx" [attr.aria-label]="open.name + ' colours and models'">
                <div class="vx-stage">
                  <img tgFadeIn [src]="stageUrl()" [alt]="open.name" decoding="async" />
                </div>
                <div class="vx-side">
                  <header class="vx-head">
                    <div>
                      <h2>{{ open.name }}</h2>
                      <p>{{ priceLabel(open) }}</p>
                    </div>
                    <button type="button" class="vx-close" (click)="close()" aria-label="Close">×</button>
                  </header>

                  <div class="vx-tabs" role="tablist">
                    <button type="button" role="tab" class="vx-tab" [class.on]="openTab() === 'colours'" [attr.aria-selected]="openTab() === 'colours'" (click)="openTab.set('colours')">
                      Colours <span>{{ open.colors?.length || 0 }}</span>
                    </button>
                    <button type="button" role="tab" class="vx-tab" [class.on]="openTab() === 'models'" [attr.aria-selected]="openTab() === 'models'" (click)="openTab.set('models')">
                      Models <span>{{ models().length }}</span>
                    </button>
                  </div>

                  @if (openTab() === 'colours') {
                    <div class="vx-grid">
                      @for (c of open.colors || []; track c.id) {
                        <button type="button" class="vx-item" [class.on]="openColor() === c.id" (click)="pickColour(open, c)">
                          <span class="vx-thumb">
                            <img tgFadeIn [src]="catalog.colourImageUrl(open, c.id)" [alt]="c.name" loading="lazy" decoding="async" />
                          </span>
                          <span class="vx-label">
                            <span class="vx-dot" [style.background]="c.hex"></span>
                            {{ c.name }}
                          </span>
                        </button>
                      } @empty {
                        <p class="vx-empty">No colours have been added to this variant yet.</p>
                      }
                    </div>
                  } @else {
                    <div class="vx-grid">
                      @for (m of models(); track m.url) {
                        <button type="button" class="vx-item" [class.on]="stageUrl() === m.url" (click)="stageUrl.set(m.url)">
                          <span class="vx-thumb">
                            <img tgFadeIn [src]="m.url" [alt]="m.label" loading="lazy" decoding="async" />
                          </span>
                          <span class="vx-label">{{ m.label }}</span>
                        </button>
                      } @empty {
                        <p class="vx-empty">No model photos have been added for this colour yet.</p>
                      }
                    </div>
                  }

                  <footer class="vx-foot">
                    <a class="pc-mini pc-mini-fill vx-go" [routerLink]="['/designer']" [queryParams]="designerParams(open, openColor())">
                      Customise in the designer →
                    </a>
                  </footer>
                </div>
              </section>
            }
          }
        </div>
      </section>
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

    .shop-body { max-width: 1360px; margin: 0 auto; padding: 14px 28px 64px; }
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

    /* variants */
    .vgrid { display: grid; grid-template-columns: repeat(var(--cols, 4), minmax(0, 1fr)); gap: 26px 16px; }
    .vc-media { padding: 0; border: 0; cursor: pointer; font: inherit; text-align: inherit; }
    .vc.is-open { outline: 2px solid var(--forest); outline-offset: -1px; }
    .pc-actions { flex: none; }

    /* expanded variant: colours and models, across the full row */
    .vx {
      grid-column: 1 / -1;
      display: grid;
      grid-template-columns: minmax(0, 0.9fr) minmax(0, 1.1fr);
      background: var(--panel);
      border: 1px solid var(--line);
      border-radius: 16px;
      overflow: hidden;
      animation: shopOpen 0.28s ease both;
    }
    .vx-stage { position: relative; background: #fff; min-height: 360px; display: grid; place-items: center; padding: 16px; }
    .vx-stage img { max-width: 100%; max-height: 520px; object-fit: contain; transition: opacity 0.3s ease; }
    .vx-stage img.tg-pending { opacity: 0; }
    .vx-side { padding: 22px 24px 20px; display: flex; flex-direction: column; gap: 16px; min-width: 0; }
    .vx-head { display: flex; justify-content: space-between; align-items: flex-start; gap: 12px; }
    .vx-head h2 { margin: 0; font-family: 'Cormorant Garamond', Georgia, serif; font-size: 1.9rem; font-weight: 600; text-transform: none; letter-spacing: -0.01em; line-height: 1.05; }
    .vx-head p { margin: 4px 0 0; font-family: 'IBM Plex Mono', monospace; font-size: 0.8rem; font-weight: 600; }
    .vx-close {
      flex: none;
      width: 34px;
      height: 34px;
      border-radius: 50%;
      border: 1px solid var(--line);
      background: var(--panel);
      font-size: 1.3rem;
      line-height: 1;
      cursor: pointer;
      color: var(--ink);
    }
    .vx-close:hover { border-color: var(--forest); }
    .vx-tabs { display: flex; gap: 6px; border-bottom: 1px solid var(--line); }
    .vx-tab {
      background: none;
      border: 0;
      border-bottom: 2px solid transparent;
      margin-bottom: -1px;
      padding: 8px 14px;
      font-family: 'Montserrat', sans-serif;
      font-size: 0.68rem;
      font-weight: 700;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      color: var(--muted);
      cursor: pointer;
    }
    .vx-tab span { margin-left: 4px; font-weight: 600; opacity: 0.8; }
    .vx-tab.on { color: var(--ink); border-bottom-color: var(--forest); }
    .vx-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(104px, 1fr)); gap: 12px; align-content: start; min-height: 150px; }
    .vx-item { display: flex; flex-direction: column; gap: 7px; background: none; border: 0; padding: 0; cursor: pointer; font: inherit; text-align: left; min-width: 0; }
    .vx-thumb {
      display: block;
      aspect-ratio: 4 / 5;
      background: #fff;
      border: 1px solid var(--line);
      border-radius: 10px;
      overflow: hidden;
      transition: border-color 0.15s, box-shadow 0.15s;
    }
    .vx-thumb img { width: 100%; height: 100%; object-fit: contain; display: block; transition: opacity 0.3s ease; }
    .vx-thumb img.tg-pending { opacity: 0; }
    .vx-item:hover .vx-thumb { border-color: var(--forest); }
    .vx-item.on .vx-thumb { border-color: var(--forest); box-shadow: 0 0 0 2px color-mix(in srgb, var(--forest) 35%, transparent); }
    .vx-label { display: flex; align-items: center; gap: 6px; font-size: 0.74rem; font-weight: 600; color: var(--ink); min-width: 0; }
    .vx-dot { width: 12px; height: 12px; border-radius: 50%; border: 1px solid rgba(53, 57, 54, 0.25); flex: none; }
    .vx-empty { grid-column: 1 / -1; margin: 0; color: var(--muted); font-size: 0.82rem; }
    .vx-foot { margin-top: auto; padding-top: 6px; }
    .vx-go { padding: 11px 18px; font-size: 0.66rem; }

    @media (max-width: 900px) {
      .shop-tabs-inner, .shop-head, .shop-body, .shop-filters-inner { padding-left: 18px; padding-right: 18px; }
      .vx { grid-template-columns: 1fr; }
      .vx-stage { min-height: 280px; }
    }
    @media (prefers-reduced-motion: reduce) {
      .shop-filters, .vx { animation: none; }
    }
  `,
})
export class ProductsPageComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);
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

  readonly openId = signal<string | null>(null);
  readonly openColor = signal('');
  readonly openTab = signal<'colours' | 'models'>('colours');
  readonly stageUrl = signal('');
  readonly cols = signal(columnsFor(typeof window === 'undefined' ? 1280 : window.innerWidth));

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
        return list.sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
    }
  });

  /** The expanded variant, if it is still in the list. */
  private readonly openProduct = computed(() => this.filtered().find((p) => p.id === this.openId()) || null);

  /** The model photos of the colour chosen in the expanded panel. */
  readonly models = computed(() => {
    const p = this.openProduct();
    return p ? this.catalog.modelImages(p, this.openColor()) : [];
  });

  @HostListener('window:resize')
  onResize() {
    const next = columnsFor(window.innerWidth);
    if (next !== this.cols()) this.cols.set(next);
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
    this.close();
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
          this.openWanted();
        },
        error: () => {
          this.loading.set(false);
          this.error.set('Could not load the variants. Check the API connection.');
        },
      });
  }

  /** Opens the variant named in the address (?product=…), once the list is there. */
  private openWanted() {
    const id = this.wantedProduct;
    if (!id) return;
    this.wantedProduct = null;
    const p = this.products().find((x) => x.id === id);
    if (p) {
      this.open(p);
      setTimeout(() => document.querySelector('.vx')?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 150);
    }
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

  // ───── expanding a variant ─────
  toggle(p: Product) {
    if (this.openId() === p.id) this.close();
    else this.open(p);
  }

  private open(p: Product) {
    const def = p.colors?.find((c) => c.isDefault) || p.colors?.[0];
    this.openId.set(p.id);
    this.openColor.set(def?.id || '');
    this.openTab.set('colours');
    // opens on the variant's own main image; picking a colour or a model changes it
    this.stageUrl.set(this.catalog.mainImageUrl(p));
    this.catalog.prefetchProduct(p.id);
  }

  close() {
    this.openId.set(null);
  }

  pickColour(p: Product, c: ProductColor) {
    this.openColor.set(c.id);
    this.stageUrl.set(this.catalog.colourImageUrl(p, c.id));
  }

  /**
   * The expanded panel is shown after the last card of the row that holds the open variant, so
   * the cards keep their order and the panel spans the full width.
   */
  panelAfter(index: number): Product | null {
    const open = this.openProduct();
    if (!open) return null;
    const list = this.filtered();
    const at = list.findIndex((p) => p.id === open.id);
    const cols = this.cols();
    const rowEnd = Math.min(Math.floor(at / cols) * cols + cols - 1, list.length - 1);
    return index === rowEnd ? open : null;
  }

  priceLabel(p: Product): string {
    return formatProductPrice(p, null, { from: true });
  }

  descriptionFor(p: Product): string {
    const def = p.colors?.find((c) => c.isDefault)?.id || p.colors?.[0]?.id;
    return cardDescription(p, def);
  }

  /** Opens the Custom Designer on this variant (and colour). */
  designerParams(p: Product, colorId?: string | null): Record<string, string> {
    const color = colorId || p.colors?.find((c) => c.isDefault)?.id || p.colors?.[0]?.id || '';
    return { product: p.id, name: p.name, category: p.template || '', color };
  }
}
