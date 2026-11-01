import { Injectable, computed, inject } from '@angular/core';
import { CatalogService } from './catalog.service';
import { HomeMediaService } from './home-media.service';
import { SiteSettingsService, TemplateView } from './site-settings.service';
import { attributeImageKey } from '../utils/attribute-images';

/** The angles a template can have a picture for (the names the garment's own angle pictures use). */
export const TEMPLATE_ANGLES: ReadonlyArray<{ angle: string; label: string }> = [
  { angle: 'front', label: 'Front' },
  { angle: 'back', label: 'Back' },
  { angle: 'side', label: 'Side' },
  { angle: 'sleeve', label: 'Sleeve' },
  { angle: 'collar', label: 'Collar' },
  { angle: 'detail', label: 'Detail' },
];

/** The attributes whose options the Custom Designer lets a customer choose, so a template can show there. */
export const TEMPLATE_CODES: readonly string[] = ['sleeve', 'style', 'material', 'gsm'];

/**
 * A template is a set of garment pictures, one per angle, for one attribute option (for example
 * Sleeve: Short sleeve, shown in the Custom Designer when a customer picks it). The pictures are
 * stored like the other site pictures and kept with the site settings; nothing about a product changes.
 */
@Injectable({ providedIn: 'root' })
export class AttributeTemplatesService {
  private readonly site = inject(SiteSettingsService);
  private readonly media = inject(HomeMediaService);
  private readonly catalog = inject(CatalogService);

  private readonly byKey = computed(
    () => new Map(this.site.settings().attributeTemplates.map((t) => [t.key, t.views])),
  );
  /** Saves run one after another, so two pictures added together cannot overwrite each other. */
  private chain: Promise<unknown> = Promise.resolve();

  /** The pictures of an option's template (empty when it has none). */
  viewsOf(code: string, label: string): TemplateView[] {
    return this.byKey().get(attributeImageKey(code, label)) ?? [];
  }

  countOf(code: string, label: string): number {
    return this.viewsOf(code, label).length;
  }

  /** The option's picture for one angle, ready to show, or '' when its template has none for it. */
  pictureFor(code: string, label: string, angle: string): string {
    const v = this.viewsOf(code, label).find((x) => x.angle === angle);
    return v ? this.catalog.normalizeMediaUrl(v.imageUrl) : '';
  }

  /** Uploads a picture (sent exactly as picked) and puts it in the option's template for that angle. */
  async attach(code: string, label: string, angle: string, file: File): Promise<void> {
    const url = await this.media.upload(file, `${label} · ${angle}`);
    await this.save(code, label, (views) => [...views.filter((v) => v.angle !== angle), { angle, imageUrl: url }]);
  }

  async detach(code: string, label: string, angle: string): Promise<void> {
    await this.save(code, label, (views) => views.filter((v) => v.angle !== angle));
  }

  private save(code: string, label: string, change: (views: TemplateView[]) => TemplateView[]): Promise<void> {
    const run = this.chain.then(async () => {
      const key = attributeImageKey(code, label);
      const saved = (await this.site.current()).attributeTemplates;
      const views = change(saved.find((t) => t.key === key)?.views ?? []);
      const rest = saved.filter((t) => t.key !== key);
      await this.site.update({ attributeTemplates: views.length ? [...rest, { key, views }] : rest });
    });
    this.chain = run.catch(() => undefined);
    return run;
  }
}
