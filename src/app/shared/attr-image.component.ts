import { Component, OnInit, inject, input, signal } from '@angular/core';
import { AttributeImagesService } from '../core/services/attribute-images.service';
import { SiteSettingsService } from '../core/services/site-settings.service';

/**
 * A small picture button for one attribute value, used in the admin next to each option.
 * Shows the picture when there is one (click it to replace, × to take it off) and a "+" when
 * there is none. Changes are saved straight away.
 */
@Component({
  selector: 'tg-attr-image',
  standalone: true,
  template: `
    <span class="ai" [class.busy]="busy()">
      @if (url()) {
        <button type="button" class="ai-thumb" (click)="file.click()" [disabled]="busy()" [title]="'Replace the picture for ' + label()">
          <img [src]="url()" [alt]="label()" />
        </button>
        <button type="button" class="ai-x" (click)="remove()" [disabled]="busy()" [attr.aria-label]="'Remove the picture of ' + label()" title="Remove picture">×</button>
      } @else {
        <button type="button" class="ai-add" (click)="file.click()" [disabled]="busy()" [attr.aria-label]="'Add a picture for ' + label()" title="Add a picture. Customers see it when they click this value.">
          <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="2" /><circle cx="9" cy="10" r="1.6" /><path d="M21 16l-5-5-8 8" /></svg>
          <span>Picture</span>
        </button>
      }
      <input #file type="file" accept="image/*" hidden (change)="pick($event)" />
      @if (busy()) {
        <span class="ai-spin" role="status" aria-label="Uploading"></span>
      }
      @if (error()) {
        <span class="ai-err" role="alert">{{ error() }}</span>
      }
    </span>
  `,
  styles: `
    :host { display: inline-flex; vertical-align: middle; }
    .ai { display: inline-flex; align-items: center; gap: 4px; }
    .ai.busy { opacity: 0.8; }
    button { font: inherit; cursor: pointer; }
    button:disabled { cursor: not-allowed; }
    .ai-add {
      display: inline-flex; align-items: center; gap: 4px; padding: 2px 8px; border-radius: 999px;
      border: 1px dashed #b9b4a6; background: transparent; color: #6b6f63; font-size: 0.66rem; font-weight: 600; line-height: 1.4;
    }
    .ai-add:hover:not(:disabled) { border-color: #3d4b37; color: #3d4b37; }
    .ai-thumb { padding: 0; border: 1px solid #d4cec0; border-radius: 6px; background: #fff; overflow: hidden; width: 30px; height: 30px; display: block; }
    .ai-thumb img { width: 100%; height: 100%; object-fit: cover; display: block; }
    .ai-thumb:hover:not(:disabled) { border-color: #3d4b37; }
    .ai-x { border: 0; background: none; color: #8b3a2f; font-size: 1rem; line-height: 1; padding: 0 2px; }
    .ai-spin { width: 14px; height: 14px; border-radius: 50%; border: 2px solid rgba(60, 69, 54, 0.2); border-top-color: #3c4536; animation: aiSpin 0.8s linear infinite; }
    @keyframes aiSpin { to { transform: rotate(360deg); } }
    .ai-err { color: #8b3a2f; font-size: 0.66rem; max-width: 180px; }
  `,
})
export class AttrImageComponent implements OnInit {
  readonly code = input.required<string>();
  readonly label = input.required<string>();

  private readonly images = inject(AttributeImagesService);
  private readonly site = inject(SiteSettingsService);

  readonly busy = signal(false);
  readonly error = signal('');

  ngOnInit() {
    this.site.load();
  }

  url(): string {
    return this.images.imageFor(this.code(), this.label());
  }

  async pick(event: Event) {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    await this.run(() => this.images.attach(this.code(), this.label(), file));
  }

  remove() {
    void this.run(() => this.images.detach(this.code(), this.label()));
  }

  private async run(job: () => Promise<void>) {
    this.busy.set(true);
    this.error.set('');
    try {
      await job();
    } catch (err) {
      const m = (err as { error?: { message?: string | string[] } })?.error?.message;
      this.error.set(err instanceof Error && err.message ? err.message : Array.isArray(m) ? m.join(', ') : m || 'Could not save the picture.');
    } finally {
      this.busy.set(false);
    }
  }
}
