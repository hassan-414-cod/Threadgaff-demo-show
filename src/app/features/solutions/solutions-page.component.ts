import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'tg-solutions-page',
  standalone: true,
  imports: [RouterLink],
  template: `
    <div class="container page-hero">
      <h1>Solutions</h1>
      <p>Built for brands, corporates, and merchandise programmes.</p>
    </div>
    <div class="container page card-grid" style="padding-top:0">
      <a class="product-card" routerLink="/order/own-label"><div class="meta"><h3>Own label</h3><p class="muted">Launch or expand your brand range.</p></div></a>
      <a class="product-card" routerLink="/order/wholesale"><div class="meta"><h3>Wholesale</h3><p class="muted">Volume blanks and decorated stock.</p></div></a>
      <a class="product-card" routerLink="/order/merchandise"><div class="meta"><h3>Merchandise</h3><p class="muted">Campaign and team apparel.</p></div></a>
    </div>
  `,
})
export class SolutionsPageComponent {}
