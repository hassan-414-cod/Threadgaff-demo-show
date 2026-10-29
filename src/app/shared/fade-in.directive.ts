import { AfterViewInit, Directive, ElementRef, HostListener, inject } from '@angular/core';

/**
 * A picture that is still coming in is invisible (class "tg-pending"), then fades in when it has
 * loaded. The page decides how the class looks; this only adds and removes it.
 */
@Directive({ selector: 'img[tgFadeIn]', standalone: true })
export class FadeInDirective implements AfterViewInit {
  private readonly el = inject<ElementRef<HTMLImageElement>>(ElementRef).nativeElement;

  constructor() {
    this.el.classList.add('tg-pending');
  }

  ngAfterViewInit() {
    // a picture that was already cached can finish before this runs
    if (this.el.complete) this.done();
  }

  @HostListener('load')
  @HostListener('error')
  done() {
    this.el.classList.remove('tg-pending');
  }
}
