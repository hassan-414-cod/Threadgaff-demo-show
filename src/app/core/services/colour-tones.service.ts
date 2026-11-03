import { Injectable, computed, inject } from '@angular/core';
import { ColourTones, SiteSettingsService } from './site-settings.service';
import { cleanTones, toneBackground } from '../utils/colour-tones';
import { variantFilterKey } from '../utils/variant-filters';

/**
 * The extra shades of a colour (a two-tone or multi-colour garment). A colour of a product has one colour code in
 * the product database, and that database is left alone, so its main shade stays there and the extra ones are kept
 * with the other site settings, by product and colour name (like the filters ticked on a colour).
 */
@Injectable({ providedIn: 'root' })
export class ColourTonesService {
  private readonly site = inject(SiteSettingsService);

  private readonly byColour = computed(() => new Map(this.site.settings().colourTones.map((t) => [t.key, t.tones])));

  /** The extra shades of one colour, besides its main one (none for an ordinary colour). */
  extrasOf(productId: string, colourName: string): string[] {
    return this.byColour().get(variantFilterKey(productId, colourName)) ?? [];
  }

  /** Every shade of a colour, its main one first. */
  shadesOf(productId: string, colourName: string, mainHex: string): string[] {
    return [mainHex, ...this.extrasOf(productId, colourName)].filter((s) => !!s);
  }

  /** The CSS background of the swatch of a colour: a plain colour, or split into its shades. */
  background(productId: string, colourName: string, mainHex: string): string {
    return toneBackground(this.shadesOf(productId, colourName, mainHex));
  }

  /** What is saved for one product, for the admin form: the extra shades by normalised colour name. */
  async savedFor(productId: string): Promise<Map<string, string[]>> {
    const s = await this.site.current();
    const prefix = `${productId}|`;
    const out = new Map<string, string[]>();
    for (const t of s.colourTones) if (t.key.startsWith(prefix)) out.set(t.key.slice(prefix.length), [...t.tones]);
    return out;
  }

  /** Saves the extra shades of one product's colours; the other products' are kept as they are. */
  async saveFor(productId: string, rows: Array<{ name: string; tones: string[] }>): Promise<void> {
    const base = await this.site.current();
    const prefix = `${productId}|`;
    const mine: ColourTones[] = [];
    for (const r of rows) {
      const tones = cleanTones(r.tones);
      const key = variantFilterKey(productId, r.name);
      if (tones.length && !mine.some((m) => m.key === key)) mine.push({ key, tones });
    }
    const colourTones = [...base.colourTones.filter((t) => !t.key.startsWith(prefix)), ...mine];
    const sig = (list: ColourTones[]) =>
      JSON.stringify([...list].sort((a, b) => a.key.localeCompare(b.key)).map((t) => [t.key, t.tones]));
    if (sig(colourTones) === sig(base.colourTones)) return;
    await this.site.update({ colourTones });
  }
}
