import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { AuthService } from './auth.service';
import { CatalogService, COVER_STORE_SLUG } from './catalog.service';
import { Product } from '../models/catalog.models';
import { shrinkImage } from '../utils/shrink-image';

/** Longest address the settings may hold for one picture. */
export const MEDIA_URL_MAX = 500;

/**
 * Stores pictures for the home page (catalogue cards and slider).
 *
 * The API only has a product image upload, so the pictures live on the same hidden, active
 * "Category cover images" product that category covers already use (it never shows in any
 * product list). A picture comes back as a short /uploads/… address that the home page settings
 * keep. Nothing is ever deleted from the store: taking a picture off the home page only
 * removes it from the settings.
 */
@Injectable({ providedIn: 'root' })
export class HomeMediaService {
  private readonly catalog = inject(CatalogService);
  private readonly auth = inject(AuthService);

  /** Uploads a picture exactly as it is (scaled down only if the server says it is too big). */
  async upload(file: File, altText: string): Promise<string> {
    if (!file.type.startsWith('image/')) throw new Error('Choose an image file (JPG, PNG or WebP).');
    const holder = await this.ensureStore();
    const before = new Set((await this.imagesOf(holder.id)).map((i) => i.id));

    const steps: Array<[number, number] | null> = [null, [3000, 0.95], [2200, 0.92], [1600, 0.9]];
    let res: unknown;
    let last: unknown;
    for (const step of steps) {
      try {
        const f = step ? await shrinkImage(file, step[0], step[1]) : file;
        res = await this.send(holder.id, f, altText);
        last = undefined;
        break;
      } catch (err) {
        last = err;
        if ((err as { status?: number })?.status !== 413) break;
      }
    }
    if (last) throw new Error('Image upload failed: ' + this.describe(last));

    const box = res as { url?: string; image?: { url?: string }; images?: Array<{ id: string; url: string }> } | null;
    let url = box?.url || box?.image?.url || '';
    if (!url && box?.images) url = box.images.filter((i) => !before.has(i.id)).pop()?.url || '';
    if (!url) {
      const after = await this.imagesOf(holder.id);
      url = after.filter((i) => !before.has(i.id)).pop()?.url || '';
    }
    if (!url) throw new Error('The image was uploaded but the server did not return its address.');
    if (url.length > MEDIA_URL_MAX) throw new Error('The server returned an image address that is too long.');
    return url;
  }

  /** One upload; a dropped connection or a busy server is tried again (3 tries in all). */
  private async send(productId: string, file: File, altText: string): Promise<unknown> {
    let last: unknown;
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        await firstValueFrom(this.auth.ensureFreshAccessToken());
        return await firstValueFrom(
          this.catalog.uploadProductImage(productId, file, { role: 'gallery', angle: 'other', altText }),
        );
      } catch (err) {
        last = err;
        const status = (err as { status?: number })?.status;
        const transient = status === undefined || status === 0 || status >= 500;
        if (!transient || attempt === 3) break;
        await new Promise((r) => setTimeout(r, 900 * attempt));
      }
    }
    throw last;
  }

  private async imagesOf(id: string): Promise<Array<{ id: string; url: string }>> {
    const fresh = await firstValueFrom(this.catalog.getProduct(id)).catch(() => null);
    if (fresh?.images) return fresh.images;
    const listed = await firstValueFrom(this.catalog.findCoverStore()).catch(() => null);
    return listed?.images || [];
  }

  private async ensureStore(): Promise<Product> {
    const existing = await firstValueFrom(this.catalog.findCoverStore());
    if (existing) return existing.isActive === false ? this.activate(existing) : existing;
    let lastError = '';
    try {
      return await firstValueFrom(
        this.catalog.createProduct({
          name: 'Category cover images (system, do not delete)',
          slug: COVER_STORE_SLUG,
          isActive: true,
          isStandalone: true,
          categoryId: null,
          extraCategoryIds: [],
          tagIds: [],
          sizes: [],
          attributes: [],
        }),
      );
    } catch (err) {
      lastError = this.describe(err);
    }
    const created = await firstValueFrom(this.catalog.findCoverStore()).catch(() => null);
    if (created) return created.isActive === false ? this.activate(created) : created;
    throw new Error('Could not prepare image storage: ' + lastError);
  }

  private async activate(store: Product): Promise<Product> {
    try {
      await firstValueFrom(this.catalog.updateProduct(store.id, { isActive: true }));
    } catch {
      /* it may have been saved even if the API cannot return the row: verify below */
    }
    const fresh = await firstValueFrom(this.catalog.findCoverStore()).catch(() => null);
    if (fresh && fresh.isActive !== false) return fresh;
    throw new Error('Could not prepare image storage: the hidden "Category cover images" product could not be activated.');
  }

  private describe(err: unknown): string {
    const e = err as { status?: number; error?: { message?: string | string[] }; message?: string };
    const m = e?.error?.message;
    const text = Array.isArray(m) ? m.join(', ') : m || e?.message || '';
    if (e?.status === 413) return 'the file is too large';
    if (e?.status === 401 || e?.status === 403) return 'you need to be signed in as staff';
    return [text || 'check the API is running', e?.status ? `(HTTP ${e.status})` : ''].filter(Boolean).join(' ');
  }
}
