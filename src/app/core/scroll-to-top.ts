import { ViewportScroller } from '@angular/common';
import { inject, provideAppInitializer } from '@angular/core';
import { NavigationEnd, Router } from '@angular/router';
import { filter } from 'rxjs/operators';

function routePath(url: string): string {
  return (url || '').split('?')[0].split('#')[0];
}

/** Scroll to top only when the route path changes — not on query/hash updates. */
export function provideScrollToTopOnPathChange() {
  return provideAppInitializer(() => {
    const router = inject(Router);
    const viewport = inject(ViewportScroller);
    let previousPath = routePath(router.url);

    router.events
      .pipe(filter((e): e is NavigationEnd => e instanceof NavigationEnd))
      .subscribe((e) => {
        const nextPath = routePath(e.urlAfterRedirects);
        if (nextPath !== previousPath) {
          viewport.scrollToPosition([0, 0]);
          if (typeof window !== 'undefined') {
            window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
          }
        }
        previousPath = nextPath;
      });
  });
}
