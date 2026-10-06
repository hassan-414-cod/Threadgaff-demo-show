import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'tg-about-page',
  standalone: true,
  imports: [RouterLink],
  template: `
    <section class="hero-full" aria-label="About Threadgaff">
      <div class="hero-copy">
        <span class="kicker">About Threadgaff</span>
        <h1>Built For<br />Brands Like<br />Yours</h1>
        <p class="lede">
          We help businesses bring their clothing ideas to life — from concept to delivery, under
          their own name.
        </p>
      </div>
    </section>

    <section class="vision">
      <div class="wrap">
        <div class="about-block">
          <div class="about-text">
            <h2>1. Our Vision</h2>
            <p>
              Threadgaff exists to give businesses and organisations a white-label route into quality
              clothing, without having to build their own supply chain, design capability or
              manufacturing relationships from scratch. A client picks from our product range, works
              with us on the design, and we handle sourcing, production and delivery under their name
              — not ours.
            </p>

            <div class="quote-card">
              <blockquote>
                “To be the white-label partner that lets any brand, retailer or organiser launch
                quality clothing under their own name, without building a supply chain of their own.”
              </blockquote>
            </div>

            <p class="focus-copy">
              Our current focus is entirely B2B. B2C is on hold for later — everything in this brief,
              and everything the site needs to support at this stage, is built around business
              customers placing orders, not individual shoppers.
            </p>
          </div>
          <div class="about-img">
            <img src="/assets/images/about-vision.jpg" alt="Our Vision" />
          </div>
        </div>

        <div class="stats">
          @for (s of stats; track s.value) {
            <div class="stat">
              <h4>{{ s.value }}</h4>
              <span>{{ s.label }}</span>
            </div>
          }
        </div>
      </div>
    </section>

    <section class="serve">
      <div class="wrap">
        <div class="about-block reverse">
          <div class="about-text">
            <h2>2. Who We Serve</h2>
            <p class="intro">
              We're approaching three types of B2B customer. The site should speak to all three, even
              where the entry point ends up looking slightly different for each.
            </p>

            <ul class="audience-list">
              <li>
                <svg
                  class="icon"
                  width="40"
                  height="40"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="1.5"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  aria-hidden="true"
                >
                  <circle cx="12" cy="12" r="10"></circle>
                  <line x1="2" y1="12" x2="22" y2="12"></line>
                  <path
                    d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"
                  ></path>
                </svg>
                <div>
                  <h3>Importers &amp; Wholesale Buyers</h3>
                  <p>
                    Businesses importing or distributing clothing who want a direct manufacturing
                    relationship, consolidating their sourcing with one partner for consistent quality,
                    pricing and lead times.
                  </p>
                </div>
              </li>
              <li>
                <svg
                  class="icon"
                  width="40"
                  height="40"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="1.5"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  aria-hidden="true"
                >
                  <path
                    d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"
                  ></path>
                  <line x1="7" y1="7" x2="7.01" y2="7"></line>
                </svg>
                <div>
                  <h3>Brands &amp; Retailers</h3>
                  <p>
                    Established or growing clothing brands, online-first labels and independent
                    boutique/retail stores who want their own-label range produced to a high standard,
                    without owning a factory relationship.
                  </p>
                </div>
              </li>
              <li>
                <svg
                  class="icon"
                  width="40"
                  height="40"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="1.5"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  aria-hidden="true"
                >
                  <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path>
                  <circle cx="9" cy="7" r="4"></circle>
                  <path d="M23 21v-2a4 4 0 0 0-3-3.87"></path>
                  <path d="M16 3.13a4 4 0 0 1 0 7.75"></path>
                </svg>
                <div>
                  <h3>Event &amp; Charity Organisers</h3>
                  <p>
                    Standalone buyers needing branded clothing for a specific purpose, such as charity
                    events, festivals or corporate away-days.
                  </p>
                </div>
              </li>
            </ul>

            <div class="cta-row">
              <a routerLink="/how-we-work" class="btn btn-primary">LEARN MORE ABOUT OUR PROCESS →</a>
            </div>
          </div>
          <div class="about-img">
            <img src="/assets/images/about-serve.jpg" alt="Who We Serve" />
          </div>
        </div>
      </div>
    </section>
  `,
  styles: `
    :host {
      display: block;
    }

    .hero-full {
      min-height: 60vh;
      display: flex;
      align-items: center;
      justify-content: flex-start;
      padding: 0 5%;
      background: url('/assets/images/folded_clothes.jpg') center / cover no-repeat;
      color: #fff;
    }

    .hero-copy {
      max-width: 600px;
      color: #fff;
    }

    .kicker {
      font-family: 'Montserrat', sans-serif;
      font-size: 0.85rem;
      letter-spacing: 0.15em;
      text-transform: uppercase;
      margin-bottom: 16px;
      display: block;
      opacity: 0.8;
    }

    .hero-full h1 {
      font-size: clamp(3rem, 5vw, 4.5rem);
      line-height: 1.1;
      margin: 0 0 24px;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: #fff;
    }

    .lede {
      font-size: 1.1rem;
      line-height: 1.6;
      max-width: 450px;
      margin: 0 0 32px;
      opacity: 0.9;
    }

    .vision {
      padding: 80px 0 60px;
      background: var(--panel);
    }

    .serve {
      padding: 80px 0;
      background: var(--paper);
    }

    .wrap {
      max-width: 1180px;
      margin: 0 auto;
      padding: 0 32px;
    }

    .about-block {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 60px;
      align-items: center;
      margin-bottom: 60px;
    }

    .about-block.reverse {
      direction: rtl;
    }
    .about-block.reverse > * {
      direction: ltr;
    }

    .about-img img {
      width: 100%;
      height: 100%;
      min-height: 400px;
      object-fit: cover;
      border-radius: 8px;
      box-shadow: 0 10px 30px rgba(0,0,0,0.06);
    }

    .vision h2,
    .serve h2 {
      font-size: 2.2rem;
      margin: 0 0 24px;
      font-family: 'Cormorant Garamond', Georgia, serif;
    }

    .about-text > p,
    .intro,
    .focus-copy {
      font-size: 1.05rem;
      margin: 0 0 24px;
      max-width: none;
      line-height: 1.65;
      color: var(--ink);
    }

    .quote-card {
      background: #e3dec9;
      padding: 40px;
      border-radius: 4px;
      margin-bottom: 32px;
    }

    .quote-card blockquote {
      margin: 0;
      padding: 0;
      border: 0;
      quotes: none;
      font-family: 'Inter', sans-serif;
      font-style: italic;
      font-size: 1.25rem;
      line-height: 1.5;
      color: var(--ink);
      text-align: center;
      max-width: none;
    }

    .stats {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      gap: 30px;
      text-align: center;
      border-top: 1px solid var(--line);
      padding-top: 40px;
      max-width: 1000px;
      margin: 0 auto;
    }

    .stat h4 {
      font-size: 1.1rem;
      margin: 0 0 4px;
      text-transform: none;
      letter-spacing: 0.02em;
    }

    .stat span {
      font-size: 0.8rem;
      letter-spacing: 0.1em;
      text-transform: uppercase;
      color: var(--muted);
    }

    .stat span {
      font-size: 0.8rem;
      letter-spacing: 0.1em;
      text-transform: uppercase;
      color: var(--muted);
    }

    .intro {
      margin-bottom: 48px;
    }

    .audience-list {
      list-style: none;
      padding: 0;
      margin: 0;
      display: flex;
      flex-direction: column;
      gap: 40px;
    }

    .audience-list li {
      display: flex;
      gap: 24px;
      align-items: flex-start;
    }

    .icon {
      flex: none;
      color: var(--ink);
      display: block;
    }

    .audience-list h3 {
      font-size: 1.2rem;
      margin: 0 0 8px;
      text-transform: none;
      letter-spacing: 0.02em;
    }

    .audience-list p {
      margin: 0;
      color: var(--muted);
      max-width: none;
      line-height: 1.6;
    }

    .cta-row {
      margin-top: 50px;
    }

    .btn {
      display: inline-flex;
      align-items: center;
      font-family: 'Montserrat', sans-serif;
      font-size: 0.85rem;
      font-weight: 700;
      letter-spacing: 0.06em;
      text-transform: uppercase;
      padding: 14px 24px;
      border-radius: 2px;
      border: none;
      text-decoration: none;
      cursor: pointer;
    }

    .btn-primary {
      background: var(--forest);
      color: #fff;
    }

    .btn-primary:hover {
      background: var(--gold-deep);
    }

    @media (max-width: 960px) {
      .about-block { grid-template-columns: 1fr; gap: 40px; }
      .about-block.reverse { direction: ltr; }
      .hero-full {
        min-height: 52vh;
        padding: 40px 5%;
      }
      .wrap {
        padding: 0 18px;
      }

      .quote-card {
        padding: 28px 22px;
      }

      .audience-list li {
        gap: 16px;
      }
    }
  `,
})
export class AboutPageComponent {
  readonly stats = [
    { value: 'B2B', label: 'Focused' },
    { value: '7', label: 'Product Categories' },
    { value: 'Global', label: 'Manufacturing' },
    { value: 'Your Brand', label: 'Our Production' },
  ];
}
