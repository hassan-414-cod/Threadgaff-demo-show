import { Component, HostListener, inject, signal } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { AuthService } from '../core/services/auth.service';

@Component({
  selector: 'tg-site-header',
  standalone: true,
  imports: [RouterLink, RouterLinkActive],
  template: `
    <header class="site-header">
      <div class="utility-strip">
        <span class="utility-msg"
          >Private Label Manufacturing • MOQ From 150 Units • Worldwide Shipping</span
        >
        <div class="utility-strip-links">
          <a routerLink="/quote">Sample Requests</a>
          @if (auth.isLoggedIn()) {
            <a href="#" (click)="logout($event)">Sign out</a>
          } @else {
            <a routerLink="/login">Client Login</a>
          }
        </div>
      </div>

      <nav class="nav">
        <a routerLink="/" class="logo">
          <img src="/assets/images/logo.jpg" alt="Threadgaff" class="logo-img" />
          THREADGAFF
        </a>

        <ul class="nav-links">
          <li class="has-mega">
            <a routerLink="/products" routerLinkActive="active">Products</a>
            <div class="mega-menu">
              <div class="mega-col">
                <h5>By Category</h5>
                <ul>
                  <li><a routerLink="/products" [queryParams]="{ collection: 't-shirts' }">T-Shirts</a></li>
                  <li><a routerLink="/products" [queryParams]="{ collection: 'hoodies' }">Hoodies</a></li>
                  <li><a routerLink="/products" [queryParams]="{ collection: 'sweatshirts' }">Sweatshirts</a></li>
                  <li><a routerLink="/products" [queryParams]="{ collection: 'tracksuits' }">Tracksuits</a></li>
                  <li><a routerLink="/products" [queryParams]="{ collection: 'joggers' }">Joggers</a></li>
                  <li><a routerLink="/products" [queryParams]="{ collection: 'polo-shirts' }">Polo Shirts</a></li>
                  <li><a routerLink="/products" [queryParams]="{ collection: 'sets' }">Sets (Co-ords)</a></li>
                </ul>
              </div>
              <div class="mega-col">
                <h5>By Order Type</h5>
                <ul>
                  <li><a routerLink="/order/own-label">Own-label range</a></li>
                  <li><a routerLink="/order/wholesale">Bulk &amp; wholesale</a></li>
                  <li><a routerLink="/order/merchandise">Branded merchandise</a></li>
                </ul>
              </div>
              <div class="mega-footer">
                <a routerLink="/quote">Request a sample pack →</a>
              </div>
            </div>
          </li>
          <li>
            <a routerLink="/designer" routerLinkActive="active">Custom Designer</a>
          </li>
          <li>
            <a routerLink="/how-we-work" routerLinkActive="active">How We Work</a>
          </li>
          <li>
            <a routerLink="/about" routerLinkActive="active">About</a>
          </li>
        </ul>

        <button
          type="button"
          class="hamburger"
          [class.open]="mobileOpen()"
          (click)="toggleMobile()"
          aria-label="Menu"
        >
          <span></span><span></span><span></span>
        </button>

        <div class="nav-actions">
          <a routerLink="/products" class="icon-btn" aria-label="Search products">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
              stroke-linecap="round" stroke-linejoin="round">
              <circle cx="11" cy="11" r="8"></circle>
              <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
            </svg>
          </a>
          <button type="button" class="icon-btn" (click)="cartOpen.set(true)" aria-label="Open cart">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
              stroke-linecap="round" stroke-linejoin="round">
              <path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"></path>
              <line x1="3" y1="6" x2="21" y2="6"></line>
              <path d="M16 10a4 4 0 0 1-8 0"></path>
            </svg>
          </button>
        </div>
      </nav>

      @if (cartOpen()) {
        <div class="cart-overlay" (click)="cartOpen.set(false)">
          <div class="cart-drawer" (click)="$event.stopPropagation()">
            <div class="cart-header">
              <h3 class="cart-title">Your Order</h3>
              <button type="button" class="cart-close" (click)="cartOpen.set(false)" aria-label="Close">
                ×
              </button>
            </div>
            <div class="cart-body">
              <p>Your order request is currently empty.</p>
              <a routerLink="/products" class="btn btn-primary" (click)="cartOpen.set(false)">Browse Products</a>
            </div>
            <div class="cart-footer">
              <a routerLink="/quote" class="btn-checkout" (click)="cartOpen.set(false)"
                >Go to Checkout →</a
              >
            </div>
          </div>
        </div>
      }

      <div class="mobile-nav" [class.open]="mobileOpen()">
        <button type="button" class="mobile-nav-close" (click)="mobileOpen.set(false)">×</button>
        <a routerLink="/products" (click)="mobileOpen.set(false)">Products</a>
        <a routerLink="/designer" (click)="mobileOpen.set(false)">Custom Designer</a>
        <a routerLink="/how-we-work" (click)="mobileOpen.set(false)">How We Work</a>
        <a routerLink="/about" (click)="mobileOpen.set(false)">About</a>
        @if (auth.isLoggedIn()) {
          <a href="#" class="cta" (click)="logout($event)">Sign out</a>
        } @else {
          <a routerLink="/login" class="cta" (click)="mobileOpen.set(false)">Client Login</a>
        }
        <a routerLink="/quote" class="cta" (click)="mobileOpen.set(false)">Start Your Range →</a>
      </div>
    </header>
  `,
  styles: `
    .site-header {
      position: sticky;
      top: 0;
      z-index: 50;
      background: var(--forest);
    }

    .utility-strip {
      background: var(--ink);
      color: #fff;
      padding: 9px 32px;
      font-size: 0.74rem;
      display: flex;
      align-items: center;
      justify-content: center;
      position: relative;
    }

    .utility-msg {
      text-transform: uppercase;
      letter-spacing: 0.13em;
      font-weight: 600;
      display: flex;
      align-items: center;
      gap: 14px;
      text-align: center;
    }

    .utility-msg::before,
    .utility-msg::after {
      content: '';
      width: 24px;
      height: 1px;
      background: rgba(216, 210, 197, 0.4);
      flex: none;
    }

    .utility-strip-links {
      position: absolute;
      right: 32px;
      top: 50%;
      transform: translateY(-50%);
      display: flex;
      gap: 18px;
    }

    .utility-strip-links a {
      color: #c7c4b6;
      font-size: 0.72rem;
      letter-spacing: 0.03em;
    }

    .utility-strip-links a:hover {
      color: var(--paper);
    }

    .nav {
      display: grid;
      grid-template-columns: 1fr auto 1fr;
      align-items: center;
      padding: 10px 32px;
      max-width: 1180px;
      margin: 0 auto;
      gap: 20px;
    }

    .logo {
      font-family: 'Montserrat', sans-serif;
      font-weight: 800;
      font-size: 1.05rem;
      color: #fff;
      letter-spacing: 0.12em;
      display: flex;
      align-items: center;
      gap: 10px;
      justify-self: start;
      text-transform: uppercase;
    }

    .logo-img {
      width: 50px;
      height: 50px;
      border-radius: 50%;
      object-fit: cover;
      flex: none;
    }

    .nav-links {
      display: flex;
      gap: 26px;
      list-style: none;
      margin: 0;
      padding: 0;
      align-items: center;
      justify-self: center;
      flex-wrap: wrap;
      justify-content: center;
    }

    .nav-links li {
      position: relative;
    }

    .nav-links a {
      color: #fff;
      font-weight: 600;
      font-size: 0.8rem;
      letter-spacing: 0.06em;
      text-transform: uppercase;
      padding-bottom: 4px;
      border-bottom: 2px solid transparent;
      transition: border-color 0.2s;
      font-family: 'Montserrat', sans-serif;
    }

    .nav-links > li > a:hover,
    .nav-links > li > a.active {
      border-bottom-color: #fff;
    }

    .mega-menu {
      display: none;
      position: absolute;
      top: 100%;
      left: -20px;
      background: var(--panel);
      border: 1px solid var(--line);
      padding: 24px;
      width: 500px;
      grid-template-columns: 1fr 1fr;
      gap: 32px;
      box-shadow: 0 10px 24px rgba(53, 57, 54, 0.08);
      z-index: 100;
      text-align: left;
    }

    .has-mega:hover .mega-menu {
      display: grid;
    }

    .mega-col h5 {
      font-size: 0.85rem;
      color: var(--muted);
      margin-bottom: 12px;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      font-family: 'IBM Plex Sans', sans-serif;
      font-weight: 600;
    }

    .mega-col ul {
      list-style: none;
      padding: 0;
      margin: 0;
      display: flex;
      flex-direction: column;
      gap: 8px;
    }

    .mega-col a {
      color: var(--ink);
      font-size: 0.95rem;
      border: none;
      padding: 0;
      font-weight: 500;
      text-transform: none;
      letter-spacing: 0;
      font-family: 'Inter', sans-serif;
    }

    .mega-col a:hover {
      color: var(--forest);
    }

    .mega-footer {
      grid-column: 1 / -1;
      border-top: 1px solid var(--line);
      padding-top: 16px;
      margin-top: 8px;
      text-align: center;
    }

    .mega-footer a {
      color: var(--forest);
      font-weight: 600;
      border: none;
      padding: 0;
      text-transform: none;
      letter-spacing: 0;
      font-size: 0.95rem;
    }

    .nav-actions {
      display: flex;
      align-items: center;
      gap: 16px;
      justify-self: end;
    }

    .icon-btn {
      color: #fff;
      display: flex;
      align-items: center;
      background: none;
      border: none;
      padding: 0;
      cursor: pointer;
    }

    .hamburger {
      display: none;
      flex-direction: column;
      gap: 5px;
      cursor: pointer;
      background: none;
      border: none;
      padding: 6px;
      z-index: 1001;
      justify-self: end;
    }

    .hamburger span {
      display: block;
      width: 24px;
      height: 2px;
      background: #fff;
      border-radius: 2px;
      transition: all 0.3s;
    }

    .hamburger.open span:nth-child(1) {
      transform: translateY(7px) rotate(45deg);
    }
    .hamburger.open span:nth-child(2) {
      opacity: 0;
    }
    .hamburger.open span:nth-child(3) {
      transform: translateY(-7px) rotate(-45deg);
    }

    .mobile-nav {
      display: none;
      position: fixed;
      inset: 0;
      background: rgba(28, 32, 30, 0.97);
      z-index: 1000;
      flex-direction: column;
      align-items: center;
      justify-content: center;
    }

    .mobile-nav.open {
      display: flex;
    }

    .mobile-nav a {
      color: #fff;
      font-size: 1.5rem;
      font-weight: 700;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      padding: 16px 0;
      width: 100%;
      text-align: center;
      border-bottom: 1px solid rgba(255, 255, 255, 0.08);
      font-family: 'Montserrat', sans-serif;
    }

    .mobile-nav a:hover,
    .mobile-nav a.cta {
      color: #c9b58a;
    }

    .mobile-nav-close {
      position: absolute;
      top: 20px;
      right: 24px;
      background: none;
      border: none;
      color: #fff;
      font-size: 2rem;
      cursor: pointer;
      line-height: 1;
    }

    .cart-overlay {
      position: fixed;
      inset: 0;
      background: rgba(28, 32, 30, 0.45);
      z-index: 1100;
      display: flex;
      justify-content: flex-end;
    }

    .cart-drawer {
      width: min(380px, 100%);
      height: 100%;
      background: var(--panel);
      color: var(--ink);
      display: flex;
      flex-direction: column;
      box-shadow: -8px 0 24px rgba(53, 57, 54, 0.12);
    }

    .cart-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 20px 22px;
      border-bottom: 1px solid var(--line);
    }

    .cart-title {
      font-size: 0.95rem;
      letter-spacing: 0.08em;
      margin: 0;
    }

    .cart-close {
      background: none;
      border: none;
      font-size: 1.6rem;
      cursor: pointer;
      color: var(--ink);
      line-height: 1;
    }

    .cart-body {
      padding: 32px 22px;
      text-align: center;
      color: var(--muted);
      font-size: 0.92rem;
      flex: 1;
    }

    .cart-body .btn {
      margin-top: 12px;
    }

    .cart-footer {
      padding: 16px 22px 22px;
      border-top: 1px solid var(--line);
    }

    .btn-checkout {
      display: block;
      width: 100%;
      text-align: center;
      background: var(--ink);
      color: #fff;
      padding: 14px 16px;
      font-family: 'Montserrat', sans-serif;
      font-size: 0.72rem;
      font-weight: 700;
      letter-spacing: 0.1em;
      text-transform: uppercase;
      border-radius: 2px;
    }

    .btn-checkout:hover {
      opacity: 0.9;
    }

    @media (max-width: 960px) {
      .utility-strip-links {
        display: none;
      }
    }

    @media (max-width: 768px) {
      .nav-links,
      .nav-actions {
        display: none !important;
      }
      .hamburger {
        display: flex !important;
      }
      .nav {
        grid-template-columns: 1fr auto !important;
        padding: 12px 20px !important;
      }
      .utility-strip {
        padding: 8px 16px;
      }
      .utility-msg {
        font-size: 0.66rem;
        letter-spacing: 0.08em;
      }
    }
  `,
})
export class SiteHeaderComponent {
  readonly auth = inject(AuthService);
  readonly mobileOpen = signal(false);
  readonly cartOpen = signal(false);

  @HostListener('document:keydown.escape')
  onEsc() {
    this.mobileOpen.set(false);
    this.cartOpen.set(false);
  }

  toggleMobile() {
    this.mobileOpen.update((v) => !v);
  }

  logout(event: Event) {
    event.preventDefault();
    this.mobileOpen.set(false);
    this.auth.logout().subscribe();
  }
}
