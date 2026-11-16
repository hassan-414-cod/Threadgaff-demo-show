import { AfterViewInit, Directive, ElementRef, HostListener, OnDestroy, inject } from '@angular/core';

/**
 * A picture that is still coming in is invisible (class "tg-pending"), then fades in when it has
 * loaded. The page decides how the class looks; this only adds and removes it. When the picture's
 * address changes (another angle, another colour), it goes back to "pending" until the new one is in.
 */
@Directive({ selector: 'img[tgFadeIn]', standalone: true })
export class FadeInDirective implements AfterViewInit, OnDestroy {
  private readonly el = inject<ElementRef<HTMLImageElement>>(ElementRef).nativeElement;
  private readonly watch = new MutationObserver(() => {
    if (!this.el.complete) this.el.classList.add('tg-pending');
  });

  constructor() {
    this.el.classList.add('tg-pending');
  }

  ngAfterViewInit() {
    // a picture that was already cached can finish before this runs
    if (this.el.complete) this.done();
    this.watch.observe(this.el, { attributes: true, attributeFilter: ['src'] });
  }

  ngOnDestroy() {
    this.watch.disconnect();
  }

  @HostListener('load')
  @HostListener('error')
  done() {
    this.el.classList.remove('tg-pending');
  }
}
