import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, switchMap, throwError } from 'rxjs';
import { AuthService } from '../services/auth.service';

function isAuthFailure(err: unknown): boolean {
  const status = (err as HttpErrorResponse)?.status;
  return status === 401 || status === 403;
}

export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const auth = inject(AuthService);

  const isAuthCall =
    req.url.includes('/auth/login') ||
    req.url.includes('/auth/refresh') ||
    req.url.includes('/auth/register');

  const withAuth = (token: string | null) =>
    token && !isAuthCall
      ? req.clone({
          setHeaders: { Authorization: `Bearer ${token}` },
          withCredentials: true,
        })
      : req.clone({ withCredentials: true });

  const send = (token: string | null) =>
    next(withAuth(token)).pipe(
      catchError((err: HttpErrorResponse) => {
        if (
          err.status !== 401 ||
          isAuthCall ||
          req.headers.has('X-Retry-After-Refresh')
        ) {
          return throwError(() => err);
        }
        return auth.refreshSession().pipe(
          switchMap(() => {
            const nextToken = auth.accessToken;
            if (!nextToken) return throwError(() => err);
            return next(
              req.clone({
                setHeaders: {
                  Authorization: `Bearer ${nextToken}`,
                  'X-Retry-After-Refresh': '1',
                },
                withCredentials: true,
              }),
            );
          }),
          catchError((refreshErr) => {
            // Only sign out when the refresh cookie is actually rejected.
            // Network / proxy timeouts must NOT log the user out mid-save.
            if (isAuthFailure(refreshErr)) {
              auth.forceLogout();
            }
            return throwError(() => err);
          }),
        );
      }),
    );

  // Refresh before requests when access JWT is already expired
  if (!isAuthCall && auth.accessToken && auth.isAccessExpiring(15)) {
    return auth.ensureFreshAccessToken().pipe(
      switchMap((token) => send(token)),
    );
  }

  return send(auth.accessToken);
};
