import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';

interface ProcessStep {
  num: string;
  /** Short name under the circle in the overview strip. */
  short: string;
  title: string;
  time: string;
  body: string;
  /** Extra line shown under the paragraph. */
  note?: string;
  /** Photo for this step, used for both the circle and the row. */
  image: string;
  alt: string;
}

@Component({
  selector: 'tg-how-we-work-page',
  standalone: true,
  imports: [RouterLink],
  template: `
    <section class="wl" aria-labelledby="wlTitle">
      <header class="wl-head">
        <h1 id="wlTitle">The White-Label Model</h1>
        <p>A simple, transparent process from concept to delivery.</p>
      </header>

      <ol class="wl-strip" aria-label="Process overview">
        @for (s of steps; track s.num; let i = $index; let last = $last) {
          <li class="wl-stop" [class.odd]="i % 2 === 0">
            <div class="wl-circle">
              <div class="frame"><img [src]="s.image" [alt]="s.alt" loading="lazy" (error)="hideImage($event)" /></div>
              <span class="wl-badge" aria-hidden="true">{{ s.num }}</span>
            </div>
            <strong class="wl-name">{{ s.short }}</strong>
            <span class="wl-pill">
              <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>
              {{ s.time }}
            </span>
            @if (!last) {
              <span class="wl-arrow" aria-hidden="true">→</span>
            }
          </li>
        }
      </ol>

      <div class="wl-rows">
        @for (s of steps; track s.num; let i = $index) {
          <article class="wl-row" [class.odd]="i % 2 === 0">
            <div class="wl-photo">
              <div class="frame"><img [src]="s.image" [alt]="s.alt" loading="lazy" (error)="hideImage($event)" /></div>
              <span class="wl-badge" aria-hidden="true">{{ s.num }}</span>
            </div>
            <div class="wl-copy">
              <h3>{{ s.title }}</h3>
              <p>{{ s.body }}</p>
              @if (s.note) {
                <p class="wl-note">{{ s.note }}</p>
              }
            </div>
          </article>
        }
      </div>
    </section>

    <section class="policies">
      <div class="wrap two-col">
        <div class="policy-card">
          <h3>Sampling &amp; Shipping Terms</h3>
          <p><strong>Sampling cost &amp; timeline:</strong> [TBC] per sample. Typically [TBC] days from spec approval. Sample costs are [TBC] credited against the final bulk production invoice.</p>
          <p><strong>Payment:</strong> [TBC] deposit required to commence production, balance on shipment.</p>
          <p><strong>Shipping:</strong> We offer both FOB and DDP terms depending on order volume and destination. [TBC details]</p>
        </div>
        <div>
          <h3 class="section-h">Minimums &amp; Lead Times</h3>
          <p class="note muted">
            Note: All values below are placeholders and will be confirmed prior to final order.
          </p>
          <table class="moq-table">
            <thead>
              <tr>
                <th>Category</th>
                <th>MOQ</th>
                <th>Lead Time</th>
              </tr>
            </thead>
            <tbody>
              @for (row of moqRows; track row.category) {
                <tr>
                  <td>{{ row.category }}</td>
                  <td>{{ row.moq }}</td>
                  <td>{{ row.lead }}</td>
                </tr>
              }
            </tbody>
          </table>
        </div>
      </div>
    </section>

    <section class="cta-band">
      <div class="cta-inner">
        <h2>Ready to start your range?</h2>
        <p>Configure a product directly or send us a custom enquiry.</p>
        <a routerLink="/quote" class="cta-btn">Start your range →</a>
      </div>
    </section>
  `,
  styles: `
    :host {
      display: block;
      --sage: #7f8c72;
      --taupe: #b9a291;
      --pill-beige: #efe8dc;
      --pill-sage: #e1e7de;
    }

    .wl {
      max-width: 1100px;
      margin: 0 auto;
      padding: 64px 32px 72px;
      background: var(--panel);
    }

    .wl-head { text-align: center; margin-bottom: 44px; }
    .wl-head h1 {
      font-family: 'Cormorant Garamond', Georgia, serif;
      font-size: clamp(2.2rem, 4.6vw, 3.4rem);
      font-weight: 700;
      letter-spacing: -0.01em;
      text-transform: none;
      line-height: 1.1;
      margin: 0 0 14px;
      color: var(--ink);
    }
    .wl-head p { margin: 0 auto; max-width: none; font-size: 1.15rem; color: var(--muted); }

    /* Shared: soft tint shows while a photo is missing or loading. */
    .frame {
      width: 100%;
      height: 100%;
      overflow: hidden;
      background: linear-gradient(135deg, #ece7dc, #dcd6c8);
    }
    .frame img { width: 100%; height: 100%; object-fit: cover; display: block; }

    .wl-badge {
      position: absolute;
      z-index: 2;
      width: 44px;
      height: 44px;
      border-radius: 50%;
      background: var(--sage);
      color: #fff;
      border: 3px solid #fff;
      font-family: 'Montserrat', sans-serif;
      font-weight: 700;
      font-size: 0.95rem;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.12);
    }
    .odd .wl-badge { background: var(--sage); }
    li:not(.odd) .wl-badge, .wl-row:not(.odd) .wl-badge { background: var(--taupe); }

    /* ── Overview strip ── */
    .wl-strip {
      --c: clamp(104px, 15vw, 172px);
      list-style: none;
      margin: 0 0 40px;
      padding: 0 0 36px;
      display: grid;
      grid-template-columns: repeat(5, minmax(0, 1fr));
      gap: 18px;
      border-bottom: 1px solid #ebe6db;
    }
    .wl-stop {
      position: relative;
      display: flex;
      flex-direction: column;
      align-items: center;
      text-align: center;
      gap: 14px;
    }
    .wl-circle { position: relative; width: var(--c); height: var(--c); margin-top: 14px; }
    .wl-circle .frame { border-radius: 50%; }
    .wl-circle .wl-badge { top: -14px; left: 50%; transform: translateX(-50%); }
    .wl-name { font-size: 1.02rem; font-weight: 700; color: var(--ink); line-height: 1.25; }
    .wl-pill {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      padding: 9px 18px;
      border-radius: 999px;
      background: var(--pill-beige);
      color: var(--ink);
      font-size: 0.95rem;
      white-space: nowrap;
    }
    li:not(.odd) .wl-pill { background: var(--pill-sage); }
    .wl-arrow {
      position: absolute;
      top: calc(var(--c) / 2 + 2px);
      right: -17px;
      width: 16px;
      text-align: center;
      font-size: 1.25rem;
      color: var(--ink);
      line-height: 1;
    }

    /* ── Detail rows ── */
    .wl-row {
      display: grid;
      grid-template-columns: minmax(240px, 340px) 1fr;
      gap: 44px;
      align-items: center;
      padding: 26px 0;
      border-bottom: 1px solid #ebe6db;
    }
    .wl-row:last-child { border-bottom: 0; padding-bottom: 0; }
    .wl-photo { position: relative; height: 190px; }
    .wl-photo .frame { border-radius: 18px; }
    .wl-photo .wl-badge { top: 14px; left: -16px; }
    .wl-copy h3 {
      font-family: 'Inter', system-ui, sans-serif;
      font-size: 1.55rem;
      font-weight: 700;
      letter-spacing: -0.01em;
      text-transform: none;
      margin: 0 0 12px;
      color: var(--ink);
    }
    .wl-copy p { margin: 0; max-width: 62ch; font-size: 1.02rem; line-height: 1.65; color: var(--muted); }
    .wl-copy .wl-note {
      margin-top: 12px;
      padding: 10px 14px;
      border-left: 3px solid var(--sage);
      background: var(--pill-sage);
      border-radius: 0 8px 8px 0;
      font-size: 0.92rem;
      color: var(--ink);
    }

    /* ── Terms + MOQ ── */
    .policies { padding: 72px 0; background: var(--paper); }
    .wrap { max-width: 1100px; margin: 0 auto; padding: 0 32px; }
    .two-col { display: grid; grid-template-columns: 1fr 1.2fr; gap: 48px; align-items: start; }
    .section-h { font-size: 1.5rem; margin: 0 0 12px; }
    .note { margin: 0 0 20px; max-width: none; }
    .muted { color: var(--muted); }
    .moq-table {
      width: 100%;
      border-collapse: collapse;
      background: #fff;
      box-shadow: 0 5px 15px rgba(0, 0, 0, 0.05);
      border-radius: 4px;
      overflow: hidden;
    }
    .moq-table thead { background: var(--ink); color: #fff; text-align: left; }
    .moq-table th, .moq-table td { padding: 14px 16px; }
    .moq-table tbody tr { border-bottom: 1px solid var(--line); }
    .moq-table tbody tr:last-child { border-bottom: none; }
    .policy-card {
      background: #fff;
      padding: 28px;
      border-radius: 8px;
      box-shadow: 0 5px 15px rgba(0, 0, 0, 0.05);
    }
    .policy-card h3 { font-size: 1.2rem; margin: 0 0 16px; text-transform: none; letter-spacing: 0.02em; }
    .policy-card p { margin: 0 0 8px; max-width: none; color: var(--ink); }
    .policy-card p:last-child { margin-bottom: 0; }

    .cta-band { padding: 80px 0; background: var(--forest); color: #fff; text-align: center; }
    .cta-inner { max-width: 600px; margin: 0 auto; padding: 0 32px; }
    .cta-band h2 { font-size: 2rem; margin: 0 0 16px; color: #fff; }
    .cta-band p { font-size: 1.1rem; margin: 0 0 32px; opacity: 0.9; max-width: none; }
    .cta-btn {
      display: inline-flex;
      align-items: center;
      background: #fff;
      color: var(--forest);
      border: none;
      font-weight: 700;
      font-family: 'Montserrat', sans-serif;
      font-size: 0.85rem;
      letter-spacing: 0.06em;
      text-transform: uppercase;
      padding: 14px 24px;
      border-radius: 2px;
    }
    .cta-btn:hover { background: var(--paper); }

    @media (max-width: 860px) {
      .wl { padding: 44px 18px 56px; }
      .wl-strip { grid-template-columns: repeat(3, minmax(0, 1fr)); row-gap: 28px; --c: clamp(96px, 26vw, 150px); }
      .wl-arrow { display: none; }
      .wl-row { grid-template-columns: 1fr; gap: 20px; padding: 22px 0; }
      .wl-photo { height: auto; aspect-ratio: 16 / 9; max-width: 520px; }
      .wl-photo .wl-badge { left: 10px; top: 10px; }
      .two-col { grid-template-columns: 1fr; gap: 32px; }
      .wrap, .cta-inner { padding: 0 18px; }
    }
  `,
})
export class HowWeWorkPageComponent {
  readonly steps: ProcessStep[] = [
    {
      num: '01',
      short: 'Design & Enquiry',
      title: 'Design & Enquiry',
      time: '1–2 days',
      body:
        'Choose a base product from our range or submit your own artwork and specifications. Share your measurements, material preference, branding details, and any special notes through the configurator or enquiry form. We review the brief and prepare a digital proof for approval.',
      note:
        'Using the Private Label step in the configurator? Upload one file with your measurements and text (PDF, PNG, JPG, AI or ZIP). It becomes the basis of your digital proof.',
      image: '/assets/images/white-label-1-design.jpg',
      alt: 'Hoodie sketch with fabric swatches and a pen',
    },
    {
      num: '02',
      short: 'Sampling',
      title: 'Sampling & Approval',
      time: '5–7 days',
      body:
        'A sample is produced to your approved specification before any bulk run begins. This allows you to check the fit, finish, construction, and branding details. Bulk production starts only after the sample is approved.',
      image: '/assets/images/white-label-2-sampling.jpg',
      alt: 'A finished sample hoodie with a hangtag',
    },
    {
      num: '03',
      short: 'Bulk Production',
      title: 'Bulk Production',
      time: '7–12 days',
      body:
        'Once the sample is approved, your order moves into full production. Cutting, stitching, printing or embroidery, and finishing are completed according to the approved specification.',
      image: '/assets/images/white-label-3-production.jpg',
      alt: 'Production floor with workers cutting and stitching garments',
    },
    {
      num: '04',
      short: 'Quality Control',
      title: 'Quality Control',
      time: 'Continuous',
      body:
        'Each order is checked during production and again before packing to ensure consistency, accuracy, and overall product quality against the approved brief.',
      image: '/assets/images/white-label-4-quality.jpg',
      alt: 'Hands inspecting the neckline of a garment',
    },
    {
      num: '05',
      short: 'Shipping & Delivery',
      title: 'Shipping & Delivery',
      time: '2–4 days',
      body:
        'After final inspection, orders are packed and dispatched through logistics partners. Tracking details are shared once the shipment is booked.',
      image: '/assets/images/white-label-5-shipping.jpg',
      alt: 'Packed cartons ready for dispatch',
    },
  ];

  readonly moqRows = [
    { category: 'T-Shirts', moq: '[TBC] units', lead: '[TBC] days' },
    { category: 'Hoodies', moq: '[TBC] units', lead: '[TBC] days' },
    { category: 'Polo Shirts', moq: '[TBC] units', lead: '[TBC] days' },
    { category: 'Sets / Tracksuits', moq: '[TBC] units', lead: '[TBC] days' },
  ];

  /** If a photo is ever missing, the soft tint behind each picture shows instead of a broken icon. */
  hideImage(event: Event) {
    (event.target as HTMLImageElement).style.visibility = 'hidden';
  }
}
