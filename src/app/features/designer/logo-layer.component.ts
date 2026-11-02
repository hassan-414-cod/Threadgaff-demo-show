import { Component, ElementRef, inject, input, output, signal } from '@angular/core';
import { LogoPlacement, Spot, heightPct, keepInside, spotOf } from './logo-placement';

/** How close (in % of the preview) a logo's centre must come to the centre line to snap onto it. */
const SNAP = 1.6;

/**
 * The logos laid over one angle picture of the garment. A logo that is not fixed yet can be dragged to move,
 * resized from its corner, nudged with the arrow keys and locked with the small Fix button. Dragging snaps to
 * the centre lines (with a guide shown), and a logo never leaves the picture.
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
      @let s = spot(p);
      <div
        class="logo"
        [class.draft]="!p.fixed"
        [class.sel]="!p.fixed && p.id === selectedId()"
        [class.blend]="blend()"
        [class.below]="s.y < 9"
        [style.left.%]="s.x"
        [style.top.%]="s.y"
        [style.width.%]="s.w"
        [style.aspect-ratio]="logoRatio()"
        [attr.tabindex]="p.fixed ? null : 0"
        [attr.aria-label]="p.fixed ? null : 'Your logo at ' + p.label + '. Drag it to move, or use the arrow keys.'"
        (pointerdown)="down($event, p, 'move')"
        (pointermove)="move($event)"
        (pointerup)="up($event)"
        (pointercancel)="up($event)"
        (keydown)="key($event, p)"
        (focus)="picked.emit(p.id)"
      >
        <img [src]="logoUrl()" [alt]="'Your logo at ' + p.label" draggable="false" />
        @if (!p.fixed && p.id === selectedId()) {
          <span
            class="handle"
            role="presentation"
            title="Drag to resize"
            (pointerdown)="down($event, p, 'resize')"
            (pointermove)="move($event)"
            (pointerup)="up($event)"
            (pointercancel)="up($event)"
          ></span>
          <span class="bar">
            <span class="tag">{{ p.label }}</span>
            <button type="button" class="fix" (pointerdown)="$event.stopPropagation()" (click)="fix.emit(p.id)">Fix</button>
          </span>
        }
      </div>
    }
  `,
  styles: `
    :host { position: absolute; inset: 0; z-index: 3; pointer-events: none; }
    .logo { position: absolute; transform: translateX(-50%); pointer-events: none; display: block; }
    .logo img { width: 100%; height: 100%; display: block; object-fit: contain; user-select: none; pointer-events: none; }
    .logo.blend img { mix-blend-mode: multiply; }
    /* a logo that is not fixed yet: dashed, to be moved; the selected one also has its handle, name and Fix button */
    .logo.draft { pointer-events: auto; cursor: move; touch-action: none; outline: 1.5px dashed rgba(61, 75, 55, 0.65); outline-offset: 2px; }
    .logo.sel { outline: 1.5px solid #3d4b37; z-index: 2; }
    .logo.draft:focus-visible { outline: 2px solid #3d4b37; }
    .handle {
      position: absolute; right: -8px; bottom: -8px; width: 12px; height: 12px; box-sizing: border-box;
      background: #fff; border: 2px solid #3d4b37; border-radius: 3px; cursor: nwse-resize; touch-action: none;
    }
    /* the name of the selected logo and its Fix button, side by side above it (below it when it is at the very top) */
    .bar {
      position: absolute; left: 50%; bottom: calc(100% + 7px); transform: translateX(-50%); display: flex; align-items: center;
      gap: 5px; white-space: nowrap; cursor: default;
    }
    .logo.below .bar { bottom: auto; top: calc(100% + 7px); }
    .fix {
      border: 0; border-radius: 999px; background: #3d4b37; color: #fff; font: inherit; font-size: 0.66rem; font-weight: 700;
      padding: 3px 11px; cursor: pointer; box-shadow: 0 1px 4px rgba(0, 0, 0, 0.25);
    }
    .fix:hover { background: #2f3b2b; }
    .tag {
      background: rgba(255, 255, 255, 0.94); color: #3d4b37; border: 1px solid rgba(61, 75, 55, 0.3); border-radius: 999px;
      font-size: 0.62rem; font-weight: 700; padding: 2px 9px; pointer-events: none; box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
    }
    .guide { position: absolute; background: rgba(61, 107, 79, 0.75); pointer-events: none; }
    .guide.v { left: 50%; top: 0; bottom: 0; width: 1px; }
    .guide.h { top: 50%; left: 0; right: 0; height: 1px; }
  `,
})
export class LogoLayerComponent {
  readonly placements = input.required<LogoPlacement[]>();
  /** The angle picture shown (its slot), to know which position of each logo to draw. */
  readonly viewKey = input.required<string>();
  readonly logoUrl = input.required<string>();
  /** Width / height of the logo and of the preview. */
  readonly logoRatio = input(1);
  readonly stageRatio = input(0.8);
  readonly selectedId = input<string | null>(null);
  readonly blend = input(false);

  /** A logo was moved or resized on this picture (to the given spot). */
  readonly place = output<{ id: string; x: number; y: number; w: number }>();
  /** The move or resize ended. */
  readonly commit = output<void>();
  readonly picked = output<string>();
  readonly fix = output<string>();

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

  protected spot(p: LogoPlacement): Spot {
    return spotOf(p, this.viewKey());
  }

  protected down(ev: PointerEvent, p: LogoPlacement, mode: 'move' | 'resize') {
    if (mode === 'resize') ev.stopPropagation();
    if (p.fixed || (ev.pointerType === 'mouse' && ev.button !== 0)) return;
    const el = ev.currentTarget as HTMLElement;
    ev.preventDefault();
    this.picked.emit(p.id);
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
      start: this.spot(p),
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

  /** The arrow keys move a logo that is not fixed yet (Shift = bigger steps). */
  protected key(ev: KeyboardEvent, p: LogoPlacement) {
    if (p.fixed) return;
    const step = ev.shiftKey ? 2 : 0.5;
    const move: Record<string, [number, number]> = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
    const m = move[ev.key];
    if (!m) return;
    ev.preventDefault();
    const s = this.spot(p);
    const next = keepInside({ ...s, x: s.x + m[0], y: s.y + m[1] }, this.logoRatio(), this.stageRatio());
    this.place.emit({ id: p.id, ...next });
    this.commit.emit();
  }
}
