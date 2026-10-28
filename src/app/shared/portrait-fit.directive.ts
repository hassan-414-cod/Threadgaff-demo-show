import { AfterViewInit, Directive, ElementRef, HostListener, inject } from '@angular/core';

/**
 * Product windows are portrait (4:5). A portrait photo is shown whole, exactly as before. A
 * wide photo (a model standing in a landscape shot) would otherwise be a thin strip in the
 * middle of the window, so it is zoomed in on the centre until it fills the window.
 *
 * The photo itself is never changed; this only decides how it is framed.
 */
@Directive({ selector: 'img[tgPortraitFit]', standalone: true })
export class PortraitFitDirective implements AfterViewInit {
  private readonly el = inject<ElementRef<HTMLImageElement>>(ElementRef).nativeElement;

  constructor() {
    // Until the photo has arrived the window shows a soft placeholder; the photo then fades in.
    this.el.classList.add('tg-pending');
  }

  ngAfterViewInit() {
    if (this.el.complete) this.apply();
  }

  @HostListener('error')
  failed() {
    this.el.classList.remove('tg-pending');
  }

  @HostListener('load')
  apply() {
    this.el.classList.remove('tg-pending');
    const w = this.el.naturalWidth;
    const h = this.el.naturalHeight;
    if (!w || !h) return;
    const ratio = w / h;
    const style = this.el.style;
    if (ratio <= 0.85) {
      // portrait: unchanged (whole photo visible)
      style.objectFit = '';
      style.objectPosition = '';
      style.removeProperty('--fit-zoom');
      style.removeProperty('--fit-origin');
      return;
    }
    // wide or square: fill the portrait window, centred on the model
    style.objectFit = 'cover';
    style.objectPosition = '50% 38%';
    // wide shots show the model small, so zoom in a little more
    style.setProperty('--fit-zoom', ratio > 1.3 ? '1.25' : '1');
    style.setProperty('--fit-origin', '50% 38%');
  }
}
