import { Component, ElementRef, OnInit, ViewChild, computed, effect, inject, signal, untracked } from '@angular/core';
import { RouterLink } from '@angular/router';
import { CatalogService } from '../../core/services/catalog.service';
import { Category, Product } from '../../core/models/catalog.models';
import { SiteSettingsService } from '../../core/services/site-settings.service';
import { FadeInDirective } from '../../shared/fade-in.directive';

export interface HomeCard {
  key: string;
  slug: string;
  name: string;
  image: string | null;
}

@Component({
  selector: 'tg-home-page',
  standalone: true,
  imports: [RouterLink, FadeInDirective],
  template: `
    <section class="home-hero" aria-label="Threadgaff">
      <div class="home-hero-copy">
        <p class="home-hero-kicker">Private label / Wholesale / Made for brands</p>
        <h1 class="home-hero-name">Premium Apparel Manufacturing for Growing Brands</h1>
        <p class="home-hero-lede">
          Custom garment manufacturing and wholesale apparel for brands that think bigger.
          From concept to production, we help you create high-quality, on-brand clothing
          at scale.
        </p>
        <div class="home-hero-actions">
          <a class="home-hero-btn home-hero-btn-fill" routerLink="/quote"
            >Request a Quote <span aria-hidden="true">→</span></a
          >
          <a class="home-hero-btn home-hero-btn-ghost" href="#catalogues"
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
          @if (slidesLoading()) {
            @for (n of heroSkeletons; track n) {
              <div class="hero-card is-loading" role="status" aria-label="Loading">
                <span class="hero-spinner"></span>
              </div>
            }
          } @else {
            @for (card of slides(); track card.key; let i = $index) {
              <a
                class="hero-card"
                [class.is-pending]="card.image && !heroReady()[card.key]"
                [style.animation-delay]="(i * 0.04) + 's'"
                [routerLink]="['/products']"
                [queryParams]="card.slug ? { collection: card.slug } : {}"
              >
                @if (card.image) {
                  <img
                    [src]="card.image"
                    [alt]="card.name"
                    [class.is-ready]="heroReady()[card.key]"
                    fetchpriority="high"
                    (load)="heroImageDone(card.key)"
                    (error)="heroImageDone(card.key)"
                  />
                  @if (!heroReady()[card.key]) {
                    <span class="hero-spinner" role="status" aria-label="Loading"></span>
                  }
                }
                @if (card.name) {
                  <div class="hero-card-meta">
                    <div>
                      <strong>{{ card.name }}</strong>
                    </div>
                    <span class="hero-card-go" aria-hidden="true">→</span>
                  </div>
                }
              </a>
            }
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
          <p>{{ site.settings().heroTagline }}</p>
        </div>
      </div>
    </section>

    <section class="catalogues" id="catalogues" aria-labelledby="cataloguesHeading">
      <div class="catalogues-inner">
        <div class="catalogues-intro">
          <span class="cat-kicker">Apparel for a brighter tomorrow</span>
          <h2 id="cataloguesHeading">{{ site.settings().shopHeading }}</h2>
          <p class="cat-lede">{{ site.settings().shopIntro }}</p>
        </div>

        @if (error()) {
          <div class="alert alert-error">{{ error() }}</div>
        }

        <div class="cat-grid">
          @if (cataloguesLoading()) {
            @for (n of [0, 1, 2]; track n) {
              <div class="cat-card is-loading" role="status" aria-label="Loading">
                <span class="hero-spinner"></span>
              </div>
            }
          } @else {
            @for (c of catalogues(); track c.key) {
              <a
                class="cat-card"
                [routerLink]="['/products']"
                [queryParams]="c.slug ? { collection: c.slug } : {}"
              >
                @if (c.image) {
                  <img tgFadeIn [src]="c.image" [alt]="c.name" loading="lazy" decoding="async" />
                }
                <div class="cat-meta">
                  <strong class="cat-name">{{ c.name }}</strong>
                  <span class="cat-go">View variants <span aria-hidden="true">→</span></span>
                </div>
              </a>
            }
          }
        </div>
      </div>
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
      background: #f1ece2 url('/assets/images/hero-bg-studio.png') right center / cover no-repeat;
      overflow: hidden;
    }
    .home-hero-copy {
      display: flex;
      flex-direction: column;
      justify-content: center;
      padding: 36px 36px 28px 48px;
      min-width: 0;
      background: transparent;
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
      background: transparent;
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
      -webkit-mask-image: linear-gradient(to right, black 0%, black 85%, transparent 100%);
      mask-image: linear-gradient(to right, black 0%, black 85%, transparent 100%);
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
      box-shadow: 0 6px 16px rgba(40, 36, 28, 0.12);
      background: #2a2a28;
      opacity: 0;
      animation: heroFadeUp 0.25s cubic-bezier(0.2, 0.8, 0.2, 1) forwards;
    }
    .hero-card img {
      position: absolute;
      inset: 0;
      width: 100%;
      height: 100%;
      object-fit: cover;
      object-position: center;
      opacity: 0;
      transition: transform 0.45s ease, opacity 0.35s ease;
    }
    .hero-card img.is-ready { opacity: 1; }
    /* the name appears together with the picture, never before it */
    .hero-card.is-pending .hero-card-meta { opacity: 0; }
    .hero-card-meta { transition: opacity 0.35s ease; }
    .hero-card.is-loading, .hero-card.is-pending { background: #d9d4c7; }
    .hero-card.is-loading { pointer-events: none; }
    .hero-spinner {
      position: absolute;
      top: 50%;
      left: 50%;
      width: 34px;
      height: 34px;
      margin: -17px 0 0 -17px;
      border-radius: 50%;
      border: 3px solid rgba(60, 69, 54, 0.22);
      border-top-color: #3c4536;
      animation: heroSpin 0.8s linear infinite;
      z-index: 2;
    }
    @keyframes heroSpin { to { transform: rotate(360deg); } }
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
      color: #ffffff;
    }
    
    #catalogues { scroll-margin-top: 118px; }


    .catalogues { background: var(--paper); padding: 56px 28px 72px; }
    .catalogues-inner { max-width: 1360px; margin: 0 auto; }
    .catalogues-intro { max-width: 640px; margin: 0 0 32px; }
    .cat-kicker {
      display: block;
      font-family: 'Montserrat', sans-serif;
      font-size: 0.62rem;
      font-weight: 700;
      letter-spacing: 0.2em;
      text-transform: uppercase;
      color: var(--muted);
      margin-bottom: 12px;
    }
    .catalogues-intro h2 {
      font-family: 'Cormorant Garamond', Georgia, serif;
      font-weight: 600;
      font-size: clamp(2.4rem, 4.6vw, 4rem);
      letter-spacing: -0.02em;
      text-transform: none;
      line-height: 1.02;
      margin: 0 0 16px;
    }
    .cat-lede { margin: 0; max-width: 56ch; font-size: 0.9rem; line-height: 1.65; color: var(--muted); }
    .cat-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(min(100%, 320px), 1fr));
      gap: 22px;
    }
    .cat-card {
      position: relative;
      display: block;
      aspect-ratio: 4 / 5;
      border-radius: 18px;
      overflow: hidden;
      background: #d9d4c7;
      color: #fff;
      text-decoration: none;
      box-shadow: 0 10px 28px rgba(40, 36, 28, 0.12);
      isolation: isolate;
    }
    .cat-card.is-loading { pointer-events: none; }
    .cat-card img {
      position: absolute;
      inset: 0;
      width: 100%;
      height: 100%;
      object-fit: cover;
      object-position: center;
      transition: transform 0.6s ease, opacity 0.45s ease;
    }
    .cat-card img.tg-pending { opacity: 0; }
    .cat-card:hover img { transform: scale(1.045); }
    .cat-card:not(.is-loading)::after {
      content: '';
      position: absolute;
      inset: 0;
      background: linear-gradient(to top, rgba(22, 24, 18, 0.74) 0%, rgba(22, 24, 18, 0.1) 46%, transparent 70%);
      z-index: 1;
      pointer-events: none;
    }
    .cat-meta {
      position: absolute;
      left: 0;
      right: 0;
      bottom: 0;
      z-index: 2;
      padding: 26px;
      display: flex;
      align-items: flex-end;
      justify-content: space-between;
      gap: 14px;
    }
    .cat-name {
      font-family: 'Cormorant Garamond', Georgia, serif;
      font-weight: 600;
      font-size: clamp(1.7rem, 2.4vw, 2.2rem);
      line-height: 1.05;
      letter-spacing: -0.01em;
    }
    .cat-go {
      flex: none;
      font-family: 'Montserrat', sans-serif;
      font-size: 0.64rem;
      font-weight: 700;
      letter-spacing: 0.1em;
      text-transform: uppercase;
      padding: 9px 14px;
      border-radius: 999px;
      border: 1px solid rgba(255, 255, 255, 0.7);
      background: rgba(255, 255, 255, 0.12);
      backdrop-filter: blur(4px);
      transition: background 0.2s, color 0.2s;
    }
    .cat-card:hover .cat-go { background: #fff; color: var(--forest); }

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
        background-position: 70% center;
      }
      .home-hero-visual {
        min-height: 0;
        height: auto;
        padding: 20px 0 64px;
        background: transparent;
      }
      .hero-card { min-height: 320px; height: 58vw; max-height: 420px; }
      .quality-band-inner { grid-template-columns: 1fr; }
      .catalogues { padding: 40px 18px 52px; }
    }
    @media (max-width: 560px) {
      .home-hero-actions { flex-direction: column; align-items: stretch; }
      .home-hero-btn { width: 100%; }
      .home-hero-copy { padding: 28px 20px 20px; }
      .hero-rail, .hero-rail-controls { padding-left: 16px; padding-right: 16px; }
      .hero-card { flex-basis: 70vw; min-height: 360px; height: 70vw; }
      .home-hero-brandline { right: 16px; left: 16px; }
      .cat-grid { grid-template-columns: 1fr; }
    }
  `,
})
export class HomePageComponent implements OnInit {
  @ViewChild('heroRail') heroRailRef?: ElementRef<HTMLElement>;

  readonly catalog = inject(CatalogService);
  readonly site = inject(SiteSettingsService);
  readonly error = signal('');
  readonly heroSlide = signal(0);
  readonly heroSkeletons = [0, 1, 2, 3, 4];
  /** Slider pictures that have finished loading (or failed): their spinner is gone. */
  readonly heroReady = signal<Record<string, boolean>>({});

  private readonly collections = signal<Category[]>([]);
  private readonly products = signal<Product[]>([]);
  private readonly catsLoaded = signal(false);
  private readonly productsLoaded = signal(false);

  /**
   * Until the admin sets up the home page, the collections are shown as they are (each with its
   * cover picture or its first product's photo). Nothing is shown before the server has answered.
   */
  private readonly derived = computed<HomeCard[]>(() =>
    this.catsLoaded() && this.productsLoaded()
      ? this.catalog.deriveHomeCards(this.collections(), this.products()).map((c) => ({
          key: c.slug,
          slug: c.slug,
          name: c.name,
          image: c.imageUrl || null,
        }))
      : [],
  );
  private readonly derivedReady = computed(() => this.catsLoaded() && this.productsLoaded());

  /** True until what the slider needs has come back from the server. */
  readonly slidesLoading = computed(
    () => !this.site.ready() || (this.site.settings().homeSlides === null && !this.derivedReady()),
  );
  readonly slides = computed<HomeCard[]>(() => {
    if (this.slidesLoading()) return [];
    const saved = this.site.settings().homeSlides;
    return saved
      ? saved.map((s) => ({
          key: s.id,
          slug: s.slug,
          name: s.title,
          image: s.imageUrl ? this.catalog.normalizeMediaUrl(s.imageUrl) : null,
        }))
      : this.derived();
  });

  readonly cataloguesLoading = computed(
    () => !this.site.ready() || (this.site.settings().homeCatalogues === null && !this.derivedReady()),
  );
  readonly catalogues = computed<HomeCard[]>(() => {
    if (this.cataloguesLoading()) return [];
    const saved = this.site.settings().homeCatalogues;
    return saved
      ? saved.map((c) => ({
          key: c.id,
          slug: c.slug,
          name: c.name,
          image: c.imageUrl ? this.catalog.normalizeMediaUrl(c.imageUrl) : null,
        }))
      : this.derived();
  });

  private fallbackRequested = false;

  constructor() {
    // The collections and products are only needed while the home page has not been set up in
    // the admin: once it has, the saved pictures are everything the page needs.
    effect(() => {
      if (!this.site.ready() || this.fallbackRequested) return;
      const s = this.site.settings();
      if (s.homeCatalogues === null || s.homeSlides === null) {
        this.fallbackRequested = true;
        untracked(() => this.loadCollections());
      }
    });
  }

  ngOnInit() {
    this.site.load();
  }

  private loadCollections() {
    this.catalog.getCollectionCategories().subscribe({
      next: (cats) => {
        this.collections.set(cats);
        this.catsLoaded.set(true);
      },
      error: () => this.catsLoaded.set(true),
    });
    this.catalog.getProducts({ limit: 100, isActive: true }).subscribe({
      next: (res) => {
        this.products.set((res.items || []).filter((p) => p.isActive !== false));
        this.productsLoaded.set(true);
      },
      error: () => {
        this.productsLoaded.set(true);
        this.error.set('Could not load the catalogues. Check the API connection.');
      },
    });
  }

  heroImageDone(key: string) {
    this.heroReady.update((m) => (m[key] ? m : { ...m, [key]: true }));
  }

  heroDotIndexes() {
    return this.slides().map((_, i) => i);
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
    this.heroSlide.set(Math.max(0, Math.min(index, this.slides().length - 1)));
  }
}
