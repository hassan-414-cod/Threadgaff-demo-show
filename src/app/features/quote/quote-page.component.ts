import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { CatalogService } from '../../core/services/catalog.service';
import { DesignUploadStore } from '../../core/services/design-upload.store';
import { formatGbp } from '../../core/utils/price';
import { SiteSettingsService } from '../../core/services/site-settings.service';
import {
  Attachment,
  AttachmentRole,
  MAX_FILE_CHARS,
  compressImageFile,
  fileExt,
  fileToDataUrl,
  fitAttachments,
  isImageAttachment,
  packAttachments,
  roleLabel,
  sizeLabel,
} from '../../core/utils/attachments';

type AttachmentItem = Attachment & { tooLarge: boolean };

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
                <label for="fSample">Add a file (optional)</label>
                <input
                  id="fSample"
                  name="sample"
                  type="file"
                  accept="image/*"
                  (change)="onSample($event)"
                />
                <p class="sample-hint">
                  A sketch, logo or reference photo. Your design file and logo from the designer are
                  attached below. Everything is sent with this enquiry and saved with it.
                </p>
                @if (attachments().length) {
                  <ul class="att-list" aria-label="Files sent with this enquiry">
                    @for (a of attachments(); track $index) {
                      <li class="att" [class.warn]="a.tooLarge">
                        @if (isImage(a)) {
                          <img [src]="a.dataUrl" alt="" />
                        } @else {
                          <span class="att-ext">{{ ext(a.name) }}</span>
                        }
                        <span class="att-text">
                          <strong>{{ a.name }}</strong>
                          <small>
                            {{ role(a.role) }} · {{ size(a.size) }}
                            @if (a.tooLarge) {
                              · too large to attach. Please email it to us instead.
                            }
                          </small>
                        </span>
                        <button type="button" (click)="removeAttachment($index)">Remove</button>
                      </li>
                    }
                  </ul>
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

    .sample-file {
      font-size: 0.85rem;
      font-weight: 600;
      word-break: break-all;
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

    .att-list { list-style: none; margin: 10px 0 0; padding: 0; display: flex; flex-direction: column; gap: 8px; }
    .att { display: flex; align-items: center; gap: 10px; padding: 8px 10px; border: 1px solid var(--line); border-radius: 8px; background: #fff; }
    .att.warn { border-color: #e1b9b2; background: #fbf1ef; }
    .att img { width: 44px; height: 44px; object-fit: contain; border-radius: 6px; background: #f4f2ec; flex: none; }
    .att-ext { width: 44px; height: 44px; border-radius: 6px; background: var(--forest-tint); color: var(--forest); display: inline-flex; align-items: center; justify-content: center; font-size: 0.7rem; font-weight: 800; flex: none; }
    .att-text { flex: 1; min-width: 0; display: flex; flex-direction: column; }
    .att-text strong { font-size: 0.85rem; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .att-text small { font-size: 0.72rem; color: var(--muted); }
    .att button { border: 0; background: none; text-decoration: underline; cursor: pointer; font: inherit; font-size: 0.78rem; color: var(--muted); }

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
  private readonly designUpload = inject(DesignUploadStore);

  readonly specRows = signal<SpecRow[]>([]);
  readonly attachments = signal<AttachmentItem[]>([]);
  private readonly site = inject(SiteSettingsService);
  readonly submitting = signal(false);
  readonly confirm = signal('');

  name = '';
  company = '';
  email = '';
  phone = '';
  segment = 'own-label';
  message = '';
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
      ['plFile', 'Design file'],
      ['plMaterial', 'Private label material'],
      ['plNotes', 'Private label notes'],
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

    // The designer's uploads: the logo (saved in the browser) and the Private Label design file.
    let legacyLogo: { dataUrl: string; name: string } | null = null;
    try {
      const savedLogo = sessionStorage.getItem('tg_quote_logo');
      if (savedLogo) {
        legacyLogo = { dataUrl: savedLogo, name: sessionStorage.getItem('tg_quote_logo_name') || 'logo.png' };
        sessionStorage.removeItem('tg_quote_logo');
        sessionStorage.removeItem('tg_quote_logo_name');
      }
    } catch {
      // ignore
    }
    if (q.get('logo') || legacyLogo) void this.loadLogo(legacyLogo);
    // Only pick up the saved design file when arriving from the designer with one attached.
    if (q.get('plFile')) void this.loadDesignFile();
  }

  isImage(a: Attachment): boolean {
    return isImageAttachment(a);
  }
  ext(name: string): string {
    return fileExt(name);
  }
  role(r: AttachmentRole): string {
    return roleLabel(r);
  }
  size(n: number): string {
    return sizeLabel(n);
  }

  /** Adds (or replaces) the file of that kind. Pictures are shrunk so they fit in the enquiry. */
  private async addAttachment(role: AttachmentRole, file: File) {
    let dataUrl: string;
    let type = file.type;
    let name = file.name;
    if (file.type.startsWith('image/')) {
      const c = await compressImageFile(file);
      dataUrl = c.dataUrl;
      type = c.type;
      name = c.name;
    } else {
      dataUrl = await fileToDataUrl(file);
    }
    const item: AttachmentItem = {
      role,
      name,
      type: type || 'application/octet-stream',
      size: file.type.startsWith('image/') ? Math.floor(dataUrl.length * 0.75) : file.size,
      dataUrl,
      tooLarge: dataUrl.length > MAX_FILE_CHARS,
    };
    this.attachments.update((list) => [...list.filter((a) => a.role !== role), item]);
  }

  /** The logo from the designer's Branding step. */
  private async loadLogo(legacy: { dataUrl: string; name: string } | null) {
    try {
      const file = await this.designUpload.restoreLogo();
      if (file) return await this.addAttachment('logo', file);
    } catch {
      /* fall through to the copy handed over in session storage */
    }
    if (legacy) {
      const type = /^data:([^;,]+)/.exec(legacy.dataUrl)?.[1] || 'image/png';
      this.attachments.update((list) => [
        ...list.filter((a) => a.role !== 'logo'),
        { role: 'logo', name: legacy.name, type, size: Math.floor(legacy.dataUrl.length * 0.75), dataUrl: legacy.dataUrl, tooLarge: legacy.dataUrl.length > MAX_FILE_CHARS },
      ]);
    }
  }

  /** The design file from the designer's Private Label step. */
  private async loadDesignFile() {
    const file = await this.designUpload.restore();
    if (file) await this.addAttachment('design', file).catch(() => undefined);
  }

  onSample(event: Event) {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    this.addAttachment('sample', file).catch(() => {
      alert('That file could not be read. Try a JPG, PNG or PDF.');
    });
  }

  removeAttachment(index: number) {
    const gone = this.attachments()[index];
    this.attachments.update((list) => list.filter((_, i) => i !== index));
    // Removing a file here also removes it from the saved designer draft.
    if (gone?.role === 'design') this.designUpload.set(null);
    if (gone?.role === 'logo') this.designUpload.setLogo(null);
  }

  submit() {
    if (!this.name.trim() || !this.email.trim()) {
      this.confirm.set('Please enter your name and email.');
      return;
    }
    const all = this.attachments();
    const { send, skipped } = fitAttachments(all.filter((a) => !a.tooLarge));
    const notSent: Attachment[] = [...all.filter((a) => a.tooLarge), ...skipped];
    const packed = packAttachments(send);
    const base = {
      name: this.name.trim(),
      company: this.company.trim() || undefined,
      email: this.email.trim(),
      phone: this.phone.trim() || undefined,
      segment: this.segment || undefined,
      message: this.message.trim() || undefined,
    };
    this.submitting.set(true);
    this.confirm.set('');

    const finish = (ref: string, missing: Attachment[]) => {
      const mail = this.site.settings().contactEmail;
      this.confirm.set(
        `Enquiry ${ref} received. Our team will follow up shortly.` +
          (missing.length
            ? ` These files could not be attached: ${missing.map((a) => a.name).join(', ')}. Please email them${mail ? ' to ' + mail : ''} and mention ${ref}.`
            : send.length
              ? ` Your ${send.length === 1 ? 'file is' : send.length + ' files are'} saved with it.`
              : ''),
      );
      this.name = '';
      this.company = '';
      this.email = '';
      this.phone = '';
      this.segment = 'own-label';
      this.message = this.messageFromSpec;
      this.attachments.set([]);
      // The enquiry now holds the files, so the saved drafts are no longer needed.
      if (!missing.length) this.designUpload.clear();
      this.submitting.set(false);
    };
    const fail = (err: { error?: { message?: string | string[] } }) => {
      const msg = err?.error?.message;
      this.confirm.set(
        Array.isArray(msg) ? msg.join(', ') : msg || 'Could not send enquiry. Check your connection and try again.',
      );
      this.submitting.set(false);
    };

    this.catalog
      .createEnquiry({ ...base, sampleName: packed?.sampleName, sampleDataUrl: packed?.sampleDataUrl })
      .subscribe({
        next: (res) => finish(res.ref, notSent),
        error: (err) => {
          // The server refused the attachments (too big for it): still send the enquiry itself.
          if (packed && (err?.status === 413 || err?.status === 500)) {
            this.catalog.createEnquiry(base).subscribe({
              next: (res) => finish(res.ref, [...notSent, ...send]),
              error: fail,
            });
            return;
          }
          fail(err);
        },
      });
  }
}
