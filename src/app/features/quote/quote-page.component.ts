import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { CatalogService } from '../../core/services/catalog.service';
import { formatGbp } from '../../core/utils/price';

type SpecRow = { key: string; label: string; value: string };

@Component({
  selector: 'tg-quote-page',
  standalone: true,
  imports: [FormsModule],
  template: `
    <section class="section-tight">
      <div class="wrap two-col">
        <div>
          <h2>Start Your Range</h2>
          <p class="intro">
            Send your specification through and we'll return pricing based on quantity, garment and
            finish. If you arrived from the Custom Designer, your configuration is already filled in
            below.
          </p>

          @if (specRows().length) {
            <div class="summary-box">
              <dl>
                @for (row of specRows(); track row.key) {
                  <dt>{{ row.label }}</dt>
                  <dd>{{ row.value }}</dd>
                }
              </dl>
            </div>
          }

          <div class="card-plain contact-card">
            <h4>Direct contact</h4>
            <p>hello&#64;threadgaff.com</p>
            <p class="last">+92 000 000 0000 — Lahore, Pakistan</p>
          </div>
        </div>

        <div>
          <form class="card-plain" (ngSubmit)="submit()">
            <div class="form-grid">
              <div class="field">
                <label for="fName">Full name</label>
                <input id="fName" name="name" type="text" required [(ngModel)]="name" />
              </div>
              <div class="field">
                <label for="fCompany">Company</label>
                <input id="fCompany" name="company" type="text" [(ngModel)]="company" />
              </div>
              <div class="field">
                <label for="fEmail">Email</label>
                <input id="fEmail" name="email" type="email" required [(ngModel)]="email" />
              </div>
              <div class="field">
                <label for="fPhone">Phone</label>
                <input id="fPhone" name="phone" type="tel" [(ngModel)]="phone" />
              </div>
              <div class="field full">
                <label for="fSegment">Order type</label>
                <select id="fSegment" name="segment" [(ngModel)]="segment">
                  <option value="own-label">Own-label range</option>
                  <option value="wholesale">Bulk &amp; wholesale</option>
                  <option value="merchandise">Branded merchandise</option>
                  <option value="not-sure">Not sure yet</option>
                </select>
              </div>
              <div class="field full">
                <label for="fMessage">Your specification / message</label>
                <textarea
                  id="fMessage"
                  name="message"
                  placeholder="Garment, quantity, colours, timeline..."
                  [(ngModel)]="message"
                ></textarea>
              </div>
              <div class="field full">
                <label for="fSample">Sample image (optional)</label>
                <input
                  id="fSample"
                  name="sample"
                  type="file"
                  accept="image/*"
                  (change)="onSample($event)"
                />
                <p class="sample-hint">
                  A sketch, logo or reference photo. It is sent with this enquiry.
                </p>
                @if (samplePreview()) {
                  <div class="sample-preview">
                    <img [src]="samplePreview()!" alt="Sample preview" />
                    <button type="button" (click)="clearSample()">Remove</button>
                  </div>
                }
              </div>
            </div>

            <button class="btn btn-primary btn-block" type="submit" [disabled]="submitting()">
              Send Enquiry
            </button>

            @if (confirm()) {
              <p class="confirm">{{ confirm() }}</p>
            }
          </form>
        </div>
      </div>
    </section>
  `,
  styles: `
    :host {
      display: block;
    }

    .section-tight {
      padding: 56px 0;
    }

    .wrap {
      max-width: 1180px;
      margin: 0 auto;
      padding: 0 32px;
      width: 100%;
    }

    .two-col {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 48px;
      align-items: start;
    }

    h2 {
      margin: 0;
      font-size: clamp(1.4rem, 2.4vw, 2rem);
      text-transform: uppercase;
      letter-spacing: 0.06em;
    }

    .intro {
      margin: 14px 0 0;
      max-width: none;
      line-height: 1.65;
      color: var(--ink);
    }

    .card-plain {
      border: 1px solid var(--line);
      background: var(--panel);
      padding: 28px;
    }

    .contact-card {
      margin-top: 28px;
    }

    .contact-card h4 {
      margin: 0 0 14px;
      font-size: 0.95rem;
      text-transform: uppercase;
      letter-spacing: 0.06em;
    }

    .contact-card p {
      margin: 0 0 8px;
      color: var(--muted);
      max-width: none;
    }

    .contact-card p.last {
      margin-bottom: 0;
    }

    .summary-box {
      background: var(--forest-tint);
      border: 1px solid var(--line);
      padding: 22px;
      margin-top: 24px;
    }

    .summary-box dl {
      margin: 0;
      display: grid;
      grid-template-columns: auto 1fr;
      gap: 6px 14px;
      font-size: 0.88rem;
    }

    .summary-box dt {
      color: var(--muted);
    }

    .summary-box dd {
      margin: 0;
      font-weight: 600;
      text-align: right;
    }

    .form-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 18px;
    }

    .field {
      display: flex;
      flex-direction: column;
      gap: 7px;
    }

    .field.full {
      grid-column: 1 / -1;
    }

    .field label {
      font-size: 0.86rem;
      font-weight: 600;
    }

    .field input,
    .field select,
    .field textarea {
      padding: 12px 13px;
      border: 1px solid var(--line);
      background: var(--panel);
      font-family: 'IBM Plex Sans', sans-serif;
      font-size: 0.95rem;
      color: var(--ink);
      border-radius: var(--radius-s);
      width: 100%;
    }

    .field textarea {
      resize: vertical;
      min-height: 110px;
    }

    .field input[type='file'] {
      padding: 10px;
      background: #fff;
    }

    .sample-hint {
      margin: 0;
      font-size: 0.82rem;
      color: var(--muted);
      max-width: none;
    }

    .sample-preview {
      display: flex;
      align-items: flex-end;
      gap: 12px;
    }

    .sample-preview img {
      width: 96px;
      height: 120px;
      object-fit: contain;
      background: #ece8de;
      border: 1px solid var(--line);
    }

    .sample-preview button {
      border: 1px solid var(--line);
      background: #fff;
      padding: 8px 12px;
      font: inherit;
      font-size: 0.82rem;
      cursor: pointer;
      color: var(--ink);
    }

    .btn-block {
      width: 100%;
      justify-content: center;
      margin-top: 18px;
    }

    .confirm {
      display: block;
      margin: 14px 0 0;
      color: var(--gold-deep);
      font-size: 0.9rem;
      max-width: none;
    }

    @media (max-width: 960px) {
      .two-col {
        grid-template-columns: 1fr;
      }

      .wrap {
        padding: 0 20px;
      }
    }

    @media (max-width: 600px) {
      .form-grid {
        grid-template-columns: 1fr;
      }
    }
  `,
})
export class QuotePageComponent {
  private readonly route = inject(ActivatedRoute);
  private readonly catalog = inject(CatalogService);

  readonly specRows = signal<SpecRow[]>([]);
  readonly samplePreview = signal<string | null>(null);
  readonly submitting = signal(false);
  readonly confirm = signal('');

  name = '';
  company = '';
  email = '';
  phone = '';
  segment = 'own-label';
  message = '';
  private sampleName = '';
  private messageFromSpec = '';

  constructor() {
    const q = this.route.snapshot.queryParamMap;
    const fields: Array<[string, string]> = [
      ['garment', 'Garment'],
      ['collar', 'Neckline / collar'],
      ['style', 'Style / Neckline'],
      ['sleeve', 'Sleeve'],
      ['fabric', 'Fabric'],
      ['gsm', 'GSM'],
      ['color', 'Colour'],
      ['decoration', 'Decoration'],
      ['placement', 'Placement'],
      ['privateLabel', 'Private label'],
      ['qty', 'Quantity'],
      ['unitPrice', 'Unit price'],
      ['estTotal', 'Estimated total'],
      ['notes', 'Buyer notes'],
      ['sample', 'Sample request'],
    ];

    const rows: SpecRow[] = [];
    const lines: string[] = [];
    for (const [key, label] of fields) {
      const raw = q.get(key);
      if (!raw) continue;
      let value = raw;
      if (key === 'qty') value = `${raw} units`;
      if (key === 'unitPrice' || key === 'estTotal') {
        const n = Number(raw);
        value = Number.isFinite(n) && n > 0 ? formatGbp(n) : raw;
      }
      rows.push({ key, label, value });
      lines.push(`${label}: ${value}`);
    }

    const size = q.get('size');
    const brand = q.get('brand');
    if (size) lines.push(`Sizes: ${size}`);
    if (brand) lines.push(`Brand: ${brand}`);
    if (q.get('sample') === '1') lines.push('Sample request: Yes');

    this.specRows.set(rows);
    if (lines.length) {
      this.messageFromSpec = lines.join('\n');
      this.message = this.messageFromSpec;
    }

    const routeParam = q.get('route');
    const allowed = ['own-label', 'wholesale', 'merchandise', 'not-sure'];
    if (routeParam && allowed.includes(routeParam)) {
      this.segment = routeParam;
    }

    try {
      const savedLogo = sessionStorage.getItem('tg_quote_logo');
      const savedLogoName = sessionStorage.getItem('tg_quote_logo_name');
      if (savedLogo) {
        this.samplePreview.set(savedLogo);
        this.sampleName = savedLogoName || 'logo.png';
        // Only consume it once
        sessionStorage.removeItem('tg_quote_logo');
        sessionStorage.removeItem('tg_quote_logo_name');
      }
    } catch {
      // ignore
    }
  }

  onSample(event: Event) {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) {
      this.clearSample();
      return;
    }
    this.compressSample(file)
      .then((res) => {
        this.samplePreview.set(res.src);
        this.sampleName = res.name;
      })
      .catch(() => {
        this.clearSample();
        input.value = '';
        alert('That image could not be read. Try a JPG or PNG.');
      });
  }

  clearSample() {
    this.samplePreview.set(null);
    this.sampleName = '';
  }

  submit() {
    if (!this.name.trim() || !this.email.trim()) {
      this.confirm.set('Please enter your name and email.');
      return;
    }
    this.submitting.set(true);
    this.confirm.set('');
    this.catalog
      .createEnquiry({
        name: this.name.trim(),
        company: this.company.trim() || undefined,
        email: this.email.trim(),
        phone: this.phone.trim() || undefined,
        segment: this.segment || undefined,
        message: this.message.trim() || undefined,
        sampleName: this.sampleName || undefined,
        sampleDataUrl: this.samplePreview() || undefined,
      })
      .subscribe({
        next: (res) => {
          this.confirm.set(
            `Enquiry ${res.ref} received. Our team will follow up shortly.`,
          );
          this.name = '';
          this.company = '';
          this.email = '';
          this.phone = '';
          this.segment = 'own-label';
          this.message = this.messageFromSpec;
          this.clearSample();
          this.submitting.set(false);
        },
        error: (err) => {
          const msg = err?.error?.message;
          this.confirm.set(
            Array.isArray(msg)
              ? msg.join(', ')
              : msg || 'Could not send enquiry. Check the API is running.',
          );
          this.submitting.set(false);
        },
      });
  }

  private compressSample(file: File): Promise<{ src: string; name: string }> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(new Error('Could not read image'));
      reader.onload = () => {
        const img = new Image();
        img.onload = () => {
          const maxPx = 1200;
          const scale = Math.min(1, maxPx / Math.max(img.width, img.height));
          const canvas = document.createElement('canvas');
          canvas.width = Math.max(1, Math.round(img.width * scale));
          canvas.height = Math.max(1, Math.round(img.height * scale));
          const ctx = canvas.getContext('2d');
          if (!ctx) {
            reject(new Error('Could not read image'));
            return;
          }
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
          resolve({ src: canvas.toDataURL('image/jpeg', 0.82), name: file.name });
        };
        img.onerror = () => reject(new Error('Could not read image'));
        img.src = String(reader.result || '');
      };
      reader.readAsDataURL(file);
    });
  }
}
