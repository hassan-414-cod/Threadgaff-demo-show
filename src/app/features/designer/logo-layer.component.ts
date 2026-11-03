import { Component, ElementRef, inject, input, output, signal } from '@angular/core';
import { LogoPlacement, Spot, heightPct, keepInside } from './logo-placement';

/** How close (in % of the preview) a logo's centre must come to the centre line to snap onto it. */
const SNAP = 1.6;

/**
 * The logos laid over one angle picture of the garment. A logo that is not fixed yet can be dragged to move,
 * resized from its corner, nudged with the arrow keys and locked with the small Fix button. A fixed logo stays
 * where it is, and clicking it offers "Place again". Dragging snaps to the centre lines (with a guide shown),
 * and a logo never leaves the picture.
 */
@Component({
  selector: 'tg-logo-layer',
  standalone: true,
  template: `
    @if (guideX()) {
      <i class="guide v"></i>
    }
    @if (guideY()) {
      <i class="guide h"></i>
    }
    @for (p of placements(); track p.id) {
      <div
        class="logo"
        [class.draft]="!p.fixed"
        [class.fixed]="p.fixed"
        [class.sel]="p.id === selectedId()"
        [class.blend]="blend()"
        [class.below]="p.y < 9"
        [class.bar-l]="p.x < 25"
        [class.bar-r]="p.x > 75"
        [style.left.%]="p.x"
        [style.top.%]="p.y"
        [style.width.%]="p.w"
        [style.aspect-ratio]="logoRatio()"
        tabindex="0"
        [attr.aria-label]="p.fixed ? 'Your logo at ' + p.label + ', fixed. Press Enter to place it again.' : 'Your logo at ' + p.label + '. Drag it to move, or use the arrow keys.'"
        (pointerdown)="down($event, p, 'move')"
        (pointermove)="move($event)"
        (pointerup)="up($event)"
        (pointercancel)="up($event)"
        (keydown)="key($event, p)"
        (focus)="picked.emit(p.id)"
      >
        <img [src]="logoUrl()" [alt]="'Your logo at ' + p.label" draggable="false" />
        @if (p.id === selectedId()) {
          @if (!p.fixed) {
            <span
              class="handle"
              role="presentation"
              title="Drag to resize"
              (pointerdown)="down($event, p, 'resize')"
              (pointermove)="move($event)"
              (pointerup)="up($event)"
              (pointercancel)="up($event)"
            ></span>
          }
          <span class="bar">
            <span class="tag">{{ p.label }}{{ p.fixed ? ' · fixed' : '' }}</span>
            @if (p.fixed) {
              <button type="button" class="again" (pointerdown)="$event.stopPropagation()" (click)="again.emit(p.id)">Place again</button>
            } @else {
              <button type="button" class="fix" (pointerdown)="$event.stopPropagation()" (click)="fix.emit(p.id)">Fix</button>
            }
          </span>
        }
      </div>
    }
  `,
  styles: `
    :host { position: absolute; inset: 0; z-index: 3; pointer-events: none; }
    .logo { position: absolute; transform: translateX(-50%); pointer-events: none; display: block; outline: none; }
    .logo img { width: 100%; height: 100%; display: block; object-fit: contain; user-select: none; pointer-events: none; }
    .logo.blend img { mix-blend-mode: multiply; }
    /* a logo that is not fixed yet: dashed, to be moved; the selected one also has its handle, name and Fix button */
    .logo.draft { pointer-events: auto; cursor: move; touch-action: none; outline: 1.5px dashed rgba(61, 75, 55, 0.65); outline-offset: 2px; }
    /* a fixed logo stays put; clicking it offers Place again */
    .logo.fixed { pointer-events: auto; cursor: pointer; }
    .logo.fixed:hover { outline: 1.5px dashed rgba(61, 75, 55, 0.4); outline-offset: 2px; }
    .logo.sel { outline: 1.5px solid #3d4b37; outline-offset: 2px; z-index: 2; }
    .logo:focus-visible { outline: 2px solid #3d4b37; outline-offset: 2px; }
    .handle {
      position: absolute; right: -8px; bottom: -8px; width: 12px; height: 12px; box-sizing: border-box;
      background: #fff; border: 2px solid #3d4b37; border-radius: 3px; cursor: nwse-resize; touch-action: none;
    }
    /* the name of the selected logo and its Fix / Place again button, side by side above it (below it when it is at the very top) */
    .bar {
      position: absolute; left: 50%; bottom: calc(100% + 7px); transform: translateX(-50%); display: flex; align-items: center;
      gap: 5px; white-space: nowrap; cursor: default;
    }
    .logo.below .bar { bottom: auto; top: calc(100% + 7px); }
    /* a logo near the left or right edge: the bar lines up with the logo's own edge so it is never cut off */
    .logo.bar-l .bar { left: 0; transform: none; }
    .logo.bar-r .bar { left: auto; right: 0; transform: none; }
    .fix, .again {
      border: 0; border-radius: 999px; background: #3d4b37; color: #fff; font: inherit; font-size: 0.66rem; font-weight: 700;
      padding: 3px 11px; cursor: pointer; box-shadow: 0 1px 4px rgba(0, 0, 0, 0.25);
    }
    .again { background: #fff; color: #3d4b37; border: 1px solid #3d4b37; }
    .fix:hover { background: #2f3b2b; }
    .again:hover { background: #eef2ea; }
    .tag {
      background: rgba(255, 255, 255, 0.94); color: #3d4b37; border: 1px solid rgba(61, 75, 55, 0.3); border-radius: 999px;
      font-size: 0.62rem; font-weight: 700; padding: 2px 9px; pointer-events: none; box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
    }
    .guide { position: absolute; background: rgba(61, 107, 79, 0.75); pointer-events: none; }
    .guide.v { left: 50%; top: 0; bottom: 0; width: 1px; }
    .guide.h { top: 50%; left: 0; right: 0; height: 1px; }
    /* fingers: bigger buttons and a bigger grab area on the corner handle (and a wider reach to grab a small logo) */
    @media (pointer: coarse) {
      .fix, .again { padding: 8px 18px; font-size: 0.78rem; }
      .tag { font-size: 0.7rem; padding: 4px 11px; }
      .bar { bottom: calc(100% + 12px); gap: 6px; }
      .logo.below .bar { bottom: auto; top: calc(100% + 12px); }
      .handle { width: 22px; height: 22px; right: -12px; bottom: -12px; border-radius: 6px; }
      .handle::after { content: ''; position: absolute; inset: -12px; }
      .logo.draft::before, .logo.fixed::before { content: ''; position: absolute; inset: -10px; }
    }
  `,
})
export class LogoLayerComponent {
  /** The logos on the angle picture shown. */
  readonly placements = input.required<LogoPlacement[]>();
  readonly logoUrl = input.required<string>();
  /** Width / height of the logo and of the preview. */
  readonly logoRatio = input(1);
  readonly stageRatio = input(0.8);
  readonly selectedId = input<string | null>(null);
  readonly blend = input(false);

  /** A logo was moved or resized (to the given spot). */
  readonly place = output<{ id: string; x: number; y: number; w: number }>();
  /** The move or resize ended. */
  readonly commit = output<void>();
  readonly picked = output<string>();
  readonly fix = output<string>();
  /** The customer wants to place a fixed logo again. */
  readonly again = output<string>();

  protected readonly guideX = signal(false);
  protected readonly guideY = signal(false);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private drag: {
    mode: 'move' | 'resize';
    id: string;
    x0: number;
    y0: number;
    start: Spot;
    rect: DOMRect;
    target: HTMLElement;
    pointerId: number;
  } | null = null;

  protected down(ev: PointerEvent, p: LogoPlacement, mode: 'move' | 'resize') {
    if (mode === 'resize') ev.stopPropagation();
    if (ev.pointerType === 'mouse' && ev.button !== 0) return;
    this.picked.emit(p.id);
    if (p.fixed) return; // a fixed logo is only selected: its button offers to place it again
    const el = ev.currentTarget as HTMLElement;
    ev.preventDefault();
    try {
      el.setPointerCapture(ev.pointerId);
    } catch {
      /* the pointer is already gone */
    }
    this.drag = {
      mode,
      id: p.id,
      x0: ev.clientX,
      y0: ev.clientY,
      start: { x: p.x, y: p.y, w: p.w },
      rect: this.host.nativeElement.getBoundingClientRect(),
      target: el,
      pointerId: ev.pointerId,
    };
  }

  protected move(ev: PointerEvent) {
    const d = this.drag;
    if (!d || ev.pointerId !== d.pointerId) return;
    const dx = ((ev.clientX - d.x0) / d.rect.width) * 100;
    const dy = ((ev.clientY - d.y0) / d.rect.height) * 100;
    const ratio = this.logoRatio();
    const stage = this.stageRatio();
    let next: Spot;
    let gx = false;
    let gy = false;
    if (d.mode === 'move') {
      next = keepInside({ ...d.start, x: d.start.x + dx, y: d.start.y + dy }, ratio, stage);
      const h = heightPct(next.w, ratio, stage);
      if (Math.abs(next.x - 50) < SNAP) {
        next = { ...next, x: 50 };
        gx = true;
      }
      if (Math.abs(next.y + h / 2 - 50) < SNAP) {
        next = { ...next, y: 50 - h / 2 };
        gy = true;
      }
      next = keepInside(next, ratio, stage);
    } else {
      // the corner handle: the top-left corner stays and the logo keeps its proportions
      const left = d.start.x - d.start.w / 2;
      const w = keepInside({ ...d.start, w: d.start.w + dx }, ratio, stage).w;
      next = keepInside({ ...d.start, w, x: left + w / 2 }, ratio, stage);
    }
    this.guideX.set(gx);
    this.guideY.set(gy);
    this.place.emit({ id: d.id, ...next });
  }

  protected up(ev: PointerEvent) {
    const d = this.drag;
    if (!d || ev.pointerId !== d.pointerId) return;
    try {
      d.target.releasePointerCapture(d.pointerId);
    } catch {
      /* already released */
    }
    this.drag = null;
    this.guideX.set(false);
    this.guideY.set(false);
    this.commit.emit();
  }

  /** The arrow keys move a logo that is not fixed yet (Shift = bigger steps); Enter places a fixed one again. */
  protected key(ev: KeyboardEvent, p: LogoPlacement) {
    if (p.fixed) {
      if (ev.key === 'Enter') {
        ev.preventDefault();
        this.again.emit(p.id);
      }
      return;
    }
    const step = ev.shiftKey ? 2 : 0.5;
    const move: Record<string, [number, number]> = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
    const m = move[ev.key];
    if (!m) return;
    ev.preventDefault();
    const next = keepInside({ x: p.x + m[0], y: p.y + m[1], w: p.w }, this.logoRatio(), this.stageRatio());
    this.place.emit({ id: p.id, ...next });
    this.commit.emit();
  }
}
