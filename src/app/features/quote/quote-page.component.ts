import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { CatalogService } from '../../core/services/catalog.service';
import { DesignUploadStore } from '../../core/services/design-upload.store';
import { PlacementPictureComponent } from '../../shared/placement-picture.component';
import { formatGbp } from '../../core/utils/price';
import { SiteSettingsService } from '../../core/services/site-settings.service';
import {
  Attachment,
  AttachmentRole,
  ENQUIRY_BODY_LIMIT,
  ENQUIRY_MESSAGE_MAX,
  EnquiryBase,
  EnquiryDetails,
  MAX_FILE_CHARS,
  PreparedEnquiry,
  compressImageFile,
  fileExt,
  fileToDataUrl,
  isImageAttachment,
  prepareEnquiry,
  roleLabel,
  sizeLabel,
} from '../../core/utils/attachments';

type AttachmentItem = Attachment & { tooLarge: boolean };

type SpecRow = { key: string; label: string; value: string };

@Component({
  selector: 'tg-quote-page',
  standalone: true,
  imports: [FormsModule, PlacementPictureComponent],
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
              @if (productImg()) {
                <figure class="garment-fig">
                  <img [src]="productImg()" [alt]="garmentName() || 'Your garment'" />
                  <figcaption>
                    <b>{{ garmentName() }}</b>
                    @if (colourName()) {
                      <span> · {{ colourName() }}</span>
                    }
                  </figcaption>
                </figure>
              }
              <dl>
                @for (row of specRows(); track row.key) {
                  <dt>{{ row.label }}</dt>
                  <dd>{{ row.value }}</dd>
                }
              </dl>
              @if (snapshots().length) {
                <div class="snap-block">
                  <h4>Your logo placements</h4>
                  <div class="snap-grid">
                    @for (s of snapshots(); track $index) {
                      <figure>
                        <tg-placement-picture [src]="s.dataUrl" [garment]="s.garment" [alt]="snapLabel(s)" />
                        <figcaption>{{ snapLabel(s) }}</figcaption>
                      </figure>
                    }
                  </div>
                  <p class="snap-note">These pictures are sent with your enquiry.</p>
                </div>
              }
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
                <p class="sample-hint">
                  The enquiry form takes 100 KB in all, so pictures are saved a little smaller when they are sent (your logo first).
                  Please email full-size artwork afterwards and mention your reference.
                </p>
                @if (attachments().length) {
                  <ul class="att-list" aria-label="Files sent with this enquiry">
                    @for (a of attachments(); track $index) {
                      <li class="att" [class.warn]="a.tooLarge">
                        @if (a.garment) {
                          <tg-placement-picture class="att-pic" [src]="a.dataUrl" [garment]="a.garment" />
                        } @else if (isImage(a)) {
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

    .garment-fig { margin: 0 0 14px; display: flex; align-items: center; gap: 12px; }
    .garment-fig img { width: 84px; height: 105px; object-fit: contain; background: #fff; border: 1px solid var(--line); border-radius: 6px; flex: none; }
    .garment-fig figcaption { font-size: 0.82rem; line-height: 1.4; }
    .snap-block { margin-top: 18px; padding-top: 16px; border-top: 1px solid var(--line); }
    .snap-block h4 { margin: 0 0 10px; font-size: 0.8rem; text-transform: uppercase; letter-spacing: 0.06em; }
    .snap-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(140px, 1fr)); gap: 12px; }
    .snap-grid figure { margin: 0; }
    .snap-grid tg-placement-picture { border: 1px solid var(--line); }
    .snap-grid figcaption { margin-top: 5px; font-size: 0.74rem; color: var(--muted); }
    .snap-note { margin: 10px 0 0; font-size: 0.76rem; color: var(--muted); max-width: none; }
    .att-list { list-style: none; margin: 10px 0 0; padding: 0; display: flex; flex-direction: column; gap: 8px; }
    .att { display: flex; align-items: center; gap: 10px; padding: 8px 10px; border: 1px solid var(--line); border-radius: 8px; background: #fff; }
    .att.warn { border-color: #e1b9b2; background: #fbf1ef; }
    .att-pic { width: 44px; height: 44px; flex: none; border-radius: 6px; }
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
  /** The garment picture (in the chosen colour), its name and colour: handed over by the designer and sent with the enquiry. */
  readonly productImg = signal('');
  readonly garmentName = signal('');
  readonly colourName = signal('');
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
      ['logoPlacements', 'Logo placements'],
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
    this.productImg.set(/^https?:\/\/|^\//.test(q.get('img') || '') ? (q.get('img') as string) : '');
    this.garmentName.set(q.get('garment') || '');
    this.colourName.set(q.get('color') || '');
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
    // The pictures of the logo placements fixed in the designer: one per side, sent with the enquiry.
    if (q.get('snaps')) void this.loadSnapshots();
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
      // a picture is saved smaller when it is sent; a file that cannot be made smaller must fit the form as it is
      tooLarge: file.type.startsWith('image/') ? dataUrl.length > MAX_FILE_CHARS : dataUrl.length > Math.floor(ENQUIRY_BODY_LIMIT * 0.6),
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

  /** The placement pictures saved by the designer (the garment with the logo on it, front and back). */
  private async loadSnapshots() {
    try {
      const saved = await this.designUpload.restoreSnapshots();
      const items: AttachmentItem[] = [];
      for (const s of saved) {
        const dataUrl = await fileToDataUrl(s.blob);
        items.push({
          role: 'snapshot',
          name: s.name,
          type: s.blob.type || 'image/jpeg',
          size: s.blob.size,
          dataUrl,
          garment: s.garment,
          tooLarge: dataUrl.length > MAX_FILE_CHARS,
        });
      }
      this.attachments.update((list) => [...list.filter((a) => a.role !== 'snapshot'), ...items]);
    } catch {
      /* the pictures are not there any more: the placements are still in the message */
    }
  }

  /** The placement pictures, shown with the specification so the customer sees what is being sent. */
  readonly snapshots = computed(() => this.attachments().filter((a) => a.role === 'snapshot'));

  snapLabel(a: Attachment): string {
    return a.name.replace(/\.(jpe?g|png)$/i, '').replace(/^Logo placement - /, '');
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

  /**
   * What the admin is told about the request, with everything in full: the message (the server keeps at most 5000
   * characters of it), the notes, the product and its picture, the logo (and whether it was sent smaller).
   */
  private buildDetails(fullMessage: string, sent: Attachment[]): EnquiryDetails {
    const q = this.route.snapshot.queryParamMap;
    const clip = (v: string | null, n: number) => (v ? v.slice(0, n) : undefined);
    const logo = this.attachments().find((a) => a.role === 'logo');
    const logoSent = sent.find((a) => a.role === 'logo');
    const from = logoSent?.from;
    return {
      v: 1,
      source: q.get('product') ? 'designer' : 'form',
      sentAt: new Date().toISOString(),
      product:
        this.garmentName() || this.productImg()
          ? {
              id: clip(q.get('product'), 60),
              name: clip(this.garmentName(), 120),
              colour: clip(this.colourName(), 80),
              imageUrl: clip(this.productImg(), 400),
            }
          : undefined,
      spec: this.specRows().map((r) => ({ label: r.label, value: r.value.slice(0, 600) })),
      sizes: clip(q.get('size'), 200),
      message: fullMessage.slice(0, 20000),
      notes: {
        buyer: clip(q.get('notes'), 2000),
        privateLabel: clip(q.get('plNotes'), 2000),
        privateLabelMaterial: clip(q.get('plMaterial'), 200),
        brand: clip(q.get('brand'), 60),
      },
      logoPlacements: clip(q.get('logoPlacements'), 800),
      logo: logo
        ? {
            name: logoSent?.name ?? logo.name,
            sentBytes: logoSent?.size,
            originalName: from?.name ?? logo.name,
            originalBytes: from?.size ?? logo.size,
            width: from?.width,
            height: from?.height,
            reduced: !!from,
            attached: !!logoSent,
          }
        : undefined,
    };
  }

  /**
   * Sends the enquiry. The server takes at most 100 KB for all of it, so the logo and the pictures are fitted into that
   * (the logo first, saved a little smaller when it has to be). If the server still refuses the size, it is tried once
   * more with less, and last with the text alone: the customer is always told which files did not go.
   */
  async submit() {
    if (this.submitting()) return;
    if (!this.name.trim() || !this.email.trim()) {
      this.confirm.set('Please enter your name and email.');
      return;
    }
    if (this.name.trim().length < 2) {
      this.confirm.set('Please enter your full name.');
      return;
    }
    this.submitting.set(true);
    this.confirm.set('');
    const all = this.attachments();
    const full = this.message.trim();
    const base: EnquiryBase = {
      name: this.name.trim(),
      company: this.company.trim() || undefined,
      email: this.email.trim(),
      phone: this.phone.trim() || undefined,
      segment: this.segment || undefined,
      message:
        full.length > ENQUIRY_MESSAGE_MAX
          ? full.slice(0, ENQUIRY_MESSAGE_MAX - 160).trimEnd() + '\n… (the rest is in the details sent with this enquiry)'
          : full || undefined,
    };
    const details = (sent: Attachment[]) => this.buildDetails(full, sent);
    const fits = all.filter((a) => !a.tooLarge);
    let failure = null as { status?: number; error?: { message?: string | string[] } } | null;
    try {
      for (const share of [1, 0.6, 0]) {
        const prepared = await prepareEnquiry(base, share ? fits : [], {
          limit: Math.floor(ENQUIRY_BODY_LIMIT * (share || 1)),
          details,
        });
        try {
          const res = await firstValueFrom(this.catalog.createEnquiry(prepared.payload));
          this.finish(res.ref, all, prepared);
          return;
        } catch (err) {
          failure = err as typeof failure;
          // only a refusal for size is tried again with less; anything else is reported as it is
          if (failure?.status !== 413 && failure?.status !== 500) break;
        }
      }
    } catch (err) {
      failure = err as typeof failure;
    }
    const msg = failure?.error?.message;
    this.confirm.set(
      failure?.status === 429
        ? 'Too many requests just now. Please wait a minute and press Send Enquiry again.'
        : Array.isArray(msg)
          ? msg.join(', ')
          : msg || 'Could not send enquiry. Check your connection and try again.',
    );
    this.submitting.set(false);
  }

  private finish(ref: string, all: AttachmentItem[], p: PreparedEnquiry) {
    const mail = this.site.settings().contactEmail;
    const to = mail ? ' to ' + mail : '';
    const gone = all.filter((a) => !p.sent.some((s) => s.role === a.role && (s.from?.name ?? s.name) === a.name));
    let text = `Enquiry ${ref} received. Our team will follow up shortly.`;
    if (p.sent.length) text += p.sent.length === 1 ? ' Your file is saved with it.' : ` Your ${p.sent.length} files are saved with it.`;
    if (p.reduced.length) {
      const many = p.reduced.length > 1;
      text += ` To fit the form's 100 KB limit, ${p.reduced.map((a) => a.from?.name ?? a.name).join(', ')} ${many ? 'were' : 'was'} sent as ${many ? 'smaller copies' : 'a smaller copy'}. For print, please email the original${many ? 's' : ''}${to} and mention ${ref}.`;
    }
    if (gone.length) text += ` These files could not be attached: ${gone.map((a) => a.name).join(', ')}. Please email them${to} and mention ${ref}.`;
    this.confirm.set(text);
    this.name = '';
    this.company = '';
    this.email = '';
    this.phone = '';
    this.segment = 'own-label';
    this.message = this.messageFromSpec;
    this.attachments.set([]);
    // The enquiry now holds what it could, so the saved drafts are no longer needed (unless a file still has to be emailed).
    if (!gone.length) this.designUpload.clear();
    this.submitting.set(false);
  }
}
