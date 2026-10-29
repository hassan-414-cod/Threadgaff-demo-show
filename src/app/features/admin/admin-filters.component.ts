import { Component, Input, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AttributeDefinition, CatalogService } from '../../core/services/catalog.service';
import { SiteSettingsService } from '../../core/services/site-settings.service';
import {
  BUILTIN_FILTERS,
  customFilterDefinitions,
  filterCodeFor,
  filterOptionLabels,
  optionValueFor,
} from '../../core/utils/filters';

interface FilterRow {
  code: string;
  title: string;
  /** The filters the shop already had: they cannot be deleted, only their checklist edited. */
  builtin: boolean;
  def: AttributeDefinition | null;
  options: string[];
}

/**
 * Admin → Home page → Filters. Each filter is a heading with a checklist. These are the only
 * filters (and checklist items) that can be ticked in the product editor, and they are the
 * ones shown in the shop's filter sidebar.
 */
@Component({
  selector: 'tg-admin-filters',
  standalone: true,
  imports: [FormsModule],
  template: `
    @if (!embedded) {
      <div class="head">
        <div>
          <p class="kicker">Home page / Filters</p>
          <h1>Filters</h1>
          <p class="lede">
            Add or remove the filters shoppers use to browse. Each filter has a heading and a checklist.
            Only the filters listed here can be ticked when adding or editing a product.
          </p>
        </div>
      </div>
    }

    @if (msg()) {
      <div class="note" [class.err]="msgErr()" role="status">{{ msg() }}</div>
    }

    <section class="card add-card">
      <h2>Add a filter</h2>
      <div class="add-grid">
        <div>
          <label for="nf-heading">Heading</label>
          <input
            id="nf-heading"
            type="text"
            maxlength="40"
            placeholder="e.g. Season"
            [ngModel]="newHeading()"
            (ngModelChange)="newHeading.set($event)"
          />
        </div>
        <div>
          <label for="nf-items">Checklist items <span class="soft">(one per line)</span></label>
          <textarea
            id="nf-items"
            rows="3"
            placeholder="Spring / Summer&#10;Autumn / Winter"
            [ngModel]="newItems()"
            (ngModelChange)="newItems.set($event)"
          ></textarea>
        </div>
        <button type="button" class="btn primary" [disabled]="busy()" (click)="addFilter()">+ Add filter</button>
      </div>
    </section>

    <div class="grid">
      @for (f of rows(); track f.code) {
        <article class="card filter" [class.is-hidden]="isHidden(f.code)">
          <header>
            <h2>{{ f.title }}</h2>
            <div class="head-tools">
              <button
                type="button"
                class="toggle"
                role="switch"
                [class.on]="!isHidden(f.code)"
                [attr.aria-checked]="!isHidden(f.code)"
                [attr.aria-label]="(isHidden(f.code) ? 'Show ' : 'Hide ') + f.title + ' on the shop'"
                [title]="isHidden(f.code) ? 'Hidden on the shop. Click to show.' : 'Shown on the shop. Click to hide.'"
                (click)="toggleHidden(f)"
              >
                <span class="knob"></span>
              </button>
              <span class="state">{{ isHidden(f.code) ? 'Hidden' : 'Shown' }}</span>
              @if (f.builtin) {
                <span class="tag">Existing</span>
              } @else {
                <button type="button" class="link-danger" [disabled]="busy()" (click)="removeFilter(f)">Delete</button>
              }
            </div>
          </header>

          <ul class="checklist">
            @for (o of f.options; track o) {
              <li>
                <span class="box" aria-hidden="true">✓</span>
                <span class="lbl">{{ o }}</span>
                <button type="button" class="x" [disabled]="busy()" (click)="removeOption(f, o)" [attr.aria-label]="'Remove ' + o + ' from ' + f.title">×</button>
              </li>
            } @empty {
              <li class="empty">No items yet.</li>
            }
          </ul>

          <div class="add-opt">
            <input
              type="text"
              maxlength="60"
              placeholder="Add an item"
              [attr.aria-label]="'Add an item to ' + f.title"
              [ngModel]="draft(f.code)"
              (ngModelChange)="setDraft(f.code, $event)"
              (keydown.enter)="addOption(f)"
            />
            <button type="button" class="btn" [disabled]="busy() || !draft(f.code).trim()" (click)="addOption(f)">Add</button>
          </div>
        </article>
      }
    </div>
  `,
  styles: `
    :host { display: block; color: var(--ink, #1c1f1b); }
    .head { margin-bottom: 20px; }
    .kicker {
      margin: 0 0 8px; font-size: 0.68rem; font-weight: 700; letter-spacing: 0.12em;
      text-transform: uppercase; color: var(--muted, #6b6f63);
    }
    h1 { margin: 0; font-size: 1.75rem; letter-spacing: -0.02em; }
    .lede { margin: 6px 0 0; color: #7a7f74; font-size: 0.92rem; max-width: 62ch; }
    h2 { margin: 0; font-size: 1rem; }

    .note {
      margin-bottom: 14px; padding: 10px 14px; border-radius: 8px; font-size: 0.85rem;
      background: #eef2ea; color: #3d4b37; border: 1px solid #d8e0d1;
    }
    .note.err { background: #f8ece9; color: #8b3a2f; border-color: #ebcfc9; }

    .card {
      background: #fff; border: 1px solid var(--ui-line, #e4e0d6); border-radius: 12px;
      padding: 18px; box-shadow: 0 1px 2px rgba(28, 31, 27, 0.04);
    }
    .add-card { margin-bottom: 18px; }
    .add-card h2 { margin-bottom: 12px; }
    .add-grid { display: grid; grid-template-columns: 1fr 1.4fr auto; gap: 14px; align-items: start; }
    .add-grid > .btn { align-self: end; }
    label { display: block; font-size: 0.75rem; font-weight: 600; margin-bottom: 6px; }
    .soft { color: var(--muted, #6b6f63); font-weight: 400; }
    input, textarea {
      width: 100%; box-sizing: border-box; border: 1px solid var(--ui-line, #e4e0d6); border-radius: 8px;
      background: #fff; padding: 10px 12px; font: inherit; color: inherit;
    }
    textarea { resize: vertical; }
    input:focus, textarea:focus { outline: 2px solid #3d4b37; outline-offset: 0; border-color: transparent; }

    .btn {
      border: 1px solid var(--ui-line, #e4e0d6); background: #fff; color: inherit; cursor: pointer;
      padding: 10px 14px; border-radius: 8px; font: inherit; font-weight: 600; font-size: 0.8rem; white-space: nowrap;
    }
    .btn.primary { background: #3d4b37; border-color: #3d4b37; color: #fff; }
    .btn:disabled { opacity: 0.5; cursor: not-allowed; }

    .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 16px; align-items: start; }
    .filter header { display: flex; flex-wrap: wrap; justify-content: space-between; align-items: center; gap: 8px 10px; margin-bottom: 12px; }
    .filter header h2 { flex: 1 1 150px; min-width: 0; overflow-wrap: anywhere; }
    .head-tools { display: flex; flex-wrap: wrap; align-items: center; gap: 6px 8px; }
    .state { font-size: 0.68rem; font-weight: 600; color: var(--muted, #6b6f63); min-width: 42px; }
    .toggle {
      position: relative; width: 30px; height: 17px; border-radius: 999px; border: 0; padding: 0; cursor: pointer;
      background: #c9c5b8; transition: background 0.15s ease; flex: none;
    }
    .toggle.on { background: #3d4b37; }
    .toggle .knob {
      position: absolute; top: 2px; left: 2px; width: 13px; height: 13px; border-radius: 50%; background: #fff;
      transition: transform 0.15s ease; box-shadow: 0 1px 2px rgba(0, 0, 0, 0.25);
    }
    .toggle.on .knob { transform: translateX(13px); }
    .toggle:disabled { opacity: 0.5; cursor: not-allowed; }
    .toggle:focus-visible { outline: 2px solid #3d4b37; outline-offset: 2px; }
    .filter.is-hidden .checklist, .filter.is-hidden .add-opt { opacity: 0.55; }
    .filter.is-hidden h2 { color: var(--muted, #6b6f63); }
    .tag {
      font-size: 0.65rem; font-weight: 700; letter-spacing: 0.06em; text-transform: uppercase;
      color: #3d4b37; background: #eef2ea; padding: 3px 8px; border-radius: 999px;
    }
    .link-danger {
      border: 0; background: none; color: #8b3a2f; font: inherit; font-size: 0.78rem; font-weight: 600;
      cursor: pointer; padding: 0;
    }
    .link-danger:hover { text-decoration: underline; }

    .checklist { list-style: none; margin: 0 0 12px; padding: 0; border-top: 1px solid var(--ui-line, #e4e0d6); }
    .checklist li {
      display: flex; align-items: center; gap: 10px; padding: 9px 2px;
      border-bottom: 1px solid var(--ui-line, #e4e0d6);
    }
    .box {
      width: 18px; height: 18px; border-radius: 4px; background: #3d4b37; color: #fff; flex: none;
      display: inline-flex; align-items: center; justify-content: center; font-size: 0.7rem; font-weight: 700;
    }
    .lbl { flex: 1; min-width: 0; overflow-wrap: anywhere; }
    .x {
      border: 0; background: none; cursor: pointer; font-size: 1.2rem; line-height: 1; color: #9a9d93;
      padding: 0 4px; border-radius: 4px;
    }
    .x:hover { color: #8b3a2f; background: #f8ece9; }
    .x:disabled { cursor: not-allowed; opacity: 0.5; }
    .empty { color: var(--muted, #6b6f63); font-size: 0.85rem; padding-left: 2px; }

    .add-opt { display: flex; gap: 8px; }

    @media (max-width: 760px) {
      .add-grid { grid-template-columns: 1fr; }
    }
  `,
})
export class AdminFiltersComponent implements OnInit {
  /** True when shown inside the Home page tabs, which have their own heading. */
  @Input() embedded = false;
  private readonly catalog = inject(CatalogService);
  private readonly site = inject(SiteSettingsService);

  readonly defs = signal<AttributeDefinition[]>([]);
  /** Codes of the filters switched off on the shop. */
  readonly hidden = signal<string[]>([]);
  readonly busy = signal(false);
  readonly msg = signal('');
  readonly msgErr = signal(false);
  readonly newHeading = signal('');
  readonly newItems = signal('');
  private readonly drafts = signal<Record<string, string>>({});
  private msgTimer: ReturnType<typeof setTimeout> | null = null;

  /** The existing filters first, then the ones added on this page. */
  readonly rows = computed<FilterRow[]>(() => {
    const defs = this.defs();
    const builtin = BUILTIN_FILTERS.map((b) => {
      const def = defs.find((d) => d.code === b.code) || null;
      return { code: b.code, title: b.title, builtin: true, def, options: filterOptionLabels(def) };
    });
    const custom = customFilterDefinitions(defs).map((d) => ({
      code: d.code,
      title: d.name,
      builtin: false,
      def: d,
      options: filterOptionLabels(d),
    }));
    return [...builtin, ...custom];
  });

  ngOnInit() {
    this.load();
    void this.site.current().then((s) => this.hidden.set(s.hiddenFilters));
  }

  isHidden(code: string): boolean {
    return this.hidden().includes(code);
  }

  /** Shows or hides a whole filter on the shop (its checklist items are left as they are). */
  async toggleHidden(row: FilterRow) {
    const before = this.hidden();
    const hiding = !before.includes(row.code);
    const next = hiding ? [...before, row.code] : before.filter((c) => c !== row.code);
    this.hidden.set(next); // the switch moves at once; the save happens in the background
    try {
      await this.site.update({ hiddenFilters: next });
      this.say(hiding ? `“${row.title}” is now hidden on the shop.` : `“${row.title}” is now shown on the shop.`);
    } catch (err) {
      this.hidden.set(before);
      this.fail(err, 'Could not change this filter');
    }
  }

  load() {
    this.catalog.getAttributes().subscribe({
      next: (list) => this.defs.set(list.filter((d) => d.isActive !== false)),
      error: () => this.say('Could not load filters. Is the API running?', true),
    });
  }

  draft(code: string): string {
    return this.drafts()[code] || '';
  }

  setDraft(code: string, value: string) {
    this.drafts.update((d) => ({ ...d, [code]: value }));
  }

  addOption(row: FilterRow) {
    const label = this.draft(row.code).trim();
    if (!label || this.busy()) return;
    if (row.options.some((o) => o.toLowerCase() === label.toLowerCase())) {
      this.say(`“${label}” is already in ${row.title}.`, true);
      return;
    }
    this.persist(row, [...row.options, label], () => this.setDraft(row.code, ''), `Added “${label}”`);
  }

  removeOption(row: FilterRow, label: string) {
    if (!confirm(`Remove “${label}” from ${row.title}? Products ticked with it will lose that tick.`)) return;
    this.persist(
      row,
      row.options.filter((o) => o !== label),
      undefined,
      `Removed “${label}”`,
    );
  }

  addFilter() {
    const heading = this.newHeading().trim();
    const items = this.uniqueLabels(this.newItems().split(/\r?\n/));
    if (!heading) return this.say('Give the filter a heading.', true);
    if (!items.length) return this.say('Add at least one checklist item.', true);
    const code = filterCodeFor(heading);
    const taken =
      this.rows().some((r) => r.code === code || r.title.toLowerCase() === heading.toLowerCase()) ||
      this.defs().some((d) => d.code === code);
    if (taken) return this.say(`There is already a filter called “${heading}”.`, true);

    this.busy.set(true);
    this.catalog
      .createAttribute({
        code,
        name: heading,
        valueType: 'multiselect',
        options: this.optionPayload(items, []),
      })
      .subscribe({
        next: () => {
          this.busy.set(false);
          this.newHeading.set('');
          this.newItems.set('');
          this.say(`Added the “${heading}” filter.`);
          this.load();
        },
        error: (err) => this.fail(err, 'Could not add the filter'),
      });
  }

  removeFilter(row: FilterRow) {
    if (!row.def || row.builtin) return;
    if (!confirm(`Delete the “${row.title}” filter and its checklist? Products will lose these ticks.`)) return;
    this.busy.set(true);
    this.catalog.deleteAttribute(row.def.id).subscribe({
      next: () => {
        this.busy.set(false);
        this.say(`Deleted the “${row.title}” filter.`);
        this.load();
      },
      error: (err) => this.fail(err, 'Could not delete the filter'),
    });
  }

  /** Saves the full checklist for a filter (creating the existing filter if it is missing). */
  private persist(row: FilterRow, labels: string[], done?: () => void, okMsg = 'Saved') {
    const options = this.optionPayload(labels, row.def?.options || []);
    const builtin = BUILTIN_FILTERS.find((b) => b.code === row.code);
    const req$ = row.def
      ? this.catalog.updateAttribute(row.def.id, { options })
      : this.catalog.createAttribute({
          code: row.code,
          name: builtin?.name || row.title,
          valueType: builtin?.valueType || 'multiselect',
          options,
        });
    this.busy.set(true);
    req$.subscribe({
      next: () => {
        this.busy.set(false);
        done?.();
        this.say(okMsg);
        this.load();
      },
      error: (err) => this.fail(err, 'Could not save'),
    });
  }

  /** Keeps the stored value of items that already exist so product ticks stay linked. */
  private optionPayload(
    labels: string[],
    existing: Array<{ value: string; label: string }>,
  ): Array<{ value: string; label: string; sortOrder: number }> {
    const used = new Set<string>();
    return labels.map((label, i) => {
      let value = existing.find((o) => o.label === label)?.value || optionValueFor(label);
      const base = value;
      for (let n = 2; used.has(value); n++) value = `${base}-${n}`;
      used.add(value);
      return { value, label, sortOrder: i };
    });
  }

  private uniqueLabels(raw: string[]): string[] {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const l of raw.map((s) => s.trim()).filter(Boolean)) {
      const k = l.toLowerCase();
      if (seen.has(k)) continue;
      seen.add(k);
      out.push(l);
    }
    return out;
  }

  private fail(err: unknown, fallback: string) {
    this.busy.set(false);
    const m = (err as { error?: { message?: string | string[] } })?.error?.message;
    this.say(Array.isArray(m) ? m.join(', ') : m || fallback, true);
  }

  private say(text: string, isError = false) {
    this.msg.set(text);
    this.msgErr.set(isError);
    if (this.msgTimer) clearTimeout(this.msgTimer);
    this.msgTimer = setTimeout(() => this.msg.set(''), 4000);
  }
}
