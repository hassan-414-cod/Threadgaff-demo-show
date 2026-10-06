import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';

@Component({
  selector: 'tg-login-page',
  standalone: true,
  imports: [FormsModule, RouterLink],
  template: `
    <div class="auth-wrap">
      <div class="auth-card">
        <a class="logo" routerLink="/">
          <img src="/assets/images/logo.jpg" alt="" />
          Threadgaff
        </a>
        <div class="kicker">Wholesale client access</div>
        <h1>Designer access</h1>
        <p class="sub">
          Sign in or register to open the Custom Designer. Catalogue browsing stays open.
        </p>

        <div class="tabs">
          <button
            type="button"
            [class.active]="mode() === 'login'"
            (click)="switchMode('login')"
          >
            Login
          </button>
          <button
            type="button"
            [class.active]="mode() === 'register'"
            (click)="switchMode('register')"
          >
            Register
          </button>
        </div>

        @if (message()) {
          <div class="msg" [class.err]="isError()">{{ message() }}</div>
        }

        @if (mode() === 'login') {
          <form (ngSubmit)="submit()">
            <label for="loginEmail">Work email</label>
            <input
              id="loginEmail"
              type="email"
              name="email"
              required
              placeholder="you&#64;brand.com"
              autocomplete="username"
              [(ngModel)]="email"
            />
            <label for="loginPass">Password</label>
            <input
              id="loginPass"
              type="password"
              name="password"
              required
              placeholder="••••••••"
              autocomplete="current-password"
              [(ngModel)]="password"
            />
            <button class="auth-btn" type="submit" [disabled]="busy()">
              Sign in &amp; continue
            </button>
          </form>
        } @else {
          <form (ngSubmit)="submit()">
            <label for="regEmail">Work email</label>
            <input
              id="regEmail"
              type="email"
              name="email"
              required
              placeholder="you&#64;brand.com"
              autocomplete="username"
              [(ngModel)]="email"
            />
            <label for="regPass">Password</label>
            <input
              id="regPass"
              type="password"
              name="password"
              required
              minlength="8"
              placeholder="Create a password"
              autocomplete="new-password"
              [(ngModel)]="password"
            />
            <button class="auth-btn" type="submit" [disabled]="busy()">
              Create account &amp; continue
            </button>
          </form>
        }

        <p class="note">
          Client accounts are verified by email. Catalogue browsing stays open without signing in.
        </p>
        <a class="auth-btn admin-link" routerLink="/admin">Enter admin</a>
      </div>
    </div>
  `,
  styles: `
    :host {
      display: block;
      min-height: 100vh;
      background: var(--paper);
    }

    .auth-wrap {
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 32px 16px;
    }

    .auth-card {
      width: 100%;
      max-width: 440px;
      background: var(--panel);
      border: 1px solid var(--line);
      padding: 36px 32px;
    }

    .logo {
      font-family: 'Montserrat', sans-serif;
      font-weight: 800;
      letter-spacing: 0.12em;
      text-transform: uppercase;
      text-decoration: none;
      color: var(--ink);
      display: flex;
      align-items: center;
      gap: 10px;
      margin-bottom: 8px;
    }

    .logo img {
      width: 40px;
      height: 40px;
      border-radius: 50%;
      object-fit: cover;
    }

    .kicker {
      font-size: 0.72rem;
      letter-spacing: 0.14em;
      text-transform: uppercase;
      color: var(--muted);
      font-weight: 700;
      margin-bottom: 8px;
    }

    h1 {
      font-family: 'Montserrat', sans-serif;
      font-size: 1.35rem;
      letter-spacing: 0.06em;
      text-transform: uppercase;
      margin: 0 0 8px;
      font-weight: 800;
    }

    .sub {
      color: var(--muted);
      font-size: 0.9rem;
      margin: 0 0 24px;
      max-width: none;
    }

    .tabs {
      display: flex;
      gap: 8px;
      margin-bottom: 24px;
    }

    .tabs button {
      flex: 1;
      border: 1px solid var(--line);
      background: transparent;
      padding: 10px;
      font-weight: 700;
      font-size: 0.75rem;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      cursor: pointer;
      color: var(--ink);
      font-family: inherit;
    }

    .tabs button.active {
      background: var(--gold);
      color: #fff;
      border-color: var(--gold);
    }

    label {
      display: block;
      font-size: 0.72rem;
      font-weight: 700;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      margin: 0 0 6px;
    }

    input {
      width: 100%;
      padding: 12px 14px;
      border: 1px solid var(--line);
      background: #fff;
      font: inherit;
      margin-bottom: 14px;
      color: var(--ink);
    }

    .auth-btn {
      width: 100%;
      border: 0;
      background: var(--ink);
      color: #fff;
      padding: 13px;
      font-weight: 700;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      font-size: 0.78rem;
      cursor: pointer;
      font-family: inherit;
      text-align: center;
      text-decoration: none;
      display: block;
    }

    .auth-btn:disabled {
      opacity: 0.65;
      cursor: wait;
    }

    .admin-link {
      margin-top: 14px;
      background: transparent;
      color: var(--ink);
      border: 1px solid var(--line);
    }

    .note {
      margin-top: 18px;
      font-size: 0.8rem;
      color: var(--muted);
      max-width: none;
    }

    .msg {
      background: #e3e6dc;
      padding: 10px 12px;
      font-size: 0.85rem;
      margin-bottom: 14px;
    }

    .msg.err {
      background: #f3e4df;
    }
  `,
})
export class LoginPageComponent {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  readonly mode = signal<'login' | 'register'>('login');
  readonly message = signal('');
  readonly isError = signal(false);
  readonly busy = signal(false);

  email = '';
  password = '';

  switchMode(mode: 'login' | 'register') {
    this.mode.set(mode);
    this.message.set('');
    this.isError.set(false);
  }

  submit() {
    this.busy.set(true);
    this.message.set('');
    if (this.mode() === 'login') {
      this.auth.login(this.email, this.password).subscribe({
        next: () => {
          const next = this.route.snapshot.queryParamMap.get('next') || '/designer';
          this.router.navigateByUrl(next);
        },
        error: (err) => {
          this.busy.set(false);
          this.isError.set(true);
          this.message.set(err?.error?.message || 'Login failed');
        },
        complete: () => this.busy.set(false),
      });
    } else {
      this.auth
        .register({
          email: this.email,
          password: this.password,
        })
        .subscribe({
          next: () => {
            this.busy.set(false);
            this.isError.set(false);
            this.message.set(
              'Account created. Check your email to verify, then sign in.',
            );
            this.mode.set('login');
          },
          error: (err) => {
            this.busy.set(false);
            this.isError.set(true);
            const msg = err?.error?.message;
            this.message.set(
              Array.isArray(msg) ? msg.join(', ') : msg || 'Registration failed',
            );
          },
        });
    }
  }
}
