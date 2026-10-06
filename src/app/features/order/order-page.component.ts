import { Component, inject } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';

@Component({
  selector: 'tg-order-page',
  standalone: true,
  imports: [RouterLink],
  template: `
    <div class="container page-hero">
      <h1>{{ title }}</h1>
      <p>{{ blurb }}</p>
    </div>
    <div class="container page" style="padding-top:0">
      <a class="btn btn-primary" [routerLink]="['/quote']" [queryParams]="{ route: type }">
        Start a quote
      </a>
    </div>
  `,
})
export class OrderPageComponent {
  private readonly route = inject(ActivatedRoute);
  readonly type = this.route.snapshot.paramMap.get('type') || 'own-label';
  readonly title =
    this.type === 'wholesale'
      ? 'Wholesale'
      : this.type === 'merchandise'
        ? 'Merchandise'
        : 'Own label';
  readonly blurb =
    this.type === 'wholesale'
      ? 'Bulk programmes with consistent quality and clear lead times.'
      : this.type === 'merchandise'
        ? 'Branded apparel for campaigns, events, and teams.'
        : 'Build a private-label range with Threadgaff manufacturing.';
}
