import { ApplicationConfig, provideZoneChangeDetection } from '@angular/core';
import { provideRouter, withComponentInputBinding, withPreloading, PreloadAllModules, withViewTransitions } from '@angular/router';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { routes } from './app.routes';
import { authInterceptor } from './core/interceptors/auth.interceptor';
import { retryGetInterceptor } from './core/interceptors/retry-get.interceptor';
import { cacheGetInterceptor } from './core/interceptors/cache-get.interceptor';
import { provideScrollToTopOnPathChange } from './core/scroll-to-top';
import { provideAnimationsAsync } from '@angular/platform-browser/animations/async';

export const appConfig: ApplicationConfig = {
  providers: [
    provideZoneChangeDetection({ eventCoalescing: true }),
    provideRouter(routes, withComponentInputBinding(), withPreloading(PreloadAllModules), withViewTransitions({ skipInitialTransition: true })),
    provideScrollToTopOnPathChange(),
    provideHttpClient(withInterceptors([cacheGetInterceptor, authInterceptor, retryGetInterceptor])),
    provideAnimationsAsync(),
  ],
};
