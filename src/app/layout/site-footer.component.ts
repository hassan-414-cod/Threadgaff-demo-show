import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'tg-site-footer',
  standalone: true,
  imports: [RouterLink],
  template: `
    <footer class="site-footer">
      <div class="wrap">
        <div class="footer-grid">
          <div class="footer-col">
            <a routerLink="/" class="logo">
              <img src="/assets/images/logo.jpg" alt="Threadgaff" class="logo-img" />
              THREADGAFF
            </a>
            <p class="blurb">
              Private label apparel manufacturing, designed piece by piece and produced to
              order.
            </p>
          </div>
          <div class="footer-col">
            <h5>Site</h5>
            <ul>
              <li><a routerLink="/products">Products</a></li>
              <li><a routerLink="/designer">Custom Designer</a></li>
              <li><a routerLink="/how-we-work">How We Work</a></li>
              <li><a routerLink="/about">About Threadgaff</a></li>
            </ul>
          </div>
          <div class="footer-col">
            <h5>Order Types</h5>
            <ul>
              <li><a routerLink="/order/own-label">Own-label range</a></li>
              <li><a routerLink="/order/wholesale">Bulk &amp; wholesale</a></li>
              <li><a routerLink="/order/merchandise">Branded merchandise</a></li>
            </ul>
          </div>
          <div class="footer-col">
            <h5>Get in touch</h5>
            <ul>
              <li><a routerLink="/quote">Start your range</a></li>
              <li><a routerLink="/about">Contact Us</a></li>
              <li><a href="mailto:hello&#64;threadgaff.com">hello&#64;threadgaff.com</a></li>
            </ul>
          </div>
        </div>
        <hr class="hr" />
        <div class="footer-bottom">
          <span>© {{ year }} Threadgaff</span>
          <span>Lahore, Pakistan</span>
        </div>
      </div>
    </footer>
  `,
  styles: `
    .site-footer {
      border-top: 1px solid var(--line);
      padding: 56px 0 34px;
      background: var(--paper);
      margin-top: auto;
    }

    .footer-grid {
      display: grid;
      grid-template-columns: 1.4fr 1fr 1fr 1fr;
      gap: 32px;
      margin-bottom: 40px;
    }

    .logo {
      display: flex;
      align-items: center;
      gap: 10px;
      margin-bottom: 14px;
      font-family: 'Montserrat', sans-serif;
      font-weight: 800;
      font-size: 0.95rem;
      letter-spacing: 0.12em;
      text-transform: uppercase;
      color: var(--ink);
    }

    .logo-img {
      width: 44px;
      height: 44px;
      border-radius: 50%;
      object-fit: cover;
    }

    .blurb {
      color: var(--muted);
      font-size: 0.92rem;
      max-width: 34ch;
      margin: 0;
    }

    .footer-col h5 {
      font-size: 0.85rem;
      text-transform: uppercase;
      letter-spacing: 0.06em;
      color: var(--muted);
      margin: 0 0 14px;
      font-family: 'IBM Plex Sans', sans-serif;
      font-weight: 600;
    }

    .footer-col ul {
      list-style: none;
      margin: 0;
      padding: 0;
      display: flex;
      flex-direction: column;
      gap: 9px;
    }

    .footer-col a {
      color: var(--ink);
      font-size: 0.92rem;
    }

    .footer-col a:hover {
      color: var(--gold-deep);
    }

    .footer-bottom {
      display: flex;
      justify-content: space-between;
      color: var(--muted);
      font-size: 0.82rem;
      flex-wrap: wrap;
      gap: 10px;
      margin-top: 22px;
    }

    @media (max-width: 800px) {
      .footer-grid {
        grid-template-columns: 1fr 1fr;
      }
    }

    @media (max-width: 520px) {
      .footer-grid {
        grid-template-columns: 1fr;
      }
      .footer-bottom {
        flex-direction: column;
        text-align: center;
      }
    }
  `,
})
export class SiteFooterComponent {
  readonly year = new Date().getFullYear();
}
