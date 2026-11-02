import { Component, input } from '@angular/core';

/**
 * A picture of a logo placement. Usually it is one finished picture (the garment with the logo on it).
 * When the browser could not read the garment picture (it comes from another site), what was saved is
 * only the logo layer, the size of the garment picture, together with the address of that picture: the
 * two are shown one on top of the other, which needs no permission from the garment picture's site.
 */
@Component({
  selector: 'tg-placement-picture',
  standalone: true,
  template: `
    @if (garment()) {
      <span class="stack">
        <img class="g" [src]="garment()" alt="" loading="lazy" />
        <img class="o" [src]="src()" [alt]="alt()" />
      </span>
    } @else {
      <img class="plain" [src]="src()" [alt]="alt()" />
    }
  `,
  styles: `
    :host { display: block; background: #fff; overflow: hidden; }
    .stack { position: relative; display: block; }
    .g, .plain { display: block; width: 100%; height: auto; }
    .o { position: absolute; inset: 0; width: 100%; height: 100%; display: block; }
  `,
})
export class PlacementPictureComponent {
  /** The picture that was saved (the garment with the logo on it, or just the logo layer). */
  readonly src = input.required<string>();
  /** Set when `src` is only the logo layer: the garment picture it goes on. */
  readonly garment = input<string | undefined>(undefined);
  readonly alt = input('');
}
