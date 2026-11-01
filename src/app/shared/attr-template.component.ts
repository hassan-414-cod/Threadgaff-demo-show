import { Component, OnInit, inject, input, signal } from '@angular/core';
import { AttributeTemplatesService, TEMPLATE_ANGLES } from '../core/services/attribute-templates.service';
import { SiteSettingsService } from '../core/services/site-settings.service';

/**
 * The template of one attribute option, in the admin: a picture of the garment for each angle. The
 * Custom Designer shows them, instead of the garment's own picture for the same angle, when a
 * customer picks this option. Each picture is saved as soon as it is chosen.
 */
@Component({
  selector: 'tg-attr-template',
  standalone: true,
  template: `
    <div class="tp">
      <p class="tp-note">
        Pictures of the garment with <strong>{{ label() }}</strong>. When a customer picks it in the designer, these
        show instead of the garment's own picture for the same angle. An angle left empty keeps the garment's own.
      </p>
      <div class="tp-grid">
        @for (a of angles; track a.angle) {
          <div class="tp-slot" [class.has]="!!url(a.angle)" [class.busy]="busy()[a.angle]">
            <div class="tp-frame">
              @if (url(a.angle)) {
                <img [src]="url(a.angle)" [alt]="label() + ' · ' + a.label" />
              } @else {
                <span class="tp-empty">No picture</span>
              }
              @if (busy()[a.angle]) {
                <span class="tp-spin" role="status" aria-label="Uploading"></span>
              }
            </div>
            <div class="tp-row">
              <span class="tp-name">{{ a.label }}</span>
              <button type="button" class="tp-btn" [disabled]="busy()[a.angle]" (click)="file.click()">
                {{ url(a.angle) ? 'Replace' : 'Add' }}
              </button>
              @if (url(a.angle)) {
                <button
                  type="button"
                  class="tp-x"
                  [disabled]="busy()[a.angle]"
                  (click)="remove(a.angle)"
                  [attr.aria-label]="'Remove the ' + a.label + ' picture of ' + label()"
                >×</button>
              }
            </div>
            <input #file type="file" accept="image/*" hidden (change)="pick($event, a.angle)" />
            @if (errors()[a.angle]) {
              <span class="tp-err" role="alert">{{ errors()[a.angle] }}</span>
            }
          </div>
        }
      </div>
    </div>
  `,
  styles: `
    :host { display: block; flex: 1 1 100%; }
    .tp { margin: 6px 0 4px; padding: 12px; border-radius: 10px; background: #f7f5ef; border: 1px solid #e4e0d6; }
    .tp-note { margin: 0 0 10px; font-size: 0.74rem; color: #6b6f63; line-height: 1.5; }
    .tp-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 10px; }
    .tp-slot { display: flex; flex-direction: column; gap: 6px; min-width: 0; }
    .tp-frame {
      position: relative; aspect-ratio: 4 / 5; border-radius: 8px; overflow: hidden; background: #fff;
      border: 1px dashed #c9c5b8; display: grid; place-items: center;
    }
    .tp-slot.has .tp-frame { border-style: solid; border-color: #d4cec0; }
    .tp-frame img { width: 100%; height: 100%; object-fit: contain; display: block; }
    .tp-empty { font-size: 0.68rem; color: #9a9d93; }
    .tp-row { display: flex; flex-wrap: wrap; align-items: center; gap: 4px 6px; min-width: 0; }
    .tp-name { flex: 1 0 100%; min-width: 0; font-size: 0.72rem; font-weight: 700; }
    button { font: inherit; cursor: pointer; }
    button:disabled { cursor: not-allowed; opacity: 0.55; }
    .tp-btn {
      border: 1px solid #d4cec0; background: #fff; border-radius: 6px; padding: 3px 9px; font-size: 0.68rem; font-weight: 700;
    }
    .tp-btn:hover:not(:disabled) { border-color: #3d4b37; color: #3d4b37; }
    .tp-x { border: 0; background: none; color: #8b3a2f; font-size: 1.05rem; line-height: 1; padding: 0 3px; }
    .tp-err { color: #8b3a2f; font-size: 0.66rem; }
    .tp-spin {
      position: absolute; width: 18px; height: 18px; border-radius: 50%; border: 2px solid rgba(60, 69, 54, 0.2);
      border-top-color: #3c4536; animation: tpSpin 0.8s linear infinite;
    }
    @keyframes tpSpin { to { transform: rotate(360deg); } }
    @media (max-width: 520px) { .tp-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
  `,
})
export class AttrTemplateComponent implements OnInit {
  readonly code = input.required<string>();
  readonly label = input.required<string>();

  private readonly templates = inject(AttributeTemplatesService);
  private readonly site = inject(SiteSettingsService);

  readonly angles = TEMPLATE_ANGLES;
  readonly busy = signal<Record<string, boolean>>({});
  readonly errors = signal<Record<string, string>>({});

  ngOnInit() {
    this.site.load();
  }

  url(angle: string): string {
    return this.templates.pictureFor(this.code(), this.label(), angle);
  }

  async pick(event: Event, angle: string) {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    await this.run(angle, () => this.templates.attach(this.code(), this.label(), angle, file));
  }

  remove(angle: string) {
    void this.run(angle, () => this.templates.detach(this.code(), this.label(), angle));
  }

  private async run(angle: string, job: () => Promise<void>) {
    this.busy.update((b) => ({ ...b, [angle]: true }));
    this.errors.update((e) => ({ ...e, [angle]: '' }));
    try {
      await job();
    } catch (err) {
      const m = (err as { error?: { message?: string | string[] } })?.error?.message;
      const text =
        err instanceof Error && err.message ? err.message : Array.isArray(m) ? m.join(', ') : m || 'Could not save the picture.';
      this.errors.update((e) => ({ ...e, [angle]: text }));
    } finally {
      this.busy.update((b) => ({ ...b, [angle]: false }));
    }
  }
}
