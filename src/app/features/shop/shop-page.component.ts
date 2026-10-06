import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'tg-shop-page',
  standalone: true,
  imports: [RouterLink],
  template: `
    <div class="container page-hero">
      <h1>Shop</h1>
      <p>Coming soon — retail checkout is not part of this release.</p>
    </div>
    <div class="container page" style="padding-top:0">
      <a routerLink="/products" class="btn btn-primary">Browse the design library</a>
    </div>
  `,
})
export class ShopPageComponent {}
