import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import {
  AttributeDefinition,
  CatalogService,
} from '../../core/services/catalog.service';
import { Product, ProductColor, ProductImage } from '../../core/models/catalog.models';
import {
  effectiveUnitPrice,
  estimatedTotal,
  formatGbp,
  priceLabel as formatProductPrice,
} from '../../core/utils/price';
import { hasDisplayHex } from '../../core/utils/hex';
import { cardDescription } from '../../core/utils/description';

type Garment = 'tee' | 'hoodie' | 'polo';

interface AttrOpt {
  value: string;
  label: string;
}

interface OutlookView {
  key: string;
  label: string;
  url: string;
  angle: string;
}

const DEFAULT_SIZES = ['XS', 'S', 'M', 'L', 'XL', 'XXL'];

@Component({
  selector: 'tg-designer-page',
  standalone: true,
  imports: [RouterLink, FormsModule],
  template: `
    <div class="des-page" [class.is-picking]="!product()">
      @if (!product()) {
        <section class="des-pick">
          <div class="des-pick-panel">
            <p class="des-pick-kicker">Custom Designer</p>
            <h2>Select a garment to customise</h2>
            <p class="des-pick-lede">
              Choose the product you want to work on. The designer needs a garment from the
              catalogue before you can add colour, branding or quantities.
            </p>
            @if (error()) {
              <div class="alert">{{ error() }}</div>
            }
            @if (!pickList().length) {
              <p class="des-pick-empty">
                No garments are in the catalogue yet. Browse the shop or return home to pick one.
              </p>
            }
            <div class="des-pick-grid">
              @for (p of pickList(); track p.id) {
                <button type="button" class="des-pick-card" (click)="selectProduct(p)">
                  <img [src]="catalog.cardImageUrl(p)" [alt]="p.name" />
                  <span class="des-pick-name">{{ p.name }}</span>
                  <span class="des-pick-meta">{{ p.category?.name || p.template || 'Apparel' }}</span>
                  @if (descriptionFor(p)) {
                    <span class="des-pick-desc">{{ descriptionFor(p) }}</span>
                  }
                  <span class="des-pick-price">{{ pickPriceLabel(p) }}</span>
                </button>
              }
            </div>
            <div class="des-pick-foot">
              <a class="btn btn-outline" routerLink="/products">Browse products</a>
              <a class="btn btn-outline" routerLink="/">Back to homepage</a>
            </div>
          </div>
        </section>
      } @else {
        <div class="studio">
          <button type="button" class="studio-back" (click)="clearProduct()">← Custom Designer</button>
          <header class="studio-head">
            <h1>{{ product()!.name }}</h1>
            <p>
              {{
                descriptionFor(product()!) ||
                  'Bring your brand to life with high quality custom garments.'
              }}
            </p>
          </header>

          <div class="studio-grid">
            <section class="preview-col" aria-label="Live preview">
              <div class="preview-top">
                <div class="view-tabs">
                  @for (view of outlookViews(); track view.key; let i = $index) {
                    <button type="button" class="view-tab" [class.on]="outlookIndex() === i" (click)="outlookIndex.set(i)">
                      {{ view.label }}
                    </button>
                  }
                </div>
              </div>
              <div class="preview-main">
                <aside class="thumb-rail" aria-label="Angle thumbnails">
                  @for (view of outlookViews(); track view.key; let i = $index) {
                    <button type="button" class="thumb" [class.on]="outlookIndex() === i" (click)="outlookIndex.set(i)">
                      <img [src]="view.url" [alt]="view.label" />
                      <span>{{ view.label }}</span>
                    </button>
                  }
                </aside>
                <div class="stage-wrap">
                  <div class="stage" [style.transform]="'scale(' + zoom() / 100 + ')'">
                    <img class="stage-img" [src]="previewSrc()" [alt]="product()!.name" />
                    <div class="stage-tint" [style.background]="selectedColor()?.hex || '#55613f'"></div>
                    @if (logoPreview()) {
                      <div class="stage-logo"><img [src]="logoPreview()!" alt="Logo" /></div>
                    }
                  </div>
                </div>
              </div>
              <div class="zoom-bar">
                <button type="button" (click)="zoomBy(-10)" aria-label="Zoom out">−</button>
                <span>{{ zoom() }}%</span>
                <button type="button" (click)="zoomBy(10)" aria-label="Zoom in">+</button>
                <button type="button" class="reset" (click)="resetZoom()">Reset View</button>
              </div>
            </section>

            <section class="steps-col" aria-label="Configuration steps">
              <article class="step" [class.open]="openSteps().has(1)">
                <button type="button" class="step-h" (click)="setStep(1)">
                  <span class="step-n">1</span>
                  <span><strong>Garment</strong><small>Sleeve, neckline, fabric and colour</small></span>
                </button>
                @if (openSteps().has(1)) {
                  <div class="step-body">
                    <div class="field">
                      <div class="lbl">Sleeve Length</div>
                      @if (!sleeveOptions().length) {
                        <p class="hint">Set sleeve options on this product in admin.</p>
                      } @else {
                        <div class="chips">
                          @for (opt of sleeveOptions(); track opt.value) {
                            <button type="button" class="chip" [class.on]="isSleeveSelected(opt.value)" (click)="toggleSleeveOption(opt)">{{ opt.label }}</button>
                          }
                        </div>
                      }
                    </div>
                    <div class="field">
                      <div class="lbl">Neckline / Style</div>
                      @if (!styleOptions().length) {
                        <p class="hint">No styles selected for this product in admin.</p>
                      } @else {
                        <div class="chips">
                          @for (opt of styleOptions(); track opt.value) {
                            <button type="button" class="chip" [class.on]="isStyleSelected(opt.value)" (click)="toggleStyleOption(opt)">{{ opt.label }}</button>
                          }
                        </div>
                      }
                    </div>
                    <div class="field" [class.two]="fabricOptions().length && gsmOptions().length">
                      @if (fabricOptions().length) {
                        <div>
                          <span class="lbl">Fabric</span>
                          <div class="chips">
                            @for (f of fabricOptions(); track f.value) {
                              <button type="button" class="chip" [class.on]="isFabricSelected(f.value)" (click)="toggleFabricOption(f)">{{ f.label }}</button>
                            }
                          </div>
                        </div>
                      } @else {
                        <div>
                          <span class="lbl">Fabric</span>
                          <p class="hint">Set material on this product in admin.</p>
                        </div>
                      }
                      @if (gsmOptions().length) {
                        <div>
                          <span class="lbl">GSM</span>
                          <div class="chips">
                            @for (g of gsmOptions(); track g.value) {
                              <button type="button" class="chip" [class.on]="isGsmSelected(g.value)" (click)="toggleGsmOption(g)">{{ g.label }}</button>
                            }
                          </div>
                        </div>
                      } @else {
                        <div>
                          <span class="lbl">GSM</span>
                          <p class="hint">Set GSM options in admin Attributes / product.</p>
                        </div>
                      }
                    </div>
                    @if (displayColors().length) {
                      <div class="field">
                        <div class="lbl">Garment Colour</div>
                        <div class="swatches">
                          @for (c of displayColors(); track c.id) {
                            <button type="button" class="swatch" [class.on]="selectedColorId() === c.id" [style.background]="c.hex" [attr.title]="c.name" (click)="selectColor(c)"></button>
                          }
                        </div>
                      </div>
                    } @else {
                      <p class="hint">No colour variants with a hex set for this product in admin.</p>
                    }
                  </div>
                }
              </article>

              <article class="step" [class.open]="openSteps().has(2)">
                <button type="button" class="step-h" (click)="setStep(2)">
                  <span class="step-n">2</span>
                  <span><strong>Branding</strong><small>Add your logo, decoration method and placement.</small></span>
                </button>
                @if (openSteps().has(2)) {
                  <div class="step-body">
                    <label class="upload">
                      <strong>{{ logoName() || 'Upload Logo' }}</strong>
                      <span>PNG, SVG or AI</span>
                      <input type="file" accept="image/*" hidden (change)="onLogo($event)" />
                    </label>
                    @if (logoPreview()) {
                      <button type="button" class="linkish" (click)="clearLogo()">Clear logo</button>
                    }
                    <div class="field">
                      <span class="lbl">Decoration Method</span>
                      @if (decorationMethods().length) {
                        <div class="chips">
                          @for (m of decorationMethods(); track m) {
                            <button type="button" class="chip" [class.on]="decorationValue() === m" (click)="setDecoration(m)">{{ m }}</button>
                          }
                        </div>
                      } @else {
                        <p class="hint">Set decoration methods on this product in admin.</p>
                      }
                    </div>
                    <div class="field">
                      <span class="lbl">Logo Placement</span>
                      @if (placementOptions().length) {
                        <select [ngModel]="placementValue()" (ngModelChange)="setPlacement($event)">
                          @for (p of placementOptions(); track p.value) {
                            <option [value]="p.value">{{ p.label }}</option>
                          }
                        </select>
                      } @else {
                        <p class="hint">Set logo placement options in admin Attributes / product.</p>
                      }
                    </div>
                    <div class="field">
                      <span class="lbl">Brand text (optional)</span>
                      <input type="text" maxlength="24" placeholder="e.g. NORTHSTAR" [ngModel]="brandText()" (ngModelChange)="brandText.set($event)" />
                    </div>
                  </div>
                }
              </article>

              <article class="step" [class.open]="openSteps().has(3)">
                <button type="button" class="step-h" (click)="setStep(3)">
                  <span class="step-n">3</span>
                  <span><strong>Private Label</strong><small>Customize labels, hangtags and packaging.</small></span>
                </button>
                @if (openSteps().has(3)) {
                  <div class="step-body">
                    @if (privateLabelOptions().length) {
                      @for (opt of privateLabelOptions(); track opt.value) {
                        <label class="check">
                          <input
                            type="checkbox"
                            [checked]="isPrivateLabelSelected(opt.value)"
                            (change)="togglePrivateLabel(opt, $event)"
                          />
                          {{ opt.label }}
                        </label>
                      }
                      <p class="hint">Private label options are included in your quote request for the team to confirm.</p>
                    } @else {
                      <p class="hint">No private label options selected for this product in admin.</p>
                    }
                  </div>
                }
              </article>

              <article class="step" [class.open]="openSteps().has(4)">
                <button type="button" class="step-h" (click)="setStep(4)">
                  <span class="step-n">4</span>
                  <span><strong>Quantity</strong><small>Set your size breakdown and review pricing.</small></span>
                </button>
                @if (openSteps().has(4)) {
                  <div class="step-body">
                    <div class="qty-grid">
                      @for (s of sizeCodes(); track s) {
                        <label class="qty-cell">
                          <span>{{ s }}</span>
                          <input type="number" min="0" [ngModel]="qtyMap()[s] || 0" (ngModelChange)="setQty(s, $event)" [attr.aria-label]="'Quantity ' + s" />
                        </label>
                      }
                    </div>
                    <p class="hint">MOQ from 150 units. Current total: <strong>{{ totalQty() }}</strong></p>
                  </div>
                }
              </article>

              <article class="step" [class.open]="openSteps().has(5)">
                <button type="button" class="step-h" (click)="setStep(5)">
                  <span class="step-n">5</span>
                  <span><strong>Review</strong><small>Confirm your design and request a quote.</small></span>
                </button>
                @if (openSteps().has(5)) {
                  <div class="step-body">
                    <p class="review-line">{{ product()!.name }} · {{ sleeveLabel() }} · {{ styleLabel() }} · {{ selectedColor()?.name || 'No colour' }}</p>
                    <p class="review-line">
                      {{ fabricLabel() !== '—' ? fabricLabel() : 'Fabric TBC' }}
                      @if (gsmLabel()) { · {{ gsmLabel() }} }
                      · {{ decorationValue() || 'Decoration TBC' }}
                      @if (placementLabel()) { · {{ placementLabel() }} }
                    </p>
                    <label class="field">
                      <span class="lbl">Buyer notes (optional)</span>
                      <textarea rows="3" placeholder="Colour match, logo size, delivery timeline…" [ngModel]="buyerNotes()" (ngModelChange)="buyerNotes.set($event)"></textarea>
                    </label>
                  </div>
                }
              </article>
            </section>

            <aside class="summary-col">
              <div class="summary-card">
                <div class="summary-top">
                  <img [src]="previewSrc()" [alt]="product()!.name" />
                  <div>
                    <strong>{{ product()!.name }}</strong>
                    <span>Custom {{ garmentLabel() }}</span>
                  </div>
                </div>
                <dl class="summary-dl">
                  @if (fabricLabel() !== '—') {
                    <div><dt>Fabric</dt><dd>{{ fabricLabel() }}</dd></div>
                  }
                  @if (gsmLabel()) {
                    <div><dt>GSM</dt><dd>{{ gsmLabel() }}</dd></div>
                  }
                  <div>
                    <dt>Colour</dt>
                    <dd class="color-dd">
                      @if (selectedColor()?.hex) {
                        <i [style.background]="selectedColor()!.hex"></i>
                      }
                      {{ selectedColor()?.name || '—' }}
                    </dd>
                  </div>
                  @if (sleeveLabel()) {
                    <div><dt>Sleeve</dt><dd>{{ sleeveLabel() }}</dd></div>
                  }
                  @if (styleLabel() !== '—') {
                    <div><dt>Style</dt><dd>{{ styleLabel() }}</dd></div>
                  }
                  <div><dt>Decoration</dt><dd>{{ decorationValue() || '—' }}</dd></div>
                  @if (placementLabel()) {
                    <div><dt>Logo Placement</dt><dd>{{ placementLabel() }}</dd></div>
                  }
                  @if (privateLabelSummary()) {
                    <div><dt>Private Label</dt><dd>{{ privateLabelSummary() }}</dd></div>
                  }
                  <div><dt>Quantity</dt><dd>{{ totalQty() }} units</dd></div>
                  <div><dt>MOQ</dt><dd>150 units</dd></div>
                  <div><dt>Est. Unit Price</dt><dd>{{ configuredUnitPriceLabel() }}</dd></div>
                  @if (addonTotal() > 0) {
                    <div><dt>Service add-ons</dt><dd>+{{ formatGbp(addonTotal()) }} / unit</dd></div>
                  }
                </dl>
                <div class="summary-total">
                  <span>Estimated Total</span>
                  <strong>{{ configuredTotalLabel() }}</strong>
                </div>
                <div class="summary-lead">Lead Time · 15–25 Working Days</div>
                <p class="summary-note">Final pricing, lead time and shipping costs will be confirmed by our team.</p>
                <button type="button" class="cta" (click)="checkout()">Get Production Quote →</button>
                <div class="cta-row">
                  <button type="button" class="ghost" (click)="requestSample()">Request Sample</button>
                  <button type="button" class="ghost" (click)="saveDesign()">Save Design</button>
                </div>
                @if (saveMsg()) {
                  <p class="save-msg">{{ saveMsg() }}</p>
                }
              </div>
              <div class="tier-card">
                <div class="tier-title">Quantity Pricing</div>
                @for (t of priceTiers(); track t.range) {
                  <div class="tier-row"><span>{{ t.range }}</span><strong>{{ formatTier(t.price) }}</strong></div>
                }
                <p class="tier-note">Prices are indicative and may vary based on design complexity, fabric and decoration method.</p>
              </div>
            </aside>
          </div>

          <div class="value-bar" aria-label="Value propositions">
            <div class="vb-item"><strong>Private Label Manufacturing</strong><span>Your brand, our expertise</span></div>
            <div class="vb-item"><strong>Worldwide Shipping</strong><span>Global delivery, made simple</span></div>
            <div class="vb-item"><strong>Bulk Pricing</strong><span>Better pricing at higher volumes</span></div>
            <div class="vb-item"><strong>15–25 Working Days</strong><span>From approval to delivery</span></div>
          </div>

          <div class="info-grid">
            <a routerLink="/how-we-work" class="info-card"><strong>Product Specifications</strong><span>Materials, sizing, construction and care.</span></a>
            <a routerLink="/how-we-work" class="info-card"><strong>Manufacturing Information</strong><span>Production process, QC and compliance.</span></a>
            <a routerLink="/about" class="info-card"><strong>Private Label Options</strong><span>Labels, hangtags and packaging.</span></a>
            <a routerLink="/quote" class="info-card"><strong>Shipping & Delivery</strong><span>Worldwide shipping with tracking.</span></a>
          </div>
        </div>
      }
    </div>
  `,
  styles: `
    :host { display: block; }
    .des-page { background: var(--paper); padding: 20px 20px 56px; min-height: calc(100vh - 140px); }
    .studio { max-width: 1360px; margin: 0 auto; }
    .studio-back {
      background: none; border: 0; color: var(--muted); font: inherit; font-size: 0.82rem;
      cursor: pointer; padding: 0; margin-bottom: 10px;
    }
    .studio-head h1 {
      font-family: 'Cormorant Garamond', Georgia, serif; font-size: clamp(1.8rem, 3vw, 2.4rem);
      font-weight: 600; margin: 0 0 6px; text-transform: none; letter-spacing: -0.01em;
    }
    .studio-head p { margin: 0 0 16px; color: var(--muted); max-width: 62ch; }
    .value-bar {
      display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px;
      background: #ebe7dc; border: 1px solid var(--line); border-radius: 8px;
      padding: 14px 16px; margin-top: 18px;
    }
    .vb-item { display: flex; flex-direction: column; gap: 2px; }
    .vb-item strong { font-size: 0.78rem; }
    .vb-item span { font-size: 0.7rem; color: var(--muted); }

    .studio-grid {
      display: grid; grid-template-columns: minmax(280px, 1.15fr) minmax(280px, 1fr) minmax(240px, 0.85fr);
      gap: 16px; align-items: start;
    }

    .preview-col, .summary-card, .tier-card, .step {
      background: var(--panel); border: 1px solid var(--line); border-radius: 10px;
    }
    .preview-col { padding: 12px; }
    .preview-top { display: flex; justify-content: space-between; margin-bottom: 10px; }
    .view-tabs { display: flex; flex-wrap: wrap; gap: 6px; }
    .view-tab {
      border: 1px solid var(--line); background: #fff; border-radius: 999px;
      padding: 5px 12px; font-size: 0.72rem; font-weight: 600; cursor: pointer;
    }
    .view-tab.on { background: var(--ink); color: #fff; border-color: var(--ink); }
    .preview-main { display: grid; grid-template-columns: 78px 1fr; gap: 10px; min-height: 420px; }
    .thumb-rail { display: flex; flex-direction: column; gap: 8px; }
    .thumb {
      border: 1px solid var(--line); border-radius: 6px; background: #fff; padding: 0;
      overflow: hidden; cursor: pointer; font: inherit; color: inherit;
    }
    .thumb.on { border-color: var(--ink); box-shadow: 0 0 0 1px var(--ink); }
    .thumb img { width: 100%; aspect-ratio: 1; object-fit: contain; display: block; background: #fff; }
    .thumb span {
      display: block; text-align: center; font-size: 0.58rem; font-weight: 700;
      text-transform: uppercase; padding: 3px; border-top: 1px solid var(--line); color: var(--muted);
    }
    .stage-wrap {
      border: 1px solid var(--line); border-radius: 8px; background: #fff;
      display: grid; place-items: center; overflow: hidden; min-height: 400px;
    }
    .stage { position: relative; width: 88%; height: 88%; display: grid; place-items: center; transition: transform 0.15s ease; }
    .stage-img { max-width: 100%; max-height: 100%; object-fit: contain; position: relative; z-index: 1; }
    .stage-tint {
      position: absolute; inset: 10% 18% 8% 18%; mix-blend-mode: overlay; opacity: 0.32;
      pointer-events: none; z-index: 2; border-radius: 4px;
    }
    .stage-logo {
      position: absolute; top: 28%; left: 50%; transform: translateX(-50%);
      width: 26%; z-index: 3; pointer-events: none;
    }
    .stage-logo img { width: 100%; display: block; }
    .zoom-bar {
      display: flex; align-items: center; gap: 8px; margin-top: 10px; color: var(--muted); font-size: 0.78rem;
    }
    .zoom-bar button {
      border: 1px solid var(--line); background: #fff; border-radius: 4px;
      width: 30px; height: 28px; cursor: pointer; font: inherit;
    }
    .zoom-bar .reset { width: auto; padding: 0 10px; }

    .steps-col { display: flex; flex-direction: column; gap: 8px; }
    .step { overflow: hidden; }
    .step-h {
      width: 100%; display: flex; gap: 12px; align-items: flex-start; text-align: left;
      background: transparent; border: 0; padding: 14px 14px 12px; cursor: pointer; font: inherit;
    }
    .step-n {
      width: 28px; height: 28px; border-radius: 50%; background: var(--forest); color: #fff;
      display: inline-flex; align-items: center; justify-content: center; font-size: 0.78rem; font-weight: 700; flex-shrink: 0;
    }
    .step:not(.open) .step-n { background: #c9c4b6; }
    .step-h strong { display: block; font-size: 0.95rem; }
    .step-h small { display: block; color: var(--muted); font-size: 0.72rem; margin-top: 2px; }
    .step-body { padding: 0 14px 16px 54px; display: flex; flex-direction: column; gap: 12px; }
    .field { display: flex; flex-direction: column; gap: 6px; }
    .field.two { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
    .lbl { font-size: 0.68rem; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; color: var(--muted); }
    .chips { display: flex; flex-wrap: wrap; gap: 6px; }
    .chip {
      border: 1px solid var(--line); background: #fff; border-radius: 4px;
      padding: 6px 10px; font-size: 0.74rem; cursor: pointer; font: inherit;
    }
    .chip.on { background: var(--ink); color: #fff; border-color: var(--ink); }
    select, input[type='text'], textarea {
      width: 100%; border: 1px solid var(--line); border-radius: 6px; padding: 9px 10px;
      font: inherit; background: #fff; color: var(--ink);
      accent-color: var(--forest);
    }
    select {
      cursor: pointer;
      transition: background 0.15s ease, border-color 0.15s ease, box-shadow 0.15s ease;
    }
    select:hover {
      border-color: var(--forest);
      background: color-mix(in srgb, var(--forest) 14%, #fff);
    }
    select:focus,
    select:focus-visible {
      outline: none;
      border-color: var(--forest);
      background: color-mix(in srgb, var(--forest) 14%, #fff);
      box-shadow: 0 0 0 2px rgba(79, 90, 69, 0.28);
    }
    select option {
      background: #fff;
      color: var(--ink);
    }
    select option:checked,
    select option:hover {
      background: var(--forest-tint);
      color: var(--ink);
    }
    .swatches { display: flex; flex-wrap: wrap; gap: 8px; }
    .swatch {
      width: 28px; height: 28px; border-radius: 50%; border: 1px solid rgba(0,0,0,.15);
      padding: 0; cursor: pointer; position: relative;
    }
    .swatch.on::after {
      content: ''; position: absolute; inset: -4px; border: 2px solid var(--ink); border-radius: 50%;
    }
    .upload {
      border: 1px dashed var(--line); border-radius: 8px; padding: 14px; background: #fff;
      display: flex; flex-direction: column; gap: 2px; cursor: pointer;
    }
    .upload span { color: var(--muted); font-size: 0.72rem; }
    .check { display: flex; gap: 8px; align-items: center; font-size: 0.85rem; }
    .hint { margin: 0; font-size: 0.72rem; color: var(--muted); }
    .linkish { background: none; border: 0; color: var(--muted); text-decoration: underline; cursor: pointer; font: inherit; padding: 0; width: fit-content; }
    .qty-grid { display: flex; flex-wrap: wrap; gap: 8px; }
    .qty-cell {
      min-width: 44px; border: 1px solid var(--line); border-radius: 6px; background: #fff;
      display: flex; flex-direction: column; align-items: center; padding: 6px;
    }
    .qty-cell span { font-size: 0.62rem; font-weight: 700; color: var(--muted); }
    .qty-cell input {
      width: 36px; border: 0; text-align: center; font-weight: 700; padding: 4px 0 0;
      font-family: 'IBM Plex Mono', monospace; -moz-appearance: textfield; appearance: textfield;
    }
    .qty-cell input::-webkit-outer-spin-button,
    .qty-cell input::-webkit-inner-spin-button { -webkit-appearance: none; }
    .review-line { margin: 0; font-size: 0.82rem; color: var(--ink); }

    .summary-col { display: flex; flex-direction: column; gap: 12px; position: sticky; top: 90px; }
    .summary-card { padding: 16px; }
    .summary-top { display: flex; gap: 10px; margin-bottom: 12px; }
    .summary-top img {
      width: 64px; height: 64px; object-fit: contain; border: 1px solid var(--line);
      border-radius: 6px; background: #fff;
    }
    .summary-top strong { display: block; font-size: 0.92rem; }
    .summary-top span { color: var(--muted); font-size: 0.72rem; }
    .summary-dl { margin: 0; display: flex; flex-direction: column; gap: 8px; }
    .summary-dl > div { display: flex; justify-content: space-between; gap: 10px; font-size: 0.78rem; }
    .summary-dl dt { color: var(--muted); }
    .summary-dl dd { margin: 0; font-weight: 600; text-align: right; }
    .color-dd { display: inline-flex; align-items: center; gap: 6px; }
    .color-dd i { width: 12px; height: 12px; border-radius: 50%; border: 1px solid rgba(0,0,0,.15); display: inline-block; }
    .summary-total {
      display: flex; justify-content: space-between; margin-top: 12px; padding-top: 12px;
      border-top: 1px solid var(--line); font-size: 0.9rem;
    }
    .summary-lead { margin-top: 8px; font-size: 0.75rem; font-weight: 600; color: var(--forest); }
    .summary-note { margin: 8px 0 12px; font-size: 0.7rem; color: var(--muted); }
    .cta {
      width: 100%; background: var(--forest); color: #fff; border: 0; border-radius: 4px;
      padding: 12px 14px; font-family: 'Montserrat', sans-serif; font-weight: 600;
      font-size: 0.8rem; cursor: pointer;
    }
    .cta:hover { background: var(--gold-deep); }
    .cta-row { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-top: 8px; }
    .ghost {
      border: 1px solid var(--line); background: #fff; border-radius: 4px; padding: 9px 8px;
      font-size: 0.72rem; font-weight: 600; cursor: pointer; font: inherit;
    }
    .save-msg { margin: 8px 0 0; font-size: 0.72rem; color: var(--forest); }
    .tier-card { padding: 14px; }
    .tier-title { font-size: 0.72rem; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; margin-bottom: 8px; }
    .tier-row { display: flex; justify-content: space-between; font-size: 0.78rem; padding: 5px 0; border-bottom: 1px solid #efeae0; }
    .tier-note { margin: 8px 0 0; font-size: 0.68rem; color: var(--muted); }

    .info-grid {
      display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin-top: 22px;
    }
    .info-card {
      background: var(--panel); border: 1px solid var(--line); border-radius: 8px;
      padding: 14px; text-decoration: none; color: inherit; display: block;
    }
    .info-card strong { display: block; margin-bottom: 4px; font-size: 0.85rem; }
    .info-card span { color: var(--muted); font-size: 0.72rem; }

    .des-pick { max-width: 1100px; margin: 0 auto; padding: 24px 0; }
    .des-pick-panel { background: var(--panel); border: 1px solid var(--line); border-radius: 10px; padding: 28px; }
    .des-pick-kicker { font-size: 0.68rem; font-weight: 700; letter-spacing: 0.14em; text-transform: uppercase; color: var(--muted); margin: 0 0 8px; }
    .des-pick-panel h2 { font-family: 'Cormorant Garamond', Georgia, serif; font-size: clamp(1.6rem, 3vw, 2.2rem); font-weight: 600; text-transform: none; margin: 0 0 10px; }
    .des-pick-lede { color: var(--muted); font-size: 0.92rem; margin: 0 0 22px; max-width: 60ch; }
    .des-pick-empty { color: var(--muted); margin: 0 0 16px; }
    .des-pick-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(160px, 1fr)); gap: 14px; margin-bottom: 22px; }
    .des-pick-card { background: #fff; border: 1px solid var(--line); border-radius: 8px; padding: 10px; text-align: left; cursor: pointer; font: inherit; color: inherit; display: flex; flex-direction: column; gap: 8px; }
    .des-pick-card:hover { border-color: var(--ink); }
    .des-pick-card img { width: 100%; aspect-ratio: 4/5; object-fit: contain; background: var(--paper); border-radius: 4px; }
    .des-pick-name { font-weight: 650; font-size: 0.88rem; }
    .des-pick-meta { font-size: 0.68rem; letter-spacing: 0.06em; text-transform: uppercase; color: var(--muted); }
    .des-pick-desc {
      font-size: 0.72rem; line-height: 1.35; color: var(--muted);
      display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 2; overflow: hidden;
    }
    .des-pick-price { font-family: 'IBM Plex Mono', monospace; font-size: 0.78rem; font-weight: 600; }
    .des-pick-foot { display: flex; gap: 10px; flex-wrap: wrap; }
    .btn-outline { display: inline-flex; padding: 11px 18px; border: 1px solid var(--forest); color: var(--forest); border-radius: 2px; font-weight: 600; font-size: 0.85rem; text-decoration: none; }
    .alert { background: #f8e8e6; color: #8b3a2f; padding: 10px 12px; margin-bottom: 14px; font-size: 0.85rem; }

    @media (max-width: 1100px) {
      .studio-grid { grid-template-columns: 1fr; }
      .summary-col { position: static; }
      .value-bar, .info-grid { grid-template-columns: 1fr 1fr; }
    }
    @media (max-width: 700px) {
      .preview-main { grid-template-columns: 1fr; }
      .thumb-rail { flex-direction: row; overflow-x: auto; }
      .thumb { min-width: 72px; }
      .value-bar, .info-grid, .field.two, .cta-row { grid-template-columns: 1fr; }
      .step-body { padding-left: 14px; }
    }
  `,
})

export class DesignerPageComponent implements OnInit {
  readonly catalog = inject(CatalogService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  readonly product = signal<Product | null>(null);
  readonly pickList = signal<Product[]>([]);
  readonly error = signal('');
  readonly garment = signal<Garment>('tee');
  readonly sleeveValues = signal<string[]>([]);
  readonly styleValues = signal<string[]>([]);
  readonly selectedColorId = signal('');
  readonly outlookIndex = signal(0);
  readonly qtyMap = signal<Record<string, number>>({ M: 50 });
  readonly brandText = signal('');
  readonly logoPreview = signal<string | null>(null);
  readonly logoName = signal('');
  readonly attrDefs = signal<AttributeDefinition[]>([]);
  readonly productStyleOpts = signal<AttrOpt[]>([]);
  readonly decorationMethods = signal<string[]>([]);
  readonly openSteps = signal<Set<number>>(new Set([1]));
  readonly zoom = signal(100);
  readonly fabricValues = signal<string[]>([]);
  readonly gsmValues = signal<string[]>([]);
  readonly decorationValue = signal('');
  readonly placementValue = signal('');
  readonly buyerNotes = signal('');
  readonly saveMsg = signal('');
  readonly privateLabelValues = signal<string[]>([]);
  readonly productSleeveOpts = signal<AttrOpt[]>([]);
  readonly productFabricOpts = signal<AttrOpt[]>([]);
  readonly productGsmOpts = signal<AttrOpt[]>([]);
  readonly productPlacementOpts = signal<AttrOpt[]>([]);
  readonly productPrivateLabelOpts = signal<AttrOpt[]>([]);
  /** Admin-configured per-service add-on £ keyed as `kind:Label`. */
  readonly serviceAddOns = signal<Record<string, number>>({});
  readonly formatGbp = formatGbp;

  readonly colors = computed(() => this.product()?.colors || []);

  /** Swatches only when a real hex is set — blank colours stay hidden. */
  readonly displayColors = computed(() =>
    this.colors().filter((c) => hasDisplayHex(c.hex)),
  );

  readonly selectedColor = computed(() => {
    const id = this.selectedColorId();
    return this.colors().find((c) => c.id === id) || this.colors()[0] || null;
  });

  /** Sleeve from product selection, else sleeve attribute options — never invented. */
  readonly sleeveOptions = computed(() => {
    const fromProduct = this.productSleeveOpts();
    if (fromProduct.length) return fromProduct;
    return this.optionsFromAttr('sleeve');
  });

  /** Only styles ticked on the product in admin. */
  readonly styleOptions = computed(() => this.productStyleOpts());

  /** Fabric / GSM / placement / private label: only values set on the product in admin. */
  readonly fabricOptions = computed(() => this.productFabricOpts());
  readonly gsmOptions = computed(() => this.productGsmOpts());
  readonly placementOptions = computed(() => this.productPlacementOpts());
  readonly privateLabelOptions = computed(() => this.productPrivateLabelOpts());

  readonly fabricLabel = computed(() => {
    const vals = this.fabricValues();
    if (!vals.length) return '—';
    return vals.map((v) =>
      this.fabricOptions().find((o) => o.value === v || o.label === v)?.label || v
    ).join(', ');
  });

  readonly gsmLabel = computed(() => {
    const vals = this.gsmValues();
    if (!vals.length) return '';
    return vals.map((v) =>
      this.gsmOptions().find((o) => o.value === v || o.label === v)?.label || v
    ).join(', ');
  });

  readonly placementLabel = computed(() => {
    const v = this.placementValue();
    return (
      this.placementOptions().find((o) => o.value === v || o.label === v)?.label ||
      v ||
      ''
    );
  });

  readonly addonTotal = computed(() => {
    const map = this.serviceAddOns();
    let n = 0;
    const add = (kind: string, label: string) => {
      if (!label) return;
      const v = Number(map[`${kind}:${label}`]);
      if (Number.isFinite(v) && v > 0) n += v;
    };
    add('decoration', this.decorationValue());
    add('placement', this.placementLabel());
    add('gsm', this.gsmLabel());
    for (const opt of this.privateLabelOptions()) {
      if (this.privateLabelValues().includes(opt.value)) add('private_label', opt.label);
    }
    return Math.round(n * 100) / 100;
  });

  readonly configuredUnitPrice = computed(() => {
    const base = effectiveUnitPrice(this.product(), this.selectedColorId());
    const unit = base > 0 ? base + this.addonTotal() : this.addonTotal();
    return Math.round(unit * 100) / 100;
  });

  readonly configuredTotal = computed(() => {
    const unit = this.configuredUnitPrice();
    const qty = this.totalQty();
    return unit > 0 && qty > 0 ? Math.round(unit * qty * 100) / 100 : 0;
  });

  readonly priceTiers = computed(() => {
    const unit = this.configuredUnitPrice();
    const base = unit > 0 ? unit : 0;
    if (base <= 0) {
      return [
        { range: '150–299', price: 0 },
        { range: '300–499', price: 0 },
        { range: '500–999', price: 0 },
        { range: '1000+', price: 0 },
      ];
    }
    return [
      { range: '150–299', price: base * 1.12 },
      { range: '300–499', price: base * 1.05 },
      { range: '500–999', price: base },
      { range: '1000+', price: base * 0.9 },
    ];
  });

  /** All admin-uploaded variant shots for Outlook (card + every angle). */
  readonly outlookViews = computed((): OutlookView[] => {
    const p = this.product();
    const color = this.selectedColor();
    if (!p) return [];

    const fromColor = [...(color?.images || [])];
    const linked = (p.images || []).filter(
      (im) => color?.id && im.productColorId === color.id,
    );
    let merged = this.dedupeImages([...fromColor, ...linked]);

    // If this colour has no media yet, fall back to product-level uploads
    if (!merged.length) {
      merged = this.dedupeImages(
        (p.images || []).filter((im) => !im.productColorId),
      );
    }

    const roleRank = (role: string) =>
      role === 'card' ? 0 : role === 'view' ? 1 : role === 'gallery' ? 2 : 3;

    const views = merged
      .filter((im) => !!im.url && (im.role === 'view' || im.role === 'gallery' || im.role === 'card'))
      .sort((a, b) => {
        const roleDiff = roleRank(a.role) - roleRank(b.role);
        if (roleDiff !== 0) return roleDiff;
        return (a.sortOrder ?? 0) - (b.sortOrder ?? 0);
      })
      .map((im, i) => ({
        key: im.id || `${im.role}-${im.angle}-${i}`,
        label:
          im.role === 'card'
            ? 'Card'
            : this.prettyAngle(im.angle),
        url: this.catalog.normalizeMediaUrl(im.url),
        angle: im.angle || 'front',
      }))
      .filter((v) => !!v.url);

    if (views.length) return views;

    const card = this.catalog.cardImageUrl(p, color?.id);
    return card
      ? [
          {
            key: 'card',
            label: 'Front',
            url: this.catalog.normalizeMediaUrl(card),
            angle: 'front',
          },
        ]
      : [];
  });

  readonly sizeCodes = computed(() => {
    const sizes = this.product()?.sizes || [];
    const codes = sizes
      .map((s) => s.size?.code || s.size?.label)
      .filter((x): x is string => !!x);
    return codes.length ? codes : DEFAULT_SIZES;
  });

  readonly totalQty = computed(() =>
    Object.values(this.qtyMap()).reduce((a, b) => a + (Number(b) || 0), 0),
  );

  ngOnInit() {
    this.catalog.getAttributes().subscribe({
      next: (defs) => {
        this.attrDefs.set(defs.filter((d) => d.isActive !== false));
        const p = this.product();
        if (p) this.applyCatalogAttributes(p);
      },
    });

    this.catalog.getProducts({ limit: 48, isActive: true }).subscribe({
      next: (res) => this.pickList.set((res.items || []).filter((p) => p.isActive !== false)),
      error: () =>
        this.error.set('Could not load catalogue. Is the Nest API running?'),
    });

    this.route.queryParamMap.subscribe((params) => {
      const id = params.get('product');
      if (!id) {
        this.product.set(null);
        return;
      }
      this.catalog.getProduct(id).subscribe({
        next: (p) => {
          if (p.isActive === false) {
            this.product.set(null);
            this.error.set('This product is not currently available.');
            return;
          }
          this.applyProduct(p, params.get('color'));
        },
        error: () => this.error.set('Product could not be loaded from the API.'),
      });
    });
  }

  private optionsFromAttr(code: string): AttrOpt[] {
    const def = this.attrDefs().find((d) => d.code === code);
    return (def?.options || [])
      .slice()
      .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))
      .map((o) => ({
        value: (o.value || o.label || '').toLowerCase().trim(),
        label: o.label || o.value,
      }))
      .filter((o) => o.value && o.label);
  }

  setStep(n: number) {
    this.openSteps.update((s) => {
      const next = new Set(s);
      if (next.has(n)) next.delete(n);
      else next.add(n);
      return next;
    });
  }

  zoomBy(delta: number) {
    this.zoom.update((z) => Math.min(160, Math.max(60, z + delta)));
  }

  resetZoom() {
    this.zoom.set(100);
  }

  setDecoration(value: string) {
    this.decorationValue.set(value);
  }

  setPlacement(value: string) {
    this.placementValue.set(value);
  }

  isPrivateLabelSelected(value: string): boolean {
    return this.privateLabelValues().includes(value);
  }

  togglePrivateLabel(opt: AttrOpt, event: Event) {
    const checked = !!(event.target as HTMLInputElement)?.checked;
    this.privateLabelValues.update((list) => {
      if (checked) {
        return list.includes(opt.value) ? list : [...list, opt.value];
      }
      return list.filter((v) => v !== opt.value);
    });
  }

  privateLabelSummary(): string {
    const selected = this.privateLabelValues();
    if (!selected.length) return '';
    return this.privateLabelOptions()
      .filter((o) => selected.includes(o.value))
      .map((o) => o.label)
      .join(', ');
  }

  requestSample() {
    this.goToQuote({ sample: '1' });
  }

  saveDesign() {
    const p = this.product();
    if (!p) return;
    try {
      const payload = {
        productId: p.id,
        name: p.name,
        color: this.selectedColor()?.name || '',
        sleeve: this.sleeveLabel(),
        style: this.styleLabel(),
        fabric: this.fabricLabel() !== '—' ? this.fabricLabel() : '',
        gsm: this.gsmLabel(),
        decoration: this.decorationValue(),
        placement: this.placementLabel(),
        brand: this.brandText(),
        qty: this.qtyMap(),
        notes: this.buyerNotes(),
        privateLabel: this.privateLabelSummary(),
        savedAt: new Date().toISOString(),
      };
      localStorage.setItem('tg_saved_design', JSON.stringify(payload));
      this.saveMsg.set('Design saved on this device.');
      setTimeout(() => this.saveMsg.set(''), 2500);
    } catch {
      this.saveMsg.set('Could not save design locally.');
    }
  }

  private goToQuote(extra: Record<string, string | number | undefined> = {}) {
    const p = this.product();
    if (!p) return;

    if (this.logoPreview()) {
      try {
        sessionStorage.setItem('tg_quote_logo', this.logoPreview()!);
        sessionStorage.setItem('tg_quote_logo_name', this.logoName());
      } catch (e) {
        // quota exceeded
      }
    } else {
      sessionStorage.removeItem('tg_quote_logo');
      sessionStorage.removeItem('tg_quote_logo_name');
    }

    const qty = this.totalQty() || 50;
    const unit = effectiveUnitPrice(p, this.selectedColorId());
    const total = estimatedTotal(p, qty, this.selectedColorId());
    this.router.navigate(['/quote'], {
      queryParams: {
        garment: p.name,
        product: p.id,
        color: this.selectedColor()?.name || '',
        style: this.styleLabel(),
        sleeve: this.sleeveLabel(),
        fabric: this.fabricLabel() !== '—' ? this.fabricLabel() : undefined,
        gsm: this.gsmLabel() || undefined,
        decoration: this.decorationValue() || undefined,
        placement: this.placementLabel() || undefined,
        size: Object.entries(this.qtyMap())
          .filter(([, q]) => q > 0)
          .map(([s, q]) => `${s}:${q}`)
          .join(',') || 'M:50',
        qty,
        brand: this.brandText() || undefined,
        notes: this.buyerNotes() || undefined,
        privateLabel: this.privateLabelSummary() || undefined,
        unitPrice: this.configuredUnitPrice() > 0
          ? this.configuredUnitPrice().toFixed(2)
          : unit > 0
            ? unit.toFixed(2)
            : undefined,
        estTotal: this.configuredTotal() > 0
          ? this.configuredTotal().toFixed(2)
          : total > 0
            ? total.toFixed(2)
            : undefined,
        addons: this.addonTotal() > 0 ? this.addonTotal().toFixed(2) : undefined,
        ...extra,
      },
    });
  }

  isSleeveSelected(val: string): boolean {
    return this.sleeveValues().includes(val);
  }

  toggleSleeveOption(opt: AttrOpt) {
    this.sleeveValues.update((list) => {
      if (list.includes(opt.value)) return list.filter((v) => v !== opt.value);
      return [...list, opt.value];
    });
  }

  isFabricSelected(val: string): boolean {
    return this.fabricValues().includes(val);
  }

  toggleFabricOption(opt: AttrOpt) {
    this.fabricValues.update((list) => {
      if (list.includes(opt.value)) return list.filter((v) => v !== opt.value);
      return [...list, opt.value];
    });
  }

  isGsmSelected(val: string): boolean {
    return this.gsmValues().includes(val);
  }

  toggleGsmOption(opt: AttrOpt) {
    this.gsmValues.update((list) => {
      if (list.includes(opt.value)) return list.filter((v) => v !== opt.value);
      return [...list, opt.value];
    });
  }

  isStyleSelected(value: string): boolean {
    return this.styleValues().includes(value);
  }

  toggleStyleOption(opt: AttrOpt) {
    this.styleValues.update((list) => {
      if (list.includes(opt.value)) {
        return list.filter((v) => v !== opt.value);
      }
      return [...list, opt.value];
    });
  }

  selectProduct(p: Product) {
    this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { product: p.id, name: p.name },
      queryParamsHandling: 'merge',
    });
  }

  clearProduct() {
    this.product.set(null);
    this.router.navigate([], {
      relativeTo: this.route,
      queryParams: {},
    });
  }

  setHoodie() {
    this.garment.set('hoodie');
    // Keep current sleeve; only default style if product has one
    const styles = this.styleOptions();
    const pullover =
      styles.find((o) => o.value.includes('pull')) ||
      styles.find((o) => o.label.toLowerCase().includes('pull'));
    if (pullover) this.styleValues.set([pullover.value]);
    else if (styles[0]) this.styleValues.set([styles[0].value]);
  }

  selectColor(c: ProductColor) {
    this.selectedColorId.set(c.id);
    this.outlookIndex.set(0);
    this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { color: c.id },
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
  }

  setQty(size: string, value: number | string) {
    const n = Math.max(0, Number(value) || 0);
    this.qtyMap.update((m) => ({ ...m, [size]: n }));
  }

  previewSrc(): string {
    const views = this.outlookViews();
    const i = Math.min(Math.max(0, this.outlookIndex()), Math.max(0, views.length - 1));
    if (views[i]?.url) return views[i].url;
    const p = this.product();
    if (!p) return '/assets/images/prod_tshirt.jpg';
    return this.catalog.cardImageUrl(p, this.selectedColorId());
  }



  private prettyAngle(angle: string | null | undefined): string {
    const raw = (angle || 'front').trim();
    if (!raw) return 'View';
    return raw
      .split(/[-_\s]+/)
      .filter(Boolean)
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(' ');
  }

  private dedupeImages(images: ProductImage[]): ProductImage[] {
    const seen = new Set<string>();
    const out: ProductImage[] = [];
    for (const im of images) {
      const key = `${im.role}|${im.angle}|${im.url}`;
      if (!im.url || seen.has(key)) continue;
      seen.add(key);
      out.push(im);
    }
    return out;
  }

  garmentLabel(): string {
    return { tee: 'T-Shirt', hoodie: 'Hoodie', polo: 'Polo' }[this.garment()];
  }

  sleeveLabel(): string {
    const selected = this.sleeveValues();
    if (!selected.length) return '';
    return selected
      .map(
        (v) =>
          this.sleeveOptions().find((o) => o.value === v)?.label || v,
      )
      .join(', ');
  }

  styleLabel(): string {
    const selected = this.styleValues();
    if (!selected.length) return '—';
    return selected
      .map(
        (v) =>
          this.styleOptions().find((o) => o.value === v)?.label || v,
      )
      .join(', ');
  }

  onLogo(event: Event) {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (!file) return;
    this.logoName.set(file.name);
    const reader = new FileReader();
    reader.onload = () => this.logoPreview.set(String(reader.result || ''));
    reader.readAsDataURL(file);
  }

  clearLogo() {
    this.logoPreview.set(null);
    this.logoName.set('');
  }

  checkout() {
    this.goToQuote();
  }

  formatTier(n: number): string {
    return n > 0 ? formatGbp(n) : '—';
  }

  pickPriceLabel(p: Product): string {
    return formatProductPrice(p, null, { from: true });
  }

  descriptionFor(p: Product): string {
    const colorId = this.product()?.id === p.id ? this.selectedColorId() : null;
    return cardDescription(p, colorId);
  }

  unitPriceLabel(): string {
    return this.configuredUnitPriceLabel();
  }

  estimatedCostLabel(): string {
    return this.configuredTotalLabel();
  }

  configuredUnitPriceLabel(): string {
    const n = this.configuredUnitPrice();
    if (n > 0) return formatGbp(n);
    return formatProductPrice(this.product(), this.selectedColorId());
  }

  configuredTotalLabel(): string {
    const total = this.configuredTotal();
    return total > 0 ? formatGbp(total) : 'Quote on request';
  }

  private applyProduct(p: Product, colorParam: string | null) {
    this.product.set(p);
    this.error.set('');
    this.outlookIndex.set(0);
    const def = p.colors?.find((c) => c.isDefault) || p.colors?.[0];
    const colorOk = !!colorParam && !!p.colors?.some((c) => c.id === colorParam);
    this.selectedColorId.set(colorOk ? colorParam! : def?.id || '');

    this.productStyleOpts.set(this.stylesFromProduct(p));
    this.decorationMethods.set(this.decorationsFromProduct(p));

    const template = (p.template || '').toLowerCase();
    const name = (p.name || '').toLowerCase();
    const isHoodie = template.includes('hood') || name.includes('hood');
    if (isHoodie) {
      this.setHoodie();
    } else if (template.includes('polo')) {
      this.garment.set('polo');
      const collar =
        this.styleOptions().find((o) => o.value.includes('collar')) ||
        this.styleOptions().find((o) => o.label.toLowerCase().includes('collar'));
      this.styleValues.set(collar ? [collar.value] : this.styleOptions().slice(0, 1).map((o) => o.value));
    } else {
      this.garment.set('tee');
      const crew =
        this.styleOptions().find((o) => o.value === 'crew') ||
        this.styleOptions().find((o) => o.label.toLowerCase().includes('crew'));
      this.styleValues.set(crew ? [crew.value] : this.styleOptions().slice(0, 1).map((o) => o.value));
    }

    this.applyCatalogAttributes(p);

    const map: Record<string, number> = {};
    this.sizeCodes().forEach((s, i) => {
      map[s] = s === 'M' || (i === 2 && !map['M']) ? 50 : 0;
    });
    if (!Object.values(map).some((n) => n > 0)) {
      const first = this.sizeCodes()[0];
      if (first) map[first] = 50;
    }
    this.qtyMap.set(map);
  }

  private stylesFromProduct(p: Product): AttrOpt[] {
    return this.valuesFromProduct(p, 'style');
  }

  private decorationsFromProduct(p: Product): string[] {
    return this.valuesFromProduct(p, 'decoration').map((o) => o.label);
  }

  /** Resolve selected option labels/values for a product attribute code. */
  private valuesFromProduct(p: Product, code: string): AttrOpt[] {
    const def = this.attrDefs().find((d) => d.code === code);
    const out: AttrOpt[] = [];
    const push = (value: string, label: string) => {
      const v = (value || label || '').toLowerCase().trim();
      const l = (label || value || '').trim();
      if (!v || !l) return;
      if (out.some((o) => o.value === v)) return;
      out.push({ value: v, label: l });
    };
    for (const av of p.attributeValues || []) {
      if (av.attributeDefinition?.code !== code) continue;
      if (av.optionIds?.length && def?.options?.length) {
        for (const id of av.optionIds) {
          const opt = def.options.find((o) => o.id === id);
          if (opt) push(opt.value, opt.label);
        }
      }
      if (av.option?.value || av.option?.label) {
        push(av.option.value || av.option.label, av.option.label || av.option.value);
      } else if (av.valueText) {
        // comma-separated multi values stored as text
        for (const part of av.valueText.split(',')) {
          const t = part.trim();
          if (t) push(t, t);
        }
      }
    }
    return out;
  }

  private applyCatalogAttributes(p: Product) {
    const sleeves = this.valuesFromProduct(p, 'sleeve');
    this.productSleeveOpts.set(sleeves);
    const sleeveOpts = sleeves.length ? sleeves : this.optionsFromAttr('sleeve');
    this.sleeveValue.set(sleeveOpts[0]?.value || '');

    const productStyles = this.stylesFromProduct(p);
    this.productStyleOpts.set(productStyles);
    this.styleValues.set(productStyles.map((o) => o.value));

    const materials = this.valuesFromProduct(p, 'material');
    this.productFabricOpts.set(materials);
    this.fabricValue.set(materials[0]?.value || '');

    const gsms = this.valuesFromProduct(p, 'gsm');
    this.productGsmOpts.set(gsms);
    this.gsmValue.set(gsms[0]?.value || '');

    const placements = this.valuesFromProduct(p, 'placement').length
      ? this.valuesFromProduct(p, 'placement')
      : this.valuesFromProduct(p, 'logo_placement');
    this.productPlacementOpts.set(placements);
    this.placementValue.set(placements[0]?.value || '');

    const privateLabels = this.valuesFromProduct(p, 'private_label');
    this.productPrivateLabelOpts.set(privateLabels);
    this.privateLabelValues.set(privateLabels.map((o) => o.value));

    const decor = this.decorationsFromProduct(p);
    this.decorationMethods.set(decor);
    this.decorationValue.set(decor[0] || '');
    this.serviceAddOns.set(this.serviceAddOnsFromProduct(p));
    this.openStep.set(1);
    this.zoom.set(100);
  }

  private serviceAddOnsFromProduct(p: Product): Record<string, number> {
    const out: Record<string, number> = {};
    for (const av of p.attributeValues || []) {
      if (av.attributeDefinition?.code !== 'service_addons') continue;
      const text = (av.valueText || '').trim();
      if (!text) continue;
      try {
        const parsed = JSON.parse(text) as Record<string, unknown>;
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
          for (const [k, v] of Object.entries(parsed)) {
            const n = Number(v);
            if (k && Number.isFinite(n) && n > 0) out[k] = Math.round(n * 100) / 100;
          }
        }
      } catch {
        for (const part of text.split(',')) {
          const bits = part.split('|').map((s) => s.trim());
          if (bits.length < 3) continue;
          const n = Number(bits[2]);
          if (!Number.isFinite(n) || n <= 0) continue;
          out[`${bits[0]}:${bits[1]}`] = Math.round(n * 100) / 100;
        }
      }
    }
    return out;
  }
}
