import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'tg-how-we-work-page',
  standalone: true,
  imports: [RouterLink],
  template: `
    <section class="hero-full" aria-label="How we work">
      <div class="hero-copy">
        <span class="kicker">Our Process</span>
        <h1>How We Work</h1>
        <p class="lede">
          From a design on screen to a box at your door. Clear stages, transparent policies.
        </p>
      </div>
    </section>

    <section class="process">
      <div class="wrap">
        <h2>The White-Label Model</h2>

        <div class="process-block">
          <div class="process-img">
            <img src="/assets/images/how-we-work-1.jpg" alt="Design Process" />
          </div>
          <div class="process-text">
            @for (s of steps.slice(0, 2); track s.num) {
              <article class="step-card">
                <div class="step-num">{{ s.num }}</div>
                <div>
                  <h3>{{ s.title }}</h3>
                  <p [innerHTML]="s.body"></p>
                </div>
              </article>
            }
          </div>
        </div>

        <div class="process-block reverse">
          <div class="process-img">
            <img src="/assets/images/how-we-work-2.jpg" alt="Sampling Process" />
          </div>
          <div class="process-text">
            @for (s of steps.slice(2, 4); track s.num) {
              <article class="step-card">
                <div class="step-num">{{ s.num }}</div>
                <div>
                  <h3>{{ s.title }}</h3>
                  <p [innerHTML]="s.body"></p>
                </div>
              </article>
            }
          </div>
        </div>

        <div class="process-block">
          <div class="process-img">
            <img src="/assets/images/how-we-work-3.jpg" alt="Production Process" />
          </div>
          <div class="process-text">
            <article class="step-card">
              <div class="step-num">{{ steps[4].num }}</div>
              <div>
                <h3>{{ steps[4].title }}</h3>
                <p [innerHTML]="steps[4].body"></p>
              </div>
            </article>
            <div class="policy-card inline-policy">
              <h3>Sampling & Shipping Terms</h3>
              <p><strong>Sampling Cost & Timeline:</strong> [TBC] per sample. Typically [TBC] days from spec approval. Sample costs are [TBC] credited against the final bulk production invoice.</p>
              <p><strong>Payment:</strong> [TBC] deposit required to commence production, balance on shipment.</p>
              <p><strong>Shipping:</strong> We offer both FOB and DDP terms depending on order volume and destination. [TBC details]</p>
            </div>
          </div>
        </div>
      </div>
    </section>

    <section class="policies">
      <div class="wrap">
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
    :host { display: block; }

    .hero-full {
      min-height: 50vh;
      display: flex;
      align-items: center;
      justify-content: flex-start;
      padding: 48px 5%;
      background:
        linear-gradient(90deg, rgba(28, 32, 30, 0.55) 0%, rgba(28, 32, 30, 0.25) 55%, transparent 100%),
        url('/assets/images/hero-new.jpg') center / cover no-repeat;
      color: #fff;
    }

    .hero-copy { max-width: 600px; }

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
      font-size: clamp(2.5rem, 4vw, 4rem);
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
      margin: 0;
      opacity: 0.9;
    }

    .process {
      padding: 80px 0;
      background: var(--panel);
    }

    .narrow {
      max-width: 900px;
      margin: 0 auto;
      padding: 0 32px;
    }

    .process h2 {
      font-size: 2.5rem;
      margin: 0 0 60px;
      text-align: center;
      font-family: 'Cormorant Garamond', Georgia, serif;
    }

    .process-block {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 60px;
      align-items: center;
      margin-bottom: 80px;
    }
    
    .process-block:last-child {
      margin-bottom: 0;
    }

    .process-block.reverse {
      direction: rtl;
    }

    .process-block.reverse > * {
      direction: ltr;
    }

    .process-img img {
      width: 100%;
      height: 100%;
      min-height: 450px;
      object-fit: cover;
      border-radius: 8px;
      box-shadow: 0 10px 30px rgba(0, 0, 0, 0.06);
    }

    .process-text {
      display: flex;
      flex-direction: column;
      gap: 30px;
    }

    .step-card {
      background: #fff;
      padding: 40px;
      border-radius: 8px;
      box-shadow: 0 10px 30px rgba(0, 0, 0, 0.05);
      display: flex;
      gap: 30px;
      align-items: center;
    }

    .step-num {
      font-size: 4rem;
      font-family: 'Montserrat', sans-serif;
      font-weight: 800;
      color: #e3dec9;
      line-height: 1;
      flex: none;
    }

    .step-card h3 {
      font-size: 1.25rem;
      margin: 0 0 8px;
      text-transform: none;
      letter-spacing: 0.02em;
    }

    .step-card p {
      margin: 0;
      color: var(--muted);
      max-width: none;
      line-height: 1.6;
    }

    .step-card strong { color: var(--ink); }

    .policies {
      padding: 80px 0;
      background: var(--paper);
    }

    .wrap {
      max-width: 1180px;
      margin: 0 auto;
      padding: 0 32px;
    }

    .two-col {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 60px;
      align-items: start;
    }

    .section-h {
      font-size: 1.5rem;
      margin: 0 0 24px;
    }

    .note {
      margin: 0 0 24px;
      max-width: none;
    }

    .moq-table {
      width: 100%;
      border-collapse: collapse;
      background: #fff;
      box-shadow: 0 5px 15px rgba(0, 0, 0, 0.05);
      border-radius: 4px;
      overflow: hidden;
    }

    .moq-table thead {
      background: var(--ink);
      color: #fff;
      text-align: left;
    }

    .moq-table th,
    .moq-table td {
      padding: 16px;
    }

    .moq-table tbody tr {
      border-bottom: 1px solid var(--line);
    }

    .moq-table tbody tr:last-child {
      border-bottom: none;
    }

    .policy-card {
      background: #fff;
      padding: 32px;
      border-radius: 8px;
      box-shadow: 0 5px 15px rgba(0, 0, 0, 0.05);
      margin-bottom: 30px;
    }

    .policy-card.inline-policy {
      margin-bottom: 0;
    }

    .policy-card h3 {
      font-size: 1.2rem;
      margin: 0 0 16px;
      text-transform: none;
      letter-spacing: 0.02em;
    }

    .policy-card p {
      margin: 0 0 8px;
      max-width: none;
      color: var(--ink);
    }

    .policy-card p:last-child {
      margin-bottom: 0;
    }

    .cta-band {
      padding: 80px 0;
      background: var(--forest);
      color: #fff;
      text-align: center;
    }

    .cta-inner {
      max-width: 600px;
      margin: 0 auto;
      padding: 0 32px;
    }

    .cta-band h2 {
      font-size: 2rem;
      margin: 0 0 16px;
      color: #fff;
    }

    .cta-band p {
      font-size: 1.1rem;
      margin: 0 0 32px;
      opacity: 0.9;
      max-width: none;
    }

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

    .cta-btn:hover {
      background: var(--paper);
    }

    .muted { color: var(--muted); }

    @media (max-width: 960px) {
      .process-block { grid-template-columns: 1fr; gap: 40px; }
      .process-block.reverse { direction: ltr; }
      .step-card { flex-direction: column; align-items: flex-start; gap: 16px; }
      .step-num { font-size: 3rem; }
      .narrow, .wrap, .cta-inner { padding: 0 18px; }
    }
  `,
})
export class HowWeWorkPageComponent {
  readonly steps = [
    {
      num: '01',
      title: 'Design & Enquiry',
      body:
        'Pick a starting point from our products, or bring your own artwork. Submit your spec through the configurator or an enquiry form.<br><strong>Who:</strong> Client provides spec. Threadgaff provides digital proof. (1-2 days)',
    },
    {
      num: '02',
      title: 'Sampling & Approval',
      body:
        'A single unit is cut and finished to your spec before the full run starts. Nothing bulk-produces unapproved.<br><strong>Who:</strong> Threadgaff produces sample. Client approves physical or photo sample. (5-7 days)',
    },
    {
      num: '03',
      title: 'Bulk Production',
      body:
        'Cutting, stitching, printing or embroidery, and finishing run across our production floor to the approved spec. (7-12 days)',
    },
    {
      num: '04',
      title: 'Quality Control',
      body:
        'Every unit passes in-line and final inspection before packing. Checked against the original spec sheet. (Continuous)',
    },
    {
      num: '05',
      title: 'Shipping & Delivery',
      body:
        'Orders are packed and dispatched via our logistics partners. Tracking provided immediately. (2-4 days)',
    },
  ];

  readonly moqRows = [
    { category: 'T-Shirts', moq: '[TBC] units', lead: '[TBC] days' },
    { category: 'Hoodies', moq: '[TBC] units', lead: '[TBC] days' },
    { category: 'Polo Shirts', moq: '[TBC] units', lead: '[TBC] days' },
    { category: 'Sets / Tracksuits', moq: '[TBC] units', lead: '[TBC] days' },
  ];
}
