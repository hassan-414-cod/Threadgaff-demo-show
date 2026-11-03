import { Component, OnInit, inject, input, signal } from '@angular/core';
import { SiteSettingsService } from '../core/services/site-settings.service';
import { SwatchPlace, SwatchVisibilityService } from '../core/services/swatch-visibility.service';

/**
 * Admin: whether a product shows its colour swatches, on the products page and in the Custom Designer, and
 * whether the products page starts it opened ("Show all variants"). A ticked box means the thing is on; each change is saved at once.
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
      @if (colours() >= 2) {
        <label class="open-all" [attr.title]="'On the products page this product starts opened: every one of its colour variants is its own tile from the start (a visitor can still press Collapse). Untick it and the product starts as one tile with a Show all button.'">
          <input type="checkbox" [checked]="vis.showAllByDefault(productId())" [disabled]="busy()" (change)="flipOpen($event)" />
          Show all variants
        </label>
      } @else {
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
    .open-all { margin-top: 3px; padding-top: 5px; border-top: 1px dashed #d8d4cb; }
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

  /** Ticked: this product starts opened on the products page, with a tile for every colour variant. */
  async flipOpen(event: Event) {
    const on = (event.target as HTMLInputElement).checked;
    this.busy.set(true);
    this.error.set('');
    try {
      await this.vis.setShowAll(this.productId(), on);
    } catch {
      this.error.set('Could not save. Try again.');
    } finally {
      this.busy.set(false);
    }
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
