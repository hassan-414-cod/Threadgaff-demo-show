import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import {
  DEFAULT_SITE_SETTINGS,
  SiteSettings,
  SiteSettingsService,
} from '../../core/services/site-settings.service';

/**
 * Admin → Site Outlook. The few site-wide texts that can be changed without a code change:
 * the top banner, the home page headings and the contact email in the footer.
 */
@Component({
  selector: 'tg-admin-site-outlook',
  standalone: true,
  imports: [FormsModule],
  template: `
    <div class="head">
      <p class="kicker">Site / Outlook</p>
      <h1>Site Outlook</h1>
      <p class="lede">Change the texts customers see across the site. Changes go live for everyone as soon as you save.</p>
    </div>

    @if (msg()) {
      <div class="note" [class.err]="msgErr()" role="status">{{ msg() }}</div>
    }

    @if (loading()) {
      <p class="lede">Loading…</p>
    } @else {
      <section class="card">
        <header>
          <h2>Top banner</h2>
          <label class="switch">
            <input type="checkbox" [(ngModel)]="form.bannerVisible" name="bannerVisible" />
            <span>Show banner</span>
          </label>
        </header>
        <label for="so-banner">Banner text</label>
        <input id="so-banner" type="text" maxlength="140" [(ngModel)]="form.bannerText" name="bannerText" [disabled]="!form.bannerVisible" />
        <p class="hint">Tip: separate short phrases with “ • ”.</p>
        <div class="strip" [class.off]="!form.bannerVisible" aria-hidden="true">
          {{ form.bannerVisible ? form.bannerText || '…' : 'Banner hidden' }}
        </div>
      </section>

      <section class="card">
        <header><h2>Home page</h2></header>
        <label for="so-tagline">Tagline under the hero</label>
        <input id="so-tagline" type="text" maxlength="90" [(ngModel)]="form.heroTagline" name="heroTagline" />
        <label for="so-heading">Shop heading</label>
        <input id="so-heading" type="text" maxlength="60" [(ngModel)]="form.shopHeading" name="shopHeading" />
        <label for="so-intro">Shop intro line</label>
        <textarea id="so-intro" rows="2" maxlength="200" [(ngModel)]="form.shopIntro" name="shopIntro"></textarea>
      </section>

      <section class="card">
        <header><h2>Footer</h2></header>
        <label for="so-email">Contact email</label>
        <input id="so-email" type="email" maxlength="120" [(ngModel)]="form.contactEmail" name="contactEmail" />
      </section>

      <div class="actions">
        <button type="button" class="btn primary" [disabled]="busy()" (click)="save()">{{ busy() ? 'Saving…' : 'Save changes' }}</button>
        <button type="button" class="btn" [disabled]="busy()" (click)="restoreDefaults()">Restore default texts</button>
      </div>
    }
  `,
  styles: `
    :host { display: block; color: var(--ink, #1c1f1b); max-width: 760px; }
    .head { margin-bottom: 20px; }
    .kicker {
      margin: 0 0 8px; font-size: 0.68rem; font-weight: 700; letter-spacing: 0.12em;
      text-transform: uppercase; color: var(--muted, #6b6f63);
    }
    h1 { margin: 0; font-size: 1.75rem; letter-spacing: -0.02em; }
    h2 { margin: 0; font-size: 1rem; }
    .lede { margin: 6px 0 0; color: #7a7f74; font-size: 0.92rem; }
    .note {
      margin-bottom: 14px; padding: 10px 14px; border-radius: 8px; font-size: 0.85rem;
      background: #eef2ea; color: #3d4b37; border: 1px solid #d8e0d1;
    }
    .note.err { background: #f8ece9; color: #8b3a2f; border-color: #ebcfc9; }
    .card {
      background: #fff; border: 1px solid var(--ui-line, #e4e0d6); border-radius: 12px;
      padding: 18px; margin-bottom: 16px; box-shadow: 0 1px 2px rgba(28, 31, 27, 0.04);
    }
    .card header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 14px; gap: 12px; }
    label { display: block; font-size: 0.75rem; font-weight: 600; margin: 12px 0 6px; }
    .card header + label { margin-top: 0; }
    input[type='text'], input[type='email'], textarea {
      width: 100%; box-sizing: border-box; border: 1px solid var(--ui-line, #e4e0d6); border-radius: 8px;
      background: #fff; padding: 10px 12px; font: inherit; color: inherit;
    }
    input:disabled { background: #f5f3ef; color: #9a9d93; }
    textarea { resize: vertical; }
    input:focus, textarea:focus { outline: 2px solid #3d4b37; border-color: transparent; }
    .switch { display: inline-flex; align-items: center; gap: 8px; margin: 0; font-weight: 600; cursor: pointer; }
    .switch input { width: 16px; height: 16px; accent-color: #3d4b37; }
    .hint { margin: 6px 0 12px; font-size: 0.75rem; color: var(--muted, #6b6f63); }
    .strip {
      background: #1c1f1b; color: #ece8de; font-size: 0.72rem; letter-spacing: 0.06em; text-transform: uppercase;
      text-align: center; padding: 9px 12px; border-radius: 8px; overflow-wrap: anywhere;
    }
    .strip.off { background: #ebe8e1; color: #8a867c; }
    .actions { display: flex; gap: 10px; flex-wrap: wrap; }
    .btn {
      border: 1px solid var(--ui-line, #e4e0d6); background: #fff; color: inherit; cursor: pointer;
      padding: 10px 16px; border-radius: 8px; font: inherit; font-weight: 600; font-size: 0.82rem;
    }
    .btn.primary { background: #3d4b37; border-color: #3d4b37; color: #fff; }
    .btn:disabled { opacity: 0.6; cursor: not-allowed; }
  `,
})
export class AdminSiteOutlookComponent implements OnInit {
  private readonly site = inject(SiteSettingsService);

  form: SiteSettings = { ...DEFAULT_SITE_SETTINGS };
  readonly loading = signal(true);
  readonly busy = signal(false);
  readonly msg = signal('');
  readonly msgErr = signal(false);
  private msgTimer: ReturnType<typeof setTimeout> | null = null;

  async ngOnInit() {
    this.form = await this.site.current();
    this.loading.set(false);
  }

  restoreDefaults() {
    this.form = { ...DEFAULT_SITE_SETTINGS };
    this.say('Default texts filled in. Press Save changes to publish them.');
  }

  async save() {
    const f = this.form;
    // Hidden filters (Filters page) and the home pictures (Home page) are kept as they are.
    const next: Omit<SiteSettings, 'hiddenFilters' | 'homeCatalogues' | 'homeSlides'> = {
      bannerVisible: !!f.bannerVisible,
      bannerText: f.bannerText.trim(),
      heroTagline: f.heroTagline.trim(),
      shopHeading: f.shopHeading.trim(),
      shopIntro: f.shopIntro.trim(),
      contactEmail: f.contactEmail.trim(),
    };
    if (next.bannerVisible && !next.bannerText) return this.say('Enter the banner text, or turn the banner off.', true);
    if (!next.shopHeading) return this.say('The shop heading cannot be empty.', true);
    if (next.contactEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(next.contactEmail)) {
      return this.say('Enter a valid contact email.', true);
    }
    this.busy.set(true);
    try {
      await this.site.update(next);
      this.form = { ...this.form, ...next };
      this.say('Saved. The site now shows these texts.');
    } catch (err) {
      const m = (err as { error?: { message?: string | string[] } })?.error?.message;
      this.say(Array.isArray(m) ? m.join(', ') : m || 'Could not save. Check the API is running.', true);
    } finally {
      this.busy.set(false);
    }
  }

  private say(text: string, isError = false) {
    this.msg.set(text);
    this.msgErr.set(isError);
    if (this.msgTimer) clearTimeout(this.msgTimer);
    this.msgTimer = setTimeout(() => this.msg.set(''), 5000);
  }
}
