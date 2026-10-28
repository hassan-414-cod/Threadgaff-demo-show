import { HttpEvent, HttpEventType, HttpInterceptorFn, HttpResponse } from '@angular/common/http';
import { Observable, finalize, map, of, shareReplay, tap } from 'rxjs';

/** How long a catalogue read is reused (a page change inside this time costs no request). */
const FRESH_MS = 120_000;

const store = new Map<string, { at: number; res: HttpResponse<unknown> }>();
const inflight = new Map<string, Observable<HttpEvent<unknown>>>();
/** Bumped on every catalogue write, so a read that started before it is never stored. */
let epoch = 0;

const isCatalogue = (url: string) => /\/catalog\//.test(url);
const onAdminPage = () => typeof location !== 'undefined' && location.pathname.startsWith('/admin');

/** Each caller gets its own copy, so one page changing a product cannot alter what another sees. */
const copyOf = (res: HttpResponse<unknown>) =>
  res.clone({ body: res.body == null ? res.body : structuredClone(res.body) });

/**
 * Catalogue reads (products, categories, attributes…) are shared between pages for two
 * minutes, and identical reads that are still running are merged into one request.
 * The admin pages always read fresh, and any change to the catalogue (save, upload, delete,
 * visibility…) empties the cache straight away.
 */
export const cacheGetInterceptor: HttpInterceptorFn = (req, next) => {
  if (req.method !== 'GET') {
    if (isCatalogue(req.url) || req.url.includes('/admin')) {
      epoch++;
      store.clear();
      return next(req).pipe(
        tap((ev) => {
          if (ev.type === HttpEventType.Response) {
            epoch++;
            store.clear();
          }
        }),
      );
    }
    return next(req);
  }

  const skip =
    !isCatalogue(req.url) ||
    /\/products\/export/.test(req.url) ||
    req.responseType !== 'json' ||
    !!req.reportProgress ||
    onAdminPage();
  if (skip) return next(req);

  const key = req.urlWithParams;
  const hit = store.get(key);
  if (hit && Date.now() - hit.at < FRESH_MS) return of(copyOf(hit.res));

  let shared = inflight.get(key);
  if (!shared) {
    const startedAt = epoch;
    shared = next(req).pipe(
      tap((ev) => {
        if (ev instanceof HttpResponse && ev.status === 200 && startedAt === epoch) {
          store.set(key, { at: Date.now(), res: ev });
        }
      }),
      finalize(() => inflight.delete(key)),
      shareReplay({ bufferSize: 1, refCount: false }),
    );
    inflight.set(key, shared);
  }
  return shared.pipe(map((ev) => (ev instanceof HttpResponse ? copyOf(ev) : ev)));
};
