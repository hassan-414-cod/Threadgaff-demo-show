import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { catchError, map, of } from 'rxjs';
import { AuthService } from '../services/auth.service';

function staffAllowed(auth: AuthService): boolean {
  return (
    auth.hasPermission('catalog:manage') ||
    auth.hasPermission('catalog:read') ||
    auth.hasRole('ADMIN') ||
    auth.hasRole('STAFF')
  );
}

/** Client must be logged in (designer gate) */
export const authGuard: CanActivateFn = (_route, state) => {
  const auth = inject(AuthService);
  const router = inject(Router);
  if (auth.isLoggedIn()) return true;
  return router.createUrlTree(['/login'], {
    queryParams: { next: state.url },
  });
};

/** Staff/admin catalog access — refresh via httpOnly cookie before failing. */
export const adminGuard: CanActivateFn = (_route, state) => {
  const auth = inject(AuthService);
  const router = inject(Router);
  const loginTree = router.createUrlTree(['/login'], {
    queryParams: { next: state.url },
  });

  if (auth.accessToken && staffAllowed(auth)) return true;

  return auth.refreshSession().pipe(
    map(() => (auth.accessToken && staffAllowed(auth) ? true : loginTree)),
    catchError(() => of(loginTree)),
  );
};
