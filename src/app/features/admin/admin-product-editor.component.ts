import {
  Component,
  ElementRef,
  EventEmitter,
  Input,
  OnChanges,
  Output,
  inject,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import {
  CatalogService,
  AttributeDefinition,
  CatalogSize,
  ProductAttributeInput,
  ProductColorInput,
  ProductWritePayload,
} from '../../core/services/catalog.service';
import { Category, Product, ProductTag } from '../../core/models/catalog.models';
import { forkJoin, of, timer, throwError } from 'rxjs';
import { catchError, map, switchMap, retry } from 'rxjs/operators';
import { AuthService } from '../../core/services/auth.service';

interface AngleSlot {
  label: string;
  angle: string;
  src: string;
}

interface ColorFormRow {
  id: string;
  name: string;
  hex: string;
  priceOverride: string;
  description: string;
  isDefault: boolean;
  cardImage: string;
  views: AngleSlot[];
  selected: boolean;
}

interface ExtraAttr {
  key: string;
  value: string;
}

/** Flattened category row for hierarchical sidebar display */
interface CategoryTreeRow {
  id: string;
  name: string;
  parentId: string | null;
  depth: number;
  hasChildren: boolean;
}

const TEMPLATES = [
  { id: 'tshirt', label: 'T-Shirt' },
  { id: 'hoodie', label: 'Hoodie' },
  { id: 'polo', label: 'Polo' },
  { id: 'sweatshirt', label: 'Sweatshirt' },
  { id: 'jogger', label: 'Joggers' },
  { id: 'tracksuit', label: 'Tracksuit' },
  { id: 'set', label: 'Set (Co-ord)' },
  { id: 'overshirt', label: 'Overshirt' },
];

const MATERIALS = [
  '100% Cotton',
  'Cotton Blend',
  'French Terry',
  'Fleece',
  'Organic Cotton',
  'Pique Cotton',
];
const GENDERS = ['Unisex', "Men's", "Women's"];
const FITS = ['Slim', 'Regular', 'Relaxed', 'Oversized'];
const DECORATIONS = ['DTG Printing', 'Embroidery', 'Screen Print'];
const SUSTAINABILITY = ['Organic Cotton', 'Recycled'];
const PRICE_RANGES = ['Under £5', '£5–£10', '£10–£20'];
const GSM_OPTIONS = ['160 GSM (Light)', '180 GSM (Standard)', '220 GSM (Heavy)'];
const PLACEMENT_OPTIONS = [
  'Front Centre',
  'Front Chest',
  'Back Centre',
  'Left Chest',
  'Right Sleeve',
];
const PRIVATE_LABEL_OPTIONS = [
  'Woven neck / care label',
  'Hangtag',
  'Branded packaging',
];
const COLOR_PRESETS: { name: string; hex: string }[] = [
  { name: 'Red', hex: '#e53935' },
  { name: 'Orange', hex: '#fb8c00' },
  { name: 'Maroon', hex: '#800000' },
  { name: 'Pink', hex: '#ec407a' },
  { name: 'Purple', hex: '#8e24aa' },
  { name: 'Blue', hex: '#1e88e5' },
  { name: 'Green', hex: '#43a047' },
  { name: 'Black', hex: '#1a1a1a' },
  { name: 'White', hex: '#ffffff' },
];
const DEFAULT_ANGLES = ['Front', 'Back', 'Sleeve', 'Collar'];
const DEFAULT_BRAND_NAMES = [
  'Threadgaff Essentials',
  'Threadgaff Premium',
  'White Label',
];

@Component({
  selector: 'tg-admin-product-editor',
  standalone: true,
  imports: [FormsModule],
  template: `
    <div class="editor">
      <div class="topbar">
        <div>
          <p class="page-kicker">03 / Product details</p>
          <h1 class="crumb-heading">
            @if (standalone || !categoryName) {
              <button type="button" class="crumb-link" (click)="cancel.emit()">Extra products</button>
            } @else {
              <button type="button" class="crumb-link" (click)="cancel.emit()">Collections</button>
              <span class="crumb-sep"> / </span>
              <button type="button" class="crumb-link" (click)="cancel.emit()">{{ categoryName }}</button>
            }
            <span class="crumb-sep"> / </span>
            <span class="crumb-current">{{ form.name || 'Product' }}</span>
          </h1>
          <p class="lede">
            {{
              productId
                ? 'Edit product details, media and variants. Save writes to the storefront catalog.'
                : 'Create a product with details, media and variants. Save writes to the storefront catalog.'
            }}
          </p>
        </div>
        <div class="toolbar">
          <button type="button" class="btn btn-ghost" (click)="cancel.emit()" [disabled]="busy()">
            Cancel
          </button>
          @if (productId) {
            <button type="button" class="btn btn-danger" (click)="onDelete()" [disabled]="busy()">
              Delete
            </button>
          }
          <button
            type="button"
            class="btn btn-gold"
            (click)="save()"
            [disabled]="busy() || !form.name.trim()"
          >
            {{ busy() ? (form.name.trim() ? 'Saving…' : 'Loading…') : 'Save changes' }}
          </button>
        </div>
      </div>

      @if (formError()) {
        <div class="alert">{{ formError() }}</div>
      }

      <div class="product-layout">
        <div class="product-top">
          <div class="product-main-top">
            <section class="ui-card" id="cardBasic">
              <div class="ui-card-h">
                <div>
                  <h2>Basic Information</h2>
                  <p>Core identity for this product on the storefront.</p>
                </div>
                <div class="from-existing">
                  <label>Start from Existing</label>
                  <select [(ngModel)]="cloneFromId" name="cloneFrom" (ngModelChange)="onCloneFrom($event)">
                    <option value="">Blank / keep current</option>
                    @for (p of existingProducts; track p.id) {
                      <option [value]="p.id">{{ p.name }}</option>
                    }
                  </select>
                </div>
              </div>
              <div class="grid-2">
                <div>
                  <label>Name <span class="req">*</span></label>
                  <input
                    type="text"
                    [(ngModel)]="form.name"
                    name="name"
                    (ngModelChange)="onNameChange($event)"
                  />
                  <p class="field-hint">This name will be visible to your customers</p>
                </div>
                <div>
                  <label>SKU</label>
                  <input type="text" [(ngModel)]="form.sku" name="sku" />
                  <p class="field-hint">Internal stock keeping unit</p>
                </div>
              </div>
              <div>
                <label>Slug</label>
                <input
                  type="text"
                  [(ngModel)]="form.slug"
                  name="slug"
                  (ngModelChange)="slugTouched = true"
                />
                <p class="field-hint">URL-friendly identifier</p>
              </div>
            </section>

            <section class="ui-card" id="cardDetails">
              <div class="ui-card-h">
                <div>
                  <h2>Product Details</h2>
                  <p>Template, category and merchandising attributes.</p>
                </div>
              </div>
              <div class="grid-3">
                <div>
                  <label>Template</label>
                  <select
                    [(ngModel)]="form.template"
                    name="template"
                    (ngModelChange)="onTemplateChange()"
                  >
                    <option value="">—</option>
                    @for (t of templates; track t.id) {
                      <option [value]="t.id">{{ t.label }}</option>
                    }
                  </select>
                </div>
                <div>
                  <label>Material</label>
                  <select [(ngModel)]="form.material" name="material">
                    <option value="">—</option>
                    @for (m of attrOptionLabels('material'); track m) {
                      <option [value]="m">{{ m }}</option>
                    }
                  </select>
                </div>
                <div>
                  <label>Gender</label>
                  <select [(ngModel)]="form.gender" name="gender">
                    <option value="">—</option>
                    @for (g of attrOptionLabels('gender'); track g) {
                      <option [value]="g">{{ g }}</option>
                    }
                  </select>
                  <p class="field-hint">
                    Unisex shows in both Men’s and Women’s. Men’s / Women’s also include Unisex.
                  </p>
                </div>
                <div>
                  <label>Fit</label>
                  <select [(ngModel)]="form.fit" name="fit">
                    <option value="">—</option>
                    @for (f of attrOptionLabels('fit'); track f) {
                      <option [value]="f">{{ f }}</option>
                    }
                  </select>
                </div>
              </div>
              <div class="grid-2 row-gap">
                <div>
                  <label>Price range</label>
                  <input
                    type="text"
                    list="priceRangeList"
                    [(ngModel)]="form.priceRange"
                    name="priceRange"
                    placeholder="Pick one or type your own, e.g. £8 – £12"
                  />
                  <datalist id="priceRangeList">
                    @for (r of priceRanges; track r) {
                      <option [value]="r"></option>
                    }
                  </datalist>
                </div>
                <div>
                  <label>Base price (£)</label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    [(ngModel)]="form.basePrice"
                    name="basePrice"
                    placeholder="e.g. 12.50"
                  />
                  <p class="field-hint">Shown on the storefront. Variant price overrides this when set.</p>
                </div>
              </div>
              <div class="grid-2">
                <div>
                  <label>Badge</label>
                  <select [(ngModel)]="form.badge" name="badge">
                    <option value="">None</option>
                    <option value="BESTSELLER">BESTSELLER</option>
                    <option value="NEW IN">NEW IN</option>
                  </select>
                </div>
                <div>
                  <label>Eco tag</label>
                  <input
                    type="text"
                    [(ngModel)]="form.ecoTag"
                    name="ecoTag"
                    placeholder="ORGANIC COTTON"
                  />
                </div>
              </div>
              <div class="grid-2">
                <div>
                  <label>Status</label>
                  <select [(ngModel)]="form.isActive" name="isActive">
                    <option [ngValue]="true">Live</option>
                    <option [ngValue]="false">Hidden</option>
                  </select>
                </div>
                <div>
                  <label>Featured on home</label>
                  <select [(ngModel)]="form.isFeatured" name="isFeatured">
                    <option [ngValue]="false">No</option>
                    <option [ngValue]="true">Yes</option>
                  </select>
                </div>
              </div>
              <div class="row-gap">
                <label>Short description (marketing copy)</label>
                <textarea
                  [(ngModel)]="form.shortDescription"
                  name="shortDescription"
                  rows="2"
                  placeholder="Shown on product cards next to Customise"
                ></textarea>
                <p class="field-hint">This is the default card description. A variant can override it below.</p>
              </div>
              <div class="row-gap">
                <label>Sizes</label>
                <div class="checks">
                  @for (s of sizeOptions(); track s.id) {
                    <label class="check">
                      <input
                        type="checkbox"
                        [checked]="selectedSizeIds.includes(s.id)"
                        (change)="toggleSize(s.id, $event)"
                      />
                      {{ s.label }}
                    </label>
                  }
                </div>
              </div>
            </section>

            <section class="ui-card" id="cardDecoration">
              <div class="ui-card-h">
                <div>
                  <h2>Decoration Methods</h2>
                  <p>How this garment can be branded.</p>
                </div>
              </div>
              <label>Decoration</label>
              <div class="priced-opts">
                @for (d of attrOptionLabels('decoration'); track d) {
                  <div class="priced-opt" [class.on]="isChecked(form.decoration, d)">
                    <label class="priced-opt-check">
                      <input
                        type="checkbox"
                        [checked]="isChecked(form.decoration, d)"
                        (change)="toggleCheck(form.decoration, d, $event)"
                      />
                      <span>{{ d }}</span>
                    </label>
                    @if (isChecked(form.decoration, d)) {
                      <label class="addon-mini" title="Add-on unit price for Custom Designer">
                        <span>+£</span>
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          placeholder="0"
                          [ngModel]="getAddon('decoration', d)"
                          (ngModelChange)="setAddon('decoration', d, $event)"
                          [name]="'addonDec' + d"
                        />
                      </label>
                    }
                  </div>
                }
              </div>
              <div class="grid-2">
                <div>
                  <label>GSM</label>
                  <div class="gsm-row">
                    <select [(ngModel)]="form.gsm" name="gsm">
                      <option value="">—</option>
                      @for (g of attrOptionLabels('gsm'); track g) {
                        <option [value]="g">{{ g }}</option>
                      }
                    </select>
                    @if (form.gsm) {
                      <label class="addon-mini" title="Add-on unit price for this GSM">
                        <span>+£</span>
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          placeholder="0"
                          [ngModel]="getAddon('gsm', form.gsm)"
                          (ngModelChange)="setAddon('gsm', form.gsm, $event)"
                          name="addonGsm"
                        />
                      </label>
                    }
                  </div>
                </div>
                <div>
                  <label>Logo placement options</label>
                  <div class="priced-opts">
                    @for (p of attrOptionLabels('placement'); track p) {
                      <div class="priced-opt" [class.on]="isChecked(form.placements, p)">
                        <label class="priced-opt-check">
                          <input
                            type="checkbox"
                            [checked]="isChecked(form.placements, p)"
                            (change)="toggleCheck(form.placements, p, $event)"
                          />
                          <span>{{ p }}</span>
                        </label>
                        @if (isChecked(form.placements, p)) {
                          <label class="addon-mini" title="Add-on unit price for this placement">
                            <span>+£</span>
                            <input
                              type="number"
                              min="0"
                              step="0.01"
                              placeholder="0"
                              [ngModel]="getAddon('placement', p)"
                              (ngModelChange)="setAddon('placement', p, $event)"
                              [name]="'addonPlace' + p"
                            />
                          </label>
                        }
                      </div>
                    }
                  </div>
                </div>
              </div>
              <label>Private label options</label>
              <div class="priced-opts">
                @for (o of attrOptionLabels('private_label'); track o) {
                  <div class="priced-opt" [class.on]="isChecked(form.privateLabel, o)">
                    <label class="priced-opt-check">
                      <input
                        type="checkbox"
                        [checked]="isChecked(form.privateLabel, o)"
                        (change)="toggleCheck(form.privateLabel, o, $event)"
                      />
                      <span>{{ o }}</span>
                    </label>
                    @if (isChecked(form.privateLabel, o)) {
                      <label class="addon-mini" title="Add-on unit price for this private label option">
                        <span>+£</span>
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          placeholder="0"
                          [ngModel]="getAddon('private_label', o)"
                          (ngModelChange)="setAddon('private_label', o, $event)"
                          [name]="'addonPl' + o"
                        />
                      </label>
                    }
                  </div>
                }
              </div>
              <p class="field-hint">
                Tick options to show them in Custom Designer. Optional +£ add-on is per unit and added to the designer summary total.
              </p>
              <label>Sustainability</label>
              <div class="checks checks-compact">
                @for (s of attrOptionLabels('sustainability'); track s) {
                  <label [class.ui-check-on]="isChecked(form.sustainability, s)">
                    <input
                      type="checkbox"
                      [checked]="isChecked(form.sustainability, s)"
                      (change)="toggleCheck(form.sustainability, s, $event)"
                    />
                    {{ s }}
                  </label>
                }
              </div>
              <label>Custom attributes</label>
              @for (a of extraAttrs; track $index; let i = $index) {
                <div class="attr-row">
                  <div>
                    <label>Attribute name</label>
                    <input type="text" [(ngModel)]="a.key" [name]="'attrKey' + i" />
                  </div>
                  <div>
                    <label>Value</label>
                    <input type="text" [(ngModel)]="a.value" [name]="'attrVal' + i" />
                  </div>
                  <button type="button" class="btn btn-danger" (click)="extraAttrs.splice(i, 1)">
                    Delete
                  </button>
                </div>
              }
              <div class="section-tools">
                <button type="button" class="btn btn-ghost" (click)="extraAttrs.push({ key: '', value: '' })">
                  Add attribute
                </button>
              </div>
            </section>
          </div>

          <aside class="product-side">
            <section class="ui-card preview-card">
              <div class="ui-card-h tight">
                <h2 class="side-h">Product Preview</h2>
              </div>
              <div class="preview-img-wrap" [class.is-empty]="!previewUrl()">
                @if (previewUrl()) {
                  <img [src]="previewUrl()" [alt]="form.name || 'Preview'" />
                } @else {
                  <span class="preview-empty">Add a variant or set default media to generate preview</span>
                }
              </div>
              <p class="preview-name">{{ form.name || 'Product' }}</p>
              <p class="preview-sub">
                {{ previewCategoryLabel() }}
              </p>
              <span class="status" [class.live]="form.isActive" [class.hidden-status]="!form.isActive">
                {{ form.isActive ? 'Live' : 'Hidden' }}
              </span>
            </section>

            <section class="ui-card tax-card">
              <div class="tax-head">
                <h2 class="side-h">Product categories</h2>
                <p class="tax-sub">Select one or more collections / subcategories.</p>
              </div>
              <div class="tax-list">
                @for (c of categoryRows(); track c.id) {
                  <label
                    class="tax-item"
                    [class.is-on]="isCategorySelected(c.id)"
                    [class.is-root]="c.depth === 0"
                    [style.padding-left.px]="10 + c.depth * 16"
                  >
                    @if (c.depth > 0) {
                      <span class="tax-branch" aria-hidden="true">└</span>
                    }
                    <input
                      type="checkbox"
                      [checked]="isCategorySelected(c.id)"
                      (change)="toggleCategory(c.id, $event)"
                    />
                    <span class="tax-name">{{ c.name }}</span>
                  </label>
                } @empty {
                  <p class="fn">No categories yet.</p>
                }
              </div>
              @if (!lockCategory) {
                @if (!showAddCategory()) {
                  <button type="button" class="tax-add-link" (click)="openAddCategory()">
                    + Add new category
                  </button>
                } @else {
                  <div class="tax-add-form">
                    <div class="tax-add-title">
                      <strong>New category</strong>
                      <button type="button" class="tax-cancel" (click)="showAddCategory.set(false)">
                        Cancel
                      </button>
                    </div>
                    <label>Name</label>
                    <input
                      type="text"
                      [(ngModel)]="newCategoryName"
                      name="newCategoryName"
                      placeholder="e.g. Overshirts"
                    />
                    <label>Parent</label>
                    <select [(ngModel)]="newCategoryParentId" name="newCategoryParentId">
                      <option [ngValue]="apparelRootId || ''">
                        {{ apparelRootLabel() }} (top level)
                      </option>
                      @for (c of categoryRows(); track c.id) {
                        <option [value]="c.id">
                          {{ indentLabel(c.depth) }}{{ c.name }}
                        </option>
                      }
                    </select>
                    <button
                      type="button"
                      class="btn btn-gold btn-full"
                      (click)="addCategory()"
                      [disabled]="busy() || !newCategoryName.trim()"
                    >
                      {{ busy() ? 'Saving…' : 'Add category' }}
                    </button>
                    @if (categoryMsg()) {
                      <p class="tax-msg" [class.is-error]="categoryError()">{{ categoryMsg() }}</p>
                    }
                  </div>
                }
              }
            </section>

            <section class="ui-card tax-card">
              <div class="tax-head">
                <h2 class="side-h">Product brands</h2>
                <p class="tax-sub">Select one or more brands for this product.</p>
              </div>
              <div class="tax-list">
                @for (b of brandList(); track b.id) {
                  <label class="tax-item" [class.is-on]="isBrandSelected(b.id)">
                    <input
                      type="checkbox"
                      [checked]="isBrandSelected(b.id)"
                      (change)="toggleBrand(b.id, $event)"
                    />
                    <span>{{ b.name }}</span>
                  </label>
                } @empty {
                  <p class="fn">No brands yet. Add one below.</p>
                }
              </div>
              @if (!showAddBrand()) {
                <button type="button" class="tax-add-link" (click)="showAddBrand.set(true)">
                  + Add new brand
                </button>
              } @else {
                <div class="tax-add-form">
                  <div class="tax-add-title">
                    <strong>New brand</strong>
                    <button type="button" class="tax-cancel" (click)="showAddBrand.set(false)">
                      Cancel
                    </button>
                  </div>
                  <label>Name</label>
                  <input
                    type="text"
                    [(ngModel)]="newBrandName"
                    name="newBrandName"
                    placeholder="e.g. Threadgaff Premium"
                  />
                  <button
                    type="button"
                    class="btn btn-gold btn-full"
                    (click)="addBrand()"
                    [disabled]="busy() || !newBrandName.trim()"
                  >
                    {{ busy() ? 'Saving…' : 'Add brand' }}
                  </button>
                  @if (brandMsg()) {
                    <p class="tax-msg" [class.is-error]="brandError()">{{ brandMsg() }}</p>
                  }
                </div>
              }
            </section>

            <section class="ui-card">
              <h2 class="side-h">Product Checklist</h2>
              <ul class="checklist">
                <li>
                  <span class="ck">✓</span>
                  <span class="ck-body"
                    >Basic Information<small>Name, slug and SKU</small></span
                  >
                  <button type="button" class="ck-edit" (click)="scrollTo('cardBasic')">Edit</button>
                </li>
                <li>
                  <span class="ck">✓</span>
                  <span class="ck-body"
                    >Categorisation<small>Category &amp; brand in sidebar</small></span
                  >
                </li>
                <li>
                  <span class="ck">✓</span>
                  <span class="ck-body"
                    >Specifications<small>Material, gender, fit</small></span
                  >
                  <button type="button" class="ck-edit" (click)="scrollTo('cardDetails')">Edit</button>
                </li>
                <li>
                  <span class="ck">✓</span>
                  <span class="ck-body"
                    >Decoration Methods<small>Branding options selected</small></span
                  >
                  <button type="button" class="ck-edit" (click)="scrollTo('cardDecoration')">Edit</button>
                </li>
              </ul>
            </section>

            <section class="ui-card live-preview-card">
              <div class="ui-card-h tight">
                <h2 class="side-h"><span class="dot-live"></span>Live Preview</h2>
                <span class="meta-soft">From variant / default media</span>
              </div>
              <div class="lp-stage" [class.is-empty]="!livePreviewSrc()">
                @if (livePreviewSrc()) {
                  <img [src]="livePreviewSrc()" alt="Variant preview" />
                } @else {
                  <span class="preview-empty">Preview appears when a variant image or default media is set</span>
                }
              </div>
              @if (focusedViews().length) {
                <div class="lp-tabs">
                  @for (v of focusedViews(); track $index; let i = $index) {
                    <button
                      type="button"
                      [class.is-on]="liveAngleIndex() === i"
                      (click)="liveAngleIndex.set(i)"
                    >
                      {{ v.label || 'Angle' }}
                    </button>
                  }
                </div>
                <div class="lp-thumbs">
                  @for (v of focusedViews(); track $index; let i = $index) {
                    <button
                      type="button"
                      [class.is-on]="liveAngleIndex() === i"
                      (click)="liveAngleIndex.set(i)"
                    >
                      @if (v.src) {
                        <img [src]="v.src" [alt]="v.label" />
                      } @else {
                        <span class="thumb-empty">No image</span>
                      }
                      <span class="lp-thumb-label">{{ v.label || 'Angle' }}</span>
                    </button>
                  }
                </div>
              }
            </section>
            <p class="meta-soft">Edit and save to update the storefront catalog.</p>
          </aside>
        </div>

        <div class="product-main">
          <section class="ui-card" id="cardVariants">
            <div class="ui-card-h">
              <div>
                <p class="page-kicker sm">04 / Variants</p>
                <h2>Manage Variants</h2>
                <p>Add and manage product variants such as colours, with images and pricing.</p>
              </div>
              <button type="button" class="btn btn-gold variants-add-btn" (click)="addVariant()">
                + Add Variant
              </button>
            </div>

            <div class="variants-workspace">
              <div class="variants-center">
                @if (selectedCount() > 0) {
                  <div class="variant-bulk-bar">
                    <span class="variant-bulk-count"
                      >{{ selectedCount() }}
                      {{ selectedCount() === 1 ? 'variant selected' : 'variants selected' }}</span
                    >
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      placeholder="Price £"
                      [(ngModel)]="bulkPrice"
                      name="bulkPrice"
                    />
                    <button type="button" class="btn btn-ghost" (click)="applyBulkPrice()">
                      Apply price
                    </button>
                    <button
                      type="button"
                      class="btn btn-ghost"
                      (click)="bulkSetDefault()"
                      [disabled]="selectedCount() !== 1"
                    >
                      Set as default
                    </button>
                    <button type="button" class="btn btn-danger" (click)="bulkDelete()">
                      Delete selected
                    </button>
                  </div>
                }

                @if (focusedColor(); as c) {
                  <div
                    class="ui-card color-block"
                    [class.is-default]="c.isDefault"
                    [class.is-picked]="c.selected"
                  >
                    <div class="ui-card-h">
                      <div>
                        <h2 class="variant-h">Variant Details</h2>
                        <p class="variant-sub">
                          Edit colour, price, images and angles for this variant.
                        </p>
                      </div>
                      <div class="toolbar">
                        <label class="mini-check">
                          <input type="checkbox" [(ngModel)]="c.selected" [name]="'sel' + c.id" />
                          Select
                        </label>
                        @if (c.isDefault) {
                          <span class="variant-default-flag">Default</span>
                        } @else {
                          <button type="button" class="btn btn-ghost" (click)="setDefaultColor(focusedIndex())">
                            Set as default
                          </button>
                        }
                        <button type="button" class="btn btn-danger" (click)="removeColor(focusedIndex())">
                          Delete
                        </button>
                      </div>
                    </div>

                    <div class="grid-2">
                      <div>
                        <label>Variant name</label>
                        <input type="text" [(ngModel)]="c.name" [name]="'cname' + c.id" placeholder="Burgundy" />
                      </div>
                      <div>
                        <label>HEX colour</label>
                        <div class="hex-row hex-row-wrap">
                          <input
                            type="text"
                            [(ngModel)]="c.hex"
                            [name]="'chex' + focusedIndex()"
                            placeholder="#8c2b2b"
                            (blur)="commitHex(c)"
                          />
                          <label class="hex-picker-btn" title="Pick a colour">
                            <span
                              class="hex-picker-face"
                              [class.is-solid]="!!normalizeHexInput(c.hex)"
                              [style.background]="normalizeHexInput(c.hex) || null"
                              aria-hidden="true"
                            ></span>
                            <input
                              type="color"
                              class="hex-picker"
                              [value]="normalizedHex(c.hex)"
                              (input)="onHexPicker(c, $event)"
                              [attr.aria-label]="'Custom hex for ' + (c.name || 'variant')"
                            />
                          </label>
                        </div>
                        <div class="color-presets" role="listbox" aria-label="Major colours">
                          @for (swatch of colorPresets; track swatch.hex) {
                            <button
                              type="button"
                              class="color-preset"
                              [class.on]="(normalizeHexInput(c.hex) || '').toLowerCase() === swatch.hex"
                              [style.background-color]="swatch.hex"
                              [attr.title]="swatch.name + ' ' + swatch.hex"
                              [attr.aria-label]="swatch.name + ' ' + swatch.hex"
                              (click)="pickPresetColor(swatch.hex, 'edit')"
                            ></button>
                          }
                        </div>
                      </div>
                    </div>
                    <div class="grid-2">
                      <div>
                        <label>Price (£)</label>
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          [(ngModel)]="c.priceOverride"
                          [name]="'cprice' + c.id"
                          placeholder="Product default"
                        />
                      </div>
                      <div>
                        <label>Same as another variant</label>
                        <select
                          [ngModel]="''"
                          [name]="'same' + c.id"
                          (ngModelChange)="copyFromVariant($event)"
                        >
                          <option value="">—</option>
                          @for (o of colors; track o.id; let j = $index) {
                            @if (j !== focusedIndex()) {
                              <option [value]="j">{{ o.name || o.hex }}</option>
                            }
                          }
                        </select>
                      </div>
                    </div>
                    <div class="row-gap">
                      <label>Variant description</label>
                      <textarea
                        [(ngModel)]="c.description"
                        [name]="'cdesc' + c.id"
                        rows="2"
                        placeholder="Optional — overrides product short description on storefront cards for this colour"
                      ></textarea>
                    </div>

                    <div class="row-gap">
                      <label>Sleeve</label>
                      <select
                        [(ngModel)]="form.sleeve"
                        [name]="'vsleeve' + focusedIndex()"
                      >
                        <option value="">—</option>
                        @for (o of attrOptionLabels('sleeve'); track o) {
                          <option [value]="o">{{ o }}</option>
                        }
                      </select>
                    </div>
                    <div class="row-gap">
                      <label>Style / Neckline</label>
                      <p class="field-hint">
                        Tick styles for this product. Add or remove options — they sync to Attributes and the Custom Designer.
                      </p>
                      <div class="checks checks-compact">
                        @for (o of attrOptionLabels('style'); track o) {
                          <label [class.ui-check-on]="isChecked(form.style, o)" class="style-opt">
                            <input
                              type="checkbox"
                              [checked]="isChecked(form.style, o)"
                              (change)="toggleCheck(form.style, o, $event)"
                            />
                            <span>{{ o }}</span>
                            <button
                              type="button"
                              class="style-opt-del"
                              title="Remove option"
                              (click)="removeStyleOption(o, $event)"
                            >
                              ×
                            </button>
                          </label>
                        }
                      </div>
                      <div class="style-add-row">
                        <input
                          type="text"
                          [(ngModel)]="newStyleOption"
                          name="newStyleOption"
                          placeholder="Add style e.g. Raglan"
                          (keydown.enter)="$event.preventDefault(); addStyleOption()"
                        />
                        <button
                          type="button"
                          class="btn btn-ghost"
                          [disabled]="styleOptsBusy() || !newStyleOption.trim()"
                          (click)="addStyleOption()"
                        >
                          {{ styleOptsBusy() ? 'Saving…' : '+ Add' }}
                        </button>
                      </div>
                      @if (styleOptsMsg()) {
                        <p class="field-hint" [class.is-error]="styleOptsError()">{{ styleOptsMsg() }}</p>
                      }
                    </div>

                    <label>Swatch / card image for this variant</label>
                    <div class="thumb-row">
                      @if (c.cardImage) {
                        <img [src]="c.cardImage" alt="" />
                      } @else {
                        <div class="thumb-placeholder">No image</div>
                      }
                      <div>
                        <label class="btn btn-ghost file-btn">
                          Upload
                          <input
                            type="file"
                            accept="image/*"
                            hidden
                            (change)="onColorCardImage($event, focusedIndex())"
                          />
                        </label>
                        <button type="button" class="btn btn-ghost" (click)="c.cardImage = ''">
                          Clear
                        </button>
                      </div>
                    </div>

                    <div class="ui-card-h tight angles-head">
                      <h2 class="side-h">Angles ({{ c.views.length }})</h2>
                    </div>
                    <div class="angle-grid">
                      @for (v of c.views; track $index; let vi = $index) {
                        <div class="angle-slot">
                          <input
                            class="angle-label"
                            type="text"
                            [(ngModel)]="v.label"
                            [name]="'ang' + c.id + vi"
                            placeholder="Angle name"
                          />
                          @if (v.src) {
                            <img [src]="v.src" alt="" />
                          } @else {
                            <div class="thumb-placeholder tall">Upload an angle image</div>
                          }
                          <div class="slot-actions">
                            <label class="btn btn-ghost file-btn">
                              Upload
                              <input
                                type="file"
                                accept="image/*"
                                hidden
                                (change)="onColorAngleImage($event, focusedIndex(), vi)"
                              />
                            </label>
                            <button type="button" class="btn btn-ghost" (click)="v.src = ''">Clear</button>
                            <button type="button" class="btn btn-danger" (click)="c.views.splice(vi, 1)">
                              Delete
                            </button>
                          </div>
                        </div>
                      } @empty {
                        <p class="fn">No angles on this variant yet.</p>
                      }
                    </div>
                    <div class="section-tools">
                      <input
                        type="text"
                        [(ngModel)]="newAngleLabel"
                        name="newAngleLabel"
                        placeholder="e.g. Left Chest"
                      />
                      <button type="button" class="btn btn-ghost" (click)="addAngle()">Add angle</button>
                    </div>
                  </div>
                } @else {
                  <div class="ui-card color-block variants-empty">
                    <p class="fn">No variants yet. Use “+ Add Variant” to create the first one.</p>
                  </div>
                }
              </div>

              <div class="variants-right">
                <div class="ui-card nested variants-list-card">
                  <div class="ui-card-h tight">
                    <h2 class="side-h">Variants ({{ colors.length }})</h2>
                  </div>
                  <div class="variant-pick-list">
                    @for (c of colors; track c.id; let i = $index) {
                      <button
                        type="button"
                        class="variant-list-item"
                        [class.is-on]="focusedIndex() === i"
                        (click)="focusColor(i)"
                      >
                        @if (normalizeHexInput(c.hex); as hx) {
                          <span class="variant-list-swatch" [style.background]="hx"></span>
                        }
                        <span class="variant-list-meta">
                          <strong>{{ c.name || 'Untitled' }}</strong>
                          <span
                            >{{ normalizeHexInput(c.hex) ? normalizedHex(c.hex) : 'No colour'
                            }}{{ c.isDefault ? ' · Default' : '' }}</span
                          >
                        </span>
                      </button>
                    } @empty {
                      <p class="fn">No variants yet.</p>
                    }
                  </div>
                </div>
              </div>
            </div>
          </section>

          @if (!colors.length) {
            <section class="ui-card" id="productLevelMedia">
              <div class="ui-card-h">
                <div>
                  <h2>Default Product Media</h2>
                  <p>Used when a product has no colour variants yet.</p>
                </div>
              </div>
              <label>Default card image</label>
              <div class="thumb-row">
                @if (form.cardImageUrl.trim()) {
                  <img [src]="form.cardImageUrl" alt="" />
                } @else {
                  <div class="thumb-placeholder">No default image</div>
                }
                <div>
                  <label class="btn btn-ghost file-btn">
                    Upload
                    <input type="file" accept="image/*" hidden (change)="onDefaultCardImage($event)" />
                  </label>
                  <button type="button" class="btn btn-ghost" (click)="form.cardImageUrl = ''">
                    Clear card image
                  </button>
                </div>
              </div>
              <label>Default product angles</label>
              <div class="section-tools">
                <input
                  type="text"
                  [(ngModel)]="newDefaultAngleLabel"
                  name="newDefaultAngleLabel"
                  placeholder="e.g. Left Chest"
                />
                <button type="button" class="btn btn-ghost" (click)="addDefaultAngle()">Add angle</button>
              </div>
              <div class="angle-grid">
                @for (v of defaultAngles; track $index; let i = $index) {
                  <div class="angle-slot">
                    <input
                      class="angle-label"
                      type="text"
                      [(ngModel)]="v.label"
                      [name]="'dang' + i"
                    />
                    @if (v.src) {
                      <img [src]="v.src" alt="" />
                    } @else {
                      <div class="thumb-placeholder tall">Upload an angle image</div>
                    }
                    <div class="slot-actions">
                      <label class="btn btn-ghost file-btn">
                        Upload
                        <input
                          type="file"
                          accept="image/*"
                          hidden
                          (change)="onDefaultAngleImage($event, i)"
                        />
                      </label>
                      <button type="button" class="btn btn-ghost" (click)="v.src = ''">Clear</button>
                      <button type="button" class="btn btn-danger" (click)="defaultAngles.splice(i, 1)">
                        Delete
                      </button>
                    </div>
                  </div>
                }
              </div>
            </section>
          }
        </div>
      </div>
    </div>

    @if (deleteConfirmOpen()) {
      <div class="modal-bg open" (click)="cancelDeleteConfirm()">
        <div class="modal modal-confirm" (click)="$event.stopPropagation()" role="dialog">
          <header>
            <h2>Delete product?</h2>
            <button type="button" class="btn btn-ghost" (click)="cancelDeleteConfirm()" aria-label="Close">×</button>
          </header>
          <div class="body">
            <p class="delete-copy">
              Do you want to delete <strong>{{ form.name || 'this product' }}</strong> and its variants?
            </p>
            <p class="field-hint">
              Yes permanently removes this product, all colour variants, and images from the database.
            </p>
            @if (formError()) {
              <div class="alert">{{ formError() }}</div>
            }
          </div>
          <div class="modal-actions">
            <button type="button" class="btn btn-ghost" (click)="cancelDeleteConfirm()" [disabled]="busy()">No</button>
            <button type="button" class="btn btn-danger" (click)="executeDelete()" [disabled]="busy()">
              {{ busy() ? 'Deleting…' : 'Yes' }}
            </button>
          </div>
        </div>
      </div>
    }
  `,
  styles: `
    :host { display: block; }
    .editor { max-width: none; }

    .modal-bg {
      position: fixed; inset: 0; background: rgba(28, 31, 27, 0.45);
      display: flex; align-items: flex-start; justify-content: center;
      padding: 40px 16px; z-index: 50; overflow: auto;
    }
    .modal {
      width: 100%; max-width: 420px; background: #fff;
      border: 1px solid #e4e0d6; border-radius: 12px;
    }
    .modal header {
      padding: 16px 18px; border-bottom: 1px solid #e4e0d6;
      display: flex; justify-content: space-between; align-items: center;
    }
    .modal header h2 { font-size: 0.95rem; margin: 0; }
    .modal .body { padding: 18px; }
    .modal-actions {
      padding: 0 18px 18px; display: flex; justify-content: flex-end; gap: 8px;
    }
    .delete-copy { margin: 0 0 8px; font-size: 0.92rem; line-height: 1.45; }
    .field-hint { margin: 0; font-size: 0.72rem; color: #6b6f63; line-height: 1.4; }

    .page-kicker {
      font-size: 0.68rem; font-weight: 700; letter-spacing: 0.12em;
      text-transform: uppercase; color: #6b6f63; margin: 0 0 8px;
    }
    .page-kicker.sm { margin-bottom: 4px; }

    .topbar {
      display: flex; justify-content: space-between; gap: 16px; flex-wrap: wrap;
      margin-bottom: 20px; align-items: flex-start;
    }
    .crumb-heading {
      font-family: Montserrat, sans-serif; font-size: 1.75rem;
      letter-spacing: -0.02em; margin: 0; text-transform: none; font-weight: 700;
    }
    .crumb-link {
      background: none; border: 0; padding: 0; color: #3d4b37;
      font: inherit; font-weight: 700; cursor: pointer;
    }
    .crumb-sep { color: #6b6f63; font-weight: 600; }
    .crumb-current { color: #1c1f1b; }
    .lede { margin: 6px 0 0; color: #7a7f74; max-width: 56ch; }
    .toolbar { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; }

    .btn {
      border: 0; cursor: pointer; padding: 10px 14px; font-weight: 600;
      font-size: 0.8rem; border-radius: 8px; font-family: inherit;
      display: inline-flex; align-items: center; gap: 6px;
      background: #fff; color: #1c1f1b;
    }
    .btn-gold { background: #3d4b37; color: #fff; }
    .btn-ghost { background: #fff; border: 1px solid #e4e0d6; color: #1c1f1b; }
    .btn-danger { background: #f8e8e6; color: #8b3a2f; border: 1px solid #efd2cd; }
    .btn-full { width: 100%; justify-content: center; margin-top: 4px; }
    .btn-icon { padding: 8px 10px; width: 34px; justify-content: center; }
    .btn:disabled { opacity: 0.55; cursor: wait; }
    .file-btn { margin: 0; padding: 7px 10px; cursor: pointer; }

    .alert {
      background: #f8e8e6; color: #8b3a2f; padding: 12px 14px;
      border-radius: 8px; margin-bottom: 16px; font-size: 0.85rem;
    }

    .product-layout { display: flex; flex-direction: column; gap: 20px; }
    .product-top {
      display: grid; grid-template-columns: minmax(0, 1fr) 300px; gap: 20px; align-items: start;
    }
    .product-main-top, .product-main { display: flex; flex-direction: column; gap: 16px; min-width: 0; }
    .product-side {
      display: flex; flex-direction: column; gap: 14px;
      position: sticky; top: 20px; align-self: start;
      max-height: calc(100vh - 40px); overflow-y: auto; padding-bottom: 8px;
    }

    .ui-card {
      background: #fff; border: 1px solid #e4e0d6; border-radius: 12px;
      padding: 18px 20px; box-shadow: 0 1px 2px rgba(28, 31, 27, 0.04);
    }
    .ui-card.nested { padding: 14px; }
    .ui-card-h {
      display: flex; justify-content: space-between; align-items: flex-start;
      gap: 12px; margin-bottom: 16px; flex-wrap: wrap;
    }
    .ui-card-h.tight { margin-bottom: 10px; }
    .ui-card-h h2, .ui-card > h2.side-h, .side-h {
      font-family: Montserrat, sans-serif; font-size: 1rem; margin: 0;
      text-transform: none; letter-spacing: -0.01em;
    }
    .side-h { font-size: 0.92rem !important; }
    .ui-card-h p { margin: 4px 0 0; color: #6b6f63; font-size: 0.8rem; max-width: none; }
    .from-existing label { margin: 0 0 6px; }
    .from-existing select { margin: 0; min-width: 180px; }

    label {
      display: block; font-size: 0.7rem; font-weight: 700;
      letter-spacing: 0.04em; text-transform: uppercase; margin: 0 0 6px; color: #4a4e46;
    }
    input[type='text'], input[type='number'], select, textarea {
      width: 100%; padding: 11px 12px; border: 1px solid #e4e0d6;
      border-radius: 8px; background: #fff; margin-bottom: 12px; font: inherit; color: #1c1f1b;
    }
    .grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 0 12px; }
    .grid-3 { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 0 12px; }
    .row-gap { margin-top: 8px; }
    .field-hint { margin: -6px 0 12px; color: #6b6f63; font-size: 0.74rem; max-width: none; }
    .req { color: #b33a2e; }
    .fn { color: #6b6f63; font-size: 0.82rem; margin: 0; max-width: none; }

    .checks {
      display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 6px; margin: 0 0 12px;
    }
    .checks.checks-compact {
      grid-template-columns: repeat(auto-fill, minmax(110px, 1fr));
      gap: 6px;
    }
    .checks label {
      border: 1px solid #e4e0d6; border-radius: 6px;
      padding: 7px 28px 7px 30px; background: #fff; cursor: pointer; position: relative;
      min-width: 0; margin: 0; text-transform: none; letter-spacing: 0;
      font-size: 0.74rem; font-weight: 500; color: #1c1f1b; line-height: 1.25;
    }
    .checks label input {
      position: absolute; left: 8px; top: 50%; transform: translateY(-50%);
      width: 13px; height: 13px; margin: 0;
    }
    .checks label.ui-check-on {
      border-color: #3d4b37; background: #eef2ea;
    }
    .checks label.ui-check-on::after {
      content: '✓'; position: absolute; right: 6px; top: 50%; transform: translateY(-50%);
      width: 16px; height: 16px; border-radius: 50%; background: #3d4b37; color: #fff;
      font-size: 0.62rem; display: flex; align-items: center; justify-content: center; font-weight: 700;
    }
    .priced-opts { display: flex; flex-direction: column; gap: 6px; margin-bottom: 12px; }
    .priced-opt {
      display: flex; align-items: center; justify-content: space-between; gap: 8px;
      border: 1px solid #e4e0d6; border-radius: 6px; background: #fff; padding: 6px 8px 6px 10px;
    }
    .priced-opt.on { border-color: #3d4b37; background: #eef2ea; }
    .priced-opt-check {
      display: flex; align-items: center; gap: 8px; margin: 0; cursor: pointer;
      text-transform: none; letter-spacing: 0; font-size: 0.74rem; font-weight: 500; color: #1c1f1b;
      flex: 1; min-width: 0;
    }
    .priced-opt-check input { width: 13px; height: 13px; margin: 0; flex: none; accent-color: #3d4b37; }
    .addon-mini {
      display: inline-flex; align-items: center; gap: 3px; margin: 0; flex: none;
      font-size: 0.62rem; font-weight: 700; letter-spacing: 0; text-transform: none; color: #6b6f63;
    }
    .addon-mini span { flex: none; }
    .addon-mini input {
      width: 52px; margin: 0; padding: 4px 5px; font-size: 0.72rem; border-radius: 4px;
      border: 1px solid #d4cec0; background: #fff; text-align: right;
      -moz-appearance: textfield; appearance: textfield;
    }
    .addon-mini input::-webkit-outer-spin-button,
    .addon-mini input::-webkit-inner-spin-button { -webkit-appearance: none; }
    .gsm-row { display: flex; align-items: flex-start; gap: 8px; }
    .gsm-row select { flex: 1; min-width: 0; margin-bottom: 12px; }
    .gsm-row .addon-mini { margin-top: 8px; }
    .checks label.style-opt {
      padding-right: 44px;
      display: flex; align-items: center; gap: 4px;
    }
    .checks label.style-opt span { flex: 1; min-width: 0; }
    .style-opt-del {
      position: absolute; right: 22px; top: 50%; transform: translateY(-50%);
      width: 18px; height: 18px; border: 0; background: transparent; color: #8a867c;
      font-size: 1rem; line-height: 1; cursor: pointer; padding: 0; border-radius: 4px;
    }
    .style-opt-del:hover { color: #8b3a2f; background: #f8e8e6; }
    .style-add-row {
      display: flex; gap: 8px; align-items: center; margin: 0 0 8px;
    }
    .style-add-row input { flex: 1; margin: 0; }
    .style-add-row .btn { flex: none; margin: 0; }
    .field-hint.is-error { color: #8b3a2f; }

    .attr-row {
      display: grid; grid-template-columns: 1fr 1fr auto; gap: 8px; margin-bottom: 8px; align-items: end;
    }
    .attr-row .btn { margin-bottom: 12px; }
    .section-tools {
      display: flex; gap: 8px; align-items: center; margin: 0 0 12px; flex-wrap: wrap;
    }
    .section-tools input { margin: 0; min-width: 160px; width: auto; }

    .preview-img-wrap {
      background: #eceae4; border-radius: 10px; aspect-ratio: 1;
      display: flex; align-items: center; justify-content: center; overflow: hidden;
      margin-bottom: 12px;
    }
    .preview-img-wrap.is-empty,
    .lp-stage.is-empty {
      padding: 16px;
      text-align: center;
    }
    .preview-img-wrap img { width: 100%; height: 100%; object-fit: contain; }
    .preview-empty {
      color: #6b6f63;
      font-size: 0.78rem;
      line-height: 1.4;
      max-width: 18ch;
    }
    .thumb-placeholder {
      width: 72px;
      height: 72px;
      border-radius: 8px;
      border: 1px dashed #cfc8ba;
      background: #f4f1ea;
      color: #8a867c;
      font-size: 0.65rem;
      display: flex;
      align-items: center;
      justify-content: center;
      text-align: center;
      padding: 6px;
      flex: none;
    }
    .thumb-placeholder.tall {
      width: 100%;
      height: auto;
      aspect-ratio: 1;
      margin-bottom: 6px;
    }
    .thumb-empty {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 100%;
      height: 100%;
      font-size: 0.58rem;
      color: #8a867c;
      background: #eceae4;
    }
    .preview-name { font-weight: 700; font-size: 0.95rem; margin: 0 0 2px; }
    .preview-sub { color: #6b6f63; font-size: 0.78rem; margin: 0 0 10px; max-width: none; }
    .status {
      display: inline-block; padding: 4px 10px; border-radius: 999px;
      font-size: 0.72rem; font-weight: 700;
    }
    .status.live { background: #e7f0e4; color: #2f6b3c; }
    .status.hidden-status { background: #f0eee8; color: #6b6f63; }

    .checklist { list-style: none; margin: 0; padding: 0; }
    .checklist li {
      display: grid; grid-template-columns: 22px 1fr auto; gap: 10px; align-items: start;
      padding: 12px 0; border-bottom: 1px solid #e4e0d6; font-size: 0.85rem; font-weight: 650;
    }
    .checklist li:last-child { border-bottom: 0; }
    .checklist .ck {
      width: 22px; height: 22px; border-radius: 50%; background: #e7f0e4; color: #2f6b3c;
      display: inline-flex; align-items: center; justify-content: center; flex-shrink: 0;
      font-size: 0.7rem; margin-top: 2px;
    }
    .checklist .ck-body { min-width: 0; }
    .checklist .ck-body small {
      display: block; font-weight: 500; color: #6b6f63; font-size: 0.72rem; margin-top: 2px;
    }
    .ck-edit {
      background: none; border: 0; color: #3d4b37;
      font-size: 0.75rem; font-weight: 700; cursor: pointer; padding: 4px 0;
    }
    .meta-soft { color: #6b6f63; font-size: 0.74rem; line-height: 1.5; margin: 4px 0 0; max-width: none; }
    .dot-live {
      display: inline-block; width: 8px; height: 8px; border-radius: 50%;
      background: #2f6b3c; margin-right: 6px; vertical-align: middle;
    }

    .tax-card .side-h { margin: 0; }
    .tax-head { margin-bottom: 12px; }
    .tax-sub {
      margin: 4px 0 0; color: #6b6f63; font-size: 0.74rem; max-width: none; line-height: 1.4;
    }
    .tax-list {
      border: 1px solid #e4e0d6; border-radius: 8px; max-height: 200px; overflow-y: auto;
      padding: 6px; background: #faf9f6; margin-bottom: 10px;
    }
    .tax-item {
      display: flex; align-items: center; gap: 8px;
      margin: 0; padding: 7px 10px; cursor: pointer; border-radius: 6px;
      text-transform: none; letter-spacing: 0; font-size: 0.82rem; font-weight: 550;
      color: #1c1f1b;
    }
    .tax-item:hover { background: #fff; }
    .tax-item.is-on { background: #eef2ea; color: #3d4b37; font-weight: 650; }
    .tax-item.is-root { font-weight: 650; }
    .tax-item input { margin: 0; width: 14px; height: 14px; flex: none; accent-color: #3d4b37; }
    .tax-branch {
      color: #a8aba3; font-size: 0.7rem; flex: none; width: 12px; line-height: 1;
    }
    .tax-name { min-width: 0; }
    .tax-add-link {
      background: none; border: 0; color: #3d4b37; font-size: 0.8rem;
      font-weight: 700; cursor: pointer; padding: 0; margin: 0;
    }
    .tax-add-form {
      margin-top: 10px; padding-top: 12px; border-top: 1px solid #e4e0d6;
    }
    .tax-add-title {
      display: flex; justify-content: space-between; align-items: center;
      margin-bottom: 10px;
    }
    .tax-add-title strong { font-size: 0.82rem; }
    .tax-cancel {
      background: none; border: 0; color: #6b6f63; font-size: 0.75rem;
      font-weight: 650; cursor: pointer; padding: 0;
    }
    .tax-add-form label { margin-top: 2px; }
    .tax-add-form input,
    .tax-add-form select { margin-bottom: 10px; }
    .tax-msg { margin: 8px 0 0; font-size: 0.75rem; color: #2f6b3c; max-width: none; }
    .tax-msg.is-error { color: #8b3a2f; }

    .lp-stage {
      background: #eceae4; border-radius: 12px; aspect-ratio: 1; max-height: 280px;
      display: flex; align-items: center; justify-content: center; overflow: hidden; margin: 10px 0;
    }
    .lp-stage img { width: 100%; height: 100%; object-fit: contain; }
    .lp-tabs { display: flex; gap: 12px; margin: 0 0 10px; flex-wrap: wrap; }
    .lp-tabs button {
      background: none; border: 0; border-bottom: 2px solid transparent; padding: 4px 0;
      font-size: 0.78rem; font-weight: 700; color: #6b6f63; cursor: pointer;
    }
    .lp-tabs button.is-on { color: #1c1f1b; border-bottom-color: #1c1f1b; }
    .lp-thumbs { display: flex; gap: 8px; flex-wrap: wrap; }
    .lp-thumbs button {
      width: 64px; padding: 0; border: 1px solid #e4e0d6;
      border-radius: 8px; overflow: hidden; background: #fff; cursor: pointer;
      display: flex; flex-direction: column; font: inherit; color: inherit;
    }
    .lp-thumbs button.is-on { border-color: #1c1f1b; box-shadow: 0 0 0 1px #1c1f1b; }
    .lp-thumbs img { width: 100%; height: 58px; object-fit: contain; display: block; background: #f7f5f0; }
    .lp-thumbs .thumb-empty {
      display: grid; place-items: center; height: 58px; font-size: 0.62rem; color: #8a867c;
      background: #f7f5f0;
    }
    .lp-thumb-label {
      display: block; text-align: center; font-size: 0.62rem; font-weight: 700;
      letter-spacing: 0.03em; text-transform: uppercase; color: #6b6f63;
      padding: 3px 2px 4px; border-top: 1px solid #e4e0d6; line-height: 1.15;
    }
    .lp-thumbs button.is-on .lp-thumb-label { color: #1c1f1b; }

    #cardVariants { min-height: 640px; padding: 22px 24px 28px; }
    .variants-add-btn { flex-shrink: 0; align-self: flex-start; margin-top: 4px; }
    .variants-workspace {
      display: grid; grid-template-columns: minmax(0, 1fr) minmax(220px, 280px);
      gap: 20px; align-items: start;
    }
    .variants-center, .variants-right { min-width: 0; display: flex; flex-direction: column; gap: 14px; }
    .variants-list-card { background: #fff; }
    .variants-empty { min-height: 120px; display: flex; align-items: center; }

    .hex-row { display: flex; gap: 8px; align-items: center; margin-bottom: 8px; }
    .hex-row input[type='text'] { flex: 1; margin: 0; }
    .hex-row-wrap { position: relative; flex-wrap: wrap; }
    .hex-picker-btn {
      position: relative;
      width: 40px;
      height: 40px;
      flex-shrink: 0;
      margin: 0;
      padding: 5px;
      box-sizing: border-box;
      border: 1px solid #d8d4cb;
      border-radius: 10px;
      background: #fff;
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      justify-content: center;
    }
    .hex-picker-btn:hover { border-color: #c9d6c0; }
    .hex-picker-face {
      display: block;
      width: 100%;
      height: 100%;
      border-radius: 3px;
      border: 1px solid rgba(0,0,0,.18);
      background: conic-gradient(
        from -90deg,
        #ffd400 0deg,
        #ff8a00 40deg,
        #ff2d2d 80deg,
        #ff2db8 120deg,
        #7a2dff 160deg,
        #2d6bff 200deg,
        #00c2ff 240deg,
        #00d56a 280deg,
        #a8e000 320deg,
        #ffd400 360deg
      );
      pointer-events: none;
    }
    .hex-picker-face.is-solid {
      border-radius: 3px;
    }
    .hex-picker {
      position: absolute;
      inset: 0;
      width: 100%;
      height: 100%;
      margin: 0;
      padding: 0;
      opacity: 0;
      cursor: pointer;
      border: 0;
    }
    .color-presets {
      display: flex; flex-wrap: wrap; gap: 8px; margin: 0 0 12px;
    }
    .color-preset {
      width: 32px; height: 32px; padding: 4px; box-sizing: border-box;
      border-radius: 8px; border: 1px solid #d8d4cb; cursor: pointer;
      background-color: #ccc;
      background-clip: content-box;
    }
    .color-preset.on {
      outline: 2px solid #3d4b37;
      outline-offset: 1px;
    }

    .variant-pick-list { display: flex; flex-direction: column; gap: 8px; }
    .variant-list-item {
      display: flex; align-items: center; gap: 10px; width: 100%;
      padding: 10px 12px; border: 1px solid #e4e0d6; border-radius: 10px;
      background: #fff; cursor: pointer; text-align: left; font: inherit; color: inherit;
    }
    .variant-list-item.is-on { background: #eef2ea; border-color: #c9d6c0; }
    .variant-list-swatch {
      width: 18px; height: 18px; border-radius: 50%; border: 1px solid rgba(0,0,0,.12); flex-shrink: 0;
    }
    .variant-list-meta { flex: 1; min-width: 0; }
    .variant-list-meta strong { display: block; font-size: 0.85rem; }
    .variant-list-meta span { font-size: 0.72rem; color: #6b6f63; }

    .variant-bulk-bar {
      display: flex; flex-wrap: wrap; gap: 8px; align-items: center;
      padding: 10px 12px; border: 1px solid #e4e0d6; border-radius: 10px; background: #fcfbf9;
    }
    .variant-bulk-bar input, .variant-bulk-bar select {
      width: auto; min-width: 110px; margin: 0; padding: 7px 8px;
    }
    .variant-bulk-bar .btn { padding: 7px 10px; }
    .variant-bulk-count { font-size: 0.78rem; font-weight: 600; margin-right: 4px; }

    .color-block {
      border: 1px solid #e4e0d6; border-radius: 12px;
      padding: 20px 22px 24px; margin: 0; background: #fff; min-height: 520px;
    }
    .color-block.is-default { border-color: #3d4b37; box-shadow: 0 0 0 1px rgba(61,75,55,.15); }
    .color-block.is-picked { box-shadow: inset 3px 0 0 #3d4b37; }
    .variant-h { font-size: 0.95rem !important; margin: 0; }
    .variant-sub { margin: 4px 0 0; color: #6b6f63; font-size: 0.78rem; max-width: none; }
    .variant-default-flag {
      background: #3d4b37; color: #fff; border-radius: 999px; padding: 5px 9px;
      font-size: 0.62rem; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase;
    }
    .mini-check {
      display: inline-flex; align-items: center; gap: 6px;
      text-transform: none; letter-spacing: 0; font-size: 0.8rem; font-weight: 600;
      margin: 0; cursor: pointer;
    }
    .angles-head { margin: 8px 0 10px; }

    .thumb-row { display: flex; gap: 10px; align-items: center; margin-bottom: 12px; }
    .thumb-row img {
      width: 72px; height: 72px; object-fit: cover; background: #ece8de; border: 1px solid #d4cec0;
    }
    .thumb-row .btn { margin-right: 4px; }

    .angle-grid {
      display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 10px; margin-bottom: 12px;
    }
    .angle-slot {
      border: 1px dashed #d4cec0; padding: 8px; background: #faf9f6; border-radius: 10px; min-height: 140px;
    }
    .angle-slot .angle-label {
      font-size: 0.62rem; margin: 0 0 6px; font-family: Montserrat, sans-serif;
      letter-spacing: 0.06em; text-transform: uppercase; font-weight: 700;
      width: 100%; padding: 6px 8px;
    }
    .angle-slot img {
      width: 100%; aspect-ratio: 1; object-fit: cover; background: #ece8de; display: block; margin-bottom: 6px;
    }
    .slot-actions { display: flex; gap: 4px; flex-wrap: wrap; }
    .slot-actions .btn { padding: 6px 8px; }

    @media (max-width: 1100px) {
      .product-top { grid-template-columns: 1fr; }
      .product-side { position: static; max-height: none; overflow: visible; }
      .variants-workspace { grid-template-columns: 1fr; }
      .grid-3 { grid-template-columns: 1fr 1fr; }
    }
    @media (max-width: 700px) {
      .grid-2, .grid-3, .checks, .attr-row { grid-template-columns: 1fr; }
      .angle-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
    }
  `,
})
export class AdminProductEditorComponent implements OnChanges {
  private readonly catalog = inject(CatalogService);
  private readonly auth = inject(AuthService);
  private readonly host = inject(ElementRef<HTMLElement>);

  @Input() productId: string | null = null;
  @Input() collections: Category[] = [];
  @Input() existingProducts: Product[] = [];
  @Input() categoryId: string | null = null;
  @Input() categoryName = '';
  @Input() lockCategory = false;
  @Input() startStandalone = false;
  @Input() apparelRootId: string | null = null;

  @Output() cancel = new EventEmitter<void>();
  @Output() saved = new EventEmitter<Product>();
  @Output() deleted = new EventEmitter<void>();
  @Output() categoriesChanged = new EventEmitter<void>();

  /** Set after first successful create so retries update instead of duplicating. */
  private persistedId: string | null = null;

  readonly templates = TEMPLATES;
  readonly materials = MATERIALS;
  readonly genders = GENDERS;
  readonly fits = FITS;
  readonly decorations = DECORATIONS;
  private ensuringDesignerAttrs = false;
  readonly sustainability = SUSTAINABILITY;
  readonly priceRanges = PRICE_RANGES;
  readonly colorPresets = COLOR_PRESETS;

  readonly busy = signal(false);
  readonly formError = signal('');
  readonly deleteConfirmOpen = signal(false);
  readonly focusedIndex = signal(0);
  readonly liveAngleIndex = signal(0);
  readonly showAddCategory = signal(false);
  readonly showAddBrand = signal(false);
  readonly categoryMsg = signal('');
  readonly brandMsg = signal('');
  readonly categoryError = signal(false);
  readonly brandError = signal(false);
  readonly categoryRows = signal<CategoryTreeRow[]>([]);
  readonly brandList = signal<ProductTag[]>([]);
  readonly apparelRootLabel = signal('Apparel');
  readonly attrDefs = signal<AttributeDefinition[]>([]);
  readonly sizeOptions = signal<CatalogSize[]>([]);
  readonly styleOptsBusy = signal(false);
  readonly styleOptsMsg = signal('');
  readonly styleOptsError = signal(false);

  standalone = false;
  slugTouched = false;
  cloneFromId = '';
  selectedCategoryIds: string[] = [];
  selectedBrandIds: string[] = [];
  otherTagIds: string[] = [];
  selectedSizeIds: string[] = [];
  newCategoryName = '';
  newCategoryParentId = '';
  newBrandName = '';
  colors: ColorFormRow[] = [];
  extraAttrs: ExtraAttr[] = [];
  /** Per-service add-on unit prices keyed as `kind:Label` (e.g. decoration:DTG Printing). */
  serviceAddOns: Record<string, number> = {};
  defaultAngles: AngleSlot[] = DEFAULT_ANGLES.map((label) => ({
    label,
    angle: label.toLowerCase(),
    src: '',
  }));

  newVariantName = '';
  newVariantHex = '#1a1a1a';
  newStyleOption = '';
  newAngleLabel = '';
  newDefaultAngleLabel = '';
  bulkPrice = '';

  form = this.emptyForm();
  private loadedProductId: string | null | undefined = undefined;
  private brandsLoaded = false;
  private categoriesLoaded = false;
  private attrsLoaded = false;
  private sizesLoaded = false;
  /** Last loaded product — used to rehydrate attrs after attribute defs arrive. */
  private pendingAttrProduct: Product | null = null;
  /** True while a product GET is in flight — blocks colour PATCH races. */
  private productLoadInFlight = false;

  ngOnChanges() {
    this.loadCategoryTree();
    this.loadBrands();
    this.loadAttrDefs();
    this.loadSizes();
    const incomingCategory = this.categoryId || '';
    if (this.productId) {
      if (this.loadedProductId !== this.productId) {
        this.loadedProductId = this.productId;
        this.persistedId = this.productId;
        this.loadProduct(this.productId);
      }
    } else if (this.loadedProductId !== null || !this.form.name) {
      this.loadedProductId = null;
      this.persistedId = null;
      this.resetNew();
      if (incomingCategory) {
        this.form.categoryId = incomingCategory;
        this.selectedCategoryIds = [incomingCategory];
        this.standalone = false;
      }
    }
  }

  categoryOptions(): CategoryTreeRow[] {
    return this.categoryRows();
  }

  indentLabel(depth: number): string {
    return depth > 0 ? `${'—'.repeat(depth)} ` : '';
  }

  isCategorySelected(id: string): boolean {
    return this.selectedCategoryIds.includes(id);
  }

  isBrandSelected(id: string): boolean {
    return this.selectedBrandIds.includes(id);
  }

  toggleCategory(id: string, event: Event) {
    if (this.lockCategory && id === this.categoryId) {
      (event.target as HTMLInputElement).checked = true;
      return;
    }
    const on = (event.target as HTMLInputElement).checked;
    if (on) {
      if (!this.selectedCategoryIds.includes(id)) {
        this.selectedCategoryIds = [...this.selectedCategoryIds, id];
      }
    } else {
      this.selectedCategoryIds = this.selectedCategoryIds.filter((x) => x !== id);
    }
    this.syncPrimaryCategory();
  }

  toggleBrand(id: string, event: Event) {
    const on = (event.target as HTMLInputElement).checked;
    if (on) {
      if (!this.selectedBrandIds.includes(id)) {
        this.selectedBrandIds = [...this.selectedBrandIds, id];
      }
    } else {
      this.selectedBrandIds = this.selectedBrandIds.filter((x) => x !== id);
    }
  }

  previewCategoryLabel(): string {
    if (this.categoryName && this.selectedCategoryIds.length <= 1) {
      return this.categoryName;
    }
    const names = this.selectedCategoryIds
      .map((id) => this.categoryRows().find((c) => c.id === id)?.name)
      .filter(Boolean) as string[];
    if (!names.length) return 'Extra product';
    if (names.length === 1) return names[0];
    return `${names[0]} +${names.length - 1}`;
  }

  openAddCategory() {
    this.categoryMsg.set('');
    this.categoryError.set(false);
    this.newCategoryParentId = this.apparelRootId || '';
    this.showAddCategory.set(true);
  }

  addCategory() {
    const name = this.newCategoryName.trim();
    if (!name) return;
    this.busy.set(true);
    this.categoryMsg.set('');
    this.categoryError.set(false);
    const parentId = this.newCategoryParentId || this.apparelRootId || undefined;
    this.catalog
      .createCategory({
        name,
        parentId,
        isActive: true,
      })
      .subscribe({
        next: (created) => {
          this.busy.set(false);
          if (!this.selectedCategoryIds.includes(created.id)) {
            this.selectedCategoryIds = [...this.selectedCategoryIds, created.id];
          }
          this.syncPrimaryCategory();
          this.newCategoryName = '';
          this.newCategoryParentId = this.apparelRootId || '';
          this.showAddCategory.set(false);
          this.categoryMsg.set(`Added “${created.name}”`);
          this.categoryError.set(false);
          this.categoriesLoaded = false;
          this.loadCategoryTree(true);
          this.categoriesChanged.emit();
        },
        error: (err) => {
          this.busy.set(false);
          this.categoryError.set(true);
          this.categoryMsg.set(this.apiErrorMessage(err, 'Could not add category'));
        },
      });
  }

  addBrand() {
    const name = this.newBrandName.trim();
    if (!name) return;
    this.busy.set(true);
    this.brandMsg.set('');
    this.brandError.set(false);
    this.catalog.createBrand(name).subscribe({
      next: (created) => {
        this.busy.set(false);
        this.brandList.update((list) =>
          [...list, created].sort((a, b) => a.name.localeCompare(b.name)),
        );
        this.selectedBrandIds = this.selectedBrandIds.includes(created.id)
          ? this.selectedBrandIds
          : [...this.selectedBrandIds, created.id];
        this.newBrandName = '';
        this.showAddBrand.set(false);
        this.brandMsg.set(`Added “${created.name}”`);
        this.brandError.set(false);
      },
      error: (err) => {
        this.busy.set(false);
        this.brandError.set(true);
        this.brandMsg.set(this.apiErrorMessage(err, 'Could not add brand'));
      },
    });
  }

  focusedColor(): ColorFormRow | null {
    return this.colors[this.focusedIndex()] || null;
  }

  focusedViews(): AngleSlot[] {
    return this.focusedColor()?.views || [];
  }

  selectedCount(): number {
    return this.colors.filter((c) => c.selected).length;
  }

  previewUrl(): string {
    const c = this.focusedColor();
    const fromVariant =
      c?.cardImage?.trim() || c?.views.find((v) => v.src?.trim())?.src || '';
    if (fromVariant) return fromVariant;
    const def = this.form.cardImageUrl.trim();
    if (def) return def;
    const fromDefaultAngle = this.defaultAngles.find((v) => v.src?.trim())?.src;
    return fromDefaultAngle || '';
  }

  livePreviewSrc(): string {
    const views = this.focusedViews();
    const i = this.liveAngleIndex();
    if (views[i]?.src?.trim()) return views[i].src;
    const anyView = views.find((v) => v.src?.trim())?.src;
    if (anyView) return anyView;
    return this.previewUrl();
  }

  attrOptionLabels(code: string): string[] {
    const fromApi =
      this.attrDefs()
        .find((d) => d.code === code)
        ?.options?.slice()
        .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))
        .map((o) => o.label)
        .filter(Boolean) || [];
    if (fromApi.length) return fromApi;
    if (code === 'material') return [...this.materials];
    if (code === 'gender') return [...this.genders];
    if (code === 'fit') return [...this.fits];
    if (code === 'sleeve') return ['Short', 'Long'];
    if (code === 'style') {
      return ['Pullover', 'Zip-Up', 'Crew', 'V-Neck', 'Classic Collar', 'Neck'];
    }
    if (code === 'decoration') return [...this.decorations];
    if (code === 'sustainability') return [...this.sustainability];
    if (code === 'gsm') return [...GSM_OPTIONS];
    if (code === 'placement' || code === 'logo_placement') return [...PLACEMENT_OPTIONS];
    if (code === 'private_label') return [...PRIVATE_LABEL_OPTIONS];
    return [];
  }

  isHoodieProduct(): boolean {
    const t = `${this.form.template || ''} ${this.form.name || ''}`.toLowerCase();
    return t.includes('hood');
  }

  onTemplateChange() {
    // Sleeve stays freely editable for all templates, including hoodies.
  }

  private styleAttrDef() {
    return this.attrDefs().find((d) => d.code === 'style') || null;
  }

  private slugOptionValue(label: string): string {
    return label
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');
  }

  addStyleOption() {
    const raw = this.newStyleOption.trim();
    if (!raw) return;
    const label = raw;
    const value = this.slugOptionValue(raw);
    if (!value) {
      this.styleOptsError.set(true);
      this.styleOptsMsg.set('Enter a valid style name');
      return;
    }
    const existing = this.attrOptionLabels('style');
    if (existing.some((o) => o.toLowerCase() === label.toLowerCase())) {
      if (!this.isChecked(this.form.style, label)) {
        const match = existing.find((o) => o.toLowerCase() === label.toLowerCase()) || label;
        this.form.style = [...this.form.style, match];
      }
      this.newStyleOption = '';
      this.styleOptsError.set(false);
      this.styleOptsMsg.set(`“${label}” already exists — ticked for this product.`);
      return;
    }
    const def = this.styleAttrDef();
    if (!def) {
      this.styleOptsError.set(true);
      this.styleOptsMsg.set('Style attribute not found. Create it under Products → Attributes first.');
      return;
    }
    const options = [
      ...(def.options || []).map((o, i) => ({
        value: o.value,
        label: o.label,
        sortOrder: o.sortOrder ?? i,
      })),
      { value, label, sortOrder: (def.options || []).length },
    ];
    this.persistStyleOptions(def.id, options, label);
  }

  removeStyleOption(label: string, event?: Event) {
    event?.preventDefault();
    event?.stopPropagation();
    if (!confirm(`Remove style option “${label}” from the catalogue?`)) return;
    const def = this.styleAttrDef();
    if (!def) return;
    const options = (def.options || [])
      .filter((o) => o.label !== label)
      .map((o, i) => ({
        value: o.value,
        label: o.label,
        sortOrder: i,
      }));
    this.form.style = this.form.style.filter((s) => s !== label);
    this.persistStyleOptions(def.id, options);
  }

  private persistStyleOptions(
    attrId: string,
    options: Array<{ value: string; label: string; sortOrder: number }>,
    autoSelectLabel?: string,
  ) {
    this.styleOptsBusy.set(true);
    this.styleOptsMsg.set('');
    this.styleOptsError.set(false);
    this.catalog
      .updateAttribute(attrId, {
        valueType: 'multiselect',
        options,
      })
      .subscribe({
        next: (updated) => {
          this.styleOptsBusy.set(false);
          this.attrDefs.update((list) =>
            list.map((d) => (d.id === updated.id ? { ...d, ...updated } : d)),
          );
          if (autoSelectLabel && !this.isChecked(this.form.style, autoSelectLabel)) {
            this.form.style = [...this.form.style, autoSelectLabel];
          }
          this.newStyleOption = '';
          this.styleOptsMsg.set(
            autoSelectLabel
              ? `Added “${autoSelectLabel}” — available on Custom Designer after Save.`
              : 'Style options updated.',
          );
        },
        error: (err) => {
          this.styleOptsBusy.set(false);
          this.styleOptsError.set(true);
          const msg = err?.error?.message;
          this.styleOptsMsg.set(
            Array.isArray(msg) ? msg.join(', ') : msg || 'Could not update style options',
          );
        },
      });
  }

  collectionLabel(id: string): string {
    return this.categoryRows().find((c) => c.id === id)?.name || 'Collection';
  }

  normalizedHex(hex: string): string {
    return this.normalizeHexInput(hex) || '#000000';
  }

  /** Coerce common inputs (`1a1a1a`, `#abc`, spaced) into `#rrggbb`, or null if invalid. */
  normalizeHexInput(hex: string): string | null {
    let s = (hex || '').trim();
    if (!s) return null;
    if (!s.startsWith('#')) s = `#${s}`;
    if (/^#[0-9A-Fa-f]{3}$/.test(s)) {
      s = `#${s[1]}${s[1]}${s[2]}${s[2]}${s[3]}${s[3]}`;
    }
    if (/^#[0-9A-Fa-f]{6}$/.test(s)) return s.toLowerCase();
    return null;
  }

  commitHex(target: { hex: string }) {
    const raw = (target.hex || '').trim();
    if (!raw) {
      target.hex = '';
      return;
    }
    const n = this.normalizeHexInput(raw);
    if (n) target.hex = n;
  }

  commitNewVariantHex() {
    const n = this.normalizeHexInput(this.newVariantHex);
    if (n) this.newVariantHex = n;
  }

  onHexPicker(target: { hex: string }, event: Event) {
    const v = (event.target as HTMLInputElement).value;
    const n = this.normalizeHexInput(v);
    if (n) target.hex = n;
  }

  setNewVariantHexFromPicker(event: Event) {
    const v = (event.target as HTMLInputElement).value;
    const n = this.normalizeHexInput(v);
    if (n) this.newVariantHex = n;
  }

  pickPresetColor(hex: string, _which: 'new' | 'edit' = 'edit') {
    const value = this.normalizeHexInput(hex) || this.normalizedHex(hex);
    const c = this.focusedColor();
    if (c) {
      c.hex = value;
      this.commitHex(c);
    }
  }

  /** If the add-variant form has a name filled in, commit it before Save. */
  /** Pending side-form add removed; variants are created via Add Variant into the list. */
  private flushPendingNewVariant(): boolean {
    return true;
  }

  isChecked(list: string[], value: string): boolean {
    return list.includes(value);
  }

  toggleCheck(list: string[], value: string, event: Event) {
    const on = (event.target as HTMLInputElement).checked;
    const i = list.indexOf(value);
    if (on && i < 0) list.push(value);
    if (!on && i >= 0) list.splice(i, 1);
  }

  addonKey(kind: string, label: string): string {
    return `${kind}:${label}`;
  }

  getAddon(kind: string, label: string): number | '' {
    const n = this.serviceAddOns[this.addonKey(kind, label)];
    return Number.isFinite(n) && n > 0 ? n : '';
  }

  setAddon(kind: string, label: string, raw: number | string) {
    const key = this.addonKey(kind, label);
    const n = Number(raw);
    if (!Number.isFinite(n) || n <= 0) {
      delete this.serviceAddOns[key];
      return;
    }
    this.serviceAddOns[key] = Math.round(n * 100) / 100;
  }

  scrollTo(id: string) {
    this.host.nativeElement.querySelector('#' + id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  onNameChange(name: string) {
    if (!this.slugTouched) {
      this.form.slug = this.slugify(name);
    }
  }

  onCloneFrom(id: string) {
    if (!id) return;
    this.loadProduct(id, true);
  }

  private loadCategoryTree(force = false) {
    if (this.categoriesLoaded && !force) return;
    this.categoriesLoaded = true;
    this.catalog.getCategoryTree(false).subscribe({
      next: (roots) => {
        const apparel =
          roots.find((r) => r.slug === 'apparel') ||
          roots.find((r) => r.id === this.apparelRootId) ||
          roots[0];
        if (apparel) {
          this.apparelRootLabel.set(apparel.name || 'Apparel');
          // Show apparel children as depth 0 collections; nest their children under them
          const rows: CategoryTreeRow[] = [];
          this.flattenTree(apparel.children || [], 0, rows);
          this.categoryRows.set(rows);
        } else {
          const rows: CategoryTreeRow[] = [];
          this.flattenTree(roots, 0, rows);
          this.categoryRows.set(rows);
        }
      },
      error: () => {
        this.categoriesLoaded = false;
        // Fallback: flat collections input
        this.categoryRows.set(
          (this.collections || []).map((c) => ({
            id: c.id,
            name: c.name,
            parentId: c.parentId || null,
            depth: 0,
            hasChildren: false,
          })),
        );
      },
    });
  }

  private flattenTree(
    nodes: Category[],
    depth: number,
    out: CategoryTreeRow[],
  ) {
    const sorted = [...nodes].sort(
      (a, b) =>
        (a.sortOrder ?? 0) - (b.sortOrder ?? 0) ||
        a.name.localeCompare(b.name),
    );
    for (const node of sorted) {
      const children = node.children || [];
      out.push({
        id: node.id,
        name: node.name,
        parentId: node.parentId || null,
        depth,
        hasChildren: children.length > 0,
      });
      if (children.length) this.flattenTree(children, depth + 1, out);
    }
  }

  private loadBrands() {
    if (this.brandsLoaded) return;
    this.brandsLoaded = true;
    this.catalog.getBrands().subscribe({
      next: (brands) => {
        if (brands.length) {
          this.brandList.set(brands);
          return;
        }
        // Seed default brand tags once when none exist yet
        let pending = DEFAULT_BRAND_NAMES.length;
        const created: ProductTag[] = [];
        for (const name of DEFAULT_BRAND_NAMES) {
          this.catalog.createBrand(name).subscribe({
            next: (b) => {
              created.push(b);
              if (--pending === 0) {
                this.brandList.set(
                  created.sort((a, b) => a.name.localeCompare(b.name)),
                );
              }
            },
            error: () => {
              if (--pending === 0 && created.length) {
                this.brandList.set(
                  created.sort((a, b) => a.name.localeCompare(b.name)),
                );
              }
            },
          });
        }
      },
      error: () => {
        this.brandsLoaded = false;
      },
    });
  }

  private loadAttrDefs(force = false) {
    if (this.attrsLoaded && !force) return;
    this.attrsLoaded = true;
    this.catalog.getAttributes().subscribe({
      next: (defs) => {
        this.attrDefs.set(defs.filter((d) => d.isActive !== false));
        this.ensureDesignerAttributes(defs);
        // Re-apply attribute labels once defs are ready (fixes empty decoration/style after load)
        const id = this.productId || this.persistedId;
        if (id && this.pendingAttrProduct) {
          const fromAttrs = this.merchFromAttributes(this.pendingAttrProduct);
          if (fromAttrs.style.length) this.form.style = fromAttrs.style;
          if (fromAttrs.decoration.length) this.form.decoration = fromAttrs.decoration;
          if (fromAttrs.sustainability.length) {
            this.form.sustainability = fromAttrs.sustainability;
          }
          if (fromAttrs.sleeve) this.form.sleeve = fromAttrs.sleeve;
          if (fromAttrs.material) this.form.material = fromAttrs.material;
          if (fromAttrs.gender) this.form.gender = fromAttrs.gender;
          if (fromAttrs.fit) this.form.fit = fromAttrs.fit;
          if (fromAttrs.gsm) this.form.gsm = fromAttrs.gsm;
          if (fromAttrs.placements.length) this.form.placements = fromAttrs.placements;
          if (fromAttrs.privateLabel.length) this.form.privateLabel = fromAttrs.privateLabel;
          if (Object.keys(fromAttrs.serviceAddOns).length) {
            this.serviceAddOns = { ...fromAttrs.serviceAddOns };
          }
        }
      },
      error: () => {
        this.attrsLoaded = false;
      },
    });
  }

  /** Create GSM / placement / private_label / service_addons defs if missing. */
  private ensureDesignerAttributes(defs: AttributeDefinition[]) {
    if (this.ensuringDesignerAttrs) return;
    const needed: Array<{
      code: string;
      name: string;
      valueType: 'select' | 'multiselect' | 'text';
      options?: string[];
    }> = [
      { code: 'gsm', name: 'GSM', valueType: 'select', options: GSM_OPTIONS },
      {
        code: 'placement',
        name: 'Logo Placement',
        valueType: 'multiselect',
        options: PLACEMENT_OPTIONS,
      },
      {
        code: 'private_label',
        name: 'Private Label',
        valueType: 'multiselect',
        options: PRIVATE_LABEL_OPTIONS,
      },
      { code: 'service_addons', name: 'Service Add-ons', valueType: 'text' },
    ];
    const missing = needed.filter((n) => !defs.some((d) => d.code === n.code));
    const placement = defs.find((d) => d.code === 'placement');
    const upgradePlacement =
      !!placement && placement.valueType !== 'multiselect' ? placement : null;
    if (!missing.length && !upgradePlacement) return;
    this.ensuringDesignerAttrs = true;
    let remaining = missing.length + (upgradePlacement ? 1 : 0);
    const done = () => {
      remaining -= 1;
      if (remaining > 0) return;
      this.ensuringDesignerAttrs = false;
      this.attrsLoaded = false;
      this.loadAttrDefs(true);
    };
    if (upgradePlacement) {
      this.catalog
        .updateAttribute(upgradePlacement.id, { valueType: 'multiselect' })
        .subscribe({ next: done, error: done });
    }
    for (const n of missing) {
      this.catalog
        .createAttribute({
          code: n.code,
          name: n.name,
          valueType: n.valueType,
          options: (n.options || []).map((label, i) => ({
            value: label
              .toLowerCase()
              .replace(/[^a-z0-9]+/g, '-')
              .replace(/^-|-$/g, ''),
            label,
            sortOrder: i,
          })),
        })
        .subscribe({ next: done, error: done });
    }
  }

  private loadSizes() {
    if (this.sizesLoaded) return;
    this.sizesLoaded = true;
    this.catalog.getSizes().subscribe({
      next: (sizes) =>
        this.sizeOptions.set(
          [...sizes].sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0)),
        ),
      error: () => {
        this.sizesLoaded = false;
      },
    });
  }

  toggleSize(id: string, event: Event) {
    const checked = (event.target as HTMLInputElement).checked;
    if (checked) {
      if (!this.selectedSizeIds.includes(id)) {
        this.selectedSizeIds = [...this.selectedSizeIds, id];
      }
    } else {
      this.selectedSizeIds = this.selectedSizeIds.filter((x) => x !== id);
    }
  }

  focusColor(i: number) {
    this.focusedIndex.set(i);
    this.liveAngleIndex.set(0);
  }

  addVariant() {
    // UI-only add: append a blank row and focus it so details fields clear for editing.
    // Existing variants/products are untouched.
    this.colors.push({
      id: this.uid(),
      name: '',
      hex: '',
      priceOverride: '',
      description: '',
      isDefault: this.colors.length === 0,
      cardImage: '',
      views: DEFAULT_ANGLES.map((label) => ({ label, angle: label.toLowerCase(), src: '' })),
      selected: false,
    });
    this.newVariantName = '';
    this.newVariantHex = '';
    this.formError.set('');
    this.focusedIndex.set(this.colors.length - 1);
    this.liveAngleIndex.set(0);
  }

  removeColor(i: number) {
    const wasDefault = this.colors[i]?.isDefault;
    this.colors.splice(i, 1);
    if (wasDefault && this.colors.length) this.colors[0].isDefault = true;
    this.focusedIndex.set(Math.min(i, Math.max(0, this.colors.length - 1)));
  }

  setDefaultColor(i: number) {
    this.colors.forEach((c, idx) => (c.isDefault = idx === i));
  }

  copyFromVariant(fromIdx: string) {
    const j = Number(fromIdx);
    const src = this.colors[j];
    const dest = this.focusedColor();
    if (!src || !dest || j === this.focusedIndex()) return;
    dest.hex = src.hex;
    dest.priceOverride = src.priceOverride;
    dest.description = src.description;
    dest.cardImage = src.cardImage;
    dest.views = src.views.map((v) => ({ ...v }));
  }

  applyBulkPrice() {
    const n = Number(this.bulkPrice);
    if (!(n > 0)) {
      alert('Enter a price greater than 0');
      return;
    }
    this.colors.filter((c) => c.selected).forEach((c) => (c.priceOverride = String(n)));
  }

  bulkSetDefault() {
    const i = this.colors.findIndex((c) => c.selected);
    if (i >= 0) this.setDefaultColor(i);
  }

  bulkDelete() {
    if (!this.colors.some((c) => c.selected)) return;
    if (!confirm('Delete selected variants?')) return;
    this.colors = this.colors.filter((c) => !c.selected);
    if (this.colors.length && !this.colors.some((c) => c.isDefault)) {
      this.colors[0].isDefault = true;
    }
    this.focusedIndex.set(0);
  }

  addAngle() {
    const c = this.focusedColor();
    if (!c) return;
    const label = this.newAngleLabel.trim() || `Angle ${c.views.length + 1}`;
    c.views.push({ label, angle: this.slugify(label), src: '' });
    this.newAngleLabel = '';
  }

  addDefaultAngle() {
    const label = this.newDefaultAngleLabel.trim() || `Angle ${this.defaultAngles.length + 1}`;
    this.defaultAngles.push({ label, angle: this.slugify(label), src: '' });
    this.newDefaultAngleLabel = '';
  }

  onColorCardImage(event: Event, i: number) {
    this.readImage(event, 640, 0.62).then((src) => {
      if (!this.colors[i]) return;
      this.colors[i].cardImage = src;
      void this.persistColorImageNow(i, src, {
        role: 'card',
        angle: 'front',
        sortOrder: 0,
      });
    });
  }

  onColorAngleImage(event: Event, ci: number, vi: number) {
    this.readImage(event, 520, 0.55).then((src) => {
      const row = this.colors[ci];
      if (!row?.views[vi]) return;
      row.views[vi].src = src;
      const angle = this.toImageAngle(row.views[vi].label || row.views[vi].angle);
      row.views[vi].angle = angle;
      void this.persistColorImageNow(ci, src, {
        role: 'view',
        angle,
        sortOrder: vi + 1,
      });
    });
  }

  onDefaultCardImage(event: Event) {
    this.readImage(event, 640, 0.62).then((src) => {
      this.form.cardImageUrl = src;
      void this.persistProductImageNow(src, {
        role: 'card',
        angle: 'front',
        sortOrder: 0,
      });
    });
  }

  onDefaultAngleImage(event: Event, i: number) {
    this.readImage(event, 520, 0.55).then((src) => {
      if (!this.defaultAngles[i]) return;
      this.defaultAngles[i].src = src;
      const angle = this.toImageAngle(
        this.defaultAngles[i].label || this.defaultAngles[i].angle,
      );
      this.defaultAngles[i].angle = angle;
      void this.persistProductImageNow(src, {
        role: 'view',
        angle,
        sortOrder: i + 1,
      });
    });
  }

  /** Upload a variant image immediately when the product already exists. */
  private async persistColorImageNow(
    colorIndex: number,
    dataUrl: string,
    meta: { role: string; angle: string; sortOrder: number },
  ) {
    const productId = this.productId || this.persistedId;
    const color = this.colors[colorIndex];
    if (!productId || !color || !dataUrl.startsWith('data:')) return;

    const resolveColorId = async (): Promise<string> => {
      let colorId = this.isUuid(this.colors[colorIndex]?.id)
        ? this.colors[colorIndex].id
        : '';
      if (!colorId) {
        await this.ensureColorsPersisted();
        colorId = this.isUuid(this.colors[colorIndex]?.id)
          ? this.colors[colorIndex].id
          : '';
      }
      return colorId;
    };

    const tryUpload = (colorId: string) =>
      new Promise<boolean>((resolve) => {
        try {
          const file = this.dataUrlToFile(
            dataUrl,
            `${meta.role}-${meta.angle}.jpg`,
          );
          this.auth
            .ensureFreshAccessToken()
            .pipe(
              switchMap(() =>
                this.catalog.uploadProductImage(productId, file, {
                  ...meta,
                  productColorId: colorId,
                }),
              ),
            )
            .subscribe({
              next: () => resolve(true),
              error: () => resolve(false),
            });
        } catch {
          resolve(false);
        }
      });

    try {
      let colorId = await resolveColorId();
      if (!colorId) return;
      let uploaded = await tryUpload(colorId);
      if (!uploaded) {
        // Color may have been recreated on a prior save — refresh ids and retry once
        await this.ensureColorsPersisted();
        colorId = this.isUuid(this.colors[colorIndex]?.id)
          ? this.colors[colorIndex].id
          : '';
        if (!colorId) return;
        uploaded = await tryUpload(colorId);
      }
      if (!uploaded) {
        this.formError.set(
          'Angle image preview is set, but upload failed. Hit Save to retry.',
        );
        return;
      }
      this.formError.set('');
      this.catalog.getProduct(productId).subscribe({
        next: (fresh) => {
          const savedColor =
            fresh.colors?.find((c) => c.id === colorId) ||
            fresh.colors?.[colorIndex];
          if (savedColor?.id && this.colors[colorIndex]) {
            this.colors[colorIndex].id = savedColor.id;
          }
          const imgs = this.dedupeImages([
            ...(savedColor?.images || []),
            ...(fresh.images || []).filter(
              (im) => im.productColorId === (savedColor?.id || colorId),
            ),
          ]);
          if (meta.role === 'card') {
            const card = imgs.find((im) => im.role === 'card')?.url;
            if (card && this.colors[colorIndex]) {
              this.colors[colorIndex].cardImage = card;
            }
            return;
          }
          const match =
            imgs.find(
              (im) =>
                (im.role === 'view' || im.role === 'gallery') &&
                im.angle === meta.angle &&
                im.sortOrder === meta.sortOrder,
            ) ||
            imgs.find(
              (im) =>
                (im.role === 'view' || im.role === 'gallery') &&
                im.angle === meta.angle,
            );
          if (match?.url && this.colors[colorIndex]?.views[meta.sortOrder - 1]) {
            this.colors[colorIndex].views[meta.sortOrder - 1].src = match.url;
          }
        },
      });
    } catch {
      this.formError.set(
        'Angle image preview is set, but upload failed. Hit Save to retry.',
      );
    }
  }

  private async persistProductImageNow(
    dataUrl: string,
    meta: { role: string; angle: string; sortOrder: number },
  ) {
    const productId = this.productId || this.persistedId;
    if (!productId || !dataUrl.startsWith('data:')) return;
    try {
      const file = this.dataUrlToFile(
        dataUrl,
        `${meta.role}-${meta.angle}.jpg`,
      );
      await new Promise<void>((resolve, reject) => {
        this.auth
          .ensureFreshAccessToken()
          .pipe(switchMap(() => this.catalog.uploadProductImage(productId, file, meta)))
          .subscribe({
            next: () => resolve(),
            error: () => reject(),
          });
      });
      this.formError.set('');
      this.catalog.getProduct(productId).subscribe({
        next: (fresh) => {
          if (meta.role === 'card') {
            const card =
              fresh.images?.find((im) => im.role === 'card' && !im.productColorId)
                ?.url || this.catalog.cardImageUrl(fresh);
            if (card) this.form.cardImageUrl = card;
            return;
          }
          const match = (fresh.images || []).find(
            (im) =>
              !im.productColorId &&
              (im.role === 'view' || im.role === 'gallery') &&
              im.angle === meta.angle,
          );
          if (match?.url && this.defaultAngles[meta.sortOrder - 1]) {
            this.defaultAngles[meta.sortOrder - 1].src = match.url;
          }
        },
      });
    } catch {
      this.formError.set(
        'Image preview is set, but upload failed. Hit Save to retry.',
      );
    }
  }

  /** Persist color rows so new variants get server UUIDs before image upload. */
  private ensureColorsPersisted(): Promise<void> {
    const productId = this.productId || this.persistedId;
    if (!productId) return Promise.reject();
    if (this.productLoadInFlight) {
      return Promise.reject(new Error('Product still loading — try again in a moment.'));
    }
    if (!this.colors.length) {
      return Promise.reject(new Error('Add a colour variant before uploading images.'));
    }
    for (const c of this.colors) {
      const raw = (c.hex || '').trim();
      if (!raw) {
        c.hex = '';
        continue;
      }
      const n = this.normalizeHexInput(raw);
      if (!n) {
        return Promise.reject(
          new Error(
            `Invalid hex for “${c.name || 'variant'}”. Leave blank or use #RRGGBB.`,
          ),
        );
      }
      c.hex = n;
    }
    const colors = this.buildColorInputs();
    return new Promise((resolve, reject) => {
      this.auth
        .ensureFreshAccessToken()
        .pipe(switchMap(() => this.catalog.updateProduct(productId, { colors } as Partial<ProductWritePayload>)))
        .subscribe({
          next: (saved) => {
            this.syncLocalColorIds(saved);
            this.catalog.getProduct(productId).subscribe({
              next: (fresh) => {
                this.syncLocalColorIds(fresh);
                resolve();
              },
              error: () => resolve(),
            });
          },
          error: () => reject(),
        });
    });
  }

  private buildColorInputs(): ProductColorInput[] {
    return this.colors.map((c, i) => {
      const images: NonNullable<ProductColorInput['images']> = [];
      if (c.cardImage && !c.cardImage.startsWith('data:')) {
        images.push({ url: c.cardImage, role: 'card', angle: 'front', sortOrder: 0 });
      }
      c.views.forEach((v, vi) => {
        if (!v.src || v.src.startsWith('data:')) return;
        images.push({
          url: v.src,
          role: 'view',
          angle: this.toImageAngle(v.label || v.angle),
          sortOrder: vi + 1,
        });
      });
      return {
        name: c.name.trim() || `Colour ${i + 1}`,
        hex: this.normalizeHexInput(c.hex) || '',
        isDefault: c.isDefault,
        sortOrder: i,
        priceOverride: c.priceOverride !== '' ? Number(c.priceOverride) : undefined,
        description: c.description.trim() || undefined,
        images: images.length ? images : undefined,
      };
    });
  }

  /** Map local colour rows onto freshly saved product colour UUIDs. */
  private syncLocalColorIds(saved: Product) {
    const list = saved.colors || [];
    const used = new Set<string>();
    this.colors.forEach((local, index) => {
      let match =
        (this.isUuid(local.id) ? list.find((c) => c.id === local.id) : null) || null;
      if (!match) {
        const hex = (this.normalizeHexInput(local.hex) || '').toLowerCase();
        const name = (local.name.trim() || `Colour ${index + 1}`).toLowerCase();
        match =
          list.find((c) => {
            if (used.has(c.id)) return false;
            const cHex = (this.normalizeHexInput(c.hex || '') || '').toLowerCase();
            return (c.name || '').toLowerCase() === name && cHex === hex;
          }) || null;
      }
      if (!match) {
        match = list.find((c) => !used.has(c.id) && c.sortOrder === index) || null;
      }
      if (!match) {
        match = list.find((c) => !used.has(c.id)) || null;
      }
      if (match?.id) {
        used.add(match.id);
        local.id = match.id;
        const n = this.normalizeHexInput(match.hex || '');
        if (n) local.hex = n;
      }
    });
  }

  save() {
    if (this.productLoadInFlight) {
      this.formError.set('Product is still loading — wait a moment, then Save again.');
      return;
    }
    if (!this.flushPendingNewVariant()) {
      return;
    }
    if (!this.form.name.trim()) {
      this.formError.set('Name is required');
      return;
    }
    if (!this.selectedCategoryIds.length && !this.standalone) {
      this.formError.set('Pick at least one category so the product shows on the storefront');
      return;
    }
    const editingId = this.productId || this.persistedId;
    // Never wipe an existing product's variants with an empty colours array
    if (editingId && !this.colors.length && (this.pendingAttrProduct?.colors?.length || 0) > 0) {
      this.formError.set(
        'Colour variants failed to load. Refresh the page before saving so existing variants are not removed.',
      );
      return;
    }
    for (const c of this.colors) {
      const raw = (c.hex || '').trim();
      if (!raw) {
        // Colour is optional — empty is allowed and hides storefront swatches.
        c.hex = '';
        continue;
      }
      const n = this.normalizeHexInput(raw);
      if (!n) {
        this.formError.set(
          `Invalid hex for “${c.name || 'variant'}”. Leave blank or use #RRGGBB (e.g. #1a1a1a).`,
        );
        return;
      }
      c.hex = n;
    }
    this.busy.set(true);
    this.formError.set('');

    const runSave = () => {
      const colors = this.buildColorInputs();
      const productImages: ProductWritePayload['images'] = [];
      if (this.form.cardImageUrl.trim() && !this.form.cardImageUrl.startsWith('data:')) {
        productImages.push({
          url: this.form.cardImageUrl.trim(),
          role: 'card',
          angle: 'front',
          sortOrder: 0,
        });
      }
      this.defaultAngles.forEach((v, i) => {
        if (!v.src || v.src.startsWith('data:')) return;
        productImages.push({
          url: v.src,
          role: 'view',
          angle: this.toImageAngle(v.label || v.angle),
          sortOrder: i + 1,
        });
      });

      const primaryId = this.selectedCategoryIds[0] || '';
      const extraCategoryIds = this.selectedCategoryIds.slice(1);
      const attributes = this.buildAttributeInputs();
      // If defs missing, don't send empty attributes (would wipe style/decoration)
      const hadAttrs = (this.pendingAttrProduct?.attributeValues || []).length > 0;
      if (!this.attrDefs().length && hadAttrs) {
        this.busy.set(false);
        this.formError.set('Attributes still loading — try Save again in a second.');
        this.loadAttrDefs(true);
        return;
      }

      const tagIds = [...this.otherTagIds, ...this.selectedBrandIds];
      const sizes = this.selectedSizeIds.map((sizeId, i) => ({
        sizeId,
        isAvailable: true,
        sortOrder: i,
      }));

      const payload: ProductWritePayload = {
        name: this.form.name.trim(),
        slug: this.form.slug.trim() || undefined,
        sku: this.form.sku.trim() || undefined,
        template: this.form.template.trim() || undefined,
        badge: this.form.badge.trim() || undefined,
        ecoTag: this.form.ecoTag.trim() || undefined,
        shortDescription: this.form.shortDescription.trim() || undefined,
        basePrice:
          this.form.basePrice !== '' && this.form.basePrice != null
            ? Number(this.form.basePrice)
            : undefined,
        isActive: this.form.isActive,
        isFeatured: this.form.isFeatured,
        isStandalone: this.standalone || !primaryId,
        categoryId: primaryId || null,
        extraCategoryIds,
        tagIds,
        sizes,
        attributes,
        images: productImages.length ? productImages : undefined,
      };
      // Only include colours when we have rows (omit keeps existing on some APIs;
      // when present, ids are sent so rows update instead of full recreate wipe)
      if (colors.length) {
        payload.colors = colors;
      }

      const write$ = editingId
        ? this.catalog.updateProduct(editingId, payload)
        : this.catalog.createProduct(payload);

      this.auth
        .ensureFreshAccessToken()
        .pipe(
          switchMap(() =>
            write$.pipe(
              retry({
                count: 2,
                delay: (err) => {
                  const status = (err as { status?: number })?.status;
                  if (status && status !== 0) {
                    return throwError(() => err);
                  }
                  return timer(1200);
                },
              }),
            ),
          ),
          switchMap((saved) => {
            this.persistedId = saved.id;
            this.loadedProductId = saved.id;
            this.syncLocalColorIds(saved);
            return this.uploadPendingImages(saved.id, saved).pipe(
              switchMap((uploadOk) =>
                this.catalog.getProduct(saved.id).pipe(
                  map((fresh) => ({ fresh, uploadOk })),
                  catchError(() => of({ fresh: saved, uploadOk })),
                ),
              ),
              catchError(() =>
                of({ fresh: saved, uploadOk: false as boolean }),
              ),
            );
          }),
        )
        .subscribe({
          next: ({ fresh, uploadOk }) => {
            this.busy.set(false);
            this.persistedId = fresh.id;
            this.loadedProductId = fresh.id;
            this.syncLocalColorIds(fresh);
            this.applyProduct(fresh, false);
            if (!uploadOk) {
              this.formError.set(
                'Details saved, but some images failed to upload. Fix media and hit Save again.',
              );
              return;
            }
            this.saved.emit(fresh);
          },
          error: (err) => {
            this.busy.set(false);
            this.formError.set(this.apiErrorMessage(err, 'Save failed'));
          },
        });
    };

    if (!this.attrDefs().length) {
      this.attrsLoaded = false;
      this.catalog.getAttributes().subscribe({
        next: (defs) => {
          this.attrsLoaded = true;
          this.attrDefs.set(defs.filter((d) => d.isActive !== false));
          runSave();
        },
        error: () => {
          this.attrsLoaded = false;
          runSave();
        },
      });
      return;
    }
    runSave();
  }

  onDelete() {
    const id = this.productId || this.persistedId;
    if (!id) return;
    this.formError.set('');
    this.deleteConfirmOpen.set(true);
  }

  cancelDeleteConfirm() {
    if (this.busy()) return;
    this.deleteConfirmOpen.set(false);
  }

  executeDelete() {
    const id = this.productId || this.persistedId;
    if (!id) return;
    this.busy.set(true);
    this.formError.set('');
    this.auth
      .ensureFreshAccessToken()
      .pipe(switchMap(() => this.catalog.deleteProduct(id)))
      .subscribe({
        next: () => {
          this.busy.set(false);
          this.deleteConfirmOpen.set(false);
          this.deleted.emit();
        },
        error: (err) => {
          this.busy.set(false);
          this.formError.set(this.apiErrorMessage(err, 'Could not permanently delete'));
        },
      });
  }

  private emptyForm() {
    return {
      name: '',
      slug: '',
      sku: '',
      categoryId: '',
      template: '',
      material: '',
      gender: '',
      fit: '',
      sleeve: '',
      style: [] as string[],
      priceRange: '',
      badge: '',
      ecoTag: '',
      shortDescription: '',
      basePrice: '' as string | number,
      isActive: true,
      isFeatured: false,
      cardImageUrl: '',
      decoration: [] as string[],
      sustainability: [] as string[],
      gsm: '',
      placements: [] as string[],
      privateLabel: [] as string[],
    };
  }

  private resetNew() {
    this.serviceAddOns = {};
    this.form = { ...this.emptyForm(), categoryId: this.categoryId || '' };
    this.standalone = this.startStandalone && !this.categoryId;
    this.slugTouched = false;
    this.cloneFromId = '';
    this.selectedCategoryIds = this.categoryId ? [this.categoryId] : [];
    this.selectedBrandIds = [];
    this.otherTagIds = [];
    this.selectedSizeIds = [];
    this.extraAttrs = [];
    this.syncPrimaryCategory();
    this.colors = [
      {
        id: this.uid(),
        name: 'Black',
        hex: '#1a1a1a',
        priceOverride: '',
        description: '',
        isDefault: true,
        cardImage: '',
        views: DEFAULT_ANGLES.map((label) => ({ label, angle: label.toLowerCase(), src: '' })),
        selected: false,
      },
    ];
    this.defaultAngles = DEFAULT_ANGLES.map((label) => ({
      label,
      angle: label.toLowerCase(),
      src: '',
    }));
    this.focusedIndex.set(0);
    this.formError.set('');
  }

  private loadProduct(id: string, asClone = false) {
    this.busy.set(true);
    this.productLoadInFlight = true;
    this.catalog.getProduct(id).subscribe({
      next: (p) => {
        this.busy.set(false);
        this.productLoadInFlight = false;
        this.applyProduct(p, asClone);
      },
      error: (err) => {
        this.busy.set(false);
        this.productLoadInFlight = false;
        const msg = err?.error?.message;
        const status = err?.status;
        if (!status || status === 0) {
          this.formError.set(
            'Failed to load product — cannot reach the API. Check your connection to threadgaff.rafehahmad.com or start the Nest backend on :3000.',
          );
        } else {
          this.formError.set(
            Array.isArray(msg) ? msg.join(', ') : msg || 'Failed to load product',
          );
        }
      },
    });
  }

  private applyProduct(p: Product, asClone: boolean) {
    this.pendingAttrProduct = p;
    const fromAttrs = this.merchFromAttributes(p);
    const merch = this.parseMerch(p.shortDescription || '');
    this.form = {
      name: asClone ? `${p.name} (copy)` : p.name || '',
      slug: asClone ? '' : p.slug || '',
      sku: asClone ? '' : p.sku || '',
      categoryId: p.categoryId || p.category?.id || this.categoryId || '',
      template: p.template || '',
      material: fromAttrs.material || merch.material,
      gender: fromAttrs.gender || merch.gender,
      fit: fromAttrs.fit || merch.fit,
      sleeve: fromAttrs.sleeve || merch.sleeve || (this.isHoodieLike(p) ? 'Long' : ''),
      style: fromAttrs.style.length ? fromAttrs.style : merch.style,
      priceRange: fromAttrs.priceRange || merch.priceRange,
      badge: p.badge || '',
      ecoTag: p.ecoTag || '',
      shortDescription: this.isPackedMerch(p.shortDescription || '')
        ? ''
        : p.shortDescription || '',
      basePrice: p.basePrice ?? '',
      isActive: p.isActive !== false,
      isFeatured: !!p.isFeatured,
      cardImageUrl: this.catalog.cardImageUrl(p),
      decoration: fromAttrs.decoration.length ? fromAttrs.decoration : merch.decoration,
      sustainability: fromAttrs.sustainability.length
        ? fromAttrs.sustainability
        : merch.sustainability,
      gsm: fromAttrs.gsm || merch.gsm,
      placements: fromAttrs.placements.length
        ? fromAttrs.placements
        : merch.placements,
      privateLabel: fromAttrs.privateLabel.length
        ? fromAttrs.privateLabel
        : merch.privateLabel,
    };
    this.serviceAddOns = { ...fromAttrs.serviceAddOns, ...merch.serviceAddOns };
    this.extraAttrs = merch.extra;
    const primaryId = p.categoryId || p.category?.id || this.categoryId || '';
    const extras = [...(p.extraCategoryIds || []), ...merch.categoryIds].filter(Boolean);
    this.selectedCategoryIds = Array.from(
      new Set([...(primaryId ? [primaryId] : []), ...extras]),
    );
    this.syncPrimaryCategory();
    this.slugTouched = !asClone;
    if (asClone) this.onNameChange(this.form.name);

    const tags = p.tags || [];
    const brandTags = tags.filter(
      (t) => t.kind === 'brand' || (t.description || '').toLowerCase() === 'brand',
    );
    this.otherTagIds = tags
      .filter((t) => t.kind !== 'brand' && (t.description || '').toLowerCase() !== 'brand')
      .map((t) => t.id);
    this.selectedBrandIds = brandTags.map((t) => t.id);
    this.selectedSizeIds = (p.sizes || []).map((s) => s.sizeId).filter(Boolean);
    if (brandTags.length) {
      this.brandList.update((list) => {
        const map = new Map(list.map((b) => [b.id, b]));
        for (const b of brandTags) map.set(b.id, b);
        return [...map.values()].sort((a, b) => a.name.localeCompare(b.name));
      });
    }

    this.colors = (p.colors || []).map((c) => {
      const fromProduct = (p.images || []).filter(
        (im) => im.productColorId && im.productColorId === c.id,
      );
      const merged = this.dedupeImages([...(c.images || []), ...fromProduct]);
      const card =
        merged.find((im) => im.role === 'card')?.url ||
        merged.find((im) => im.url)?.url ||
        '';
      const views = merged
        .filter((im) => im.role === 'view' || im.role === 'gallery')
        .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))
        .map((im) => ({
          label: this.prettyAngleLabel(im.angle),
          angle: im.angle || 'front',
          src: im.url,
        }));
      return {
        id: c.id || this.uid(),
        name: c.name,
        hex: this.normalizeHexInput(c.hex || '') || '',
        priceOverride: c.priceOverride != null ? String(c.priceOverride) : '',
        description: (c.description || '').trim(),
        isDefault: !!c.isDefault,
        cardImage: card,
        views: views.length
          ? views
          : DEFAULT_ANGLES.map((label) => ({ label, angle: label.toLowerCase(), src: '' })),
        selected: false,
      };
    });
    if (!this.colors.length) {
      // Do not invent a fake variant on edit — that would overwrite real colours on Save
      this.colors = [];
      this.focusedIndex.set(0);
    } else {
      this.focusedIndex.set(0);
    }
    this.liveAngleIndex.set(0);
    this.hydrateDefaultAngles(p);
  }

  private isHoodieLike(p: Product): boolean {
    const t = `${p.template || ''} ${p.name || ''} ${p.slug || ''}`.toLowerCase();
    return t.includes('hood');
  }

  private hydrateDefaultAngles(p: Product) {
    const productLevel = (p.images || [])
      .filter((im) => !im.productColorId && (im.role === 'view' || im.role === 'gallery'))
      .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
    if (!productLevel.length) {
      if (!this.colors.length) {
        this.defaultAngles = DEFAULT_ANGLES.map((label) => ({
          label,
          angle: label.toLowerCase(),
          src: '',
        }));
      }
      return;
    }
    this.defaultAngles = productLevel.map((im) => ({
      label: this.prettyAngleLabel(im.angle),
      angle: im.angle || 'front',
      src: im.url,
    }));
  }

  private parseMerch(text: string) {
    const parts = text.split(' · ').map((s) => s.trim()).filter(Boolean);
    const out = {
      material: '',
      gender: '',
      fit: '',
      sleeve: '',
      style: [] as string[],
      priceRange: '',
      categoryIds: [] as string[],
      decoration: [] as string[],
      sustainability: [] as string[],
      gsm: '',
      placements: [] as string[],
      privateLabel: [] as string[],
      serviceAddOns: {} as Record<string, number>,
      extra: [] as ExtraAttr[],
    };
    for (const part of parts) {
      const idx = part.indexOf(':');
      if (idx < 0) continue;
      const key = part.slice(0, idx).trim();
      const value = part.slice(idx + 1).trim();
      if (key === 'Material') out.material = value;
      else if (key === 'Gender') out.gender = value;
      else if (key === 'Fit') out.fit = value;
      else if (key === 'Sleeve') out.sleeve = value;
      else if (key === 'Style') out.style = value.split(',').map((s) => s.trim()).filter(Boolean);
      else if (key === 'Price range') out.priceRange = value;
      else if (key === 'CategoryIds')
        out.categoryIds = value.split(',').map((s) => s.trim()).filter(Boolean);
      else if (key === 'Decoration') out.decoration = value.split(',').map((s) => s.trim()).filter(Boolean);
      else if (key === 'Sustainability')
        out.sustainability = value.split(',').map((s) => s.trim()).filter(Boolean);
      else if (key === 'GSM') out.gsm = value;
      else if (key === 'Placement' || key === 'Logo placement') {
        out.placements = value.split(',').map((s) => s.trim()).filter(Boolean);
      } else if (key === 'Private label')
        out.privateLabel = value.split(',').map((s) => s.trim()).filter(Boolean);
      else if (key === 'ServiceAddOns') {
        out.serviceAddOns = this.parseServiceAddOns(value);
      } else if (key !== 'Category' && key !== 'Brand') out.extra.push({ key, value });
    }
    return out;
  }

  private isPackedMerch(text: string): boolean {
    return /^(Material|Gender|Fit|Price range|CategoryIds|Decoration|Sustainability):/i.test(
      text.trim(),
    );
  }

  private merchFromAttributes(p: Product) {
    const out = {
      material: '',
      gender: '',
      fit: '',
      sleeve: '',
      style: [] as string[],
      priceRange: '',
      decoration: [] as string[],
      sustainability: [] as string[],
      gsm: '',
      placements: [] as string[],
      privateLabel: [] as string[],
      serviceAddOns: {} as Record<string, number>,
    };
    for (const av of p.attributeValues || []) {
      const code = av.attributeDefinition?.code || '';
      const label = av.option?.label || av.option?.value || av.valueText || '';
      const resolveMulti = (attrCode: string): string[] => {
        const def = this.attrDefs().find((d) => d.code === attrCode);
        const fromIds =
          av.optionIds
            ?.map((id) => def?.options?.find((o) => o.id === id)?.label)
            .filter((x): x is string => !!x) || [];
        if (fromIds.length) return fromIds;
        if (label) return [av.option?.label || this.prettyAngleLabel(label)];
        return [];
      };
      if (code === 'material' && label) out.material = av.option?.label || label;
      else if (code === 'gender' && label) out.gender = av.option?.label || label;
      else if (code === 'fit' && label) out.fit = av.option?.label || label;
      else if (code === 'sleeve' && label) {
        out.sleeve = av.option?.label || this.prettyAngleLabel(label);
      } else if (code === 'style') {
        out.style = resolveMulti('style');
      } else if (code === 'price_range' && label) {
        out.priceRange = av.option?.label || label;
      } else if (code === 'decoration') {
        out.decoration = resolveMulti('decoration');
      } else if (code === 'sustainability') {
        out.sustainability = resolveMulti('sustainability');
      } else if (code === 'gsm' && label) {
        out.gsm = av.option?.label || label;
      } else if (code === 'placement' || code === 'logo_placement') {
        out.placements = resolveMulti(code === 'logo_placement' ? 'logo_placement' : 'placement');
      } else if (code === 'private_label') {
        out.privateLabel = resolveMulti('private_label');
      } else if (code === 'service_addons' && av.valueText) {
        out.serviceAddOns = this.parseServiceAddOns(av.valueText);
      }
    }
    return out;
  }

  private parseServiceAddOns(raw: string): Record<string, number> {
    const out: Record<string, number> = {};
    const text = (raw || '').trim();
    if (!text) return out;
    try {
      const parsed = JSON.parse(text) as Record<string, unknown>;
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        for (const [k, v] of Object.entries(parsed)) {
          const n = Number(v);
          if (k && Number.isFinite(n) && n > 0) out[k] = Math.round(n * 100) / 100;
        }
        return out;
      }
    } catch {
      // compact format: decoration|DTG Printing|1.5,placement|Front Centre|0.4
    }
    for (const part of text.split(',')) {
      const bits = part.split('|').map((s) => s.trim());
      if (bits.length < 3) continue;
      const n = Number(bits[2]);
      if (!Number.isFinite(n) || n <= 0) continue;
      out[`${bits[0]}:${bits[1]}`] = Math.round(n * 100) / 100;
    }
    return out;
  }

  private serializeServiceAddOns(): string {
    const cleaned: Record<string, number> = {};
    const keep = (kind: string, labels: string[]) => {
      for (const label of labels) {
        const key = this.addonKey(kind, label);
        const n = this.serviceAddOns[key];
        if (Number.isFinite(n) && n > 0) cleaned[key] = n;
      }
    };
    keep('decoration', this.form.decoration);
    keep('placement', this.form.placements);
    keep('private_label', this.form.privateLabel);
    if (this.form.gsm) keep('gsm', [this.form.gsm]);
    return Object.keys(cleaned).length ? JSON.stringify(cleaned) : '';
  }

  private buildAttributeInputs(): ProductAttributeInput[] {
    const defs = this.attrDefs();
    const inputs: ProductAttributeInput[] = [];
    const pick = (code: string, label: string) => {
      if (!label.trim()) return;
      const def = defs.find((d) => d.code === code);
      if (!def) return;
      const opt = this.matchOption(def, label);
      if (opt) {
        inputs.push({ attributeDefinitionId: def.id, optionId: opt.id });
        return;
      }
      const byValue = (def.options || []).find(
        (o) => o.value.toLowerCase() === label.trim().toLowerCase(),
      );
      if (byValue) {
        inputs.push({ attributeDefinitionId: def.id, optionId: byValue.id });
        return;
      }
      if (def.valueType === 'select' || def.valueType === 'multiselect') {
        return;
      }
      inputs.push({ attributeDefinitionId: def.id, valueText: label.trim() });
    };
    pick('material', this.form.material);
    pick('gender', this.form.gender);
    pick('fit', this.form.fit);
    pick('sleeve', this.form.sleeve);
    pick('price_range', this.form.priceRange);
    pick('gsm', this.form.gsm);

    const multi = (code: string, labels: string[]) => {
      if (!labels.length) return;
      const def = defs.find((d) => d.code === code);
      if (!def) return;
      const optionIds = labels
        .map((l) => this.matchOption(def, l)?.id)
        .filter((id): id is string => !!id);
      if (optionIds.length) {
        inputs.push({ attributeDefinitionId: def.id, optionIds });
      }
    };
    multi('style', this.form.style);
    multi('decoration', this.form.decoration);
    multi('sustainability', this.form.sustainability);
    multi('private_label', this.form.privateLabel);
    multi('placement', this.form.placements);

    const addOnsJson = this.serializeServiceAddOns();
    const addOnDef = defs.find((d) => d.code === 'service_addons');
    if (addOnDef && addOnsJson) {
      inputs.push({ attributeDefinitionId: addOnDef.id, valueText: addOnsJson });
    }
    return inputs;
  }

  private matchOption(def: AttributeDefinition, label: string) {
    const norm = (s: string) =>
      s
        .toLowerCase()
        .replace(/[’']/g, '')
        .replace(/£/g, '')
        .replace(/[^a-z0-9]+/g, '');
    const target = norm(label);
    return (def.options || []).find(
      (o) => norm(o.label) === target || norm(o.value) === target,
    );
  }

  private uploadPendingImages(productId: string, saved: Product) {
    // Refetch so we always have real color UUIDs after create/replace
    return this.catalog.getProduct(productId).pipe(
      catchError(() => of(saved)),
      switchMap((fresh) => {
        this.syncLocalColorIds(fresh);
        return this.runImageUploads(productId, fresh);
      }),
    );
  }

  private runImageUploads(productId: string, saved: Product) {
    type UploadMeta = {
      role: string;
      angle: string;
      sortOrder: number;
      productColorId?: string;
    };
    const jobs: import('rxjs').Observable<unknown>[] = [];
    let missingColorLink = false;

    const queue = (dataUrl: string, meta: UploadMeta) => {
      if (!dataUrl?.startsWith('data:')) return;
      try {
        const file = this.dataUrlToFile(
          dataUrl,
          `${meta.role}-${meta.angle || meta.sortOrder}.jpg`,
        );
        jobs.push(
          this.auth.ensureFreshAccessToken().pipe(
            switchMap(() => this.catalog.uploadProductImage(productId, file, meta)),
          ),
        );
      } catch {
        /* skip bad data URLs */
      }
    };

    const matchSavedColor = (local: ColorFormRow, index: number) => {
      const list = saved.colors || [];
      if (this.isUuid(local.id)) {
        const byId = list.find((c) => c.id === local.id);
        if (byId) return byId;
      }
      const hex = this.normalizedHex(local.hex).toLowerCase();
      const name = (local.name.trim() || `Colour ${index + 1}`).toLowerCase();
      const normHex = (h: string) => {
        const n = this.normalizeHexInput(h || '') || '';
        return n;
      };
      return (
        list.find(
          (c) =>
            (c.name || '').toLowerCase() === name &&
            normHex(c.hex || '') === hex,
        ) ||
        list.find((c) => c.sortOrder === index) ||
        list[index] ||
        null
      );
    };

    if (this.form.cardImageUrl.startsWith('data:')) {
      queue(this.form.cardImageUrl, {
        role: 'card',
        angle: 'front',
        sortOrder: 0,
      });
    }
    this.defaultAngles.forEach((v, i) => {
      if (v.src.startsWith('data:')) {
        queue(v.src, {
          role: 'view',
          angle: this.toImageAngle(v.label || v.angle),
          sortOrder: i + 1,
        });
      }
    });
    this.colors.forEach((c, i) => {
      const savedColor = matchSavedColor(c, i);
      const productColorId = savedColor?.id;
      if (savedColor?.id && this.colors[i]) {
        this.colors[i].id = savedColor.id;
      }
      const hasPending =
        c.cardImage.startsWith('data:') ||
        c.views.some((v) => v.src.startsWith('data:'));
      if (hasPending && !productColorId) {
        missingColorLink = true;
        return;
      }
      if (c.cardImage.startsWith('data:')) {
        queue(c.cardImage, {
          role: 'card',
          angle: 'front',
          sortOrder: 0,
          productColorId,
        });
      }
      c.views.forEach((v, vi) => {
        if (v.src.startsWith('data:')) {
          queue(v.src, {
            role: 'view',
            angle: this.toImageAngle(v.label || v.angle),
            sortOrder: vi + 1,
            productColorId,
          });
        }
      });
    });

    if (missingColorLink && !jobs.length) {
      return of(false);
    }
    if (!jobs.length) return of(true);
    return forkJoin(jobs).pipe(
      map(() => !missingColorLink),
      catchError(() => of(false)),
    );
  }

  private isUuid(value: string | null | undefined): boolean {
    return !!value &&
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
        value,
      );
  }

  private prettyAngleLabel(angle: string | null | undefined): string {
    const raw = (angle || 'front').trim();
    if (!raw) return 'Angle';
    return raw
      .split(/[-_\s]+/)
      .filter(Boolean)
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(' ');
  }

  private dedupeImages(
    images: NonNullable<Product['images']>,
  ): NonNullable<Product['images']> {
    const seen = new Set<string>();
    const out: NonNullable<Product['images']> = [];
    for (const im of images) {
      const key = `${im.role}|${im.angle}|${im.url}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(im);
    }
    return out;
  }

  private dataUrlToFile(dataUrl: string, filename: string): File {
    const [header, b64] = dataUrl.split(',');
    const mime = /data:(.*?);/.exec(header)?.[1] || 'image/jpeg';
    const bin = atob(b64);
    const arr = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
    return new File([arr], filename, { type: mime });
  }

  private syncPrimaryCategory() {
    this.form.categoryId = this.selectedCategoryIds[0] || '';
    this.standalone = !this.form.categoryId;
  }

  private slugify(s: string): string {
    return s
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 180);
  }

  private toImageAngle(raw: string): string {
    const allowed = new Set([
      'front',
      'back',
      'sleeve',
      'collar',
      'front-right',
      'front-left',
      'back-right',
      'back-left',
      'side',
      'detail',
      'other',
    ]);
    const key = this.slugify(raw || '');
    return allowed.has(key) ? key : 'other';
  }

  private uid(): string {
    return 'c_' + Math.random().toString(36).slice(2, 10);
  }

  private apiErrorMessage(err: unknown, fallback: string): string {
    const e = err as {
      status?: number;
      message?: string;
      error?: { message?: string | string[]; error?: string; statusCode?: number };
    };
    const status = e?.status ?? e?.error?.statusCode;
    if (!status || status === 0) {
      return 'Cannot reach the API right now (timeout). Check your connection and try Save again.';
    }
    if (status === 401) {
      return 'Session expired — sign out, sign in again, then retry Save.';
    }
    if (status === 403) {
      return 'You need catalog manage permission to do this.';
    }
    if (status >= 500) {
      return 'Server error while saving. Wait a moment and try again.';
    }
    const msg = e?.error?.message ?? e?.message;
    if (Array.isArray(msg)) return msg.join(', ');
    if (typeof msg === 'string' && msg.trim()) return msg;
    if (typeof e?.error?.error === 'string' && e.error.error.trim()) {
      return e.error.error;
    }
    return fallback;
  }

  private readImage(event: Event, maxPx: number, quality: number): Promise<string> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return Promise.reject();
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject();
      reader.onload = () => {
        const img = new Image();
        img.onload = () => {
          const scale = Math.min(1, maxPx / Math.max(img.width, img.height));
          const canvas = document.createElement('canvas');
          canvas.width = Math.max(1, Math.round(img.width * scale));
          canvas.height = Math.max(1, Math.round(img.height * scale));
          const ctx = canvas.getContext('2d');
          if (!ctx) {
            reject();
            return;
          }
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
          resolve(canvas.toDataURL('image/jpeg', quality));
        };
        img.onerror = () => reject();
        img.src = String(reader.result || '');
      };
      reader.readAsDataURL(file);
    });
  }
}
