import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AttributeDefinition, CatalogService } from '../../core/services/catalog.service';
import { AttributeTemplatesService, TEMPLATE_CODES } from '../../core/services/attribute-templates.service';
import { SiteSettingsService } from '../../core/services/site-settings.service';
import { AttrImageComponent } from '../../shared/attr-image.component';
import { AttrTemplateComponent } from '../../shared/attr-template.component';
import { filterOptionLabels, optionValueFor } from '../../core/utils/filters';

/** The attributes the shop and the designer rely on: they can be edited but not deleted. */
const SYSTEM_CODES = [
  'material',
  'gender',
  'sustainability',
  'sleeve',
  'style',
  'fit',
  'decoration',
  'gsm',
  'placement',
  'logo_placement',
  'private_label',
  'price_range',
  'service_addons',
  'brand',
];

const KIND_LABELS: Record<string, string> = {
  select: 'One option',
  multiselect: 'Several options',
  text: 'Free text',
  number: 'Number',
  boolean: 'Yes / No',
};

interface AttrCard {
  def: AttributeDefinition;
  kindLabel: string;
  /** True for the attributes with a checklist of options. */
  hasOptions: boolean;
  options: string[];
  system: boolean;
  /** True when the Custom Designer lets a customer choose this attribute, so its options can have a template. */
  templated: boolean;
}

/**
 * Admin → Products → Attributes. Laid out like the Filters page: each attribute is a card with a
 * checklist of options. Every option can have a picture (shown to shoppers when they click the
 * value) and, for the attributes the Custom Designer uses (Sleeve, Style, Material, GSM), a
 * template: pictures of the garment per angle that the designer shows when a customer picks it.
 */
@Component({
  selector: 'tg-admin-attributes',
  standalone: true,
  imports: [FormsModule, AttrImageComponent, AttrTemplateComponent],
  template: `
    <div class="head">
      <div>
        <p class="kicker">Products / Attributes</p>
        <h1>Attributes</h1>
        <p class="lede">
          An attribute describes a garment: Sleeve, Style, Fit… Each one has a checklist of options that you tick when
          you add or edit a product. Give an option a <strong>Template</strong> (pictures of the garment with that
          option, for example the half-sleeve shirt) and the Custom Designer shows them when a customer picks it.
        </p>
      </div>
    </div>

    @if (msg()) {
      <div class="note" [class.err]="msgErr()" role="status">{{ msg() }}</div>
    }

    <section class="card add-card">
      <h2>Add an attribute</h2>
      <div class="add-grid">
        <div>
          <label for="na-name">Name</label>
          <input
            id="na-name"
            type="text"
            maxlength="40"
            placeholder="e.g. Neckline"
            [ngModel]="newName()"
            (ngModelChange)="newName.set($event)"
          />
        </div>
        <div>
          <label for="na-type">Customer picks</label>
          <select id="na-type" [ngModel]="newType()" (ngModelChange)="newType.set($event)">
            <option value="select">One option</option>
            <option value="multiselect">Several options</option>
            <option value="text">Free text</option>
          </select>
        </div>
        @if (newType() !== 'text') {
          <div>
            <label for="na-items">Options <span class="soft">(one per line)</span></label>
            <textarea
              id="na-items"
              rows="3"
              placeholder="Round neck&#10;V-neck"
              [ngModel]="newItems()"
              (ngModelChange)="newItems.set($event)"
            ></textarea>
          </div>
        }
        <button type="button" class="btn primary" [disabled]="busy()" (click)="addAttribute()">+ Add attribute</button>
      </div>
    </section>

    <div class="grid">
      @for (c of cards(); track c.def.id) {
        <article class="card attr">
          <header>
            <div class="title">
              <h2>{{ c.def.name }}</h2>
              <span class="code">{{ c.def.code }}</span>
            </div>
            <div class="head-tools">
              <span class="tag">{{ c.kindLabel }}</span>
              @if (!c.system) {
                <button type="button" class="link-danger" [disabled]="busy()" (click)="removeAttribute(c)">Delete</button>
              }
            </div>
          </header>

          @if (c.hasOptions) {
            <ul class="checklist">
              @for (o of c.options; track o) {
                <li>
                  <span class="box" aria-hidden="true">✓</span>
                  <span class="lbl">{{ o }}</span>
                  <tg-attr-image [code]="c.def.code" [label]="o" />
                  @if (c.templated) {
                    <button
                      type="button"
                      class="tpl"
                      [class.on]="isOpen(c, o)"
                      [attr.aria-expanded]="isOpen(c, o)"
                      [attr.aria-label]="'Template for ' + o"
                      title="Garment pictures per angle: the designer shows them when a customer picks this option"
                      (click)="toggle(c, o)"
                    >
                      Template
                      @if (count(c, o)) {
                        <span class="n">{{ count(c, o) }}</span>
                      }
                    </button>
                  }
                  <button
                    type="button"
                    class="x"
                    [disabled]="busy()"
                    (click)="removeOption(c, o)"
                    [attr.aria-label]="'Remove ' + o + ' from ' + c.def.name"
                  >×</button>
                  @if (c.templated && isOpen(c, o)) {
                    <tg-attr-template [code]="c.def.code" [label]="o" />
                  }
                </li>
              } @empty {
                <li class="empty">No options yet.</li>
              }
            </ul>

            <div class="add-opt">
              <input
                type="text"
                maxlength="60"
                placeholder="Add an option"
                [attr.aria-label]="'Add an option to ' + c.def.name"
                [ngModel]="draft(c.def.code)"
                (ngModelChange)="setDraft(c.def.code, $event)"
                (keydown.enter)="addOption(c)"
              />
              <button type="button" class="btn" [disabled]="busy() || !draft(c.def.code).trim()" (click)="addOption(c)">Add</button>
            </div>
            @if (c.templated) {
              <p class="hint">The Custom Designer lets customers choose {{ c.def.name }}, so each option can have a template.</p>
            }
          } @else {
            <p class="plain">Typed in when you edit a product, so there is no checklist.</p>
          }
        </article>
      } @empty {
        <p class="empty-all">No attributes yet.</p>
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
    .lede { margin: 6px 0 0; color: #7a7f74; font-size: 0.92rem; max-width: 70ch; line-height: 1.5; }
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
    .add-grid { display: grid; grid-template-columns: 1fr 0.8fr 1.4fr auto; gap: 14px; align-items: start; }
    .add-grid > .btn { align-self: end; }
    label { display: block; font-size: 0.75rem; font-weight: 600; margin-bottom: 6px; }
    .soft { color: var(--muted, #6b6f63); font-weight: 400; }
    input, textarea, select {
      width: 100%; box-sizing: border-box; border: 1px solid var(--ui-line, #e4e0d6); border-radius: 8px;
      background: #fff; padding: 10px 12px; font: inherit; color: inherit;
    }
    textarea { resize: vertical; }
    input:focus, textarea:focus, select:focus { outline: 2px solid #3d4b37; outline-offset: 0; border-color: transparent; }

    .btn {
      border: 1px solid var(--ui-line, #e4e0d6); background: #fff; color: inherit; cursor: pointer;
      padding: 10px 14px; border-radius: 8px; font: inherit; font-weight: 600; font-size: 0.8rem; white-space: nowrap;
    }
    .btn.primary { background: #3d4b37; border-color: #3d4b37; color: #fff; }
    .btn:disabled { opacity: 0.5; cursor: not-allowed; }

    .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(340px, 1fr)); gap: 16px; align-items: start; }
    .attr header { display: flex; flex-wrap: wrap; justify-content: space-between; align-items: center; gap: 8px 10px; margin-bottom: 12px; }
    .title { flex: 1 1 150px; min-width: 0; display: flex; align-items: baseline; gap: 8px; flex-wrap: wrap; }
    .title h2 { overflow-wrap: anywhere; }
    .code { font-family: 'IBM Plex Mono', monospace; font-size: 0.68rem; color: var(--muted, #6b6f63); }
    .head-tools { display: flex; flex-wrap: wrap; align-items: center; gap: 6px 10px; }
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
      display: flex; flex-wrap: wrap; align-items: center; gap: 8px 10px; padding: 9px 2px;
      border-bottom: 1px solid var(--ui-line, #e4e0d6);
    }
    .box {
      width: 18px; height: 18px; border-radius: 4px; background: #3d4b37; color: #fff; flex: none;
      display: inline-flex; align-items: center; justify-content: center; font-size: 0.7rem; font-weight: 700;
    }
    .lbl { flex: 1; min-width: 80px; overflow-wrap: anywhere; }
    .tpl {
      display: inline-flex; align-items: center; gap: 5px; padding: 3px 10px; border-radius: 999px; cursor: pointer;
      border: 1px solid #b9b4a6; background: transparent; color: #4a5043; font: inherit; font-size: 0.68rem; font-weight: 700;
    }
    .tpl:hover, .tpl.on { border-color: #3d4b37; color: #3d4b37; background: #eef2ea; }
    .tpl .n {
      min-width: 16px; padding: 0 5px; border-radius: 999px; background: #3d4b37; color: #fff; font-size: 0.62rem;
      text-align: center; line-height: 1.5;
    }
    .x {
      border: 0; background: none; cursor: pointer; font-size: 1.2rem; line-height: 1; color: #9a9d93;
      padding: 0 4px; border-radius: 4px;
    }
    .x:hover { color: #8b3a2f; background: #f8ece9; }
    .x:disabled { cursor: not-allowed; opacity: 0.5; }
    .empty, .empty-all { color: var(--muted, #6b6f63); font-size: 0.85rem; padding-left: 2px; }
    .plain, .hint { margin: 0; color: var(--muted, #6b6f63); font-size: 0.78rem; line-height: 1.5; }
    .hint { margin-top: 10px; }

    .add-opt { display: flex; gap: 8px; }

    @media (max-width: 900px) {
      .add-grid { grid-template-columns: 1fr; }
    }
  `,
})
export class AdminAttributesComponent implements OnInit {
  private readonly catalog = inject(CatalogService);
  private readonly site = inject(SiteSettingsService);
  private readonly templates = inject(AttributeTemplatesService);

  readonly defs = signal<AttributeDefinition[]>([]);
  readonly busy = signal(false);
  readonly msg = signal('');
  readonly msgErr = signal(false);
  readonly newName = signal('');
  readonly newType = signal<'select' | 'multiselect' | 'text'>('select');
  readonly newItems = signal('');
  private readonly drafts = signal<Record<string, string>>({});
  /** The options whose template editor is open ("code:option"). */
  private readonly open = signal<Set<string>>(new Set());
  private msgTimer: ReturnType<typeof setTimeout> | null = null;

  readonly cards = computed<AttrCard[]>(() =>
    [...this.defs()]
      .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0) || a.name.localeCompare(b.name))
      .map((def) => ({
        def,
        kindLabel: KIND_LABELS[def.valueType] || def.valueType,
        hasOptions: def.valueType === 'select' || def.valueType === 'multiselect',
        options: filterOptionLabels(def),
        system: SYSTEM_CODES.includes(def.code),
        templated: TEMPLATE_CODES.includes(def.code),
      })),
  );

  ngOnInit() {
    this.site.load();
    this.load();
  }

  load() {
    this.catalog.getAttributes().subscribe({
      next: (list) => this.defs.set(list.filter((d) => d.isActive !== false)),
      error: () => this.say('Could not load the attributes. Is the API running?', true),
    });
  }

  isOpen(c: AttrCard, option: string): boolean {
    return this.open().has(`${c.def.code}:${option}`);
  }

  toggle(c: AttrCard, option: string) {
    const key = `${c.def.code}:${option}`;
    this.open.update((s) => {
      const next = new Set(s);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  count(c: AttrCard, option: string): number {
    return this.templates.countOf(c.def.code, option);
  }

  draft(code: string): string {
    return this.drafts()[code] || '';
  }

  setDraft(code: string, value: string) {
    this.drafts.update((d) => ({ ...d, [code]: value }));
  }

  addOption(c: AttrCard) {
    const label = this.draft(c.def.code).trim();
    if (!label || this.busy()) return;
    if (c.options.some((o) => o.toLowerCase() === label.toLowerCase())) {
      this.say(`“${label}” is already in ${c.def.name}.`, true);
      return;
    }
    this.persist(c, [...c.options, label], () => this.setDraft(c.def.code, ''), `Added “${label}”`);
  }

  removeOption(c: AttrCard, label: string) {
    if (!confirm(`Remove “${label}” from ${c.def.name}? Products that use it will lose it.`)) return;
    this.persist(c, c.options.filter((o) => o !== label), undefined, `Removed “${label}”`);
  }

  addAttribute() {
    const name = this.newName().trim();
    const type = this.newType();
    const items = type === 'text' ? [] : this.uniqueLabels(this.newItems().split(/\r?\n/));
    if (!name) return this.say('Give the attribute a name.', true);
    if (type !== 'text' && !items.length) return this.say('Add at least one option.', true);
    const code = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    if (!code) return this.say('Use letters or numbers in the name.', true);
    const taken = this.defs().some((d) => d.code === code || d.name.toLowerCase() === name.toLowerCase());
    if (taken) return this.say(`There is already an attribute called “${name}”.`, true);

    this.busy.set(true);
    this.catalog
      .createAttribute({
        code,
        name,
        valueType: type,
        options: type === 'text' ? undefined : this.optionPayload(items, []),
      })
      .subscribe({
        next: () => {
          this.busy.set(false);
          this.newName.set('');
          this.newItems.set('');
          this.say(`Added the “${name}” attribute.`);
          this.load();
        },
        error: (err) => this.fail(err, 'Could not add the attribute'),
      });
  }

  removeAttribute(c: AttrCard) {
    if (c.system) return;
    if (!confirm(`Delete the “${c.def.name}” attribute and its options? Products will lose it.`)) return;
    this.busy.set(true);
    this.catalog.deleteAttribute(c.def.id).subscribe({
      next: () => {
        this.busy.set(false);
        this.say(`Deleted the “${c.def.name}” attribute.`);
        this.load();
      },
      error: (err) => this.fail(err, 'Could not delete the attribute'),
    });
  }

  /** Saves the whole checklist of an attribute. */
  private persist(c: AttrCard, labels: string[], done?: () => void, okMsg = 'Saved') {
    const options = this.optionPayload(labels, c.def.options || []);
    this.busy.set(true);
    this.catalog.updateAttribute(c.def.id, { options }).subscribe({
      next: () => {
        this.busy.set(false);
        done?.();
        this.say(okMsg);
        this.load();
      },
      error: (err) => this.fail(err, 'Could not save'),
    });
  }

  /** Keeps the stored value of options that already exist so product ticks stay linked. */
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
