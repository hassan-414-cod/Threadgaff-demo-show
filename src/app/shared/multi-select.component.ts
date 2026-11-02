import { Component, ElementRef, HostListener, computed, inject, input, output, signal } from '@angular/core';

export interface MultiOption {
  value: string;
  label: string;
}

/**
 * A drop-down with a tick box for every option, for choosing several: one click on the button opens the
 * list, each option is ticked or unticked on its own, and "Select all" / "Clear" do all of them at once.
 * It closes on Escape or a click outside, and the arrow keys move between the options.
 */
@Component({
  selector: 'tg-multi-select',
  standalone: true,
  template: `
    <button
      type="button"
      class="ms-btn"
      [class.open]="open()"
      aria-haspopup="listbox"
      [attr.aria-expanded]="open()"
      [attr.aria-label]="ariaLabel()"
      (click)="toggleOpen()"
      (keydown)="onButtonKey($event)"
    >
      <span class="ms-text" [class.empty]="!selected().length">{{ summary() }}</span>
      @if (selected().length) {
        <span class="ms-count" aria-hidden="true">{{ selected().length }}</span>
      }
      <svg class="ms-chev" viewBox="0 0 20 20" width="16" height="16" aria-hidden="true">
        <path d="M5 8l5 5 5-5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
      </svg>
    </button>
    @if (open()) {
      <div class="ms-panel" role="listbox" aria-multiselectable="true" [attr.aria-label]="ariaLabel()" (keydown)="onPanelKey($event)">
        <div class="ms-tools">
          <button type="button" (click)="all.emit()">Select all</button>
          <button type="button" (click)="none.emit()" [disabled]="!selected().length">Clear</button>
        </div>
        @for (o of options(); track o.value) {
          <label class="ms-opt" role="option" [class.on]="isOn(o.value)" [attr.aria-selected]="isOn(o.value)">
            <input type="checkbox" [checked]="isOn(o.value)" (change)="toggled.emit({ value: o.value, checked: $any($event.target).checked })" />
            <span class="ms-box" aria-hidden="true">
              <svg viewBox="0 0 16 16" width="12" height="12"><path d="M3 8.5l3.2 3.2L13 4.8" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" /></svg>
            </span>
            <span class="ms-label">{{ o.label }}</span>
          </label>
        }
      </div>
    }
  `,
  styles: `
    :host { display: block; position: relative; }
    .ms-btn {
      width: 100%; display: flex; align-items: center; gap: 10px; padding: 10px 12px; font: inherit; font-size: 0.86rem;
      background: #fff; border: 1px solid var(--line, #d4cec0); border-radius: 10px; cursor: pointer; color: var(--ink, #353936);
      text-align: left; transition: border-color 0.15s ease, box-shadow 0.15s ease;
    }
    .ms-btn:hover { border-color: #3d4b37; }
    .ms-btn.open, .ms-btn:focus-visible { border-color: #3d4b37; box-shadow: 0 0 0 3px rgba(61, 75, 55, 0.14); outline: none; }
    .ms-text { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-weight: 600; }
    .ms-text.empty { color: var(--muted, #6b6f63); font-weight: 400; }
    .ms-count {
      min-width: 22px; height: 22px; padding: 0 6px; box-sizing: border-box; border-radius: 999px; background: #3d4b37; color: #fff;
      font-size: 0.72rem; font-weight: 700; display: inline-flex; align-items: center; justify-content: center;
    }
    .ms-chev { flex: none; color: var(--muted, #6b6f63); transition: transform 0.18s ease; }
    .ms-btn.open .ms-chev { transform: rotate(180deg); }
    .ms-panel {
      position: absolute; z-index: 30; left: 0; right: 0; top: calc(100% + 6px); padding: 6px; background: #fff;
      border: 1px solid var(--line, #d4cec0); border-radius: 12px; box-shadow: 0 14px 34px rgba(40, 36, 28, 0.18);
      max-height: 320px; overflow-y: auto; animation: msIn 0.14s ease;
    }
    @keyframes msIn { from { opacity: 0; transform: translateY(-4px); } to { opacity: 1; transform: none; } }
    .ms-tools { display: flex; justify-content: space-between; padding: 2px 6px 6px; border-bottom: 1px solid #efece4; margin-bottom: 4px; }
    .ms-tools button {
      border: 0; background: none; padding: 4px 2px; font: inherit; font-size: 0.74rem; font-weight: 700; color: #3d4b37; cursor: pointer;
    }
    .ms-tools button:disabled { color: #a6a89f; cursor: default; }
    .ms-tools button:hover:not(:disabled) { text-decoration: underline; }
    .ms-opt { display: flex; align-items: center; gap: 10px; padding: 9px 8px; border-radius: 8px; cursor: pointer; font-size: 0.86rem; }
    .ms-opt:hover { background: #f4f2ec; }
    .ms-opt.on { background: #eef2ea; }
    .ms-opt input { position: absolute; opacity: 0; width: 0; height: 0; }
    .ms-box {
      flex: none; width: 18px; height: 18px; border: 1.5px solid #b9b5a8; border-radius: 5px; background: #fff; color: #fff;
      display: inline-flex; align-items: center; justify-content: center; transition: background 0.12s ease, border-color 0.12s ease;
    }
    .ms-box svg { opacity: 0; }
    .ms-opt.on .ms-box { background: #3d4b37; border-color: #3d4b37; }
    .ms-opt.on .ms-box svg { opacity: 1; }
    .ms-opt:has(input:focus-visible) { outline: 2px solid #3d4b37; outline-offset: -2px; }
    .ms-label { flex: 1; }
    .ms-opt.on .ms-label { font-weight: 600; }
  `,
})
export class MultiSelectComponent {
  readonly options = input.required<MultiOption[]>();
  /** The values that are ticked. */
  readonly selected = input<string[]>([]);
  readonly placeholder = input('Choose…');
  readonly ariaLabel = input('Options');

  /** One option was ticked or unticked. */
  readonly toggled = output<{ value: string; checked: boolean }>();
  readonly all = output<void>();
  readonly none = output<void>();

  protected readonly open = signal(false);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  protected readonly summary = computed(() => {
    const on = this.options().filter((o) => this.selected().includes(o.value));
    if (!on.length) return this.placeholder();
    return on.length <= 2 ? on.map((o) => o.label).join(', ') : `${on[0].label}, ${on[1].label} +${on.length - 2}`;
  });

  protected isOn(value: string): boolean {
    return this.selected().includes(value);
  }

  protected toggleOpen() {
    this.open.update((v) => !v);
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(ev: Event) {
    if (this.open() && !this.host.nativeElement.contains(ev.target as Node)) this.open.set(false);
  }

  protected onButtonKey(ev: KeyboardEvent) {
    if (ev.key === 'Escape') this.open.set(false);
    if (ev.key === 'ArrowDown' && !this.open()) {
      ev.preventDefault();
      this.open.set(true);
    }
  }

  protected onPanelKey(ev: KeyboardEvent) {
    if (ev.key === 'Escape') {
      this.open.set(false);
      (this.host.nativeElement.querySelector('.ms-btn') as HTMLElement | null)?.focus();
      return;
    }
    if (ev.key !== 'ArrowDown' && ev.key !== 'ArrowUp') return;
    ev.preventDefault();
    const inputs = Array.from(this.host.nativeElement.querySelectorAll<HTMLInputElement>('.ms-opt input'));
    const at = inputs.indexOf(document.activeElement as HTMLInputElement);
    const next = ev.key === 'ArrowDown' ? Math.min(inputs.length - 1, at + 1) : Math.max(0, at - 1);
    inputs[next]?.focus();
  }
}
