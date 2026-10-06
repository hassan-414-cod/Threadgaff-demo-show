import { Injectable, signal, computed, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import {
  Observable,
  tap,
  catchError,
  of,
  map,
  shareReplay,
  finalize,
} from 'rxjs';
import { environment } from '../../../environments/environment';
import { AuthTokens, AuthUser, LoginResponse } from '../models/catalog.models';

const ACCESS_KEY = 'tg_access_token';
const USER_KEY = 'tg_user';
/** Legacy key — cleared on load; refresh now lives in httpOnly cookie. */
const LEGACY_REFRESH_KEY = 'tg_refresh_token';

export type AccessTokenResponse = Omit<AuthTokens, 'refreshToken'> & {
  refreshToken?: string;
};

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly http = inject(HttpClient);
  private readonly router = inject(Router);
  private readonly userSignal = signal<AuthUser | null>(this.readUser());
  private refreshInFlight: Observable<AccessTokenResponse> | null = null;
  private memoryAccess: string | null = sessionStorage.getItem(ACCESS_KEY);

  readonly user = this.userSignal.asReadonly();
  readonly isLoggedIn = computed(() => !!this.userSignal()?.email);

  constructor() {
    localStorage.removeItem(LEGACY_REFRESH_KEY);
  }

  get accessToken(): string | null {
    const mem = this.memoryAccess;
    const stored = sessionStorage.getItem(ACCESS_KEY);
    // Prefer a non-expired token if memory and storage diverge
    if (mem && !this.tokenExpired(mem, 0)) return mem;
    if (stored && !this.tokenExpired(stored, 0)) {
      this.memoryAccess = stored;
      return stored;
    }
    return mem || stored;
  }

  /** True when access JWT is present but past (or within skewSec of) exp. */
  isAccessExpiring(skewSec = 60): boolean {
    const token = this.accessToken;
    if (!token) return false;
    return this.tokenExpired(token, skewSec);
  }

  /**
   * Refresh when access token is expired so catalog writes don't 401.
   * No-ops when already fresh or logged out. Dedupes via refreshSession().
   * Network failures keep the existing token — never clear the session here.
   */
  ensureFreshAccessToken(): Observable<string | null> {
    if (!this.accessToken && !this.isLoggedIn()) {
      return of(null);
    }
    if (!this.isAccessExpiring(15) && this.accessToken) {
      return of(this.accessToken);
    }
    return this.refreshSession().pipe(
      map((t) => t.accessToken || this.accessToken),
      catchError(() => of(this.accessToken)),
    );
  }

  private tokenExpired(token: string, skewSec: number): boolean {
    try {
      const part = token.split('.')[1];
      if (!part) return true;
      const json = JSON.parse(
        atob(part.replace(/-/g, '+').replace(/_/g, '/')),
      ) as { exp?: number };
      if (!json.exp) return false;
      return json.exp <= Math.floor(Date.now() / 1000) + skewSec;
    } catch {
      return true;
    }
  }

  login(email: string, password: string) {
    return this.http
      .post<LoginResponse>(
        `${environment.apiBaseUrl}/auth/login`,
        { email, password },
        { withCredentials: true },
      )
      .pipe(tap((res) => this.persistSession(res)));
  }

  register(payload: {
    email: string;
    password: string;
    brand?: string;
    firstName?: string;
    lastName?: string;
  }) {
    return this.http.post(`${environment.apiBaseUrl}/auth/register`, payload, {
      withCredentials: true,
    });
  }

  /** Rotate refresh cookie and store new access token. Dedupes concurrent callers. */
  refreshSession(): Observable<AccessTokenResponse> {
    if (this.refreshInFlight) return this.refreshInFlight;

    this.refreshInFlight = this.http
      .post<AccessTokenResponse>(
        `${environment.apiBaseUrl}/auth/refresh`,
        {},
        { withCredentials: true },
      )
      .pipe(
        tap((tokens) => this.persistTokens(tokens)),
        finalize(() => {
          this.refreshInFlight = null;
        }),
        shareReplay(1),
      );
    return this.refreshInFlight;
  }

  logout() {
    const req$ = this.accessToken
      ? this.http
          .post(
            `${environment.apiBaseUrl}/auth/logout`,
            {},
            { withCredentials: true },
          )
          .pipe(catchError(() => of(null)))
      : of(null);

    return req$.pipe(
      tap(() => {
        this.clearSession();
        this.router.navigateByUrl('/login');
      }),
    );
  }

  /** Clear session without calling API (used when refresh fails). */
  forceLogout() {
    this.clearSession();
    this.router.navigateByUrl('/login?next=/admin');
  }

  me() {
    return this.http.get<AuthUser>(`${environment.apiBaseUrl}/auth/me`).pipe(
      tap((user) => {
        sessionStorage.setItem(USER_KEY, JSON.stringify(user));
        this.userSignal.set(user);
      }),
    );
  }

  hasPermission(code: string): boolean {
    return !!this.userSignal()?.permissions?.includes(code);
  }

  hasRole(role: string): boolean {
    return !!this.userSignal()?.roles?.includes(role);
  }

  private persistSession(res: LoginResponse | (AccessTokenResponse & { user: AuthUser })) {
    this.persistTokens(res);
    sessionStorage.setItem(USER_KEY, JSON.stringify(res.user));
    this.userSignal.set(res.user);
  }

  private persistTokens(tokens: AccessTokenResponse) {
    this.memoryAccess = tokens.accessToken;
    sessionStorage.setItem(ACCESS_KEY, tokens.accessToken);
    localStorage.removeItem(LEGACY_REFRESH_KEY);
    localStorage.removeItem(ACCESS_KEY);
  }

  private clearSession() {
    this.memoryAccess = null;
    sessionStorage.removeItem(ACCESS_KEY);
    sessionStorage.removeItem(USER_KEY);
    localStorage.removeItem(ACCESS_KEY);
    localStorage.removeItem(LEGACY_REFRESH_KEY);
    localStorage.removeItem(USER_KEY);
    this.userSignal.set(null);
  }

  private readUser(): AuthUser | null {
    try {
      const raw =
        sessionStorage.getItem(USER_KEY) || localStorage.getItem(USER_KEY);
      if (raw && !sessionStorage.getItem(USER_KEY)) {
        sessionStorage.setItem(USER_KEY, raw);
        localStorage.removeItem(USER_KEY);
      }
      return JSON.parse(raw || 'null');
    } catch {
      return null;
    }
  }
}
