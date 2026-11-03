import { Component, OnInit, inject, input, signal } from '@angular/core';
import { SiteSettingsService } from '../core/services/site-settings.service';
import { SwatchPlace, SwatchVisibilityService } from '../core/services/swatch-visibility.service';

/**
 * Admin: whether a product shows its colour swatches, on the products page and in the Custom Designer.
 * A ticked box means the swatches are shown there; each change is saved at once.
 */
@Component({
  selector: 'tg-swatch-toggle',
  standalone: true,
  template: `
    <div class="st">
      <label [attr.title]="'Show the colour dots under this product on the products page (colour names are only shown in the Custom Designer)'">
        <input type="checkbox" [checked]="!vis.hiddenOnShop(productId())" [disabled]="busy()" (change)="flip('shop', $event)" />
        Products page
      </label>
      <label [attr.title]="'Show the colour name and the Garment Colour swatches in the Custom Designer'">
        <input type="checkbox" [checked]="!vis.hiddenInDesigner(productId())" [disabled]="busy()" (change)="flip('designer', $event)" />
        Custom Designer
      </label>
      @if (colours() < 2) {
        <span class="none">One colour</span>
      }
      @if (error()) {
        <span class="err" role="alert">{{ error() }}</span>
      }
    </div>
  `,
  styles: `
    :host { display: block; }
    .st { display: flex; flex-direction: column; gap: 4px; }
    label { display: flex; align-items: center; gap: 6px; font-size: 0.72rem; font-weight: 600; white-space: nowrap; cursor: pointer; }
    input { width: 15px; height: 15px; margin: 0; accent-color: #3d4b37; }
    input:disabled { cursor: wait; }
    .none { color: #9a9d93; font-size: 0.72rem; }
    .err { color: #8b3a2f; font-size: 0.68rem; }
  `,
})
export class SwatchToggleComponent implements OnInit {
  readonly productId = input.required<string>();
  /** How many colours the product has; with fewer than two there are no swatches to hide. */
  readonly colours = input.required<number>();

  readonly vis = inject(SwatchVisibilityService);
  private readonly site = inject(SiteSettingsService);

  readonly busy = signal(false);
  readonly error = signal('');

  ngOnInit() {
    this.site.load();
  }

  async flip(place: SwatchPlace, event: Event) {
    const shown = (event.target as HTMLInputElement).checked;
    this.busy.set(true);
    this.error.set('');
    try {
      await this.vis.set(this.productId(), place, !shown);
    } catch {
      this.error.set('Could not save. Try again.');
    } finally {
      this.busy.set(false);
    }
  }
}
