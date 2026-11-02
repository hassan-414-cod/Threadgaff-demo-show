import { Component, OnDestroy, OnInit, computed, effect, inject, signal, untracked } from '@angular/core';
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
import { AttributeTemplatesService } from '../../core/services/attribute-templates.service';
import { SiteSettingsService } from '../../core/services/site-settings.service';
import { SwatchVisibilityService } from '../../core/services/swatch-visibility.service';
import { LEFT_CHEST, logoZoneFor, viewIndexFor } from './logo-zones';
import { LOGO_ACCEPT, LOGO_RULES, checkLogo } from './logo-rules';
import { LogoPlacement, keepInside, newPlacement, renderSnapshot } from './logo-placement';
import { PlacementPictureComponent } from '../../shared/placement-picture.component';
import { hasDisplayHex } from '../../core/utils/hex';
import { cardDescription } from '../../core/utils/description';
import {
  DESIGN_UPLOAD_ACCEPT,
  DESIGN_UPLOAD_MAX_BYTES,
  DesignUploadStore,
  formatFileSize,
  isPreviewableImage,
} from '../../core/services/design-upload.store';

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

/** Where the last chosen logo placement is remembered in this browser (with the saved logo). */
const PLACEMENT_KEY = 'tg_logo_placement';

@Component({
  selector: 'tg-designer-page',
  standalone: true,
  imports: [RouterLink, FormsModule, PlacementPictureComponent],
  template: `
    <div class="des-page" [class.is-picking]="!product()">
      @if (!product() && loadingProduct()) {
        <section class="des-pick des-loading" role="status" aria-live="polite">
          <div class="des-pick-panel">
            <p class="des-pick-kicker">Custom Designer</p>
            <h2>Opening your garment…</h2>
            <span class="des-spinner" aria-hidden="true"></span>
          </div>
        </section>
      } @else if (!product()) {
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
                  <img [src]="catalog.mainImageUrl(p)" [alt]="p.name" />
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

          <nav class="stepper-card" aria-label="Design steps">
            <ol class="stepper">
              @for (st of steps; track st.n) {
                <li [class.done]="st.n < currentStep()" [class.active]="st.n === currentStep()">
                  <button
                    type="button"
                    class="st-btn"
                    (click)="goStep(st.n)"
                    [attr.aria-current]="st.n === currentStep() ? 'step' : null"
                    [attr.aria-label]="'Step ' + st.n + ': ' + st.label"
                  >
                    <span class="st-dot">
                      @if (st.n < currentStep()) { ✓ } @else { {{ st.n }} }
                    </span>
                    <span class="st-label">{{ st.label }}</span>
                  </button>
                </li>
              }
            </ol>
          </nav>

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
              <div class="preview-main" [class.no-rail]="!hasShootPhotos()">
                @if (hasShootPhotos()) {
                  <aside class="thumb-rail" aria-label="Web shoot photos">
                    @for (view of outlookViews(); track view.key; let i = $index) {
                      @if (view.angle === 'shoot') {
                        <button type="button" class="thumb" [class.on]="currentViewIndex() === i" (click)="outlookIndex.set(i)">
                          <img [src]="view.url" [alt]="view.label" />
                          <span>{{ view.label }}</span>
                        </button>
                      }
                    }
                  </aside>
                }
                <div class="stage-col">
                <div class="stage-wrap" [style.max-width.px]="stageMaxWidth()">
                  <div class="stage" [style.aspect-ratio]="stageRatio()" [style.transform]="'scale(' + zoom() / 100 + ')'">
                    <img class="stage-img" [src]="previewSrc()" [alt]="product()!.name" (load)="onStageLoad($event)" />
                    @if (designPreviewUrl()) {
                      <div class="stage-design" [class.blend]="designIsJpeg()">
                        <img [src]="designPreviewUrl()!" alt="Your uploaded design" />
                      </div>
                    }
                    @for (p of shownPlacements(); track p.id) {
                      <div
                        class="stage-logo"
                        [class.draft]="!p.fixed"
                        [class.blend]="logoIsJpeg()"
                        [class.below]="p.y < 9"
                        [style.left.%]="p.x"
                        [style.top.%]="p.y"
                        [style.width.%]="p.w"
                        [style.aspect-ratio]="logoRatio()"
                        [attr.tabindex]="p.fixed ? null : 0"
                        [attr.aria-label]="p.fixed ? null : 'Your logo at ' + p.label + '. Drag it to move, or use the arrow keys.'"
                        (pointerdown)="startMove($event, p)"
                        (pointermove)="onDrag($event)"
                        (pointerup)="endDrag($event)"
                        (pointercancel)="endDrag($event)"
                        (keydown)="onNudge($event, p)"
                      >
                        <img [src]="logoPreview()!" [alt]="'Your logo at ' + p.label" draggable="false" />
                        @if (!p.fixed) {
                          <span
                            class="logo-handle"
                            role="presentation"
                            title="Drag to resize"
                            (pointerdown)="startResize($event, p)"
                            (pointermove)="onDrag($event)"
                            (pointerup)="endDrag($event)"
                            (pointercancel)="endDrag($event)"
                          ></span>
                          <button type="button" class="logo-fix" (pointerdown)="$event.stopPropagation()" (click)="fixPlacement(p)">Fix</button>
                        }
                      </div>
                    }
                  </div>
                </div>
                @if (hasAnglePictures()) {
                  <div class="angle-row" aria-label="Angle pictures">
                    @for (view of outlookViews(); track view.key; let i = $index) {
                      @if (view.angle !== 'shoot') {
                        <button type="button" class="thumb" [class.on]="currentViewIndex() === i" (click)="outlookIndex.set(i)">
                          <img [src]="view.url" [alt]="view.label" />
                          <span>{{ view.label }}</span>
                        </button>
                      }
                    }
                  </div>
                }
                </div>
              </div>
              @if (logoHint(); as h) {
                <p class="logo-note" role="status">
                  {{ h.text }}
                  @if (h.go) {
                    <button type="button" class="linkish" (click)="goToPlacementView()">{{ h.go }}</button>
                  }
                </p>
              }
              @if (plFile(); as f) {
                <div class="design-file">
                  @if (designPreviewUrl()) {
                    <img class="df-thumb" [src]="designPreviewUrl()!" alt="" />
                  } @else {
                    <span class="df-ext">{{ fileExt(f.name) }}</span>
                  }
                  <span class="df-text">
                    <strong>{{ f.name }}</strong>
                    <small>
                      {{ fileSize(f.size) }} ·
                      {{ designPreviewUrl() ? 'Your design is shown on the garment' : 'Saved with your design (no on-garment preview for this file type)' }}
                    </small>
                  </span>
                  <button type="button" class="linkish" (click)="clearPrivateLabelFile()">Remove</button>
                </div>
              }
              <div class="zoom-bar">
                <button type="button" (click)="zoomBy(-10)" aria-label="Zoom out">−</button>
                <span>{{ zoom() }}%</span>
                <button type="button" (click)="zoomBy(10)" aria-label="Zoom in">+</button>
                <button type="button" class="reset" (click)="resetZoom()">Reset View</button>
              </div>
            </section>

            <section class="steps-col" aria-label="Configuration steps">
              <div class="step-panel">
                <div class="sp-head">
                  <span class="step-n">{{ currentStep() }}</span>
                  <span>
                    <strong>{{ currentStepInfo().title }}</strong>
                    <small>{{ currentStepInfo().sub }}</small>
                  </span>
                </div>

                @switch (currentStep()) {
                  @case (1) {
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
              @if (swatchesHidden()) {
                <!-- the colour swatches are switched off for this product in the admin -->
              } @else if (displayColors().length) {
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
                  @case (2) {
                    <div class="step-body">
              <label class="upload" [class.has-logo]="!!logoPreview()">
                @if (logoPreview()) {
                  <img class="up-thumb" [src]="logoPreview()!" alt="" />
                }
                <span class="up-text">
                  <strong>{{ logoName() || 'Upload Logo' }}</strong>
                  <span>
                    {{ logoPreview() ? 'Saved with your design · click to replace' : 'Choose your logo file. It goes on the garment pictures where you place it.' }}
                  </span>
                </span>
                <input type="file" [accept]="logoAccept" hidden (change)="onLogo($event)" />
              </label>
              <ul class="logo-rules" aria-label="Logo requirements">
                @for (r of logoRules; track r) {
                  <li>{{ r }}</li>
                }
              </ul>
              @if (logoError()) {
                <p class="hint hint-err" role="alert">{{ logoError() }}</p>
              }
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
                  <div class="chips">
                    @for (p of placementOptions(); track p.value) {
                      <button type="button" class="chip" [class.on]="placementValue() === p.value" (click)="setPlacement(p.value)">{{ p.label }}</button>
                    }
                  </div>
                  @if (!logoPreview()) {
                    <p class="hint">Upload a logo above to place it on the garment pictures.</p>
                  }
                } @else {
                  <p class="hint">Set logo placement options in admin Attributes / product.</p>
                }
              </div>
              @if (logoPreview()) {
                <div class="field">
                  <span class="lbl">Your logo placements</span>
                  @if (!placements().length) {
                    <p class="hint">Pick a placement above, drag the logo on the garment, then press Fix.</p>
                  }
                  <ul class="pl-list">
                    @for (p of placements(); track p.id) {
                      <li [class.draft]="!p.fixed">
                        <span class="pl-name"><b>{{ p.label }}</b> · {{ p.view }} picture</span>
                        @if (p.fixed) {
                          <span class="pl-ok">✓ Fixed</span>
                          <button type="button" class="linkish" (click)="editPlacement(p)">Move</button>
                        } @else {
                          <button type="button" class="pl-fix" (click)="fixPlacement(p)">Fix</button>
                        }
                        <button type="button" class="linkish" (click)="removePlacement(p)">Remove</button>
                      </li>
                    }
                  </ul>
                  @if (!draft()) {
                    <button type="button" class="pl-add" (click)="addPlacement()">+ Add another placement</button>
                  }
                  @if (snapshotFailed()) {
                    <p class="hint hint-err" role="status">The preview pictures could not be saved on this browser. Your placements are still sent as text.</p>
                  }
                </div>
              }
              <div class="field">
                <span class="lbl">Brand text (optional)</span>
                <input type="text" maxlength="24" placeholder="e.g. NORTHSTAR" [ngModel]="brandText()" (ngModelChange)="brandText.set($event)" />
              </div>
                    </div>
                  }
                  @case (3) {
                    <div class="step-body">
              <div class="field">
                <span class="lbl">Design file</span>
                <label class="upload">
                  <strong>{{ plFile()?.name || 'Upload design file' }}</strong>
                  <span>
                    {{ plFile() ? fileSize(plFile()!.size) : 'Measurements and text. ' + plAcceptLabel + ', max ' + plMaxLabel }}
                  </span>
                  <input type="file" hidden [accept]="plAccept" (change)="onPrivateLabelFile($event)" />
                </label>
                @if (plFileError()) {
                  <p class="hint hint-err" role="alert">{{ plFileError() }}</p>
                }
                @if (plFile()) {
                  <button type="button" class="linkish" (click)="clearPrivateLabelFile()">Remove file</button>
                }
              </div>
              <div class="field">
                <span class="lbl">Material</span>
                @if (fabricOptions().length) {
                  <select [ngModel]="plMaterial()" (ngModelChange)="plMaterial.set($event)" aria-label="Private label material">
                    <option value="">Select material</option>
                    @for (f of fabricOptions(); track f.value) {
                      <option [value]="f.label">{{ f.label }}</option>
                    }
                  </select>
                } @else {
                  <input type="text" maxlength="80" placeholder="e.g. 100% organic cotton, 280 GSM" [ngModel]="plMaterial()" (ngModelChange)="plMaterial.set($event)" aria-label="Private label material" />
                }
              </div>
              <div class="field">
                <span class="lbl">Notes</span>
                <textarea rows="4" maxlength="1000" placeholder="Explain your design in detail: label placement, sizes, packaging, anything we should know." [ngModel]="plNotes()" (ngModelChange)="plNotes.set($event)"></textarea>
              </div>
              <p class="hint">Using an AI-generated design? Upload the image or PDF. Your file feeds the digital proof we prepare in step 1 of How We Work.</p>
                    </div>
                  }
                  @case (4) {
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
                  @case (5) {
                    <div class="step-body">
              <p class="review-line">
                {{ product()!.name }} · {{ sleeveLabel() }} · {{ styleLabel() }}
                @if (!swatchesHidden()) { · {{ selectedColor().name || 'No colour' }} }
              </p>
              @if (snapshots().length) {
                <div class="snap-grid" aria-label="Your logo placements">
                  @for (sn of snapshots(); track sn.id) {
                    <figure>
                      <tg-placement-picture [src]="sn.url" [garment]="sn.garment" [alt]="sn.label" />
                      <figcaption>{{ sn.label }}</figcaption>
                    </figure>
                  }
                </div>
              }
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
                }

                <div class="step-nav">
                  <button type="button" class="nav-btn nav-back" (click)="prevStep()" [disabled]="currentStep() === 1">← Back</button>
                  <span class="nav-count">Step {{ currentStep() }} of {{ steps.length }}</span>
                  @if (isLastStep()) {
                    <button type="button" class="nav-btn nav-next" (click)="checkout()">Get Production Quote →</button>
                  } @else {
                    <button type="button" class="nav-btn nav-next" (click)="nextStep()">Next: {{ nextStepInfo().label }} →</button>
                  }
                </div>
              </div>
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
                  @if (!swatchesHidden()) {
                    <div>
                      <dt>Colour</dt>
                      <dd class="color-dd">
                        @if (selectedColor().hex) {
                          <i [style.background]="selectedColor().hex"></i>
                        }
                        {{ selectedColor().name || '—' }}
                      </dd>
                    </div>
                  }
                  @if (sleeveLabel()) {
                    <div><dt>Sleeve</dt><dd>{{ sleeveLabel() }}</dd></div>
                  }
                  @if (styleLabel() !== '—') {
                    <div><dt>Style</dt><dd>{{ styleLabel() }}</dd></div>
                  }
                  <div><dt>Decoration</dt><dd>{{ decorationValue() || '—' }}</dd></div>
                  @if (placementSummary()) {
                    <div><dt>Logo Placements</dt><dd>{{ placementSummary() }}</dd></div>
                  } @else if (placementLabel()) {
                    <div><dt>Logo Placement</dt><dd>{{ placementLabel() }}</dd></div>
                  }
                  @if (privateLabelSummary()) {
                    <div><dt>Private Label</dt><dd>{{ privateLabelSummary() }}</dd></div>
                  }
                  @if (plFile()) {
                    <div><dt>Design file</dt><dd>{{ plFile()!.name }}</dd></div>
                  }
                  @if (plMaterial()) {
                    <div><dt>Label material</dt><dd>{{ plMaterial() }}</dd></div>
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

    .preview-col, .summary-card, .tier-card {
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
    .preview-main { display: grid; grid-template-columns: 78px 1fr; gap: 10px; align-items: start; }
    .preview-main.no-rail { grid-template-columns: 1fr; }
    .thumb-rail { display: flex; flex-direction: column; gap: 8px; }
    /* the preview box and, right under it, the angle pictures in a row (so the whole card stays low) */
    .stage-col { display: flex; flex-direction: column; gap: 8px; min-width: 0; }
    .stage-col .stage-wrap { margin-inline: auto; }
    .angle-row { display: flex; gap: 6px; overflow-x: auto; justify-content: center; padding-bottom: 2px; }
    .angle-row .thumb { flex: 0 0 62px; }
    .thumb {
      border: 1px solid var(--line); border-radius: 6px; background: #fff; padding: 0;
      overflow: hidden; cursor: pointer; font: inherit; color: inherit;
    }
    .thumb.on { border-color: var(--ink); box-shadow: 0 0 0 1px var(--ink); }
    .thumb img { width: 100%; aspect-ratio: 4 / 5; object-fit: cover; display: block; background: #fff; }
    .thumb span {
      display: block; text-align: center; font-size: 0.58rem; font-weight: 700;
      text-transform: uppercase; padding: 3px; border-top: 1px solid var(--line); color: var(--muted);
    }
    /* The preview box takes the proportions of the picture it shows (set from the picture itself, 4:5 until it
       loads) and hugs it: the whole picture fills the box, nothing is cropped and there are no white bars,
       however many thumbnails stand beside it. */
    .stage-wrap {
      width: 100%; justify-self: center; align-self: start; box-sizing: border-box;
      border: 1px solid var(--line); border-radius: 8px; background: #fff;
      display: grid; place-items: center; overflow: hidden;
    }
    .stage { position: relative; width: 100%; aspect-ratio: 4 / 5; background: #fff; transition: transform 0.15s ease; }
    .stage-img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: contain; background: #fff; z-index: 1; }
    /* the logo is laid over the static garment picture at its placement (left, top and width are set per placement) */
    .stage-logo { position: absolute; transform: translateX(-50%); z-index: 3; pointer-events: none; display: block; }
    .stage-logo img { width: 100%; height: 100%; display: block; object-fit: contain; user-select: none; pointer-events: none; }
    .stage-logo.blend img { mix-blend-mode: multiply; }
    /* a logo that is not fixed yet: drag it to move, drag the corner to resize, press Fix to lock it */
    .stage-logo.draft { pointer-events: auto; cursor: move; touch-action: none; outline: 1.5px dashed #3d4b37; outline-offset: 2px; }
    .stage-logo.draft:focus-visible { outline-style: solid; }
    .logo-handle {
      position: absolute; right: -8px; bottom: -8px; width: 12px; height: 12px; box-sizing: border-box;
      background: #fff; border: 2px solid #3d4b37; border-radius: 3px; cursor: nwse-resize; touch-action: none;
    }
    .logo-fix {
      position: absolute; right: -2px; top: -30px; border: 0; border-radius: 999px; background: #3d4b37; color: #fff;
      font: inherit; font-size: 0.66rem; font-weight: 700; padding: 3px 11px; cursor: pointer; box-shadow: 0 1px 4px rgba(0, 0, 0, 0.25);
    }
    .stage-logo.below .logo-fix { top: auto; bottom: -34px; }
    .logo-rules { margin: 6px 0 0; padding-left: 18px; font-size: 0.72rem; color: var(--muted); display: flex; flex-direction: column; gap: 2px; }
    .pl-list { list-style: none; margin: 4px 0 8px; padding: 0; display: flex; flex-direction: column; gap: 6px; }
    .pl-list li { display: flex; align-items: center; gap: 10px; padding: 7px 10px; border: 1px solid var(--line); border-radius: 8px; background: #fff; font-size: 0.78rem; }
    .pl-list li.draft { border-color: #3d4b37; background: #f3f6ef; }
    .pl-name { flex: 1; min-width: 0; }
    .pl-ok { color: #3d6b4f; font-weight: 700; font-size: 0.72rem; }
    .pl-fix, .pl-add {
      border: 1px solid #3d4b37; background: #3d4b37; color: #fff; border-radius: 999px; padding: 3px 12px;
      font: inherit; font-size: 0.72rem; font-weight: 700; cursor: pointer;
    }
    .pl-add { background: #fff; color: #3d4b37; padding: 6px 14px; }
    .snap-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(130px, 1fr)); gap: 10px; margin: 10px 0; }
    .snap-grid figure { margin: 0; }
    .snap-grid tg-placement-picture { border: 1px solid var(--line); border-radius: 6px; }
    .snap-grid figcaption { margin-top: 4px; font-size: 0.68rem; color: var(--muted); }
    .logo-note { margin: 8px 0 0; font-size: 0.74rem; color: var(--muted); }
    .stage-design {
      position: absolute; top: 32%; left: 50%; transform: translateX(-50%);
      width: 34%; z-index: 3; pointer-events: none;
    }
    .stage-design img { width: 100%; max-height: 34%; display: block; object-fit: contain; }
    .stage-design.blend img { mix-blend-mode: multiply; }
    .design-file {
      display: flex; align-items: center; gap: 10px; margin-top: 10px; padding: 8px 10px;
      border: 1px solid var(--line); border-radius: 8px; background: #fff;
    }
    .df-thumb { width: 40px; height: 40px; object-fit: contain; border-radius: 6px; background: #f4f2ec; flex: none; }
    .df-ext {
      width: 40px; height: 40px; border-radius: 6px; background: var(--forest-tint); color: var(--forest);
      display: inline-flex; align-items: center; justify-content: center; font-size: 0.68rem; font-weight: 800;
      text-transform: uppercase; flex: none;
    }
    .df-text { flex: 1; min-width: 0; display: flex; flex-direction: column; }
    .df-text strong { font-size: 0.8rem; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .df-text small { font-size: 0.7rem; color: var(--muted); }
    .zoom-bar {
      display: flex; align-items: center; gap: 8px; margin-top: 10px; color: var(--muted); font-size: 0.78rem;
    }
    .zoom-bar button {
      border: 1px solid var(--line); background: #fff; border-radius: 4px;
      width: 30px; height: 28px; cursor: pointer; font: inherit;
    }
    .zoom-bar .reset { width: auto; padding: 0 10px; }

    /* a slim step bar: small dots joined by a thin line, the name right under each */
    .stepper-card {
      background: var(--panel); border: 1px solid var(--line); border-radius: 10px;
      padding: 9px 20px 7px; margin-bottom: 12px;
    }
    .stepper { list-style: none; margin: 0; padding: 0; display: flex; }
    .stepper li { flex: 1; position: relative; min-width: 0; }
    .stepper li::before {
      content: ''; position: absolute; top: 10px; right: 50%; width: 100%; height: 2px;
      background: var(--line); border-radius: 2px;
    }
    .stepper li:first-child::before { display: none; }
    .stepper li.done::before, .stepper li.active::before { background: var(--forest); }
    .st-btn {
      position: relative; z-index: 1; width: 100%; display: flex; flex-direction: column; align-items: center;
      gap: 3px; background: none; border: 0; padding: 0; cursor: pointer; font: inherit; color: var(--muted);
    }
    .st-dot {
      width: 22px; height: 22px; border-radius: 50%; display: inline-flex; align-items: center; justify-content: center;
      background: #fff; border: 2px solid var(--line); font-size: 0.66rem; font-weight: 700; color: var(--muted);
      transition: background 0.15s ease, border-color 0.15s ease, box-shadow 0.15s ease;
    }
    .st-label { font-size: 0.7rem; font-weight: 600; text-align: center; line-height: 1.2; }
    .stepper li.done .st-dot, .stepper li.active .st-dot { background: var(--forest); border-color: var(--forest); color: #fff; }
    .stepper li.active .st-dot { box-shadow: 0 0 0 3px var(--forest-tint); }
    .stepper li.active .st-label { color: var(--forest); font-weight: 700; }
    .stepper li.done .st-label { color: var(--ink); }
    .st-btn:hover .st-dot { border-color: var(--forest); }
    .st-btn:focus-visible { outline: 2px solid var(--forest); outline-offset: 4px; border-radius: 6px; }

    .steps-col { display: flex; flex-direction: column; gap: 8px; }
    .step-panel { background: var(--panel); border: 1px solid var(--line); border-radius: 10px; }
    .sp-head { display: flex; gap: 12px; align-items: flex-start; padding: 16px 18px 12px; }
    .step-n {
      width: 30px; height: 30px; border-radius: 8px; background: var(--forest-tint); color: var(--forest);
      display: inline-flex; align-items: center; justify-content: center; font-size: 0.85rem; font-weight: 700; flex-shrink: 0;
    }
    .sp-head strong { display: block; font-size: 1rem; }
    .sp-head small { display: block; color: var(--muted); font-size: 0.74rem; margin-top: 2px; }
    .step-body { padding: 0 18px 18px; display: flex; flex-direction: column; gap: 12px; }
    .step-nav {
      display: flex; align-items: center; justify-content: space-between; gap: 10px;
      padding: 12px 18px; border-top: 1px solid var(--line);
    }
    .nav-count { font-size: 0.72rem; color: var(--muted); }
    .nav-btn {
      border-radius: 4px; padding: 9px 14px; font: inherit; font-size: 0.78rem; font-weight: 600; cursor: pointer;
      border: 1px solid var(--line); background: #fff; color: var(--ink);
    }
    .nav-btn:disabled { opacity: 0.45; cursor: default; }
    .nav-next { background: var(--forest); border-color: var(--forest); color: #fff; }
    .nav-next:hover { background: var(--gold-deep); border-color: var(--gold-deep); }
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
    .upload.has-logo { flex-direction: row; align-items: center; gap: 12px; }
    .up-thumb { width: 44px; height: 44px; object-fit: contain; border-radius: 6px; background: #f4f2ec; flex: none; }
    .up-text { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
    .up-text strong { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .check { display: flex; gap: 8px; align-items: center; font-size: 0.85rem; }
    .hint { margin: 0; font-size: 0.72rem; color: var(--muted); }
    .hint-err { color: #8b3a2f; }
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

    .summary-col { display: flex; flex-direction: column; gap: 12px; position: sticky; top: 132px; }
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

    .des-pick { max-width: 1200px; margin: 0 auto; padding: 40px 0; }
    .des-pick-panel { background: var(--panel); border: 1px solid var(--line); border-radius: 12px; padding: 40px; }
    .des-loading .des-pick-panel { min-height: 280px; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 14px; text-align: center; animation: desFade 0.3s ease both; }
    .des-spinner { width: 28px; height: 28px; border-radius: 50%; border: 3px solid #d9d4c7; border-top-color: #3c4536; animation: desSpin 0.8s linear infinite; }
    @keyframes desSpin { to { transform: rotate(360deg); } }
    @keyframes desFade { from { opacity: 0; } to { opacity: 1; } }
    .des-pick-kicker { font-size: 0.8rem; font-weight: 700; letter-spacing: 0.14em; text-transform: uppercase; color: var(--muted); margin: 0 0 10px; }
    .des-pick-panel h2 { font-family: 'Cormorant Garamond', Georgia, serif; font-size: clamp(2rem, 4vw, 3rem); font-weight: 600; text-transform: none; margin: 0 0 14px; }
    .des-pick-lede { color: var(--muted); font-size: 1.1rem; margin: 0 0 30px; max-width: 65ch; line-height: 1.5; }
    .des-pick-empty { color: var(--muted); margin: 0 0 20px; font-size: 1.1rem; }
    .des-pick-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 20px; margin-bottom: 30px; }
    .des-pick-card { background: #fff; border: 1px solid var(--line); border-radius: 10px; padding: 14px; text-align: left; cursor: pointer; font: inherit; color: inherit; display: flex; flex-direction: column; gap: 10px; transition: transform 0.2s, box-shadow 0.2s; }
    .des-pick-card:hover { border-color: var(--ink); transform: translateY(-3px); box-shadow: 0 4px 12px rgba(0,0,0,0.08); }
    .des-pick-card img { width: 100%; aspect-ratio: 4/5; object-fit: contain; background: var(--paper); border-radius: 6px; }
    .des-pick-name { font-weight: 650; font-size: 1.1rem; }
    .des-pick-meta { font-size: 0.75rem; letter-spacing: 0.06em; text-transform: uppercase; color: var(--muted); }
    .des-pick-desc {
      font-size: 0.85rem; line-height: 1.4; color: var(--muted);
      display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 2; overflow: hidden;
    }
    .des-pick-price { font-family: 'IBM Plex Mono', monospace; font-size: 0.9rem; font-weight: 600; }
    .des-pick-foot { display: flex; gap: 14px; flex-wrap: wrap; margin-top: 10px; }
    .btn-outline { display: inline-flex; padding: 11px 18px; border: 1px solid var(--forest); color: var(--forest); border-radius: 2px; font-weight: 600; font-size: 0.85rem; text-decoration: none; transition: background 0.2s, color 0.2s; }
    .btn-outline:hover { background: var(--forest); color: #fff; }
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
      }
  `,
})

export class DesignerPageComponent implements OnInit, OnDestroy {
  readonly catalog = inject(CatalogService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  readonly product = signal<Product | null>(null);
  readonly pickList = signal<Product[]>([]);
  /** True while the garment named in the address is being fetched. */
  readonly loadingProduct = signal(false);
  readonly error = signal('');
  readonly garment = signal<Garment>('tee');
  readonly sleeveValues = signal<string[]>([]);
  readonly styleValues = signal<string[]>([]);
  readonly selectedColorId = signal('');
  readonly outlookIndex = signal(0);
  /** Width / height of the picture in the preview box: the box takes its proportions (4:5 until a picture has loaded). */
  readonly stageRatio = signal(4 / 5);
  /** The preview box is at most this wide, so it is never taller than 660px (and no wider than its picture needs). */
  readonly stageMaxWidth = computed(() => Math.round(660 * this.stageRatio()) + 2);

  onStageLoad(event: Event) {
    const img = event.target as HTMLImageElement;
    if (img.naturalWidth > 0 && img.naturalHeight > 0) {
      this.stageRatio.set(Math.min(2, Math.max(0.5, img.naturalWidth / img.naturalHeight)));
    }
  }
  readonly qtyMap = signal<Record<string, number>>({ M: 50 });
  readonly brandText = signal('');
  readonly logoPreview = signal<string | null>(null);
  readonly logoName = signal('');
  readonly attrDefs = signal<AttributeDefinition[]>([]);
  readonly productStyleOpts = signal<AttrOpt[]>([]);
  readonly decorationMethods = signal<string[]>([]);
  readonly steps = [
    { n: 1, label: 'Garment', title: 'Garment', sub: 'Sleeve, neckline, fabric and colour' },
    { n: 2, label: 'Branding', title: 'Branding', sub: 'Add your logo, decoration method and placement.' },
    { n: 3, label: 'Private Label', title: 'Private Label', sub: 'Upload your design file, choose a material and add notes.' },
    { n: 4, label: 'Quantity', title: 'Quantity', sub: 'Set your size breakdown and review pricing.' },
    { n: 5, label: 'Review', title: 'Review', sub: 'Confirm your design and request a quote.' },
  ];
  readonly currentStep = signal(1);
  readonly currentStepInfo = computed(() => this.steps[this.currentStep() - 1]);
  readonly nextStepInfo = computed(() => this.steps[Math.min(this.currentStep(), this.steps.length - 1)]);
  readonly isLastStep = computed(() => this.currentStep() === this.steps.length);
  readonly zoom = signal(100);
  readonly fabricValues = signal<string[]>([]);
  readonly gsmValues = signal<string[]>([]);
  readonly decorationValue = signal('');
  readonly placementValue = signal('');
  readonly buyerNotes = signal('');
  readonly saveMsg = signal('');
  readonly privateLabelValues = signal<string[]>([]);
  private readonly designUpload = inject(DesignUploadStore);
  private readonly templates = inject(AttributeTemplatesService);
  private readonly site = inject(SiteSettingsService);
  private readonly swatchVis = inject(SwatchVisibilityService);
  readonly plFile = signal<File | null>(null);
  /** Object URL of the uploaded design when it is an image, so it can be drawn on the garment. */
  readonly designPreviewUrl = signal<string | null>(null);
  readonly designIsJpeg = computed(() => /\.jpe?g$/i.test(this.plFile()?.name || ''));
  readonly plFileError = signal('');
  readonly plMaterial = signal('');
  readonly plNotes = signal('');
  readonly plAccept = DESIGN_UPLOAD_ACCEPT;
  readonly plAcceptLabel = 'PDF, PNG, JPG, AI or ZIP';
  readonly plMaxLabel = formatFileSize(DESIGN_UPLOAD_MAX_BYTES);
  readonly fileSize = formatFileSize;
  fileExt(name: string): string {
    return name.split('.').pop()?.slice(0, 4) || 'file';
  }
  readonly productSleeveOpts = signal<AttrOpt[]>([]);
  readonly productFabricOpts = signal<AttrOpt[]>([]);
  readonly productGsmOpts = signal<AttrOpt[]>([]);
  readonly productPlacementOpts = signal<AttrOpt[]>([]);
  readonly productPrivateLabelOpts = signal<AttrOpt[]>([]);
  /** Admin-configured per-service add-on £ keyed as `kind:Label`. */
  readonly serviceAddOns = signal<Record<string, number>>({});
  readonly formatGbp = formatGbp;

  readonly colors = computed(() => this.product()?.colors || []);

  /** True when the admin switched off the Garment Colour swatches for this product. */
  readonly swatchesHidden = computed(() => {
    const p = this.product();
    return !!p && this.swatchVis.hiddenInDesigner(p.id);
  });

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

  /** A JPEG logo has a white box around it, which is blended into the garment like the design file. */
  readonly logoIsJpeg = computed(() => /\.jpe?g$/i.test(this.logoName()));

  readonly logoAccept = LOGO_ACCEPT;
  readonly logoRules = LOGO_RULES;
  /** Why the last logo was not accepted. */
  readonly logoError = signal('');
  /** Width / height of the uploaded logo. */
  readonly logoRatio = signal(1);
  /** The logos placed on the garment pictures: moved and resized by the customer, locked with Fix. */
  readonly placements = signal<LogoPlacement[]>([]);
  /** One picture per side that has fixed logos: the garment picture with them on it, saved and sent with the enquiry. */
  readonly snapshots = signal<Array<{ id: string; label: string; name: string; blob: Blob; url: string; garment?: string }>>([]);
  readonly snapshotFailed = signal(false);

  /** The placement that is still being moved (not fixed yet); there is only one at a time. */
  readonly draft = computed(() => this.placements().find((p) => !p.fixed) ?? null);
  readonly fixedPlacements = computed(() => this.placements().filter((p) => p.fixed));
  readonly placementSummary = computed(() =>
    this.fixedPlacements()
      .map((p) => `${p.label} (${p.view})`)
      .join('; '),
  );

  /** The picture shown in the preview now. */
  readonly currentViewIndex = computed(() => {
    const last = Math.max(0, this.outlookViews().length - 1);
    return Math.min(Math.max(0, this.outlookIndex()), last);
  });

  /** The web shoot photos stand in a column on the left of the preview; the angle pictures in a row under it. */
  readonly hasShootPhotos = computed(() => this.outlookViews().some((v) => v.angle === 'shoot'));
  readonly hasAnglePictures = computed(() => this.outlookViews().some((v) => v.angle !== 'shoot'));

  /** True while a model (web shoot) photo is shown: a logo cannot be placed on those. */
  readonly onModelPhoto = computed(() => this.outlookViews()[this.currentViewIndex()]?.angle === 'shoot');

  /** The placements that sit on the picture shown now. */
  readonly shownPlacements = computed(() => {
    if (!this.logoPreview()) return [];
    const at = this.currentViewIndex();
    return this.placements().filter((p) => this.viewIndexOf(p) === at);
  });

  /** Said under the preview when the logo cannot be seen or placed where the customer is looking. */
  readonly logoHint = computed<{ text: string; go?: string } | null>(() => {
    if (!this.logoPreview()) return null;
    const d = this.draft();
    if (d && this.viewIndexOf(d) < 0) {
      return { text: `This colour has no ${d.view} picture yet, so the logo cannot be placed for ${d.label}.` };
    }
    if (this.onModelPhoto()) {
      return {
        text: 'A logo can only be placed on the angle pictures (Front, Back …), not on the model photos.',
        go: d ? `Go to the ${d.view} picture` : 'Show the angle pictures',
      };
    }
    return d && this.viewIndexOf(d) !== this.currentViewIndex()
      ? { text: `Your logo is placed on the ${d.view} picture.`, go: 'Go to it' }
      : null;
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

  /** The designer preview pictures: the angles uploaded for it (the card is only the fallback). */
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

    // The designer opens on the web shoot photos of the colour (the models), then come the angles uploaded
    // for it. The shop card image is a separate setting and is not listed here.
    const ordered = (role: string) =>
      merged
        .filter((im) => !!im.url && im.role === role)
        .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
    const angles = ordered('view').map((im, i) => ({
      key: im.id || `${im.role}-${im.angle}-${i}`,
      label: this.prettyAngle(im.angle),
      url: this.catalog.normalizeMediaUrl(im.url),
      angle: im.angle || 'front',
    }));
    const shoot = ordered('gallery').map((im, i) => ({
      key: im.id || `${im.role}-${im.angle}-${i}`,
      label: 'Photo ' + (i + 1),
      url: this.catalog.normalizeMediaUrl(im.url),
      angle: 'shoot', // a model photo: never stands in for a garment angle (templates, logo placement)
    }));

    // With no angles the card image leads, as before.
    const card = this.catalog.cardImageUrl(p, color?.id);
    const lead = angles.length
      ? angles
      : card
        ? [{ key: 'card', label: 'Front', url: this.catalog.normalizeMediaUrl(card), angle: 'front' }]
        : [];
    return this.withTemplates([...shoot, ...lead].filter((v) => !!v.url));
  });

  /** The chosen options that can have a template, as [attribute code, label], in the order they are listed. */
  private chosenOptions(): Array<[string, string]> {
    const of = (code: string, values: string[], opts: AttrOpt[]): Array<[string, string]> =>
      values.map((v) => [code, opts.find((o) => o.value === v || o.label === v)?.label || v]);
    return [
      ...of('sleeve', this.sleeveValues(), this.sleeveOptions()),
      ...of('style', this.styleValues(), this.styleOptions()),
      ...of('material', this.fabricValues(), this.fabricOptions()),
      ...of('gsm', this.gsmValues(), this.gsmOptions()),
    ];
  }

  /**
   * A chosen option with a template (Sleeve: Short, Style: V-Neck, …) shows its own picture for an angle
   * in place of the garment's picture for that angle; an angle the template has no picture for keeps the
   * garment's own.
   */
  private withTemplates(views: OutlookView[]): OutlookView[] {
    const chosen = this.chosenOptions();
    if (!chosen.length) return views;
    return views.map((v) => {
      for (const [code, label] of chosen) {
        const url = this.templates.pictureFor(code, label, v.angle);
        if (url) return { ...v, url };
      }
      return v;
    });
  }

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

  ngOnDestroy() {
    this.revokeDesignPreview();
  }

  ngOnInit() {
    this.site.load(); // the templates of attribute options live in the site settings
    // Bring back the uploads saved from an earlier visit (design file + logo).
    void this.designUpload.restore().then((f) => {
      if (f && !this.plFile()) this.applyPlFile(f);
    });
    void this.designUpload.restoreLogo().then((f) => {
      if (!f || this.logoPreview()) return;
      const reader = new FileReader();
      reader.onload = () => {
        if (this.logoPreview()) return;
        const url = String(reader.result || '');
        this.logoName.set(f.name);
        void this.measureLogo(url).then(() => this.logoPreview.set(url));
      };
      reader.readAsDataURL(f);
    });
    this.catalog.getAttributes().subscribe({
      next: (defs) => {
        this.attrDefs.set(defs.filter((d) => d.isActive !== false));
        const p = this.product();
        if (p) this.applyCatalogAttributes(p);
      },
    });

    this.route.queryParamMap.subscribe((params) => {
      const id = params.get('product');
      if (!id) {
        this.loadingProduct.set(false);
        this.product.set(null);
        this.loadPickList();
        return;
      }
      // The chosen garment comes first: it is what the page is waiting for.
      this.loadingProduct.set(true);
      this.catalog.getProduct(id).subscribe({
        next: (p) => {
          this.loadingProduct.set(false);
          if (p.isActive === false) {
            this.product.set(null);
            this.error.set('This product is not currently available.');
            this.loadPickList();
            return;
          }
          this.applyProduct(p, params.get('color'));
        },
        error: () => {
          this.loadingProduct.set(false);
          this.error.set('Product could not be loaded from the API.');
          this.loadPickList();
        },
      });
    });
  }

  /** The garment picker's list is only needed when no garment is chosen (or the chosen one is missing). */
  private pickListLoaded = false;
  private loadPickList() {
    if (this.pickListLoaded) return;
    this.pickListLoaded = true;
    this.catalog.getProducts({ limit: 48, isActive: true }).subscribe({
      next: (res) => {
        this.pickList.set((res.items || []).filter((p) => p.isActive !== false && p.category?.isActive !== false));
        // products of a category that is off the site (or inside one) are not offered either
        this.catalog.getVisibleCategoryIds().subscribe({
          next: (ids) =>
            this.pickList.update((list) =>
              list.filter((p) => {
                const cid = p.categoryId || p.category?.id;
                return !cid || ids.has(cid);
              }),
            ),
        });
      },
      error: () => {
        this.pickListLoaded = false;
        this.error.set('Could not load catalogue. Is the Nest API running?');
      },
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

  goStep(n: number) {
    this.currentStep.set(Math.min(this.steps.length, Math.max(1, n)));
  }

  nextStep() {
    this.goStep(this.currentStep() + 1);
  }

  prevStep() {
    this.goStep(this.currentStep() - 1);
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

  /** A placement button: the logo being placed jumps to that spot, or (with none open) a new placement starts there. */
  setPlacement(value: string) {
    this.placementValue.set(value);
    try {
      localStorage.setItem(PLACEMENT_KEY, this.placementLabel());
    } catch {
      /* storage is blocked: the choice is simply not remembered */
    }
    if (!this.logoPreview()) return;
    const d = this.draft();
    if (!d) {
      this.startPlacement();
      return;
    }
    const label = this.placementLabel();
    const zone = this.presetFor(label);
    const moved = keepInside({ ...d, label, view: zone.view, x: zone.x, y: zone.y, w: zone.w }, this.logoRatio(), this.stageRatio());
    this.placements.update((l) => l.map((p) => (p.id === d.id ? moved : p)));
    this.savePlacements();
    this.showPlacement(moved);
  }

  /** Where a new placement starts: the spot of the chosen placement, beside the design file when that is in the way. */
  private presetFor(label: string) {
    const zone = logoZoneFor(label);
    return zone.centre && this.designPreviewUrl() ? LEFT_CHEST : zone;
  }

  /** The picture that carries a placement (the front or the back one); -1 when this colour has none. */
  private viewIndexOf(p: LogoPlacement): number {
    return viewIndexFor(this.outlookViews(), p.view);
  }

  private showPlacement(p: LogoPlacement) {
    const at = this.viewIndexOf(p);
    if (at >= 0) this.outlookIndex.set(at);
  }

  /** Shows the picture the logo being placed belongs to (or, with none open, the first angle picture). */
  goToPlacementView() {
    const d = this.draft();
    if (d) return this.showPlacement(d);
    const at = this.outlookViews().findIndex((v) => v.angle !== 'shoot');
    if (at >= 0) this.outlookIndex.set(at);
  }

  /** Starts a new placement at the spot of the chosen placement. Only one is open at a time: an open one is fixed where it is. */
  private startPlacement() {
    if (!this.logoPreview()) return;
    const open = this.draft();
    if (open) this.fixPlacement(open);
    const label = this.placementLabel() || 'Logo';
    const p = keepInside(newPlacement(label, this.presetFor(label)), this.logoRatio(), this.stageRatio());
    this.placements.update((l) => [...l, p]);
    this.savePlacements();
    this.showPlacement(p);
  }

  addPlacement() {
    this.startPlacement();
  }

  /** Locks a placement where it is and saves the picture of that side with the logo on it. */
  fixPlacement(p: LogoPlacement) {
    this.placements.update((l) => l.map((x) => (x.id === p.id ? { ...x, fixed: true } : x)));
    this.savePlacements();
    void this.rebuildSnapshots();
  }

  /** Opens a fixed placement to move it again. */
  editPlacement(p: LogoPlacement) {
    const open = this.draft();
    if (open && open.id !== p.id) this.fixPlacement(open);
    this.placements.update((l) => l.map((x) => (x.id === p.id ? { ...x, fixed: false } : x)));
    this.savePlacements();
    this.showPlacement(p);
    void this.rebuildSnapshots();
  }

  removePlacement(p: LogoPlacement) {
    this.placements.update((l) => l.filter((x) => x.id !== p.id));
    this.savePlacements();
    void this.rebuildSnapshots();
  }

  private savePlacements() {
    const p = this.product();
    const list = this.placements();
    this.designUpload.setPlacements(p && list.length ? { productId: p.id, placements: list } : null);
  }

  // ── moving and resizing the logo on the preview
  private drag: {
    mode: 'move' | 'resize';
    x0: number;
    y0: number;
    start: LogoPlacement;
    rect: DOMRect;
    target: HTMLElement;
    pointerId: number;
  } | null = null;

  startMove(ev: PointerEvent, p: LogoPlacement) {
    if (p.fixed || (ev.pointerType === 'mouse' && ev.button !== 0)) return;
    this.beginDrag(ev, p, 'move');
  }

  startResize(ev: PointerEvent, p: LogoPlacement) {
    ev.stopPropagation();
    if (p.fixed || (ev.pointerType === 'mouse' && ev.button !== 0)) return;
    this.beginDrag(ev, p, 'resize');
  }

  private beginDrag(ev: PointerEvent, p: LogoPlacement, mode: 'move' | 'resize') {
    const el = ev.currentTarget as HTMLElement;
    const stage = el.closest('.stage') as HTMLElement | null;
    if (!stage) return;
    ev.preventDefault();
    try {
      el.setPointerCapture(ev.pointerId);
    } catch {
      /* the pointer is already gone */
    }
    this.drag = { mode, x0: ev.clientX, y0: ev.clientY, start: { ...p }, rect: stage.getBoundingClientRect(), target: el, pointerId: ev.pointerId };
  }

  onDrag(ev: PointerEvent) {
    const d = this.drag;
    if (!d || ev.pointerId !== d.pointerId) return;
    const dx = ((ev.clientX - d.x0) / d.rect.width) * 100;
    const dy = ((ev.clientY - d.y0) / d.rect.height) * 100;
    const ratio = this.logoRatio();
    const stageRatio = this.stageRatio();
    let next: LogoPlacement;
    if (d.mode === 'move') {
      next = keepInside({ ...d.start, x: d.start.x + dx, y: d.start.y + dy }, ratio, stageRatio);
    } else {
      // the corner handle: the top-left corner stays and the logo keeps its proportions
      const left = d.start.x - d.start.w / 2;
      const w = keepInside({ ...d.start, w: d.start.w + dx }, ratio, stageRatio).w;
      next = keepInside({ ...d.start, w, x: left + w / 2 }, ratio, stageRatio);
    }
    this.placements.update((l) => l.map((p) => (p.id === next.id ? next : p)));
  }

  endDrag(ev: PointerEvent) {
    const d = this.drag;
    if (!d || ev.pointerId !== d.pointerId) return;
    try {
      d.target.releasePointerCapture(d.pointerId);
    } catch {
      /* already released */
    }
    this.drag = null;
    this.savePlacements();
  }

  /** The arrow keys move a logo that is not fixed yet (Shift = bigger steps). */
  onNudge(ev: KeyboardEvent, p: LogoPlacement) {
    if (p.fixed) return;
    const step = ev.shiftKey ? 2 : 0.5;
    const move: Record<string, [number, number]> = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
    const m = move[ev.key];
    if (!m) return;
    ev.preventDefault();
    const next = keepInside({ ...p, x: p.x + m[0], y: p.y + m[1] }, this.logoRatio(), this.stageRatio());
    this.placements.update((l) => l.map((x) => (x.id === p.id ? next : x)));
    this.savePlacements();
  }

  // ── the pictures of the fixed placements
  private snapChain: Promise<void> = Promise.resolve();

  private rebuildSnapshots(): Promise<void> {
    this.snapChain = this.snapChain.then(() => this.buildSnapshots()).catch(() => undefined);
    return this.snapChain;
  }

  private releaseSnapshots() {
    for (const s of this.snapshots()) URL.revokeObjectURL(s.url);
    this.snapshots.set([]);
  }

  /** One picture per side (front, back) that has fixed logos on it, drawn from the garment picture and the logo. */
  private async buildSnapshots() {
    const logo = this.logoPreview();
    const views = this.outlookViews();
    const out: Array<{ id: string; label: string; name: string; blob: Blob; url: string; garment?: string }> = [];
    let failed = false;
    if (logo) {
      for (const side of ['front', 'back'] as const) {
        const placed = this.fixedPlacements().filter((p) => p.view === side);
        const at = viewIndexFor(views, side);
        if (!placed.length || at < 0) continue;
        try {
          const shot = await renderSnapshot(views[at].url, logo, this.logoRatio(), placed);
          const sideName = side === 'front' ? 'Front' : 'Back';
          out.push({
            id: side,
            label: `${sideName} picture: ${placed.map((p) => p.label).join(' + ')}`,
            name: `Logo placement - ${sideName} picture - ${placed.map((p) => p.label).join(' + ')}${shot.garment ? ' (logo layer)' : ''}.${shot.garment ? 'png' : 'jpg'}`,
            blob: shot.blob,
            url: URL.createObjectURL(shot.blob),
            garment: shot.garment,
          });
        } catch {
          failed = true;
        }
      }
    }
    this.releaseSnapshots();
    this.snapshots.set(out);
    this.snapshotFailed.set(failed);
    this.designUpload.setSnapshots(out.map(({ id, label, name, blob, garment }) => ({ id, label, name, blob, garment })));
  }

  /** The garment this visit's placements belong to; they are brought back from the saved draft once it and the logo are known. */
  private placementsFor: string | null = null;
  private readonly placementsEffect = effect(() => {
    const p = this.product();
    if (!p || !this.logoPreview()) return;
    untracked(() => {
      const prev = this.placementsFor;
      this.placementsFor = p.id;
      if (prev === p.id) return;
      if (prev) {
        this.placements.set([]); // another garment: it has its own placements
        this.releaseSnapshots();
      }
      if (!this.placements().length) void this.restorePlacements(p.id);
    });
  });

  private async restorePlacements(productId: string) {
    const draft = await this.designUpload.restorePlacements();
    if (!draft || draft.productId !== productId || this.placements().length) return;
    this.placements.set(draft.placements.map((x) => ({ ...x })));
    const saved = await this.designUpload.restoreSnapshots();
    this.snapshots.set(saved.map((s) => ({ ...s, url: URL.createObjectURL(s.blob) })));
  }

  private measureLogo(url: string): Promise<void> {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        this.logoRatio.set(img.naturalWidth > 0 && img.naturalHeight > 0 ? img.naturalWidth / img.naturalHeight : 1);
        resolve();
      };
      img.onerror = () => resolve();
      img.src = url;
    });
  }

  onPrivateLabelFile(event: Event) {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    const err = this.designUpload.validate(file);
    input.value = '';
    if (err) {
      this.plFileError.set(err);
      return;
    }
    this.plFileError.set('');
    this.applyPlFile(file);
    this.designUpload.set(file);
  }

  clearPrivateLabelFile() {
    this.applyPlFile(null);
    this.plFileError.set('');
    this.designUpload.set(null);
  }

  /** Shows the file in the form and, when it is an image, on the garment preview. */
  private applyPlFile(file: File | null) {
    this.revokeDesignPreview();
    this.plFile.set(file);
    if (file && isPreviewableImage(file)) this.designPreviewUrl.set(URL.createObjectURL(file));
  }

  private revokeDesignPreview() {
    const url = this.designPreviewUrl();
    if (url) URL.revokeObjectURL(url);
    this.designPreviewUrl.set(null);
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
        privateLabelMaterial: this.plMaterial(),
        privateLabelNotes: this.plNotes(),
        privateLabelFile: this.plFile()?.name || '',
        privateLabelFileSize: this.plFile()?.size || 0,
        logoName: this.logoName(),
        savedAt: new Date().toISOString(),
      };
      localStorage.setItem('tg_saved_design', JSON.stringify(payload));
      this.saveMsg.set('Design saved on this device.');
      setTimeout(() => this.saveMsg.set(''), 2500);
    } catch {
      this.saveMsg.set('Could not save design locally.');
    }
  }

  private async goToQuote(extra: Record<string, string | number | undefined> = {}) {
    const p = this.product();
    if (!p) return;
    // A logo still being placed is fixed where it is, and the pictures of the placements are ready before they are handed over.
    const open = this.draft();
    if (open) this.fixPlacement(open);
    await this.rebuildSnapshots();

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
        logoPlacements: this.placementSummary() || undefined,
        snaps: this.snapshots().length ? '1' : undefined,
        size: Object.entries(this.qtyMap())
          .filter(([, q]) => q > 0)
          .map(([s, q]) => `${s}:${q}`)
          .join(',') || 'M:50',
        qty,
        brand: this.brandText() || undefined,
        notes: this.buyerNotes() || undefined,
        privateLabel: this.privateLabelSummary() || undefined,
        plFile: this.plFile()?.name || undefined,
        logo: this.logoPreview() ? '1' : undefined,
        plMaterial: this.plMaterial().trim() || undefined,
        plNotes: this.plNotes().trim() || undefined,
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
    this.outlookIndex.set(0); // a colour opens on its first picture: its web shoot photo
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
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = ''; // so the same file can be chosen again after it was cleared
    if (!file) return;
    void this.acceptLogo(file);
  }

  /** Checks the logo against the requirements (type, size, no background); only a logo that meets them is kept. */
  private async acceptLogo(file: File) {
    this.logoError.set('');
    const problem = await checkLogo(file);
    if (problem) {
      this.logoError.set(problem);
      return;
    }
    this.designUpload.setLogo(file); // saved in this browser: it comes back after a reload and goes with the quote
    const reader = new FileReader();
    reader.onload = async () => {
      const url = String(reader.result || '');
      await this.measureLogo(url);
      this.logoName.set(file.name);
      this.logoPreview.set(url);
      if (this.placements().length) {
        void this.rebuildSnapshots(); // the placements stay; their pictures show the new logo
      } else {
        this.startPlacement(); // the logo starts at the chosen placement, ready to be moved
      }
    };
    reader.readAsDataURL(file);
  }

  clearLogo() {
    this.logoPreview.set(null);
    this.logoName.set('');
    this.logoError.set('');
    this.designUpload.setLogo(null);
    this.placements.set([]);
    this.releaseSnapshots();
    this.designUpload.setPlacements(null);
    this.designUpload.setSnapshots([]);
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
    this.sleeveValues.set([]);

    const productStyles = this.stylesFromProduct(p);
    this.productStyleOpts.set(productStyles);
    this.styleValues.set(productStyles.map((o) => o.value));

    const materials = this.valuesFromProduct(p, 'material');
    this.productFabricOpts.set(materials);
    this.fabricValues.set([]);

    const gsms = this.valuesFromProduct(p, 'gsm');
    this.productGsmOpts.set(gsms);
    this.gsmValues.set([]);

    // The placements ticked on the product; when it has none, the ones the attribute offers (front, back, sleeve…).
    const ofProduct = this.valuesFromProduct(p, 'placement').length
      ? this.valuesFromProduct(p, 'placement')
      : this.valuesFromProduct(p, 'logo_placement');
    const placements = ofProduct.length
      ? ofProduct
      : this.optionsFromAttr('placement').length
        ? this.optionsFromAttr('placement')
        : this.optionsFromAttr('logo_placement');
    this.productPlacementOpts.set(placements);
    let remembered = '';
    try {
      remembered = localStorage.getItem(PLACEMENT_KEY) || '';
    } catch {
      /* storage is blocked */
    }
    const first = placements.find((o) => o.label === remembered) || placements[0];
    this.placementValue.set(first?.value || '');

    const privateLabels = this.valuesFromProduct(p, 'private_label');
    this.productPrivateLabelOpts.set(privateLabels);
    this.privateLabelValues.set(privateLabels.map((o) => o.value));

    const decor = this.decorationsFromProduct(p);
    this.decorationMethods.set(decor);
    this.decorationValue.set(decor[0] || '');
    this.serviceAddOns.set(this.serviceAddOnsFromProduct(p));
    this.currentStep.set(1);
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
