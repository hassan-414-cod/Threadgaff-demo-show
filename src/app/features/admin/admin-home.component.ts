import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import { CatalogService } from '../../core/services/catalog.service';
import { HomeMediaService, MEDIA_URL_MAX } from '../../core/services/home-media.service';
import { HomeCatalogue, HomeSlide, SiteSettingsService } from '../../core/services/site-settings.service';

type Section = 'catalogues' | 'slider';

/** One editable card (a catalogue card or a slide share the same shape here). */
interface Row {
  id: string;
  /** Slug of the collection it opens; empty opens all products. */
  slug: string;
  /** Catalogue name, or slide title. */
  label: string;
  /** The saved address of the picture. */
  imageUrl: string;
  /** A local preview while the picture is going up. */
  preview: string;
  busy: boolean;
  error: string;
}

const MAX_CARDS = 24;

/**
 * Admin → Home page. The big catalogue cards and the slider on the home page: change their
 * pictures, add and remove cards. Taking a card off only removes it from the home page; the
 * collection it points to and every product in it stay exactly as they are.
 */
@Component({
  selector: 'tg-admin-home',
  standalone: true,
  imports: [FormsModule],
  template: `
    <div class="head">
      <p class="kicker">Site / Home page</p>
      <h1>Home page</h1>
      <p class="lede">
        Choose the pictures on the home page. Customers click a catalogue card to see all of its variants on the
        products page. Changes go live for everyone when you save.
      </p>
    </div>

    @if (msg()) {
      <div class="note" [class.err]="msgErr()" role="status">{{ msg() }}</div>
    }

    @if (loading()) {
      <p class="lede">Loading…</p>
    } @else {
      <div class="tabs" role="tablist">
        <button type="button" role="tab" class="tab" [class.on]="section() === 'catalogues'" [attr.aria-selected]="section() === 'catalogues'" (click)="section.set('catalogues')">
          Catalogues <span>{{ catalogues().length }}</span>
        </button>
        <button type="button" role="tab" class="tab" [class.on]="section() === 'slider'" [attr.aria-selected]="section() === 'slider'" (click)="section.set('slider')">
          Slider <span>{{ slides().length }}</span>
        </button>
      </div>

      <section class="card">
        <header>
          <div>
            <h2>{{ section() === 'catalogues' ? 'Catalogue cards' : 'Slider pictures' }}</h2>
            <p class="hint">
              @if (section() === 'catalogues') {
                The big cards under the slider. Each one opens the products page on one catalogue.
              } @else {
                The pictures that slide across the top of the home page.
              }
            </p>
          </div>
          @if (isAuto()) {
            <span class="badge" title="Nothing has been saved here yet">Automatic</span>
          }
        </header>

        @if (isAuto()) {
          <p class="auto-note">
            These come from your collections for now. Change anything and save to set this up yourself.
          </p>
        }

        <div class="rows">
          @for (r of rows(); track r.id; let i = $index; let first = $first; let last = $last) {
            <div class="row" [class.is-busy]="r.busy">
              <div class="thumb" [class.empty]="!r.preview && !r.imageUrl">
                @if (r.preview || r.imageUrl) {
                  <img [src]="r.preview || catalog.normalizeMediaUrl(r.imageUrl)" [alt]="r.label || 'Picture'" />
                } @else {
                  <span>No picture</span>
                }
                @if (r.busy) {
                  <span class="spin" role="status" aria-label="Uploading"></span>
                }
              </div>

              <div class="fields">
                <label [for]="'lab' + r.id">{{ section() === 'catalogues' ? 'Name' : 'Title (optional)' }}</label>
                <input
                  [id]="'lab' + r.id"
                  type="text"
                  maxlength="60"
                  [ngModel]="r.label"
                  (ngModelChange)="edit(r, { label: $event })"
                  [name]="'lab' + r.id"
                  [placeholder]="section() === 'catalogues' ? 'e.g. Hoodies' : 'Shown on the slide'"
                />
                <label [for]="'opens' + r.id">Opens</label>
                <select
                  [id]="'opens' + r.id"
                  [ngModel]="r.slug"
                  (ngModelChange)="edit(r, { slug: $event })"
                  [name]="'opens' + r.id"
                >
                  <option value="">All products</option>
                  @for (c of collectionOptions(r.slug); track c.slug) {
                    <option [value]="c.slug">{{ c.name }}</option>
                  }
                </select>
                @if (r.error) {
                  <p class="err">{{ r.error }}</p>
                }
              </div>

              <div class="acts">
                <label class="btn file-btn" [class.disabled]="r.busy">
                  {{ r.imageUrl ? 'Replace picture' : 'Add picture' }}
                  <input type="file" accept="image/*" hidden [disabled]="r.busy" (change)="onPick($event, r)" />
                </label>
                <div class="order">
                  <button type="button" class="btn sm" [disabled]="first" (click)="move(i, -1)" aria-label="Move up">↑</button>
                  <button type="button" class="btn sm" [disabled]="last" (click)="move(i, 1)" aria-label="Move down">↓</button>
                  <button type="button" class="btn sm danger" (click)="remove(r)">Remove</button>
                </div>
              </div>
            </div>
          } @empty {
            <p class="empty">
              Nothing here yet. Press “Add {{ section() === 'catalogues' ? 'catalogue' : 'slide' }}” to put a picture on the home page.
            </p>
          }
        </div>

        <div class="add-row">
          <button type="button" class="btn" [disabled]="rows().length >= max" (click)="add()">
            + Add {{ section() === 'catalogues' ? 'catalogue' : 'slide' }}
          </button>
          @if (!isAuto()) {
            <button type="button" class="link" (click)="useAutomatic()">Use my collections automatically</button>
          }
        </div>
      </section>

      <div class="actions">
        <button type="button" class="btn primary" [disabled]="saving() || uploading() || !dirty()" (click)="save()">
          {{ saving() ? 'Saving…' : uploading() ? 'Uploading…' : 'Save changes' }}
        </button>
        <button type="button" class="btn" [disabled]="saving() || !dirty()" (click)="discard()">Discard changes</button>
        @if (dirty()) {
          <span class="dirty">You have unsaved changes</span>
        }
      </div>
    }
  `,
  styles: `
    :host { display: block; color: var(--ink, #1c1f1b); max-width: 900px; }
    .head { margin-bottom: 20px; }
    .kicker { margin: 0 0 8px; font-size: 0.68rem; font-weight: 700; letter-spacing: 0.12em; text-transform: uppercase; color: var(--muted, #6b6f63); }
    h1 { margin: 0; font-size: 1.75rem; letter-spacing: -0.02em; }
    h2 { margin: 0; font-size: 1rem; }
    .lede { margin: 6px 0 0; color: #7a7f74; font-size: 0.92rem; max-width: 64ch; }
    .note { margin-bottom: 14px; padding: 10px 14px; border-radius: 8px; font-size: 0.85rem; background: #eef2ea; color: #3d4b37; border: 1px solid #d8e0d1; }
    .note.err { background: #f8ece9; color: #8b3a2f; border-color: #ebcfc9; }
    .tabs { display: flex; gap: 8px; margin-bottom: 14px; }
    .tab { border: 1px solid var(--ui-line, #e4e0d6); background: #fff; border-radius: 999px; padding: 8px 18px; font: inherit; font-weight: 700; font-size: 0.8rem; cursor: pointer; color: inherit; }
    .tab span { margin-left: 6px; opacity: 0.7; font-weight: 600; }
    .tab.on { background: #3d4b37; border-color: #3d4b37; color: #fff; }
    .card { background: #fff; border: 1px solid var(--ui-line, #e4e0d6); border-radius: 12px; padding: 18px; margin-bottom: 16px; box-shadow: 0 1px 2px rgba(28, 31, 27, 0.04); }
    .card > header { display: flex; justify-content: space-between; align-items: flex-start; gap: 12px; margin-bottom: 12px; }
    .hint { margin: 4px 0 0; font-size: 0.78rem; color: var(--muted, #6b6f63); }
    .badge { flex: none; background: #eef2ea; color: #3d4b37; border: 1px solid #d8e0d1; border-radius: 999px; padding: 3px 10px; font-size: 0.68rem; font-weight: 700; letter-spacing: 0.06em; text-transform: uppercase; }
    .auto-note { margin: 0 0 14px; padding: 9px 12px; border-radius: 8px; background: #faf7ef; border: 1px solid #ece4cc; font-size: 0.8rem; color: #6b5d2e; }
    .rows { display: grid; gap: 12px; }
    .row { display: grid; grid-template-columns: 96px minmax(0, 1fr) auto; gap: 16px; align-items: start; padding: 12px; border: 1px solid var(--ui-line, #e4e0d6); border-radius: 12px; background: #fcfbf8; }
    .row.is-busy { opacity: 0.85; }
    .thumb { position: relative; width: 96px; aspect-ratio: 4 / 5; border-radius: 10px; overflow: hidden; background: #fff; border: 1px solid var(--ui-line, #e4e0d6); display: grid; place-items: center; }
    .thumb img { width: 100%; height: 100%; object-fit: cover; display: block; }
    .thumb.empty span { font-size: 0.68rem; color: #9a9d93; text-align: center; padding: 6px; }
    .spin { position: absolute; width: 26px; height: 26px; border-radius: 50%; border: 3px solid rgba(60, 69, 54, 0.2); border-top-color: #3c4536; animation: hSpin 0.8s linear infinite; }
    @keyframes hSpin { to { transform: rotate(360deg); } }
    .fields label { display: block; font-size: 0.72rem; font-weight: 600; margin: 0 0 5px; }
    .fields label:not(:first-child) { margin-top: 10px; }
    input[type='text'], select { width: 100%; box-sizing: border-box; border: 1px solid var(--ui-line, #e4e0d6); border-radius: 8px; background: #fff; padding: 9px 11px; font: inherit; color: inherit; }
    input:focus, select:focus { outline: 2px solid #3d4b37; border-color: transparent; }
    .err { margin: 8px 0 0; font-size: 0.76rem; color: #8b3a2f; }
    .acts { display: flex; flex-direction: column; align-items: flex-end; gap: 10px; }
    .order { display: flex; gap: 6px; }
    .btn { border: 1px solid var(--ui-line, #e4e0d6); background: #fff; color: inherit; cursor: pointer; padding: 9px 14px; border-radius: 8px; font: inherit; font-weight: 600; font-size: 0.8rem; display: inline-flex; align-items: center; justify-content: center; white-space: nowrap; }
    .btn.sm { padding: 6px 10px; font-size: 0.74rem; }
    .btn.primary { background: #3d4b37; border-color: #3d4b37; color: #fff; }
    .btn.danger { color: #8b3a2f; }
    .btn:disabled, .btn.disabled { opacity: 0.55; cursor: not-allowed; }
    .btn:hover:not(:disabled):not(.disabled) { border-color: #3d4b37; }
    .file-btn { cursor: pointer; }
    .add-row { display: flex; align-items: center; gap: 16px; margin-top: 14px; flex-wrap: wrap; }
    .link { background: none; border: 0; padding: 0; font: inherit; font-size: 0.78rem; color: var(--muted, #6b6f63); text-decoration: underline; cursor: pointer; }
    .empty { margin: 0; padding: 18px; text-align: center; color: var(--muted, #6b6f63); font-size: 0.85rem; border: 1px dashed var(--ui-line, #e4e0d6); border-radius: 12px; }
    .actions { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; }
    .dirty { font-size: 0.78rem; color: #8b6b1f; }
    @media (max-width: 720px) {
      .row { grid-template-columns: 76px minmax(0, 1fr); }
      .thumb { width: 76px; }
      .acts { grid-column: 1 / -1; flex-direction: row; align-items: center; justify-content: space-between; flex-wrap: wrap; }
    }
  `,
})
export class AdminHomeComponent implements OnInit {
  readonly catalog = inject(CatalogService);
  private readonly site = inject(SiteSettingsService);
  private readonly media = inject(HomeMediaService);

  readonly max = MAX_CARDS;
  readonly loading = signal(true);
  readonly section = signal<Section>('catalogues');
  readonly saving = signal(false);
  readonly msg = signal('');
  readonly msgErr = signal(false);
  private msgTimer: ReturnType<typeof setTimeout> | null = null;

  readonly catalogues = signal<Row[]>([]);
  readonly slides = signal<Row[]>([]);
  /** True while a list has never been saved: it then follows the collections. */
  readonly catalogueAuto = signal(false);
  readonly slideAuto = signal(false);
  private readonly collections = signal<Array<{ slug: string; name: string }>>([]);
  /** The last saved / loaded state, to know whether anything changed. */
  private baseline = '';

  readonly rows = computed(() => (this.section() === 'catalogues' ? this.catalogues() : this.slides()));
  readonly isAuto = computed(() => (this.section() === 'catalogues' ? this.catalogueAuto() : this.slideAuto()));
  readonly uploading = computed(() => [...this.catalogues(), ...this.slides()].some((r) => r.busy));
  readonly dirty = computed(() => this.snapshot() !== this.baseline);

  async ngOnInit() {
    await this.load();
  }

  private async load() {
    this.loading.set(true);
    const [saved, cats, products] = await Promise.all([
      this.site.current(),
      firstValueFrom(this.catalog.getCollectionCategories(false)).catch(() => []),
      firstValueFrom(this.catalog.getProducts({ limit: 100, isActive: true })).then((r) => r.items || []).catch(() => []),
    ]);
    this.collections.set(cats.map((c) => ({ slug: c.slug, name: c.name })));
    const derived = this.catalog.deriveHomeCards(cats, products);
    const fromDerived = (): Row[] => derived.map((c) => this.row(c.slug, c.name, c.imageUrl));

    this.catalogueAuto.set(saved.homeCatalogues === null);
    this.slideAuto.set(saved.homeSlides === null);
    this.catalogues.set(
      saved.homeCatalogues ? saved.homeCatalogues.map((c) => this.row(c.slug, c.name, c.imageUrl, c.id)) : fromDerived(),
    );
    this.slides.set(
      saved.homeSlides
        ? saved.homeSlides.map((s) => this.row(s.slug, s.title, s.imageUrl, s.id))
        : fromDerived().map((r) => ({ ...r, label: '' })),
    );
    this.baseline = this.snapshot();
    this.loading.set(false);
  }

  private row(slug: string, label: string, imageUrl: string, id?: string): Row {
    return { id: id || 'h' + Math.random().toString(36).slice(2, 9), slug, label, imageUrl, preview: '', busy: false, error: '' };
  }

  private snapshot(): string {
    const strip = (rows: Row[]) => rows.map((r) => [r.id, r.slug, r.label, r.imageUrl]);
    return JSON.stringify([this.catalogueAuto(), this.slideAuto(), strip(this.catalogues()), strip(this.slides())]);
  }

  /** The collections to choose from; a saved slug that no longer exists is still listed. */
  collectionOptions(current: string) {
    const list = this.collections();
    return current && !list.some((c) => c.slug === current) ? [...list, { slug: current, name: current }] : list;
  }

  private setRows(update: (rows: Row[]) => Row[]) {
    if (this.section() === 'catalogues') {
      this.catalogues.update(update);
      this.catalogueAuto.set(false);
    } else {
      this.slides.update(update);
      this.slideAuto.set(false);
    }
  }

  edit(r: Row, patch: Partial<Pick<Row, 'label' | 'slug'>>) {
    this.setRows((rows) => rows.map((x) => (x.id === r.id ? { ...x, ...patch } : x)));
  }

  add() {
    const used = new Set(this.rows().map((r) => r.slug));
    const next = this.collections().find((c) => !used.has(c.slug));
    const isCatalogue = this.section() === 'catalogues';
    this.setRows((rows) => [...rows, this.row(next?.slug || '', isCatalogue ? next?.name || '' : '', '')]);
  }

  remove(r: Row) {
    this.setRows((rows) => rows.filter((x) => x.id !== r.id));
  }

  move(index: number, dir: -1 | 1) {
    this.setRows((rows) => {
      const to = index + dir;
      if (to < 0 || to >= rows.length) return rows;
      const next = [...rows];
      [next[index], next[to]] = [next[to], next[index]];
      return next;
    });
  }

  /** Back to following the collections: the saved list is dropped and the cards come from them again. */
  async useAutomatic() {
    const isCatalogue = this.section() === 'catalogues';
    const [cats, products] = await Promise.all([
      firstValueFrom(this.catalog.getCollectionCategories(false)).catch(() => []),
      firstValueFrom(this.catalog.getProducts({ limit: 100, isActive: true })).then((r) => r.items || []).catch(() => []),
    ]);
    const derived = this.catalog.deriveHomeCards(cats, products).map((c) => this.row(c.slug, isCatalogue ? c.name : '', c.imageUrl));
    if (isCatalogue) {
      this.catalogues.set(derived);
      this.catalogueAuto.set(true);
    } else {
      this.slides.set(derived);
      this.slideAuto.set(true);
    }
    this.say('Following your collections again. Press Save changes to publish.');
  }

  async onPick(event: Event, r: Row) {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    const patch = (p: Partial<Row>) => this.setRows((rows) => rows.map((x) => (x.id === r.id ? { ...x, ...p } : x)));
    const preview = URL.createObjectURL(file);
    patch({ busy: true, error: '', preview });
    try {
      const url = await this.media.upload(file, r.label || 'Home page picture');
      patch({ imageUrl: url, preview: '', busy: false });
    } catch (err) {
      patch({ preview: '', busy: false, error: err instanceof Error ? err.message : 'Could not upload that picture.' });
    } finally {
      URL.revokeObjectURL(preview);
    }
  }

  async save() {
    const catalogues = this.catalogues();
    const slides = this.slides();
    if (!this.catalogueAuto() && catalogues.some((r) => !r.label.trim())) {
      this.section.set('catalogues');
      return this.say('Every catalogue card needs a name.', true);
    }
    if ([...catalogues, ...slides].some((r) => r.imageUrl.length > MEDIA_URL_MAX)) {
      return this.say('One of the picture addresses is too long. Upload that picture again.', true);
    }
    const toCatalogue = (r: Row): HomeCatalogue => ({ id: r.id, slug: r.slug, name: r.label.trim(), imageUrl: r.imageUrl });
    const toSlide = (r: Row): HomeSlide => ({ id: r.id, slug: r.slug, title: r.label.trim(), imageUrl: r.imageUrl });
    this.saving.set(true);
    try {
      await this.site.update({
        homeCatalogues: this.catalogueAuto() ? null : catalogues.map(toCatalogue),
        homeSlides: this.slideAuto() ? null : slides.map(toSlide),
      });
      this.baseline = this.snapshot();
      this.say('Saved. The home page now shows these pictures.');
    } catch (err) {
      const m = (err as { error?: { message?: string | string[] } })?.error?.message;
      this.say(Array.isArray(m) ? m.join(', ') : m || 'Could not save. Check the API is running.', true);
    } finally {
      this.saving.set(false);
    }
  }

  async discard() {
    await this.load();
    this.say('Changes discarded.');
  }

  private say(text: string, isError = false) {
    this.msg.set(text);
    this.msgErr.set(isError);
    if (this.msgTimer) clearTimeout(this.msgTimer);
    this.msgTimer = setTimeout(() => this.msg.set(''), 5000);
  }
}
