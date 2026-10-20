import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { TimeoutError, retry, throwError, timeout, timer } from 'rxjs';

/** A stalled, dropped or briefly unavailable server: worth asking again. */
function isTransient(err: unknown): boolean {
  if (err instanceof TimeoutError) return true;
  const status = (err as HttpErrorResponse)?.status;
  return status === 0 || status === 502 || status === 503 || status === 504;
}

/**
 * Reads (GET) are safe to repeat. When the API stalls, resets the connection or answers
 * 502/503/504, give up on that attempt after 12 s and try again (up to 3 attempts), so a
 * single hiccup does not show "Failed to load …" to the user.
 * Writes are never repeated.
 */
export const retryGetInterceptor: HttpInterceptorFn = (req, next) => {
  if (req.method !== 'GET' || req.url.includes('/auth/')) return next(req);
  return next(req).pipe(
    timeout(12000),
    retry({
      count: 2,
      delay: (err, attempt) => (isTransient(err) ? timer(500 * attempt) : throwError(() => err)),
    }),
  );
};
