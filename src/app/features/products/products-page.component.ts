import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { forkJoin } from 'rxjs';
import { map } from 'rxjs/operators';
import { CatalogService } from '../../core/services/catalog.service';
import { Category, Product } from '../../core/models/catalog.models';
import { expandGenderFilter } from '../../core/utils/gender';
import { hasDisplayHex } from '../../core/utils/hex';
import { priceLabel as formatProductPrice } from '../../core/utils/price';
import { cardDescription } from '../../core/utils/description';

interface DisplayCard {
  key: string;
  product: Product;
  colorId: string;
  colorName: string;
  expanded: boolean;
  canExpand: boolean;
}

@Component({
  selector: 'tg-products-page',
  standalone: true,
  imports: [RouterLink],
  template: `
    <div class="products-page">
      <section class="collection-pills-bar" aria-label="Collections">
        <div class="pills-row">
          <div class="collection-row">
            <button
              type="button"
              class="filter-btn"
              [class.active]="!selectedSlug()"
              (click)="selectCollection(null)"
            >
              All collections
            </button>
            @for (c of collections(); track c.id) {
              <button
                type="button"
                class="filter-btn"
                [class.active]="selectedSlug() === c.slug"
                (click)="selectCollection(c)"
              >
                {{ c.name }}
              </button>
            }
          </div>
          <div class="extra-filters">
            <span class="filter-label">FILTER BY:</span>
            <select
              aria-label="Fit"
              [value]="fitFilter()"
              (change)="setFit(($any($event.target)).value)"
            >
              <option value="">Fit</option>
              @for (o of fitOptions(); track o) {
                <option [value]="o">Fit · {{ o }}</option>
              }
            </select>
            <select
              aria-label="Fabric"
              [value]="materialFilter()"
              (change)="setMaterial(($any($event.target)).value)"
            >
              <option value="">Fabric</option>
              @for (o of materialOptions(); track o) {
                <option [value]="o">Fabric · {{ o }}</option>
              }
            </select>
            <select
              aria-label="Gender"
              [value]="genderFilter()"
              (change)="setGender(($any($event.target)).value)"
            >
              <option value="">Gender</option>
              @for (o of genderOptions(); track o) {
                <option [value]="o">Gender · {{ o }}</option>
              }
            </select>
            <select
              aria-label="Sleeve"
              [value]="sleeveFilter()"
              (change)="setSleeve(($any($event.target)).value)"
            >
              <option value="">Sleeve</option>
              @for (o of sleeveOptions(); track o) {
                <option [value]="o">Sleeve · {{ o }}</option>
              }
            </select>
            <select
              aria-label="Style"
              [value]="styleFilter()"
              (change)="setStyle(($any($event.target)).value)"
            >
              <option value="">Style</option>
              @for (o of styleOptions(); track o) {
                <option [value]="o">Style · {{ o }}</option>
              }
            </select>
          </div>
        </div>
      </section>

      <section class="range-header">
        <span class="kicker">Wholesale apparel manufacturing</span>
        <h1>{{ rangeTitle() }}</h1>
        <p class="lede">
          Detailed size dimensions (chest, length, sleeves) are provided for each garment
          inside the Custom Designer.
        </p>
      </section>

      <section class="grid-section">
        @if (error()) {
          <div class="alert alert-error">{{ error() }}</div>
        }
        <div id="productGrid" class="shop-grid">
          @for (card of displayCards(); track card.key) {
            <article class="pc" [class.is-variant]="card.expanded">
              @if (card.canExpand || card.expanded) {
                <button
                  type="button"
                  class="pc-expand"
                  (click)="toggleExpand(card, $event)"
                >
                  @if (card.expanded) {
                    <span class="pc-expand-arrow">←</span> back
                  } @else {
                    expand <span class="pc-expand-arrow">→</span>
                  }
                </button>
              }
              <a
                class="pc-media"
                [routerLink]="['/designer']"
                [queryParams]="{
                  product: card.product.id,
                  name: card.product.name,
                  category: card.product.template,
                  color: card.colorId,
                }"
              >
                @if (card.product.badge) {
                  <span class="pc-badge">{{ card.product.badge }}</span>
                }
                <img [src]="cardSrc(card.product, card.colorId)" [alt]="cardTitle(card)" />
              </a>
              <div class="pc-body">
                <h3 class="pc-name">
                  <a
                    [routerLink]="['/designer']"
                    [queryParams]="{
                      product: card.product.id,
                      name: card.product.name,
                      color: card.colorId,
                    }"
                  >
                    {{ card.product.name }}
                  </a>
                </h3>
                @if (card.colorName) {
                  <div class="pc-variant-name">{{ card.colorName }}</div>
                }
                <div class="pc-price">{{ priceLabel(card.product, card.colorId) }}</div>
                @if (card.product.sku) {
                  <div class="pc-sku">{{ card.product.sku }}</div>
                }
                @if (!card.expanded && colorSwatches(card.product).length) {
                  <div class="pc-swatches">
                    @for (c of colorSwatches(card.product).slice(0, 8); track c.id) {
                      <button
                        type="button"
                        class="pc-swatch"
                        [style.background]="c.hex"
                        [class.is-on]="card.colorId === c.id"
                        [attr.title]="c.name"
                        [attr.aria-label]="c.name"
                        (click)="selectCardColor(card.product.id, c.id, $event)"
                      ></button>
                    }
                  </div>
                }
                <div class="pc-foot">
                  @if (descriptionFor(card.product, card.colorId)) {
                    <p class="pc-desc">{{ descriptionFor(card.product, card.colorId) }}</p>
                  } @else {
                    <span class="pc-desc" aria-hidden="true"></span>
                  }
                  <a
                    class="pc-quote"
                    [routerLink]="['/designer']"
                    [queryParams]="{
                      product: card.product.id,
                      name: card.product.name,
                      category: card.product.template,
                      color: card.colorId,
                    }"
                  >
                    Customise →
                  </a>
                </div>
              </div>
            </article>
          }
        </div>
      </section>

      <section class="bottom-cta">
        <div class="cta-inner">
          <div class="cta-copy">
            <span class="kicker">Let's build together</span>
            <h2>Start your range</h2>
            <p>
              From concept to collection, we help bring your vision to life with premium
              quality and dependable manufacturing.
            </p>
            <div class="cta-actions">
              <a routerLink="/quote" class="cta-solid">Request bulk order →</a>
              <a routerLink="/about" class="cta-outline">Speak to our team →</a>
            </div>
          </div>
          <div class="cta-features">
            <div class="cta-feature">
              <div class="cta-icon" aria-hidden="true">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M12 20h9M16.5 3.5a2.12 2.12 0 013 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>
              </div>
              <div>
                <h4>Customisation<br />Options</h4>
                <p>Fits, fabrics, labels &amp; more</p>
              </div>
            </div>
            <div class="cta-feature">
              <div class="cta-icon" aria-hidden="true">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 01-2.83 2.83l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"/></svg>
              </div>
              <div>
                <h4>Consistent<br />Quality</h4>
                <p>Built for long-term partnerships</p>
              </div>
            </div>
            <div class="cta-feature">
              <div class="cta-icon" aria-hidden="true">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75"/></svg>
              </div>
              <div>
                <h4>B2B<br />Support</h4>
                <p>Dedicated wholesale guidance</p>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  `,
  styles: `
    .products-page {
      --page-inline: 32px;
      background: #efebe4;
      min-height: 60vh;
    }

    .collection-pills-bar {
      padding: 20px var(--page-inline) 12px;
      background: #efebe4;
      border-bottom: 1px solid #dcd7ce;
    }

    .pills-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      flex-wrap: wrap;
      gap: 16px;
    }

    .collection-row {
      display: flex;
      gap: 12px;
      flex-wrap: wrap;
    }

    .filter-btn {
      padding: 10px 20px;
      border-radius: 20px;
      font-size: 0.85rem;
      font-weight: 600;
      color: var(--ink);
      background: transparent;
      border: 1px solid #dcd7ce;
      cursor: pointer;
      font-family: inherit;
    }

    .filter-btn.active {
      background: #4a5441;
      color: #fff;
      border-color: #4a5441;
    }

    .extra-filters {
      display: flex;
      align-items: center;
      gap: 16px;
      flex-wrap: wrap;
    }

    .filter-label {
      font-family: 'Montserrat', sans-serif;
      font-size: 0.75rem;
      font-weight: 700;
      letter-spacing: 0.05em;
      color: var(--ink);
    }

    .extra-filters select {
      background: transparent;
      border: 1px solid #dcd7ce;
      padding: 10px 32px 10px 16px;
      border-radius: 20px;
      font-size: 0.85rem;
      color: var(--ink);
      appearance: none;
      background-image: url("data:image/svg+xml;utf8,<svg width='12' height='8' viewBox='0 0 12 8' fill='none' xmlns='http://www.w3.org/2000/svg'><path d='M1 1.5L6 6.5L11 1.5' stroke='%23333' stroke-width='1.5' stroke-linecap='round' stroke-linejoin='round'/></svg>");
      background-repeat: no-repeat;
      background-position: right 12px center;
    }

    .range-header {
      padding: 28px var(--page-inline) 20px;
    }

    .kicker {
      font-family: 'Montserrat', sans-serif;
      font-size: 0.7rem;
      letter-spacing: 0.15em;
      text-transform: uppercase;
      margin-bottom: 8px;
      display: block;
      color: var(--ink);
      font-weight: 700;
    }

    .range-header h1 {
      font-size: clamp(1.5rem, 2.5vw, 2rem);
      font-family: 'Montserrat', sans-serif;
      font-weight: 900;
      line-height: 1;
      margin-bottom: 12px;
      text-transform: uppercase;
      letter-spacing: 0.02em;
      color: var(--ink);
    }

    .lede {
      font-size: 0.95rem;
      line-height: 1.5;
      color: var(--muted);
      max-width: 550px;
      margin: 0;
    }

    .grid-section {
      padding: 0 var(--page-inline) 80px;
    }

    .pc-variant-name {
      margin: -4px 0 0;
      font-size: 0.72rem;
      font-weight: 600;
      color: var(--muted);
    }

    .pc.is-variant {
      outline: 1px solid color-mix(in srgb, var(--forest) 22%, var(--line));
    }

    .bottom-cta {
      background: #e8e6df;
      padding: 60px var(--page-inline);
      border-top: 1px solid #dcd7ce;
    }

    .cta-inner {
      display: flex;
      justify-content: space-between;
      align-items: flex-end;
      flex-wrap: wrap;
      gap: 40px;
    }

    .cta-copy {
      max-width: 600px;
    }

    .cta-features {
      display: flex;
      gap: 40px;
      align-items: center;
      position: relative;
      padding-left: 20px;
      border-left: 1px solid #dcd7ce;
    }

    .cta-feature {
      display: flex;
      align-items: center;
      gap: 12px;
    }

    .cta-icon {
      width: 44px;
      height: 44px;
      border-radius: 50%;
      border: 1px solid var(--ink);
      display: flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
    }

    .cta-feature h4 {
      font-size: 0.7rem;
      font-family: 'Montserrat', sans-serif;
      font-weight: 800;
      margin: 0 0 4px;
      letter-spacing: 0.05em;
      color: var(--ink);
      text-transform: uppercase;
      line-height: 1.25;
    }

    .cta-feature p {
      font-size: 0.65rem;
      color: var(--muted);
      margin: 0;
      max-width: none;
    }

    @media (max-width: 900px) {
      .cta-features {
        border-left: none;
        padding-left: 0;
        flex-wrap: wrap;
      }
    }

    @media (max-width: 768px) {
      .products-page {
        --page-inline: 18px;
      }
    }

    .cta-copy h2 {
      font-size: clamp(2rem, 3vw, 3rem);
      font-family: 'Montserrat', sans-serif;
      font-weight: 900;
      line-height: 1;
      margin-bottom: 16px;
      text-transform: uppercase;
      letter-spacing: 0.02em;
      color: var(--ink);
    }

    .cta-copy p {
      font-size: 1.1rem;
      line-height: 1.5;
      color: var(--muted);
      max-width: 500px;
      margin-bottom: 32px;
    }

    .cta-actions {
      display: flex;
      gap: 16px;
      flex-wrap: wrap;
    }

    .cta-solid {
      background: #4a5441;
      color: #fff;
      padding: 14px 28px;
      font-size: 0.85rem;
      font-weight: 700;
      letter-spacing: 0.05em;
      text-transform: uppercase;
      font-family: 'Montserrat', sans-serif;
    }

    .cta-outline {
      background: transparent;
      color: var(--ink);
      border: 1px solid #4a5441;
      padding: 14px 28px;
      font-size: 0.85rem;
      font-weight: 700;
      letter-spacing: 0.05em;
      text-transform: uppercase;
      font-family: 'Montserrat', sans-serif;
    }

    @media (max-width: 768px) {
      .extra-filters {
        display: none;
      }
    }
  `,
})
export class ProductsPageComponent implements OnInit {
  readonly catalog = inject(CatalogService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  readonly collections = signal<Category[]>([]);
  readonly products = signal<Product[]>([]);
  readonly selectedSlug = signal<string | null>(null);
  readonly error = signal('');
  readonly rangeTitle = signal('Our product range');
  readonly fitFilter = signal('');
  readonly materialFilter = signal('');
  readonly genderFilter = signal('');
  readonly sleeveFilter = signal('');
  readonly styleFilter = signal('');
  readonly fitOptions = signal<string[]>([]);
  readonly materialOptions = signal<string[]>([]);
  readonly genderOptions = signal<string[]>([]);
  readonly sleeveOptions = signal<string[]>([]);
  readonly styleOptions = signal<string[]>([]);
  /** productId → selected colour id for card preview */
  readonly cardColorIds = signal<Record<string, string>>({});
  /** When set, that product’s colour variants fill the grid in sequence. */
  readonly expandedProductId = signal<string | null>(null);

  readonly displayCards = computed((): DisplayCard[] => {
    const expanded = this.expandedProductId();
    const cards: DisplayCard[] = [];
    for (const p of this.products()) {
      const colors = p.colors || [];
      const canExpand = colors.length > 1;
      if (expanded === p.id && canExpand) {
        for (const c of colors) {
          cards.push({
            key: `${p.id}:${c.id}`,
            product: p,
            colorId: c.id,
            colorName: c.name || '',
            expanded: true,
            canExpand: true,
          });
        }
        continue;
      }
      cards.push({
        key: p.id,
        product: p,
        colorId: this.selectedColorId(p),
        colorName: '',
        expanded: false,
        canExpand,
      });
    }
    return cards;
  });

  ngOnInit() {
    this.catalog.getAttributes().subscribe({
      next: (defs) => {
        const labels = (code: string) =>
          defs
            .find((d) => d.code === code)
            ?.options?.map((o) => o.label)
            .filter(Boolean) || [];
        this.fitOptions.set(labels('fit'));
        this.materialOptions.set(labels('material'));
        this.genderOptions.set(labels('gender'));
        this.sleeveOptions.set(labels('sleeve'));
        this.styleOptions.set(labels('style'));
      },
    });

    this.catalog.getCollectionCategories().subscribe({
      next: (cats) => {
        this.collections.set(cats);
        const slug = this.route.snapshot.queryParamMap.get('collection');
        this.applySlug(slug);
      },
      error: () =>
        this.error.set('Could not load categories. Start the Nest API on :3000.'),
    });

    this.route.queryParamMap.subscribe((params) => {
      this.applySlug(params.get('collection'));
    });
  }

  selectCollection(cat: Category | null) {
    const slug = cat?.slug ?? null;
    this.expandedProductId.set(null);
    this.router.navigate([], {
      relativeTo: this.route,
      queryParams: slug ? { collection: slug } : {},
      replaceUrl: true,
    });
  }

  toggleExpand(card: DisplayCard, event?: Event) {
    event?.preventDefault();
    event?.stopPropagation();
    if (card.expanded) {
      this.expandedProductId.set(null);
      return;
    }
    this.expandedProductId.set(card.product.id);
  }

  setFit(v: string) {
    this.fitFilter.set(v);
    this.reloadWithFilters();
  }

  setMaterial(v: string) {
    this.materialFilter.set(v);
    this.reloadWithFilters();
  }

  setGender(v: string) {
    this.genderFilter.set(v);
    this.reloadWithFilters();
  }

  setSleeve(v: string) {
    this.sleeveFilter.set(v);
    this.reloadWithFilters();
  }

  setStyle(v: string) {
    this.styleFilter.set(v);
    this.reloadWithFilters();
  }

  priceLabel(p: Product, colorId?: string | null): string {
    return formatProductPrice(p, colorId ?? this.selectedColorId(p), {
      from: false,
    });
  }

  descriptionFor(p: Product, colorId?: string | null): string {
    return cardDescription(p, colorId ?? this.selectedColorId(p));
  }

  selectedColorId(p: Product): string {
    const picked = this.cardColorIds()[p.id];
    if (picked) return picked;
    return p.colors?.find((c) => c.isDefault)?.id || p.colors?.[0]?.id || '';
  }

  colorSwatches(p: Product) {
    return (p.colors || []).filter((c) => hasDisplayHex(c.hex));
  }

  selectCardColor(productId: string, colorId: string, event?: Event) {
    event?.preventDefault();
    event?.stopPropagation();
    this.cardColorIds.update((m) => ({ ...m, [productId]: colorId }));
  }

  cardSrc(p: Product, colorId?: string | null): string {
    return this.catalog.cardImageUrl(p, colorId ?? this.selectedColorId(p));
  }

  cardTitle(card: DisplayCard): string {
    return card.colorName ? `${card.product.name} · ${card.colorName}` : card.product.name;
  }

  private applySlug(slug: string | null) {
    if (this.selectedSlug() !== slug) {
      this.expandedProductId.set(null);
    }
    this.selectedSlug.set(slug);
    const cat = slug
      ? this.collections().find((c) => c.slug === slug)
      : null;
    this.rangeTitle.set(cat ? cat.name : 'Our product range');
    this.reloadWithFilters();
  }

  private reloadWithFilters() {
    this.loadProducts(this.selectedSlug());
  }

  private loadProducts(slug: string | null) {
    const cats = this.collections();
    const cat = slug ? cats.find((c) => c.slug === slug) : null;
    const base = {
      limit: 100,
      isActive: true as const,
      categoryId: cat?.id,
      includeDescendants: true as const,
    };

    const fit = this.fitFilter();
    const material = this.materialFilter();
    const sleeve = this.sleeveFilter();
    const style = this.styleFilter();
    const genderValues = this.genderFilter()
      ? expandGenderFilter(this.genderFilter())
      : [];

    type AttrFilter = { code: string; values: string[]; union: boolean };
    const groups: AttrFilter[] = [];
    if (genderValues.length) {
      groups.push({ code: 'gender', values: genderValues, union: true });
    }
    if (fit) groups.push({ code: 'fit', values: [fit], union: false });
    if (material) {
      groups.push({ code: 'material', values: [material], union: false });
    }
    if (sleeve) groups.push({ code: 'sleeve', values: [sleeve], union: false });
    if (style) groups.push({ code: 'style', values: [style], union: false });

    if (!groups.length) {
      this.catalog.getProducts(base).subscribe({
        next: (res) => this.setProductsWithMedia(res.items),
        error: () =>
          this.error.set('Could not load products. Start the Nest API on :3000.'),
      });
      return;
    }

    const groupRequests = groups.map((g) =>
      forkJoin(
        g.values.map((value) =>
          this.catalog.getProducts({
            ...base,
            attributeCode: g.code,
            attributeValue: value,
          }),
        ),
      ).pipe(
        map((results) => {
          const byId = new Map<string, Product>();
          for (const res of results) {
            for (const p of res.items) byId.set(p.id, p);
          }
          return byId;
        }),
      ),
    );

    forkJoin(groupRequests).subscribe({
      next: (maps) => {
        let ids = new Set(maps[0].keys());
        for (let i = 1; i < maps.length; i++) {
          const next = new Set(maps[i].keys());
          ids = new Set([...ids].filter((id) => next.has(id)));
        }
        const byId = new Map<string, Product>();
        for (const m of maps) {
          for (const [id, p] of m) byId.set(id, p);
        }
        this.setProductsWithMedia(
          [...ids].map((id) => byId.get(id)!).filter(Boolean),
        );
      },
      error: () =>
        this.error.set('Could not load products. Start the Nest API on :3000.'),
    });
  }

  private setProductsWithMedia(items: Product[]) {
    const live = (items || []).filter((p) => p.isActive !== false);
    this.products.set(live);
    this.catalog.enrichWithColorMedia(live).subscribe({
      next: (full) => this.products.set(full.filter((p) => p.isActive !== false)),
    });
  }
}
