import {
  Component,
  ElementRef,
  OnInit,
  OnDestroy,
  ViewChild,
  inject,
  signal,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { NgTemplateOutlet } from '@angular/common';
import {
  AttributeDefinition,
  CatalogService,
} from '../../core/services/catalog.service';
import { Category, Product } from '../../core/models/catalog.models';
import { genderMatchesFilter } from '../../core/utils/gender';
import { hasDisplayHex } from '../../core/utils/hex';
import { priceLabel as formatProductPrice } from '../../core/utils/price';
import { cardDescription } from '../../core/utils/description';

type FilterGroup = 'category' | 'sustainability' | 'material' | 'gender';

interface ActiveFilterChip {
  group: FilterGroup;
  type: string;
  value: string;
  key: string;
}

@Component({
  selector: 'tg-home-page',
  standalone: true,
  imports: [RouterLink, NgTemplateOutlet],
  template: `
    <section class="home-hero" aria-label="Threadgaff">
      <div class="home-hero-copy">
        <p class="home-hero-kicker">Private label / Wholesale / Made for brands</p>
        <h1 class="home-hero-name">Premium Apparel Manufacturing for Growing Brands</h1>
        <p class="home-hero-lede">
          Custom garment manufacturing and wholesale apparel for brands that think bigger.
          From concept to production, we help you create high-quality, on-brand clothing —
          at scale.
        </p>
        <div class="home-hero-actions">
          <a class="home-hero-btn home-hero-btn-fill" routerLink="/quote"
            >Request a Quote <span aria-hidden="true">→</span></a
          >
          <a class="home-hero-btn home-hero-btn-ghost" href="#featuredCollection"
            >View Catalogue</a
          >
        </div>
        <ul class="home-hero-points">
          <li>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20.59 13.41l-7.17 7.17a2 2 0 01-2.83 0L2 12V2h10l8.59 8.59a2 2 0 010 2.82z"/><circle cx="7" cy="7" r="1.2" fill="currentColor" stroke="none"/></svg>
            <strong>Low MOQ</strong>
            <span>Start small grow big</span>
          </li>
          <li>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/></svg>
            <strong>Premium fabrics</strong>
            <span>Quality in every stitch</span>
          </li>
          <li>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 01-2.83 2.83l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"/></svg>
            <strong>Custom manufacturing</strong>
            <span>Your vision our expertise</span>
          </li>
          <li>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><path d="M2 12h20M12 2a15.3 15.3 0 010 20M12 2a15.3 15.3 0 000 20"/></svg>
            <strong>Global shipping</strong>
            <span>Brands worldwide</span>
          </li>
        </ul>
        <p class="home-hero-foot">Apparel manufacturing for a stronger tomorrow</p>
      </div>

      <div class="home-hero-visual" aria-label="Product ranges">
        <div class="hero-rail-controls">
          <button type="button" class="hero-rail-btn" (click)="scrollHeroRail(-1)" aria-label="Previous">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M15 18l-6-6 6-6"/></svg>
          </button>
          <button type="button" class="hero-rail-btn is-next" (click)="scrollHeroRail(1)" aria-label="Next">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 18l6-6-6-6"/></svg>
          </button>
        </div>

        <div
          class="hero-rail"
          #heroRail
          (scroll)="onHeroRailScroll()"
        >
          @for (card of heroCards(); track card.slug; let i = $index) {
            <a
              class="hero-card"
              [style.animation-delay]="(i * 0.04) + 's'"
              [routerLink]="['/products']"
              [queryParams]="{ collection: card.slug }"
            >
              <img [src]="card.image" [alt]="card.name" fetchpriority="high" />
              <div class="hero-card-meta">
                <div>
                  <strong>{{ card.name }}</strong>
                  <span>{{ card.styles }}</span>
                </div>
                <span class="hero-card-go" aria-hidden="true">→</span>
              </div>
            </a>
          }
        </div>

        <div class="hero-rail-dots" role="tablist" aria-label="Carousel pages">
          @for (dot of heroDotIndexes(); track dot) {
            <button
              type="button"
              class="hero-dot"
              [class.is-on]="heroSlide() === dot"
              (click)="goHeroSlide(dot)"
              [attr.aria-label]="'Go to slide ' + (dot + 1)"
            ></button>
          }
        </div>

        <div class="home-hero-brandline">
          <span></span>
          <p>Custom colours. Custom labels. Your brand.</p>
        </div>
      </div>
    </section>

    <section class="shop-hero" id="featuredCollection" aria-labelledby="featuredCollectionHeading">
      <div class="shop-hero-inner">
        <aside class="shop-filters" aria-label="Product filters">
          <div class="sf-head">
            <span class="sf-title">Filter by:</span>
            @if (activeFilterChips().length > 0) {
              <button type="button" class="sf-reset" (click)="resetFilters()">Reset all</button>
            }
          </div>

          <div class="sf-group" [class.open]="openGroups().has('category')">
            <button type="button" class="sf-group-head" (click)="toggleGroup('category')" [attr.aria-expanded]="openGroups().has('category')">
              Product Category
              <svg class="sf-chev" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 9l6 6 6-6" stroke-linecap="round" stroke-linejoin="round" fill="none" stroke="currentColor" stroke-width="2"/></svg>
            </button>
            <div class="sf-group-body">
              @for (c of collections(); track c.id) {
                <label class="sf-check">
                  <input
                    type="checkbox"
                    [checked]="selectedCats().has(c.slug)"
                    (change)="toggleCat(c.slug, $event)"
                  />
                  <span>{{ c.name }}</span>
                </label>
              }
            </div>
          </div>

          <div class="sf-group" [class.open]="openGroups().has('sustainability')">
            <button type="button" class="sf-group-head" (click)="toggleGroup('sustainability')" [attr.aria-expanded]="openGroups().has('sustainability')">
              Sustainability &amp; Ethics
              <svg class="sf-chev" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 9l6 6 6-6" stroke-linecap="round" stroke-linejoin="round" fill="none" stroke="currentColor" stroke-width="2"/></svg>
            </button>
            <div class="sf-group-body">
              @for (opt of sustainabilityOpts(); track opt) {
                <label class="sf-check">
                  <input
                    type="checkbox"
                    [checked]="selectedSustainability().has(opt)"
                    (change)="toggleSustainability(opt, $event)"
                  />
                  <span>{{ opt }}</span>
                </label>
              }
            </div>
          </div>

          <div class="sf-group" [class.open]="openGroups().has('material')">
            <button type="button" class="sf-group-head" (click)="toggleGroup('material')" [attr.aria-expanded]="openGroups().has('material')">
              Material
              <svg class="sf-chev" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 9l6 6 6-6" stroke-linecap="round" stroke-linejoin="round" fill="none" stroke="currentColor" stroke-width="2"/></svg>
            </button>
            <div class="sf-group-body">
              @for (opt of materialOpts(); track opt) {
                <label class="sf-check">
                  <input
                    type="checkbox"
                    [checked]="selectedMaterials().has(opt)"
                    (change)="toggleMaterial(opt, $event)"
                  />
                  <span>{{ opt }}</span>
                </label>
              }
            </div>
          </div>

          <div class="sf-group" [class.open]="openGroups().has('gender')">
            <button type="button" class="sf-group-head" (click)="toggleGroup('gender')" [attr.aria-expanded]="openGroups().has('gender')">
              Gender
              <svg class="sf-chev" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 9l6 6 6-6" stroke-linecap="round" stroke-linejoin="round" fill="none" stroke="currentColor" stroke-width="2"/></svg>
            </button>
            <div class="sf-group-body">
              @for (opt of genderOpts(); track opt) {
                <label class="sf-check">
                  <input
                    type="checkbox"
                    [checked]="selectedGenders().has(opt)"
                    (change)="toggleGender(opt, $event)"
                  />
                  <span>{{ opt }}</span>
                </label>
              }
            </div>
          </div>

          <div class="sf-card">
            <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M11 20A7 7 0 014 13c0-5 4-9.5 10-10 .5 5.5-1 12-9 13.5"/><path d="M6.5 20c1-4.5 3.5-8 7-10" stroke-linecap="round"/></svg>
            <h4>A more responsible supply chain</h4>
            <p>Ethically made. Transparently sourced. Built for a better tomorrow.</p>
            <a routerLink="/how-we-work">Learn more →</a>
          </div>
        </aside>

        <div class="shop-main">
          <div class="shop-intro">
            <span class="shop-kicker">Apparel for a brighter tomorrow</span>
            <h1 id="featuredCollectionHeading">Featured Collection</h1>
            <p class="shop-lede">
              Browse our collections, then open a style to customise it in the designer.
            </p>
          </div>

          <div class="shop-toolbar">
            <span class="shop-count"
              >Showing {{ filteredProducts().length }} of {{ filterPoolSize() }} styles</span
            >
            <label class="shop-sort"
              >Sort by
              <select [value]="sort()" (change)="onSort($event)">
                <option value="featured">Default order</option>
                <option value="price-asc">Price: low to high</option>
                <option value="price-desc">Price: high to low</option>
                <option value="name">Name A–Z</option>
              </select>
            </label>
          </div>

          @if (activeFilterChips().length) {
            <div class="sf-active" aria-label="Active filters">
              @for (chip of activeFilterChips(); track chip.key) {
                <button
                  type="button"
                  class="sf-chip"
                  (click)="removeFilterChip(chip)"
                  [attr.title]="'Remove ' + chip.type + ': ' + chip.value"
                >
                  <span class="sf-chip-type">{{ chip.type }}</span>
                  <span class="sf-chip-val">{{ chip.value }}</span>
                  <span class="sf-chip-x" aria-hidden="true">×</span>
                </button>
              }
            </div>
          }

          @if (error()) {
            <div class="alert alert-error">{{ error() }}</div>
          }

          <ng-template #productCard let-p="p">
            <article class="pc">
              <a
                class="pc-media"
                [routerLink]="['/products']"
                [queryParams]="exploreParams(p)"
              >
                @if (p.badge) {
                  <span class="pc-badge">{{ p.badge }}</span>
                }
                <img [src]="cardSrc(p)" [alt]="p.name" />
              </a>
              <div class="pc-body">
                <h3 class="pc-name">
                  <a [routerLink]="['/products']" [queryParams]="exploreParams(p)">
                    {{ p.name }}
                  </a>
                </h3>
                <div class="pc-price">{{ priceLabel(p, selectedColorId(p)) }}</div>
                @if (p.sku) {
                  <div class="pc-sku">{{ p.sku }}</div>
                }
                @if (colorSwatches(p).length) {
                  <div class="pc-swatches">
                    @for (c of colorSwatches(p).slice(0, 6); track c.id) {
                      <button
                        type="button"
                        class="pc-swatch"
                        [style.background]="c.hex"
                        [class.is-on]="selectedColorId(p) === c.id"
                        [attr.title]="c.name"
                        [attr.aria-label]="c.name"
                        (click)="selectCardColor(p.id, c.id, $event)"
                      ></button>
                    }
                  </div>
                }
                <div class="pc-foot">
                  @if (descriptionFor(p)) {
                    <p class="pc-desc">{{ descriptionFor(p) }}</p>
                  } @else {
                    <span class="pc-desc" aria-hidden="true"></span>
                  }
                  <div class="pc-actions">
                    <a
                      class="pc-mini"
                      [routerLink]="['/products']"
                      [queryParams]="exploreParams(p)"
                    >
                      Explore
                    </a>
                    <a
                      class="pc-mini pc-mini-fill"
                      [routerLink]="['/designer']"
                      [queryParams]="{
                        product: p.id,
                        name: p.name,
                        color: selectedColorId(p),
                      }"
                    >
                      Design
                    </a>
                  </div>
                </div>
              </div>
            </article>
          </ng-template>

          <div class="shop-grid">
            @for (p of filteredProducts().slice(0, 4); track p.id) {
              <ng-container *ngTemplateOutlet="productCard; context: { p: p }"></ng-container>
            }
          </div>
        </div>
      </div>

      @if (filteredProducts().length > 4) {
        <div class="shop-grid bottom-grid" style="margin-top: 26px;">
          @for (p of filteredProducts().slice(4); track p.id) {
            <ng-container *ngTemplateOutlet="productCard; context: { p: p }"></ng-container>
          }
        </div>
      }
    </section>

    <section class="quality-band">
      <div class="quality-band-inner">
        <div class="quality-copy">
          <span class="quality-kicker">Manufacturing for global brands</span>
          <h2>Quality in Every Stitch</h2>
          <p>
            From fabric sourcing to final production, we help brands turn ideas into
            high-quality apparel — reliably, ethically, and at scale.
          </p>
          <a routerLink="/how-we-work" class="quality-cta">Our Process →</a>
        </div>
        <div class="quality-stats">
          <div class="quality-stat">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z"/></svg>
            <h3>Premium materials</h3>
            <p>Wide range of fabrics and finishes</p>
          </div>
          <div class="quality-stat">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 01-2.83 2.83l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"/></svg>
            <h3>Advanced manufacturing</h3>
            <p>Consistent quality &amp; precision</p>
          </div>
          <div class="quality-stat">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="1" y="3" width="15" height="13" rx="2"/><path d="M16 8h4l3 3v5h-7V8z"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/></svg>
            <h3>Flexible order quantities</h3>
            <p>MOQ from 150 units</p>
          </div>
          <div class="quality-stat">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="12" cy="12" r="10"/><path d="M2 12h20M12 2a15.3 15.3 0 010 20M12 2a15.3 15.3 0 000 20"/></svg>
            <h3>Global delivery</h3>
            <p>Produced in Pakistan, shipped worldwide</p>
          </div>
        </div>
        <div
          class="quality-photo"
          style="background-image: url('/assets/images/folded_clothes.jpg')"
        >
          <span>THREADGAFF</span>
        </div>
      </div>
    </section>

    <section class="trusted-row">
      <p>Trusted by emerging &amp; established brands worldwide</p>
    </section>
  `,
  styles: `
    .home-hero {
      position: relative;
      isolation: isolate;
      z-index: 0;
      display: grid;
      grid-template-columns: minmax(320px, 1fr) minmax(0, 1.06fr);
      height: calc(100vh - 118px);
      min-height: 560px;
      background: #f3efe6;
      overflow: hidden;
    }
    .home-hero-copy {
      display: flex;
      flex-direction: column;
      justify-content: center;
      padding: 36px 36px 28px 48px;
      min-width: 0;
      background: #f3efe6;
    }
    .home-hero-kicker {
      margin: 0 0 18px;
      font-family: 'Montserrat', sans-serif;
      font-size: 0.62rem;
      font-weight: 600;
      letter-spacing: 0.22em;
      text-transform: uppercase;
      color: #8a867c;
    }
    .home-hero-name {
      margin: 0 0 18px;
      color: #1a1916;
      font-family: 'Playfair Display', 'Cormorant Garamond', Georgia, serif;
      font-size: clamp(2.2rem, 4vw, 3.85rem);
      font-weight: 600;
      letter-spacing: -0.02em;
      line-height: 0.96;
      text-transform: none;
    }
    .home-hero-lede {
      margin: 0 0 22px;
      max-width: 44ch;
      color: #5c5a52;
      font-size: 0.92rem;
      font-weight: 400;
      line-height: 1.65;
    }
    .home-hero-actions {
      display: flex;
      flex-wrap: nowrap;
      align-items: center;
      gap: 10px;
      margin: 0 0 22px;
    }
    .home-hero-btn {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      min-height: 44px;
      padding: 0 18px;
      border-radius: 2px;
      border: 1px solid #1c1c1c;
      font-family: 'Montserrat', sans-serif;
      font-size: 0.68rem;
      font-weight: 700;
      letter-spacing: 0.14em;
      text-transform: uppercase;
      text-decoration: none;
      white-space: nowrap;
      cursor: pointer;
      transition: background 0.15s ease, color 0.15s ease;
    }
    .home-hero-btn-fill { background: #1c1c1c; color: #f3efe6; }
    .home-hero-btn-fill:hover { background: #000; color: #fff; }
    .home-hero-btn-ghost { background: transparent; color: #1c1c1c; }
    .home-hero-btn-ghost:hover { background: #1c1c1c; color: #f3efe6; }
    .home-hero-points {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 16px 20px;
      margin: 0 0 18px;
      padding: 18px 0 0;
      list-style: none;
      border-top: 1px solid rgba(53, 57, 54, 0.12);
      max-width: 420px;
    }
    .home-hero-points li {
      display: grid;
      grid-template-columns: 28px minmax(0, 1fr);
      grid-template-rows: auto auto;
      column-gap: 8px;
      row-gap: 2px;
    }
    .home-hero-points svg {
      grid-row: 1 / span 2;
      width: 26px;
      height: 26px;
      margin-top: 1px;
      color: #2b2b28;
    }
    .home-hero-points strong {
      font-family: 'Montserrat', sans-serif;
      font-size: 0.58rem;
      font-weight: 700;
      letter-spacing: 0.12em;
      text-transform: uppercase;
      color: #1a1916;
      line-height: 1.3;
    }
    .home-hero-points span {
      font-size: 0.58rem;
      font-weight: 500;
      letter-spacing: 0.06em;
      text-transform: uppercase;
      color: #8a867c;
      line-height: 1.35;
    }
    .home-hero-foot {
      margin: auto 0 0;
      padding-top: 8px;
      display: flex;
      align-items: center;
      gap: 12px;
      font-family: 'Montserrat', sans-serif;
      font-size: 0.58rem;
      font-weight: 600;
      letter-spacing: 0.16em;
      text-transform: uppercase;
      color: #8a867c;
    }
    .home-hero-foot::before {
      content: '';
      width: 28px;
      height: 1px;
      background: #8a867c;
      flex: none;
    }
    .home-hero-visual {
      position: relative;
      display: flex;
      flex-direction: column;
      min-height: 100%;
      height: 100%;
      padding: 28px 0 72px;
      overflow: hidden;
      background:
        linear-gradient(105deg, #f3efe6 0%, rgba(243, 239, 230, 0.35) 18%, transparent 42%),
        linear-gradient(180deg, rgba(232, 224, 210, 0.55) 0%, rgba(210, 200, 182, 0.35) 100%),
        url('/assets/images/hero-split.jpg') center / cover no-repeat;
    }
    .hero-rail-controls {
      display: flex;
      justify-content: flex-end;
      gap: 10px;
      padding: 0 28px 18px;
      position: relative;
      z-index: 2;
    }
    .hero-rail-btn {
      width: 42px;
      height: 42px;
      border-radius: 50%;
      border: 1px solid rgba(28, 28, 28, 0.18);
      background: rgba(243, 239, 230, 0.88);
      color: #1c1c1c;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      transition: background 0.15s ease, color 0.15s ease, border-color 0.15s ease;
    }
    .hero-rail-btn svg { width: 18px; height: 18px; }
    .hero-rail-btn.is-next {
      background: #1c1c1c;
      border-color: #1c1c1c;
      color: #f3efe6;
    }
    .hero-rail-btn:hover { background: #1c1c1c; border-color: #1c1c1c; color: #f3efe6; }
    .hero-rail {
      display: flex;
      gap: 16px;
      overflow-x: auto;
      scroll-snap-type: x mandatory;
      scroll-behavior: smooth;
      scrollbar-width: none;
      padding: 0 28px 8px;
      flex: 1;
      align-items: stretch;
      -webkit-overflow-scrolling: touch;
    }
    .hero-rail::-webkit-scrollbar { display: none; }
    @keyframes heroFadeUp {
      from { opacity: 0; transform: translateY(15px); }
      to { opacity: 1; transform: translateY(0); }
    }
    .hero-card {
      position: relative;
      flex: 0 0 clamp(168px, 22vw, 210px);
      height: min(100%, 520px);
      min-height: 380px;
      border-radius: 14px;
      overflow: hidden;
      scroll-snap-align: start;
      text-decoration: none;
      color: #fff;
      box-shadow: 0 18px 40px rgba(40, 36, 28, 0.22);
      background: #2a2a28;
      opacity: 0;
      animation: heroFadeUp 0.5s cubic-bezier(0.2, 0.8, 0.2, 1) forwards;
    }
    .hero-card img {
      position: absolute;
      inset: 0;
      width: 100%;
      height: 100%;
      object-fit: cover;
      object-position: center;
      transition: transform 0.45s ease;
    }
    .hero-card:hover img { transform: scale(1.04); }
    .hero-card-meta {
      position: absolute;
      left: 0;
      right: 0;
      bottom: 0;
      z-index: 1;
      display: flex;
      align-items: flex-end;
      justify-content: space-between;
      gap: 10px;
      padding: 56px 14px 14px;
      background: linear-gradient(180deg, transparent 0%, rgba(18, 16, 12, 0.72) 70%);
    }
    .hero-card-meta strong {
      display: block;
      font-family: 'Playfair Display', 'Cormorant Garamond', Georgia, serif;
      font-size: 1.35rem;
      font-weight: 600;
      line-height: 1.1;
      letter-spacing: -0.01em;
    }
    .hero-card-meta span {
      display: block;
      margin-top: 4px;
      font-family: 'Montserrat', sans-serif;
      font-size: 0.55rem;
      font-weight: 600;
      letter-spacing: 0.14em;
      text-transform: uppercase;
      opacity: 0.85;
    }
    .hero-card-go {
      flex: none;
      width: 28px;
      height: 28px;
      border-radius: 50%;
      border: 1px solid rgba(255, 255, 255, 0.55);
      display: inline-flex !important;
      align-items: center;
      justify-content: center;
      margin: 0 !important;
      font-size: 0.85rem !important;
      letter-spacing: 0 !important;
      opacity: 1 !important;
      background: rgba(255, 255, 255, 0.08);
    }
    .hero-rail-dots {
      display: flex;
      justify-content: center;
      gap: 8px;
      padding: 16px 0 0;
      position: relative;
      z-index: 2;
    }
    .hero-dot {
      width: 8px;
      height: 8px;
      padding: 0;
      border: none;
      border-radius: 50%;
      background: rgba(75, 83, 60, 0.28);
      cursor: pointer;
      transition: background 0.15s ease, transform 0.15s ease;
    }
    .hero-dot.is-on {
      background: #4b533c;
      transform: scale(1.15);
    }
    .home-hero-brandline {
      position: absolute;
      right: 28px;
      bottom: 22px;
      display: flex;
      align-items: center;
      gap: 12px;
      z-index: 2;
    }
    .home-hero-brandline span {
      width: 28px;
      height: 1px;
      background: rgba(28, 28, 28, 0.45);
      flex: none;
    }
    .home-hero-brandline p {
      margin: 0;
      font-family: 'Montserrat', sans-serif;
      font-size: 0.58rem;
      font-weight: 700;
      letter-spacing: 0.16em;
      text-transform: uppercase;
      color: #5c5a52;
    }
    #featuredCollection { scroll-margin-top: 118px; }

    .shop-hero {
      background: var(--paper);
      padding: 24px 28px 44px;
    }
    .shop-hero-inner {
      display: grid;
      grid-template-columns: 190px minmax(0, 1fr);
      gap: 0 28px;
      align-items: start;
    }
    .shop-filters {
      border-right: 1px solid var(--line);
      padding-right: 16px;
    }
    .sf-head {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 12px;
    }
    .sf-title {
      font-family: 'Montserrat', sans-serif;
      font-size: 0.68rem;
      font-weight: 700;
      letter-spacing: 0.1em;
      text-transform: uppercase;
    }
    .sf-reset {
      background: none;
      border: none;
      color: var(--muted);
      font-size: 0.68rem;
      cursor: pointer;
      text-decoration: underline;
      padding: 0;
    }
    .sf-group { border-bottom: 1px solid var(--line); }
    .sf-group-head {
      width: 100%;
      display: flex;
      justify-content: space-between;
      align-items: center;
      background: none;
      border: none;
      padding: 12px 0;
      font-family: 'Montserrat', sans-serif;
      font-size: 0.68rem;
      font-weight: 700;
      letter-spacing: 0.06em;
      text-transform: uppercase;
      color: var(--ink);
      cursor: pointer;
      text-align: left;
    }
    .sf-chev { width: 14px; height: 14px; transition: transform 0.2s; }
    .sf-group.open > .sf-group-head .sf-chev { transform: rotate(180deg); }
    .sf-group-body { display: none; padding: 0 0 12px; }
    .sf-group.open > .sf-group-body { display: flex; flex-direction: column; gap: 8px; }
    .sf-check {
      display: flex;
      align-items: center;
      gap: 8px;
      font-size: 0.78rem;
      cursor: pointer;
      color: var(--ink);
    }
    .sf-check input { accent-color: var(--forest); }
    .sf-active {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      margin: 0 0 14px;
    }
    .sf-chip {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      border: 1px solid var(--line);
      background: var(--panel, #fffdf9);
      color: var(--ink);
      border-radius: 999px;
      padding: 5px 10px 5px 8px;
      font-size: 0.72rem;
      cursor: pointer;
      font-family: inherit;
      line-height: 1.2;
    }
    .sf-chip:hover { border-color: var(--forest); }
    .sf-chip-type {
      font-weight: 700;
      letter-spacing: 0.04em;
      text-transform: uppercase;
      font-size: 0.62rem;
      color: var(--muted);
    }
    .sf-chip-val { font-weight: 600; }
    .sf-chip-x {
      margin-left: 2px;
      color: var(--muted);
      font-size: 0.9rem;
      line-height: 1;
    }
    .sf-card {
      margin-top: 18px;
      padding: 16px;
      background: var(--forest-tint);
      border: 1px solid var(--line);
    }
    .sf-card svg { width: 22px; height: 22px; color: var(--forest); margin-bottom: 8px; }
    .sf-card h4 {
      font-size: 0.72rem;
      letter-spacing: 0.06em;
      margin: 0 0 6px;
      text-transform: uppercase;
    }
    .sf-card p { margin: 0 0 10px; font-size: 0.75rem; color: var(--muted); max-width: none; }
    .sf-card a { font-size: 0.75rem; font-weight: 600; color: var(--forest); }

    .shop-main { display: grid; row-gap: 18px; }
    .shop-kicker {
      display: block;
      font-family: 'Montserrat', sans-serif;
      font-size: 0.62rem;
      font-weight: 700;
      letter-spacing: 0.2em;
      text-transform: uppercase;
      color: var(--muted);
      margin-bottom: 12px;
    }
    .shop-intro h1 {
      font-family: 'Cormorant Garamond', Georgia, serif;
      font-weight: 600;
      font-size: clamp(2.4rem, 4.6vw, 4rem);
      letter-spacing: -0.02em;
      text-transform: none;
      line-height: 1.02;
      margin: 0 0 16px;
    }
    .shop-lede {
      margin: 0;
      max-width: 56ch;
      font-size: 0.86rem;
      line-height: 1.65;
      color: var(--muted);
    }
    .shop-toolbar {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 16px;
      flex-wrap: wrap;
    }
    .shop-count { font-size: 0.72rem; color: var(--muted); }
    .shop-sort {
      display: inline-flex;
      align-items: center;
      gap: 10px;
      font-size: 0.72rem;
      color: var(--muted);
    }
    .shop-sort select {
      font: inherit;
      color: var(--ink);
      background: var(--panel);
      border: 1px solid var(--line);
      border-radius: 3px;
      padding: 6px 10px;
      min-width: 118px;
    }

    .quality-band { background: var(--ink); color: var(--paper); }
    .quality-band-inner {
      display: grid;
      grid-template-columns: 1.05fr 1.15fr 0.9fr;
      max-width: 1360px;
      margin: 0 auto;
      min-height: 360px;
      align-items: center;
    }
    .quality-copy { padding: 48px 40px 48px 28px; }
    .quality-kicker {
      display: block;
      font-family: 'Montserrat', sans-serif;
      font-size: 0.68rem;
      font-weight: 700;
      letter-spacing: 0.16em;
      text-transform: uppercase;
      color: #b7b3a6;
      margin-bottom: 12px;
    }
    .quality-copy h2 {
      font-family: 'Cormorant Garamond', Georgia, serif;
      font-size: clamp(2rem, 3.2vw, 3rem);
      font-weight: 600;
      letter-spacing: -0.01em;
      text-transform: none;
      line-height: 1.15;
      color: var(--paper);
      margin: 0 0 14px;
    }
    .quality-copy p { color: #b7b3a6; margin: 0 0 20px; }
    .quality-cta {
      display: inline-flex;
      padding: 12px 18px;
      border: 1px solid rgba(242, 239, 230, 0.45);
      color: var(--paper);
      font-family: 'Montserrat', sans-serif;
      font-size: 0.72rem;
      font-weight: 700;
      letter-spacing: 0.1em;
      text-transform: uppercase;
    }
    .quality-cta:hover { background: var(--paper); color: var(--ink); }
    .quality-stats {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 28px 20px;
      padding: 24px 16px;
    }
    .quality-stat { text-align: center; }
    .quality-stat svg {
      width: 26px; height: 26px; margin: 0 auto 10px; display: block; color: var(--paper);
    }
    .quality-stat h3 {
      font-family: 'Montserrat', sans-serif;
      font-size: 0.72rem;
      letter-spacing: 0.1em;
      margin: 0 0 6px;
      color: var(--paper);
    }
    .quality-stat p {
      margin: 0 auto;
      font-size: 0.78rem;
      color: #b7b3a6;
      max-width: 18ch;
      line-height: 1.4;
    }
    .quality-photo {
      min-height: 360px;
      height: 100%;
      background-size: cover;
      background-position: center;
      position: relative;
    }
    .quality-photo::after {
      content: '';
      position: absolute;
      inset: 0;
      background: linear-gradient(90deg, rgba(53, 57, 54, 0.55) 0%, rgba(53, 57, 54, 0.15) 100%);
    }
    .quality-photo span {
      position: absolute;
      right: 20px;
      top: 20px;
      z-index: 1;
      font-family: 'Montserrat', sans-serif;
      font-size: 0.7rem;
      font-weight: 800;
      letter-spacing: 0.18em;
      color: var(--paper);
    }
    .trusted-row {
      background: var(--paper);
      border-top: 1px solid var(--line);
      padding: 22px 28px;
      text-align: center;
    }
    .trusted-row p {
      margin: 0 auto;
      font-family: 'Montserrat', sans-serif;
      font-size: 0.72rem;
      letter-spacing: 0.14em;
      text-transform: uppercase;
      color: var(--muted);
      max-width: none;
    }

    @media (max-width: 1280px) {
      .home-hero-copy { padding: 36px 28px 28px 36px; }
      .hero-card { flex-basis: 180px; min-height: 340px; }
    }
    @media (max-width: 900px) {
      .home-hero {
        grid-template-columns: 1fr;
        height: auto;
        min-height: 0;
      }
      .home-hero-visual {
        min-height: 0;
        height: auto;
        padding: 20px 0 64px;
        background:
          linear-gradient(180deg, #f3efe6 0%, rgba(243, 239, 230, 0.2) 18%, transparent 40%),
          linear-gradient(180deg, rgba(232, 224, 210, 0.55) 0%, rgba(210, 200, 182, 0.35) 100%),
          url('/assets/images/hero-split.jpg') center / cover no-repeat;
      }
      .hero-card { min-height: 320px; height: 58vw; max-height: 420px; }
      .shop-hero-inner { grid-template-columns: 1fr; }
      .shop-filters { border-right: none; border-bottom: 1px solid var(--line); padding: 0 0 20px; margin-bottom: 20px; }
      .quality-band-inner { grid-template-columns: 1fr; }
    }
    @media (max-width: 560px) {
      .home-hero-actions { flex-direction: column; align-items: stretch; }
      .home-hero-btn { width: 100%; }
      .home-hero-copy { padding: 28px 20px 20px; }
      .hero-rail, .hero-rail-controls { padding-left: 16px; padding-right: 16px; }
      .hero-card { flex-basis: 70vw; min-height: 360px; height: 70vw; }
      .home-hero-brandline { right: 16px; left: 16px; }
    }
  `,
})
export class HomePageComponent implements OnInit, OnDestroy {
  @ViewChild('heroRail') heroRailRef?: ElementRef<HTMLElement>;

  private heroScrollInterval: any;
  private heroScrollDir = 1;

  readonly catalog = inject(CatalogService);
  readonly featured = signal<Product[]>([]);
  readonly collections = signal<Category[]>([]);
  readonly attrDefs = signal<AttributeDefinition[]>([]);
  readonly selectedCats = signal<Set<string>>(new Set());
  readonly selectedGenders = signal<Set<string>>(new Set());
  readonly selectedMaterials = signal<Set<string>>(new Set());
  readonly selectedSustainability = signal<Set<string>>(new Set());
  readonly openGroups = signal<Set<string>>(new Set(['category']));
  readonly sort = signal('featured');
  readonly error = signal('');
  readonly filteredProducts = signal<Product[]>([]);
  readonly heroSlide = signal(0);
  readonly allProducts = signal<Product[]>([]);
  /** productId → selected colour id for card preview */
  readonly cardColorIds = signal<Record<string, string>>({});

  private readonly fallbackSustainability = [
    'Organic Cotton',
    'Recycled Materials',
    'Fairtrade Certified',
    'Vegan',
  ];
  private readonly fallbackMaterials = [
    '100% Cotton',
    'Cotton Blend',
    'French Terry',
    'Fleece',
  ];
  private readonly fallbackGenders = ['Unisex', "Men's", "Women's"];

  readonly sustainabilityOpts = signal<string[]>([...this.fallbackSustainability]);
  readonly materialOpts = signal<string[]>([...this.fallbackMaterials]);
  readonly genderOpts = signal<string[]>([...this.fallbackGenders]);

  private readonly heroFallbackImages: Record<string, string> = {
    hoodies: '/assets/images/prod_hoodie.jpg',
    't-shirts': '/assets/images/prod_tshirt.jpg',
    sweatshirts: '/assets/images/prod_sweatshirt.jpg',
    joggers: '/assets/images/prod_joggers.jpg',
    'polo-shirts': '/assets/images/prod_polo.jpg',
    sets: '/assets/images/prod_sets.jpg',
    tracksuits: '/assets/images/prod_tracksuit.jpg',
    jackets: '/assets/images/prod_hoodie.jpg',
  };

  private readonly heroPreferredOrder = [
    'hoodies',
    't-shirts',
    'sweatshirts',
    'joggers',
    'polo-shirts',
    'sets',
  ];

  readonly heroCards = signal<
    { slug: string; name: string; styles: string; image: string; _isCustom?: boolean }[]
  >([]);

  heroDotIndexes() {
    return this.heroCards().map((_, i) => i);
  }

  scrollHeroRail(dir: number) {
    const el = this.heroRailRef?.nativeElement;
    if (!el) return;
    const card = el.querySelector('.hero-card') as HTMLElement | null;
    const step = card ? card.offsetWidth + 16 : 200;
    el.scrollBy({ left: dir * step, behavior: 'smooth' });
  }

  goHeroSlide(index: number) {
    const el = this.heroRailRef?.nativeElement;
    if (!el) return;
    const card = el.children.item(index) as HTMLElement | null;
    if (!card) return;
    el.scrollTo({ left: card.offsetLeft - 28, behavior: 'smooth' });
    this.heroSlide.set(index);
  }

  onHeroRailScroll() {
    const el = this.heroRailRef?.nativeElement;
    if (!el) return;
    const card = el.querySelector('.hero-card') as HTMLElement | null;
    const step = card ? card.offsetWidth + 16 : 200;
    const index = Math.round(el.scrollLeft / step);
    this.heroSlide.set(
      Math.max(0, Math.min(index, this.heroCards().length - 1)),
    );
  }

  ngOnInit() {
    this.heroScrollInterval = setInterval(() => {
      const el = this.heroRailRef?.nativeElement;
      if (!el || !this.heroCards().length) return;
      
      const maxScroll = el.scrollWidth - el.clientWidth;
      
      if (this.heroScrollDir === 1 && el.scrollLeft >= maxScroll - 5) {
        this.heroScrollDir = -1;
      } else if (this.heroScrollDir === -1 && el.scrollLeft <= 5) {
        this.heroScrollDir = 1;
      }
      
      this.scrollHeroRail(this.heroScrollDir);
    }, 2500);

    this.catalog.getAttributes().subscribe({
      next: (defs) => {
        this.attrDefs.set(defs.filter((d) => d.isActive !== false));
        const labels = (code: string, fallback: string[]) => {
          const fromApi =
            defs
              .find((d) => d.code === code)
              ?.options?.slice()
              .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))
              .map((o) => o.label)
              .filter(Boolean) || [];
          return fromApi.length ? fromApi : fallback;
        };
        this.sustainabilityOpts.set(
          labels('sustainability', this.fallbackSustainability),
        );
        this.materialOpts.set(labels('material', this.fallbackMaterials));
        this.genderOpts.set(labels('gender', this.fallbackGenders));
        this.applyFilters();
      },
    });

    this.catalog.getCollectionCategories().subscribe({
      next: (cats) => {
        this.collections.set(cats);
        this.refreshHeroCards(cats, this.allProducts());
      },
    });

    this.catalog.getProducts({ limit: 100, isActive: true }).subscribe({
      next: (res) => {
        const items = (res.items || []).filter((p) => p.isActive !== false);
        const ordered = [...items].sort(
          (a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0),
        );
        this.allProducts.set(ordered);
        this.refreshHeroCards(this.collections(), ordered);

        // Default homepage grid follows admin drag order (sortOrder)
        this.featured.set(ordered);
        this.applyFilters();

        this.catalog.enrichWithColorMedia(ordered).subscribe({
          next: (full) => {
            const live = full
              .filter((p) => p.isActive !== false)
              .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
            this.allProducts.set(live);
            this.refreshHeroCards(this.collections(), live);
            this.featured.set(live);
            this.applyFilters();
          },
        });
      },
      error: () =>
        this.error.set(
          'Could not load products. Check the API connection.',
        ),
    });
  }

  ngOnDestroy() {
    if (this.heroScrollInterval) {
      clearInterval(this.heroScrollInterval);
    }
  }

  private defaultHeroCards() {
    return this.heroPreferredOrder.map((slug) => ({
      slug,
      name: this.labelForSlug(slug),
      styles: 'Styles',
      image: this.catalog.normalizeMediaUrl(this.heroFallbackImages[slug] || '/assets/images/prod_tshirt.jpg'),
    }));
  }

  private labelForSlug(slug: string) {
    const labels: Record<string, string> = {
      hoodies: 'Hoodies',
      't-shirts': 'T-Shirts',
      sweatshirts: 'Sweatshirts',
      joggers: 'Joggers',
      'polo-shirts': 'Polo Shirts',
      sets: 'Sets/Co-ords',
      tracksuits: 'Tracksuits',
      jackets: 'Jackets',
    };
    return (
      labels[slug] ||
      slug.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
    );
  }

  private refreshHeroCards(cats: Category[], products: Product[]) {
    const bySlug = new Map(cats.map((c) => [c.slug, c]));
    const counts = new Map<string, number>();
    const images = new Map<string, string>();

    const ranked = [...products].sort((a, b) => {
      const feat = Number(b.isFeatured) - Number(a.isFeatured);
      if (feat) return feat;
      return (a.sortOrder ?? 0) - (b.sortOrder ?? 0);
    });

    for (const p of ranked) {
      const slug = p.category?.slug;
      if (!slug) continue;
      counts.set(slug, (counts.get(slug) || 0) + 1);
      
      const pImage = this.catalog.cardImageUrl(p);
      const isCustom = !pImage.includes('/assets/');
      
      if (!images.has(slug)) {
        images.set(slug, pImage);
      } else if (isCustom && images.get(slug)?.includes('/assets/')) {
        images.set(slug, pImage);
      }
    }

    const orderedSlugs = [
      ...this.heroPreferredOrder.filter((s) => bySlug.has(s) || images.has(s)),
      ...cats
        .map((c) => c.slug)
        .filter((s) => !this.heroPreferredOrder.includes(s)),
    ];

    const unique = [...new Set(orderedSlugs)].slice(0, 8);
    if (!unique.length) {
      this.heroCards.set(this.defaultHeroCards());
      return;
    }

    const cards = unique.map((slug) => {
      const cat = bySlug.get(slug);
      const count = counts.get(slug) || 0;
      const rawImage =
        cat?.imageUrl ||
        images.get(slug) ||
        this.heroFallbackImages[slug] ||
        '/assets/images/prod_tshirt.jpg';
      const image = this.catalog.normalizeMediaUrl(rawImage);
      return {
        slug,
        name:
          slug === 'sets'
            ? 'Sets/Co-ords'
            : cat?.name || this.labelForSlug(slug),
        styles: count > 0 ? `${count}+ Styles` : 'Styles',
        image,
        _isCustom: !image.includes('/assets/'),
      };
    });

    cards.sort((a, b) => {
      if (a._isCustom && !b._isCustom) return -1;
      if (!a._isCustom && b._isCustom) return 1;
      return 0;
    });

    this.heroCards.set(
      cards.map((c) => ({
        slug: c.slug,
        name: c.name,
        styles: c.styles,
        image: c.image,
      }))
    );
  }

  toggleGroup(name: string) {
    const current = new Set(this.openGroups());
    if (current.has(name)) {
      current.delete(name);
    } else {
      current.add(name);
    }
    this.openGroups.set(current);
  }

  private toggleInSet(
    store: ReturnType<typeof signal<Set<string>>>,
    value: string,
    event: Event,
  ) {
    const checked = (event.target as HTMLInputElement).checked;
    store.update((set) => {
      const next = new Set(set);
      if (checked) next.add(value);
      else next.delete(value);
      return next;
    });
    this.applyFilters();
  }

  toggleCat(slug: string, event: Event) {
    this.toggleInSet(this.selectedCats, slug, event);
  }

  toggleGender(opt: string, event: Event) {
    this.toggleInSet(this.selectedGenders, opt, event);
  }

  toggleMaterial(opt: string, event: Event) {
    this.toggleInSet(this.selectedMaterials, opt, event);
  }

  toggleSustainability(opt: string, event: Event) {
    this.toggleInSet(this.selectedSustainability, opt, event);
  }

  resetFilters() {
    this.selectedCats.set(new Set());
    this.selectedGenders.set(new Set());
    this.selectedMaterials.set(new Set());
    this.selectedSustainability.set(new Set());
    this.sort.set('featured');
    this.applyFilters();
  }

  onSort(event: Event) {
    this.sort.set((event.target as HTMLSelectElement).value);
    this.applyFilters();
  }

  hasActiveFilters(): boolean {
    return (
      this.selectedCats().size > 0 ||
      this.selectedGenders().size > 0 ||
      this.selectedMaterials().size > 0 ||
      this.selectedSustainability().size > 0
    );
  }

  filterPoolSize(): number {
    return this.hasActiveFilters()
      ? this.allProducts().length || this.featured().length
      : this.featured().length;
  }

  activeFilterChips(): ActiveFilterChip[] {
    const chips: ActiveFilterChip[] = [];
    for (const slug of this.selectedCats()) {
      const name =
        this.collections().find((c) => c.slug === slug)?.name || slug;
      chips.push({
        group: 'category',
        type: 'Category',
        value: name,
        key: `category:${slug}`,
      });
    }
    for (const opt of this.selectedSustainability()) {
      chips.push({
        group: 'sustainability',
        type: 'Sustainability',
        value: opt,
        key: `sustainability:${opt}`,
      });
    }
    for (const opt of this.selectedMaterials()) {
      chips.push({
        group: 'material',
        type: 'Material',
        value: opt,
        key: `material:${opt}`,
      });
    }
    for (const opt of this.selectedGenders()) {
      chips.push({
        group: 'gender',
        type: 'Gender',
        value: opt,
        key: `gender:${opt}`,
      });
    }
    return chips;
  }

  removeFilterChip(chip: ActiveFilterChip) {
    const drop = (store: ReturnType<typeof signal<Set<string>>>, key: string) => {
      store.update((set) => {
        const next = new Set(set);
        next.delete(key);
        return next;
      });
    };
    if (chip.group === 'category') {
      const slug =
        this.collections().find((c) => c.name === chip.value)?.slug ||
        chip.key.replace(/^category:/, '');
      drop(this.selectedCats, slug);
    } else if (chip.group === 'sustainability') {
      drop(this.selectedSustainability, chip.value);
    } else if (chip.group === 'material') {
      drop(this.selectedMaterials, chip.value);
    } else if (chip.group === 'gender') {
      drop(this.selectedGenders, chip.value);
    }
    this.applyFilters();
  }

  selectedColorId(p: Product): string {
    const picked = this.cardColorIds()[p.id];
    if (picked) return picked;
    return p.colors?.find((c) => c.isDefault)?.id || p.colors?.[0]?.id || '';
  }

  /** Only colours with a real hex show as storefront swatches. */
  colorSwatches(p: Product) {
    return (p.colors || []).filter((c) => hasDisplayHex(c.hex));
  }

  selectCardColor(productId: string, colorId: string, event?: Event) {
    event?.preventDefault();
    event?.stopPropagation();
    this.cardColorIds.update((m) => ({ ...m, [productId]: colorId }));
  }

  cardSrc(p: Product): string {
    return this.catalog.cardImageUrl(p, this.selectedColorId(p));
  }

  priceLabel(p: Product, colorId?: string | null): string {
    return formatProductPrice(p, colorId, { from: !colorId });
  }

  descriptionFor(p: Product): string {
    return cardDescription(p, this.selectedColorId(p));
  }

  exploreParams(p: Product): Record<string, string> {
    const params: Record<string, string> = { product: p.id };
    const slug = p.category?.slug;
    if (slug) params['collection'] = slug;
    return params;
  }

  private normalizeLabel(v: string): string {
    return v
      .toLowerCase()
      .replace(/[’']/g, '')
      .replace(/[^a-z0-9]+/g, ' ')
      .trim();
  }

  private labelsMatch(productLabel: string, selected: string): boolean {
    const a = this.normalizeLabel(productLabel);
    const b = this.normalizeLabel(selected);
    if (!a || !b) return false;
    return a === b || a.includes(b) || b.includes(a);
  }

  private productAttrLabels(p: Product, code: string): string[] {
    const out: string[] = [];
    const push = (raw: string | null | undefined) => {
      const v = (raw || '').trim();
      if (!v) return;
      if (out.some((x) => this.normalizeLabel(x) === this.normalizeLabel(v))) return;
      out.push(v);
    };

    const def = this.attrDefs().find((d) => d.code === code);
    for (const av of p.attributeValues || []) {
      const avCode = av.attributeDefinition?.code;
      const avDefId = av.attributeDefinitionId;
      const matches =
        avCode === code || (!!def && (avDefId === def.id || av.attributeDefinition?.id === def.id));
      if (!matches) continue;

      push(av.option?.label);
      push(av.valueText);

      const ids = [
        ...(av.optionIds || []),
        ...(av.optionId ? [av.optionId] : []),
      ];
      for (const id of ids) {
        const opt = def?.options?.find((o) => o.id === id);
        if (opt) push(opt.label);
      }
    }

    if (code === 'sustainability' && p.ecoTag) {
      push(p.ecoTag);
    }

    return out;
  }

  private productGender(p: Product): string {
    return this.productAttrLabels(p, 'gender')[0] || '';
  }

  private matchesSelectedLabels(
    productLabels: string[],
    selected: string[],
  ): boolean {
    if (!selected.length) return true;
    if (!productLabels.length) return false;
    return selected.some((sel) =>
      productLabels.some((pl) => this.labelsMatch(pl, sel)),
    );
  }

  private applyFilters() {
    const filtering = this.hasActiveFilters();
    let list = filtering
      ? [...(this.allProducts().length ? this.allProducts() : this.featured())]
      : [...this.featured()];

    const cats = this.selectedCats();
    if (cats.size) {
      list = list.filter(
        (p) => p.category?.slug && cats.has(p.category.slug),
      );
    }

    const genders = [...this.selectedGenders()];
    if (genders.length) {
      list = list.filter((p) => {
        const g = this.productGender(p);
        return genders.some((sel) => genderMatchesFilter(g, sel));
      });
    }

    const materials = [...this.selectedMaterials()];
    if (materials.length) {
      list = list.filter((p) =>
        this.matchesSelectedLabels(this.productAttrLabels(p, 'material'), materials),
      );
    }

    const sustain = [...this.selectedSustainability()];
    if (sustain.length) {
      list = list.filter((p) =>
        this.matchesSelectedLabels(
          this.productAttrLabels(p, 'sustainability'),
          sustain,
        ),
      );
    }

    switch (this.sort()) {
      case 'price-asc':
        list.sort((a, b) => Number(a.basePrice) - Number(b.basePrice));
        break;
      case 'price-desc':
        list.sort((a, b) => Number(b.basePrice) - Number(a.basePrice));
        break;
      case 'name':
        list.sort((a, b) => a.name.localeCompare(b.name));
        break;
      default:
        list.sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
        break;
    }
    this.filteredProducts.set(list);
  }
}
