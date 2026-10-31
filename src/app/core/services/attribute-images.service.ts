import { Injectable, computed, inject } from '@angular/core';
import { CatalogService } from './catalog.service';
import { HomeMediaService } from './home-media.service';
import { AttributeImage, SiteSettingsService } from './site-settings.service';
import { attributeImageKey } from '../utils/attribute-images';

/**
 * Pictures attached to attribute values (for example "Fleece" or "Embroidery"). The admin adds
 * them next to the value; the shop shows one when a customer clicks that value.
 *
 * They are kept with the other site settings, and the picture itself is stored like the home
 * page pictures. Taking a picture off only removes it from the settings.
 */
@Injectable({ providedIn: 'root' })
export class AttributeImagesService {
  private readonly site = inject(SiteSettingsService);
  private readonly media = inject(HomeMediaService);
  private readonly catalog = inject(CatalogService);

  private readonly byKey = computed(
    () => new Map(this.site.settings().attributeImages.map((i) => [i.key, i.imageUrl])),
  );

  /** The picture attached to this value, ready to show, or '' when it has none. */
  imageFor(code: string, label: string): string {
    const raw = this.byKey().get(attributeImageKey(code, label));
    return raw ? this.catalog.normalizeMediaUrl(raw) : '';
  }

  /** Uploads a picture (sent exactly as picked) and attaches it to the value. */
  async attach(code: string, label: string, file: File): Promise<void> {
    const url = await this.media.upload(file, `${label}`);
    await this.save(this.replace(attributeImageKey(code, label), url));
  }

  async detach(code: string, label: string): Promise<void> {
    await this.save(this.replace(attributeImageKey(code, label), ''));
  }

  private replace(key: string, imageUrl: string): AttributeImage[] {
    const rest = this.site.settings().attributeImages.filter((i) => i.key !== key);
    return imageUrl ? [...rest, { key, imageUrl }] : rest;
  }

  /** Saved at once (the other site settings are kept as they are). */
  private async save(list: AttributeImage[]): Promise<void> {
    await this.site.update({ attributeImages: list });
  }
}
