import { NgTemplateOutlet } from '@angular/common';
import { Component, HostListener, OnDestroy, OnInit, computed, effect, inject, signal, untracked } from '@angular/core';
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
import { LEFT_CHEST, logoZoneFor } from './logo-zones';
import { LOGO_ACCEPT, LOGO_RULES, checkLogo } from './logo-rules';
import { LogoPlacement, Spot, keepInside, newPlacement, renderSnapshot } from './logo-placement';
import { LogoLayerComponent } from './logo-layer.component';
import { MultiSelectComponent } from '../../shared/multi-select.component';
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

/** Where the ticked logo placements are remembered in this browser (with the saved logo). */
const TICKS_KEY = 'tg_logo_ticks';

/** The zoom limits of the preview, in %. */
const ZOOM_MIN = 60;
const ZOOM_MAX = 250;

@Component({
  selector: 'tg-designer-page',
  standalone: true,
  imports: [RouterLink, FormsModule, NgTemplateOutlet, PlacementPictureComponent, LogoLayerComponent, MultiSelectComponent],
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
              <div class="preview-main" [class.no-rail]="!railAngles().length">
                @if (railAngles().length) {
                  <aside class="rail" aria-label="Angle pictures">
                    <p class="rail-h">Angles</p>
                    @for (t of railAngles(); track t.key) {
                      <ng-container [ngTemplateOutlet]="angleThumb" [ngTemplateOutletContext]="{ $implicit: t }" />
                    }
                  </aside>
                }
                <div class="stage-col">
                  <div
                    class="stage-wrap"
                    [class.pannable]="zoom() > 100"
                    [class.panning]="panning()"
                    [style.touch-action]="zoom() > 100 ? 'none' : 'pan-y'"
                    [style.max-width.px]="stageMaxWidth()"
                    [style.--ratio]="stageRatio()"
                    (pointerdown)="onPanDown($event)"
                    (pointermove)="onPanMove($event)"
                    (pointerup)="onPanUp($event)"
                    (pointercancel)="onPanUp($event)"
                    (wheel)="onWheel($event)"
                  >
                    <div class="stage" [style.aspect-ratio]="stageRatio()" [style.transform]="stageTransform()">
                      <img class="stage-img" [src]="previewSrc()" [alt]="product()!.name" draggable="false" (load)="onStageLoad($event)" />
                      @if (designPreviewUrl()) {
                        <div class="stage-design" [class.blend]="designIsJpeg()">
                          <img [src]="designPreviewUrl()!" alt="Your uploaded design" />
                        </div>
                      }
                      @if (showLogoLayer()) {
                        <tg-logo-layer
                          [placements]="shownPlacements()"
                          [logoUrl]="logoPreview()!"
                          [logoRatio]="logoRatio()"
                          [stageRatio]="stageRatio()"
                          [selectedId]="selectedId()"
                          [blend]="logoIsJpeg()"
                          (place)="onLogoPlace($event)"
                          (commit)="onLogoCommit()"
                          (picked)="selectedId.set($event)"
                          (fix)="fixPlacement($event)"
                          (again)="editPlacement($event)"
                        />
                      }
                    </div>
                  </div>
                  @if (stripGroups().length) {
                    <div class="strip" aria-label="More pictures of this garment">
                      @for (g of stripGroups(); track g.name) {
                        <div class="strip-group">
                          <p class="strip-h">{{ g.name }}</p>
                          <div class="strip-row">
                            @for (t of g.items; track t.key) {
                              <ng-container [ngTemplateOutlet]="t.angle ? angleThumb : shootThumb" [ngTemplateOutletContext]="{ $implicit: t }" />
                            }
                          </div>
                        </div>
                      }
                    </div>
                  }
                </div>
              </div>
              <ng-template #angleThumb let-t>
                <button
                  type="button"
                  class="thumb"
                  [class.on]="currentViewIndex() === t.index"
                  [class.has]="placementsOn(t.index).length > 0"
                  (click)="outlookIndex.set(t.index)"
                  [attr.aria-label]="t.label + ' angle' + (placementsOn(t.index).length ? ', ' + placementsOn(t.index).length + ' logo(s)' : '')"
                >
                  <span class="thumb-pic">
                    <img [src]="t.url" [alt]="t.label" />
                    @if (logoPreview()) {
                      @for (p of placementsOn(t.index); track p.id) {
                        <img class="mini-logo" [src]="logoPreview()!" alt="" [style.left.%]="p.x" [style.top.%]="p.y" [style.width.%]="p.w" />
                      }
                      @if (placementsOn(t.index).length) {
                        <i class="thumb-badge" aria-hidden="true">{{ placementsOn(t.index).length }}</i>
                      }
                    }
                  </span>
                  <span>{{ t.label }}</span>
                </button>
              </ng-template>
              <ng-template #shootThumb let-t>
                <button type="button" class="thumb" [class.on]="currentViewIndex() === t.index" (click)="outlookIndex.set(t.index)" [attr.aria-label]="t.label">
                  <img [src]="t.url" [alt]="t.label" />
                  <span>{{ t.label }}</span>
                </button>
              </ng-template>
              @if (logoHint(); as h) {
                <p class="logo-note" role="status">
                  {{ h.text }}
                  @if (h.go) {
                    <button type="button" class="linkish" (click)="goToAngle()">{{ h.go }}</button>
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
                <button type="button" (click)="zoomBy(-25)" [disabled]="zoom() <= 60" aria-label="Zoom out">−</button>
                <span>{{ zoom() }}%</span>
                <button type="button" (click)="zoomBy(25)" [disabled]="zoom() >= 250" aria-label="Zoom in">+</button>
                <button type="button" class="reset" (click)="resetZoom()">Reset View</button>
                @if (zoom() > 100) {
                  <span class="zoom-hint">Drag the picture to move it</span>
                }
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
                <span class="lbl">Logo placements</span>
                @if (placementOptions().length) {
                  <tg-multi-select
                    [options]="placementOptions()"
                    [selected]="tickedValues()"
                    placeholder="Choose where the logo goes"
                    ariaLabel="Logo placements"
                    (toggled)="onTick($event.value, $event.checked)"
                    (all)="tickAll()"
                    (none)="untickAll()"
                  />
                  <p class="hint">
                    {{ logoPreview() ? 'Each ticked placement gets its own copy of your logo, shown on every angle picture.' : 'Tick where the logo goes. Upload your logo and it is placed there for you.' }}
                  </p>
                } @else {
                  <p class="hint">Set logo placement options in admin Attributes / product.</p>
                }
              </div>
              @if (logoPreview() && placements().length) {
                <div class="field">
                  <span class="lbl">Your logos</span>
                  <p class="hint">Each logo sits on the angle picture of its placement. Pick another angle for it if you like, fix it, or place it again.</p>
                  <ul class="pl-list">
                    @for (p of placements(); track p.id) {
                      <li [class.draft]="!p.fixed" [class.sel]="p.id === selectedId()" (click)="selectLogo(p)">
                        <span class="pl-name"><b>{{ p.label }}</b></span>
                        <label class="pl-on">
                          <span>on</span>
                          <select [ngModel]="p.angle" (ngModelChange)="setAngle(p.id, $event)" (click)="$event.stopPropagation()" aria-label="Angle picture for this logo">
                            @for (s of angleSlots(); track s.key) {
                              <option [value]="s.key">{{ s.label }}</option>
                            }
                          </select>
                        </label>
                        @if (p.fixed) {
                          <span class="pl-ok">✓ Fixed</span>
                          <button type="button" class="linkish" (click)="editPlacement(p.id); $event.stopPropagation()">Place again</button>
                        } @else {
                          <button type="button" class="pl-fix" (click)="fixPlacement(p.id); $event.stopPropagation()">Fix</button>
                          <button type="button" class="linkish" (click)="resetPlacement(p.id); $event.stopPropagation()">Reset</button>
                        }
                        <button type="button" class="linkish" (click)="removePlacement(p); $event.stopPropagation()">Remove</button>
                      </li>
                    }
                  </ul>
                  @if (draftCount() > 1) {
                    <button type="button" class="pl-add" (click)="fixAll()">Fix all</button>
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
    /* The angle pictures stand in a column on the left of the preview box, as many as fit its height (so the column
       never scrolls). Under the box are the webshoots, and the angle pictures that did not fit in the column. */
    .preview-main { display: grid; grid-template-columns: 70px minmax(0, 1fr); gap: 12px; align-items: start; }
    .preview-main.no-rail { grid-template-columns: 1fr; }
    .rail { display: flex; flex-direction: column; gap: 8px; }
    .rail-h, .strip-h { margin: 0; font-size: 0.6rem; font-weight: 800; letter-spacing: 0.12em; text-transform: uppercase; color: var(--muted); }
    .stage-col { display: flex; flex-direction: column; gap: 10px; min-width: 0; }
    .stage-col .stage-wrap { margin-inline: auto; }
    .strip { display: flex; flex-wrap: wrap; gap: 8px 22px; }
    .strip-group { display: flex; flex-direction: column; gap: 5px; min-width: 0; }
    .strip-row { display: flex; flex-wrap: wrap; gap: 8px; }
    .thumb {
      flex: none; width: 66px; border: 1px solid var(--line); border-radius: 6px; background: #fff; padding: 0;
      overflow: hidden; cursor: pointer; font: inherit; color: inherit;
    }
    .strip .thumb { width: 62px; }
    .thumb.on { border-color: var(--ink); box-shadow: 0 0 0 1px var(--ink); }
    /* an angle picture that carries logos is marked, so every angle the logos are on can be seen at a glance */
    .thumb.has:not(.on) { border-color: #3d6b4f; box-shadow: 0 0 0 1px rgba(61, 107, 79, 0.35); }
    .thumb-badge {
      position: absolute; right: 4px; top: 4px; min-width: 16px; height: 16px; padding: 0 4px; box-sizing: border-box; border-radius: 999px;
      background: #3d4b37; color: #fff; font-style: normal; font-size: 0.6rem; font-weight: 800; line-height: 16px; text-align: center;
    }
    .thumb img { width: 100%; aspect-ratio: 4 / 5; object-fit: cover; display: block; background: #fff; }
    .thumb-pic { position: relative; display: block; }
    /* the logos, small, on the angle pictures */
    .thumb .mini-logo { position: absolute; transform: translateX(-50%); height: auto; aspect-ratio: auto; object-fit: contain; background: none; pointer-events: none; }
    .thumb > span:last-child {
      display: block; text-align: center; font-size: 0.58rem; font-weight: 700;
      text-transform: uppercase; padding: 3px; border-top: 1px solid var(--line); color: var(--muted);
    }
    .zoom-hint { font-size: 0.7rem; color: var(--muted); margin-left: 6px; }
    .zoom-bar button:disabled { opacity: 0.4; cursor: default; }
    /* zoomed, the picture can be dragged; at 100% a finger on it still scrolls the page */
    .stage-wrap { user-select: none; -webkit-user-select: none; }
    .stage-wrap.pannable { cursor: grab; }
    .stage-wrap.panning { cursor: grabbing; }
    .stage-wrap.panning .stage { transition: none; }
    .stage-wrap img { -webkit-user-drag: none; }
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
    .stage-wrap { position: relative; }
    .pl-head { display: flex; align-items: center; justify-content: space-between; gap: 10px; margin-bottom: 2px; }
    .switch { display: inline-flex; align-items: center; gap: 6px; font-size: 0.72rem; color: var(--muted); cursor: pointer; }
    .switch input { width: 15px; height: 15px; margin: 0; accent-color: #3d4b37; }
    .pl-list li { cursor: pointer; flex-wrap: wrap; }
    .pl-on { display: inline-flex; align-items: center; gap: 5px; font-size: 0.7rem; color: var(--muted); }
    .pl-on select { font: inherit; font-size: 0.72rem; font-weight: 600; padding: 3px 6px; border: 1px solid var(--line); border-radius: 6px; background: #fff; color: var(--ink); max-width: 110px; }
    .pl-list li.draft { border-color: #cbd6c3; cursor: pointer; background: #fff; }
    .pl-list li.sel { border-color: #3d4b37; background: #f3f6ef; box-shadow: 0 0 0 2px rgba(61, 75, 55, 0.12); }
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
    /* Phones: the picture comes first, sized to fit the screen, with a small swipeable strip of the other
       pictures right under it (the model photos, then the angles). Nothing runs off the edge. */
    @media (max-width: 700px) {
      .des-page { padding: 12px 12px 40px; }
      /* a tighter heading and step bar, so the picture starts higher on the screen */
      .studio-back { margin-bottom: 4px; }
      .studio-head h1 { font-size: 1.5rem; margin-bottom: 4px; }
      .studio-head p {
        margin-bottom: 10px; font-size: 0.8rem; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;
      }
      .stepper-card { padding: 7px 10px 6px; margin-bottom: 10px; }
      .st-label { font-size: 0.62rem; }
      .preview-col { padding: 10px; }
      /* "Your logos": the name on its own line, then the angle, Fix and the rest */
      .pl-list li { gap: 6px 10px; }
      .pl-name { flex: 1 0 100%; }
      .preview-main { grid-template-columns: 1fr; gap: 8px; }
      .thumb, .strip .thumb { width: 58px; }
      .thumb > span:last-child { font-size: 0.5rem; padding: 2px 1px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .thumb-badge { right: 3px; top: 3px; min-width: 15px; height: 15px; line-height: 15px; font-size: 0.56rem; }
      .strip { gap: 8px 16px; }
      /* the whole picture always fits the screen: never taller than about 58% of it */
      .stage-wrap { max-width: min(100%, calc(var(--ratio, 0.8) * 58vh)) !important; }
      .zoom-bar { margin-top: 6px; flex-wrap: wrap; }
      .logo-note { font-size: 0.7rem; }
      .value-bar, .info-grid, .field.two, .cta-row { grid-template-columns: 1fr; }
    }
    @supports (height: 1svh) {
      @media (max-width: 700px) {
        .stage-wrap { max-width: min(100%, calc(var(--ratio, 0.8) * 58svh)) !important; }
      }
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
  /** The values of the ticked logo placements. */
  readonly tickedValues = signal<string[]>([]);
  /** The logo copy that is selected on the preview (the one with the handle and the Fix button). */
  readonly selectedId = signal<string | null>(null);
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

  /** The ticked placements, by name. */
  readonly placementLabel = computed(() => {
    const on = this.tickedValues();
    return this.placementOptions()
      .filter((o) => on.includes(o.value))
      .map((o) => o.label)
      .join(', ');
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

  /** The logo copies on the garment: one for every ticked placement, moved and resized by the customer, locked with Fix. */
  readonly fixedPlacements = computed(() => this.placements().filter((p) => p.fixed));
  readonly draftCount = computed(() => this.placements().filter((p) => !p.fixed).length);
  readonly placementSummary = computed(() =>
    this.fixedPlacements()
      .map((p) => `${p.label} (${this.angleLabelOf(p.angle)})`)
      .join('; '),
  );

  /** The picture shown in the preview now. */
  readonly currentViewIndex = computed(() => {
    const last = Math.max(0, this.outlookViews().length - 1);
    return Math.min(Math.max(0, this.outlookIndex()), last);
  });

  /** The web shoot photos (models) and the angle pictures (the garment) stand together in a column beside the preview. */
  readonly hasShootPhotos = computed(() => this.outlookViews().some((v) => v.angle === 'shoot'));
  readonly hasAnglePictures = computed(() => this.outlookViews().some((v) => v.angle !== 'shoot'));

  /** Every picture of this colour as a thumbnail: the angle pictures and the model (web shoot) photos. */
  private readonly thumbs = computed(() => {
    const slots = this.angleSlots();
    return this.outlookViews().map((v, index) => ({
      key: v.key,
      index,
      url: v.url,
      label: v.label,
      angle: v.angle !== 'shoot',
      slot: slots.find((s) => s.index === index)?.key ?? '',
    }));
  });
  readonly angleThumbs = computed(() => this.thumbs().filter((t) => t.angle));
  readonly shootThumbs = computed(() => this.thumbs().filter((t) => !t.angle));

  /** The height of the preview box, measured, to know how many angle pictures fit beside it. */
  readonly stageHeight = signal(0);
  /** True on a phone, where there is no column beside the picture. */
  readonly narrow = signal(typeof window !== 'undefined' && window.matchMedia('(max-width: 700px)').matches);

  /** How many angle pictures stand in the column beside the preview: as many as fit the height of the box, so it never scrolls. */
  readonly railCapacity = computed(() => {
    if (this.narrow()) return 0;
    const h = this.stageHeight();
    return h > 0 ? Math.max(1, Math.floor((h - 22 + 8) / 112)) : 4;
  });
  readonly railAngles = computed(() => this.angleThumbs().slice(0, this.railCapacity()));

  /** Under the preview: the webshoots, and the angle pictures that did not fit in the column (all of them on a phone). */
  readonly stripGroups = computed(() => {
    const more = this.angleThumbs().slice(this.railCapacity());
    const shoots = this.shootThumbs();
    const groups: Array<{ name: string; items: typeof more }> = [];
    if (this.narrow()) {
      if (more.length) groups.push({ name: 'Angles', items: more });
      if (shoots.length) groups.push({ name: 'Webshots', items: shoots });
    } else {
      if (shoots.length) groups.push({ name: 'Webshots', items: shoots });
      if (more.length) groups.push({ name: 'More angles', items: more });
    }
    return groups;
  });

  /** True while a model (web shoot) photo is shown: a logo cannot be placed on those. */
  readonly onModelPhoto = computed(() => this.outlookViews()[this.currentViewIndex()]?.angle === 'shoot');

  /** The angle pictures in order, with their slot (a0, a1 …), their position in the column and a name (a repeated name gets a number). */
  readonly angleSlots = computed(() => {
    const out: Array<{ key: string; label: string; index: number; angle: string }> = [];
    const seen = new Map<string, number>();
    this.outlookViews().forEach((v, index) => {
      if (v.angle === 'shoot') return;
      const n = (seen.get(v.label) ?? 0) + 1;
      seen.set(v.label, n);
      out.push({ key: 'a' + out.length, label: n > 1 ? `${v.label} ${n}` : v.label, index, angle: v.angle });
    });
    return out;
  });

  /** The slot of the angle picture at a position of the column; '' for a model photo. */
  angleKeyOf(index: number): string {
    return this.angleSlots().find((s) => s.index === index)?.key ?? '';
  }
  readonly currentAngleKey = computed(() => this.angleKeyOf(this.currentViewIndex()));

  angleLabelOf(key: string): string {
    return this.angleSlots().find((s) => s.key === key)?.label ?? 'angle';
  }

  /** The logos on the angle picture at a position of the column (for its small preview and its badge). */
  placementsOn(index: number): LogoPlacement[] {
    const key = this.angleKeyOf(index);
    return key ? this.placements().filter((p) => p.angle === key) : [];
  }

  /** The logos on the angle picture shown in the preview. */
  readonly shownPlacements = computed(() => {
    const key = this.currentAngleKey();
    return key ? this.placements().filter((p) => p.angle === key) : [];
  });

  /** The logos are laid over the angle pictures only. */
  readonly showLogoLayer = computed(() => !!this.logoPreview() && this.shownPlacements().length > 0 && !this.onModelPhoto());

  /** Said under the preview when a model photo is shown while logos are placed. */
  readonly logoHint = computed<{ text: string; go?: string } | null>(() =>
    this.logoPreview() && this.placements().length && this.onModelPhoto()
      ? { text: 'A logo can only be placed on the angle pictures (Front, Back …), not on the model photos.', go: 'Show the angle pictures' }
      : null,
  );

  readonly addonTotal = computed(() => {
    const map = this.serviceAddOns();
    let n = 0;
    const add = (kind: string, label: string) => {
      if (!label) return;
      const v = Number(map[`${kind}:${label}`]);
      if (Number.isFinite(v) && v > 0) n += v;
    };
    add('decoration', this.decorationValue());
    for (const label of this.tickedLabels()) add('placement', label);
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
    this.stageObserver?.disconnect();
    this.phoneQuery?.removeEventListener('change', this.onPhoneChange);
  }

  ngOnInit() {
    this.phoneQuery?.addEventListener('change', this.onPhoneChange);
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

  // ── zoom (up to 250%) and moving the picture while it is zoomed: drag it, pinch it, double-tap it
  readonly panX = signal(0);
  readonly panY = signal(0);
  readonly panning = signal(false);
  readonly stageTransform = computed(() => `translate(${this.panX()}px, ${this.panY()}px) scale(${this.zoom() / 100})`);
  private readonly pointers = new Map<number, { x: number; y: number }>();
  private panStart: { x: number; y: number; px: number; py: number } | null = null;
  private pinch: { dist: number; zoom: number } | null = null;
  private lastTap: { t: number; x: number; y: number } | null = null;
  private downAt: { x: number; y: number } | null = null;
  private tapMoved = false;

  /** Keeps the picture covering the box: it can be moved only as far as the zoom has made it bigger than the box. */
  private clampPan(px: number, py: number, zoom: number): { x: number; y: number } {
    const el = document.querySelector<HTMLElement>('.stage-wrap');
    if (!el || zoom <= 100) return { x: 0, y: 0 };
    const mx = ((zoom / 100 - 1) * el.clientWidth) / 2;
    const my = ((zoom / 100 - 1) * el.clientHeight) / 2;
    return { x: Math.min(mx, Math.max(-mx, px)), y: Math.min(my, Math.max(-my, py)) };
  }

  setZoom(value: number) {
    const z = Math.round(Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, value)));
    this.zoom.set(z);
    const c = this.clampPan(this.panX(), this.panY(), z);
    this.panX.set(c.x);
    this.panY.set(c.y);
  }

  zoomBy(delta: number) {
    this.setZoom(this.zoom() + delta);
  }

  resetZoom() {
    this.zoom.set(100);
    this.panX.set(0);
    this.panY.set(0);
  }

  onPanDown(ev: PointerEvent) {
    if ((ev.target as HTMLElement).closest('tg-logo-layer .logo')) return; // a logo handles its own dragging
    if (ev.pointerType === 'mouse' && ev.button !== 0) return;
    this.pointers.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });
    try {
      (ev.currentTarget as HTMLElement).setPointerCapture(ev.pointerId);
    } catch {
      /* the pointer is already gone */
    }
    if (this.pointers.size === 1) {
      this.tapMoved = false;
      this.downAt = { x: ev.clientX, y: ev.clientY };
    }
    if (this.pointers.size === 2) {
      const [a, b] = [...this.pointers.values()];
      this.pinch = { dist: Math.max(1, Math.hypot(a.x - b.x, a.y - b.y)), zoom: this.zoom() };
      this.panStart = null;
      this.tapMoved = true;
    } else if (this.zoom() > 100) {
      this.panStart = { x: ev.clientX, y: ev.clientY, px: this.panX(), py: this.panY() };
      this.panning.set(true);
    }
  }

  onPanMove(ev: PointerEvent) {
    const p = this.pointers.get(ev.pointerId);
    if (!p) return;
    p.x = ev.clientX;
    p.y = ev.clientY;
    if (this.downAt && Math.hypot(ev.clientX - this.downAt.x, ev.clientY - this.downAt.y) > 6) this.tapMoved = true;
    if (this.pointers.size === 2 && this.pinch) {
      const [a, b] = [...this.pointers.values()];
      this.setZoom((this.pinch.zoom * Math.hypot(a.x - b.x, a.y - b.y)) / this.pinch.dist);
      return;
    }
    if (this.panStart) {
      const c = this.clampPan(this.panStart.px + (ev.clientX - this.panStart.x), this.panStart.py + (ev.clientY - this.panStart.y), this.zoom());
      this.panX.set(c.x);
      this.panY.set(c.y);
    }
  }

  onPanUp(ev: PointerEvent) {
    const had = this.pointers.delete(ev.pointerId);
    try {
      (ev.currentTarget as HTMLElement).releasePointerCapture(ev.pointerId);
    } catch {
      /* already released */
    }
    if (this.pointers.size < 2) this.pinch = null;
    if (this.pointers.size === 0) {
      this.panStart = null;
      this.panning.set(false);
    }
    // a double tap (or double click) zooms in on the spot, or back out again
    if (had && ev.type === 'pointerup' && !this.tapMoved && this.pointers.size === 0) {
      const now = Date.now();
      if (this.lastTap && now - this.lastTap.t < 320 && Math.hypot(ev.clientX - this.lastTap.x, ev.clientY - this.lastTap.y) < 30) {
        this.lastTap = null;
        this.toggleZoomAt(ev.clientX, ev.clientY);
      } else {
        this.lastTap = { t: now, x: ev.clientX, y: ev.clientY };
      }
    }
  }

  private toggleZoomAt(cx: number, cy: number) {
    if (this.zoom() > 100) return this.resetZoom();
    const el = document.querySelector<HTMLElement>('.stage-wrap');
    if (!el) return;
    const r = el.getBoundingClientRect();
    const s = 2;
    const c = this.clampPan(-(s - 1) * (cx - (r.left + r.width / 2)), -(s - 1) * (cy - (r.top + r.height / 2)), s * 100);
    this.zoom.set(s * 100);
    this.panX.set(c.x);
    this.panY.set(c.y);
  }

  /** Ctrl + wheel (or a trackpad pinch) zooms; the wheel moves the picture up and down while it is zoomed. */
  onWheel(ev: WheelEvent) {
    if (ev.ctrlKey || ev.metaKey) {
      ev.preventDefault();
      this.setZoom(this.zoom() * (ev.deltaY < 0 ? 1.1 : 1 / 1.1));
      return;
    }
    if (this.zoom() > 100) {
      ev.preventDefault();
      const c = this.clampPan(this.panX() - ev.deltaX, this.panY() - ev.deltaY, this.zoom());
      this.panX.set(c.x);
      this.panY.set(c.y);
    }
  }

  /** A new picture starts in the middle. */
  private readonly panReset = effect(() => {
    this.currentViewIndex();
    untracked(() => {
      this.panX.set(0);
      this.panY.set(0);
    });
  });

  // ── the height of the preview box (for how many angle pictures fit beside it) and the phone width
  private stageObserver: ResizeObserver | null = null;
  private observedStage: Element | null = null;
  private readonly phoneQuery = typeof window !== 'undefined' ? window.matchMedia('(max-width: 700px)') : null;
  private readonly onPhoneChange = (e: MediaQueryListEvent) => {
    this.narrow.set(e.matches);
    this.resetZoom();
  };
  private readonly stageWatch = effect(() => {
    this.product();
    untracked(() => setTimeout(() => this.watchStage(), 0));
  });

  private watchStage() {
    const el = document.querySelector('.stage-wrap');
    if (!el || el === this.observedStage || typeof ResizeObserver === 'undefined') return;
    this.stageObserver?.disconnect();
    this.observedStage = el;
    this.stageObserver = new ResizeObserver(() => this.stageHeight.set(Math.round((el as HTMLElement).offsetHeight)));
    this.stageObserver.observe(el);
  }

  @HostListener('window:resize')
  onWindowResize() {
    const c = this.clampPan(this.panX(), this.panY(), this.zoom());
    this.panX.set(c.x);
    this.panY.set(c.y);
  }


  setDecoration(value: string) {
    this.decorationValue.set(value);
  }

  // ── logo placements: tick where the logo goes, then move, resize, fix and place again each copy
  private tickedLabels(): string[] {
    const on = this.tickedValues();
    return this.placementOptions()
      .filter((o) => on.includes(o.value))
      .map((o) => o.label);
  }

  private saveTicks() {
    try {
      localStorage.setItem(TICKS_KEY, JSON.stringify(this.tickedLabels()));
    } catch {
      /* storage is blocked: the choice is simply not remembered */
    }
  }

  /** Ticking a placement puts a copy of the logo on its angle picture and shows it; unticking takes it away. */
  onTick(value: string, checked: boolean) {
    this.tickedValues.update((list) => (checked ? (list.includes(value) ? list : [...list, value]) : list.filter((v) => v !== value)));
    this.saveTicks();
    this.syncPlacements(checked ? value : null);
  }

  tickAll() {
    this.tickedValues.set(this.placementOptions().map((o) => o.value));
    this.saveTicks();
    this.syncPlacements(null);
  }

  untickAll() {
    this.tickedValues.set([]);
    this.saveTicks();
    this.syncPlacements(null);
  }

  /** Where a new copy starts: the spot of the placement, beside the design file when that is in the way. */
  private presetFor(label: string): Spot {
    const zone = logoZoneFor(label);
    const z = zone.centre && this.designPreviewUrl() ? LEFT_CHEST : zone;
    return { x: z.x, y: z.y, w: z.w };
  }

  /**
   * The angle picture a placement belongs to: the Back picture for a back placement, the Sleeve picture for a
   * sleeve, the Front picture for the rest. A colour without that picture uses the front one (or the next one
   * for a back), so a placement always has a picture; the customer can pick another in the list.
   */
  private defaultAngleFor(label: string): string {
    const slots = this.angleSlots();
    if (!slots.length) return '';
    const named = (name: string) => slots.find((s) => s.angle.trim().toLowerCase() === name);
    const closeUps = ['back', 'sleeve', 'collar', 'side', 'neck', 'detail'];
    const front = named('front') ?? slots.find((s) => !closeUps.includes(s.angle.trim().toLowerCase())) ?? slots[0];
    if (/sleeve/i.test(label)) return (named('sleeve') ?? front).key;
    if (logoZoneFor(label).view === 'back') return (named('back') ?? [...slots].reverse().find((s) => s !== front) ?? front).key;
    return front.key;
  }

  /** Makes the logo copies match the ticks: a ticked placement has its copy, an unticked one has none. */
  private syncPlacements(focus: string | null) {
    const ticked = this.tickedValues();
    const before = this.placements();
    let list = before.filter((p) => ticked.includes(p.value));
    let added: LogoPlacement | null = null;
    if (this.logoPreview()) {
      for (const value of ticked) {
        if (list.some((p) => p.value === value)) continue;
        const option = this.placementOptions().find((o) => o.value === value);
        if (!option) continue;
        const p = keepInside(
          newPlacement(option.value, option.label, this.defaultAngleFor(option.label), this.presetFor(option.label)),
          this.logoRatio(),
          this.stageRatio(),
        );
        list = [...list, p];
        if (!added || value === focus) added = p;
      }
    }
    this.placements.set(list);
    this.savePlacements();
    if (added) {
      this.selectedId.set(added.id);
      this.showPlacement(added);
    } else if (!list.some((p) => p.id === this.selectedId())) {
      this.selectedId.set(list.find((p) => !p.fixed)?.id ?? null);
    }
    if (added || list.length !== before.length) void this.rebuildSnapshots();
  }

  /** Called once the logo is set: the first placement is ticked when none is, and every ticked placement gets its copy. */
  private afterLogoSet() {
    if (!this.tickedValues().length) {
      const first = this.placementOptions()[0];
      if (first) {
        this.tickedValues.set([first.value]);
        this.saveTicks();
      }
    }
    this.syncPlacements(null);
    void this.rebuildSnapshots();
    this.revealPreview(); // on a phone: show the customer their logo on the garment
  }

  /** Turns the preview to the angle picture a logo is on. */
  private showPlacement(p: LogoPlacement) {
    const slot = this.angleSlots().find((s) => s.key === p.angle);
    if (slot) this.outlookIndex.set(slot.index);
  }

  /** Shows the first angle picture when a model photo is shown, so the logos are seen. */
  goToAngle() {
    if (!this.onModelPhoto()) return;
    const first = this.placements()[0];
    const slot = (first && this.angleSlots().find((s) => s.key === first.angle)) || this.angleSlots()[0];
    if (slot) this.outlookIndex.set(slot.index);
  }

  /** Clicking a logo in the list selects it and shows its angle picture. */
  selectLogo(p: LogoPlacement) {
    this.selectedId.set(p.id);
    this.showPlacement(p);
    this.revealPreview();
  }

  /** On a phone the controls are below the picture: bring the picture into view when something is done to it. */
  private revealPreview() {
    if (typeof window === 'undefined' || window.innerWidth > 700) return;
    setTimeout(() => {
      const box = document.querySelector('.stage-wrap');
      if (!box) return;
      const r = box.getBoundingClientRect();
      if (r.top < 120 || r.bottom > window.innerHeight) box.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 150);
  }

  /** Puts a logo on another angle picture. */
  setAngle(id: string, key: string) {
    this.placements.update((list) => list.map((p) => (p.id === id ? { ...p, angle: key } : p)));
    const p = this.placements().find((x) => x.id === id);
    if (p) {
      this.selectedId.set(id);
      this.showPlacement(p);
    }
    this.savePlacements();
    void this.rebuildSnapshots();
  }

  /** A logo was moved or resized on the angle picture shown. */
  onLogoPlace(ev: { id: string; x: number; y: number; w: number }) {
    this.placements.update((list) => list.map((p) => (p.id === ev.id ? { ...p, x: ev.x, y: ev.y, w: ev.w } : p)));
  }

  onLogoCommit() {
    this.savePlacements();
  }

  /** Locks a logo where it is and saves the pictures of the angles with the logos on them. */
  fixPlacement(id: string) {
    this.placements.update((list) => list.map((p) => (p.id === id ? { ...p, fixed: true } : p)));
    this.selectedId.set(this.placements().find((p) => !p.fixed)?.id ?? null);
    this.savePlacements();
    void this.rebuildSnapshots();
  }

  fixAll() {
    if (!this.placements().some((p) => !p.fixed)) return;
    this.placements.update((list) => list.map((p) => ({ ...p, fixed: true })));
    this.selectedId.set(null);
    this.savePlacements();
    void this.rebuildSnapshots();
  }

  /** Opens a fixed logo to place it again. */
  editPlacement(id: string) {
    this.placements.update((list) => list.map((p) => (p.id === id ? { ...p, fixed: false } : p)));
    this.selectedId.set(id);
    const p = this.placements().find((x) => x.id === id);
    if (p) this.showPlacement(p);
    this.savePlacements();
    void this.rebuildSnapshots();
    this.revealPreview();
  }

  /** Puts a logo back at the spot of its placement. */
  resetPlacement(id: string) {
    this.placements.update((list) =>
      list.map((p) => (p.id === id ? { ...p, ...keepInside(this.presetFor(p.label), this.logoRatio(), this.stageRatio()) } : p)),
    );
    this.savePlacements();
  }

  removePlacement(p: LogoPlacement) {
    this.onTick(p.value, false);
  }

  private savePlacements() {
    const p = this.product();
    const list = this.placements();
    this.designUpload.setPlacements(p && list.length ? { productId: p.id, placements: list } : null);
  }

  // ── the pictures of the angles with the fixed logos on them
  private snapChain: Promise<void> = Promise.resolve();

  private rebuildSnapshots(): Promise<void> {
    this.snapChain = this.snapChain.then(() => this.buildSnapshots()).catch(() => undefined);
    return this.snapChain;
  }

  private releaseSnapshots() {
    for (const s of this.snapshots()) URL.revokeObjectURL(s.url);
    this.snapshots.set([]);
  }

  /** One picture for every angle picture that has fixed logos on it: the garment picture with those logos placed. */
  private async buildSnapshots() {
    const logo = this.logoPreview();
    const views = this.outlookViews();
    const fixed = this.fixedPlacements();
    const out: Array<{ id: string; label: string; name: string; blob: Blob; url: string; garment?: string }> = [];
    let failed = false;
    if (logo && fixed.length) {
      for (const slot of this.angleSlots()) {
        const here = fixed.filter((p) => p.angle === slot.key);
        const view = views[slot.index];
        if (!here.length || !view) continue;
        try {
          const shot = await renderSnapshot(view.url, logo, this.logoRatio(), here);
          out.push({
            id: slot.key,
            label: `${slot.label} picture: ${here.map((p) => p.label).join(' + ')}`,
            name: `Logo placement - ${slot.label} picture - ${here.map((p) => p.label).join(' + ')}${shot.garment ? ' (logo layer)' : ''}.${shot.garment ? 'png' : 'jpg'}`,
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
  private ticksFor: string | null = null;
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
    const options = this.placementOptions();
    const list: LogoPlacement[] = [];
    for (const x of draft.placements) {
      const value = x.value ?? options.find((o) => o.label === x.label)?.value;
      if (!value || list.some((p) => p.value === value)) continue;
      const angle = x.angle && this.angleSlots().some((s) => s.key === x.angle) ? x.angle : this.defaultAngleFor(x.label);
      list.push({ id: 'pl-' + value, value, label: x.label, angle, x: x.x, y: x.y, w: x.w, fixed: x.fixed });
    }
    this.placements.set(list);
    this.tickedValues.update((on) => [...new Set([...on, ...list.map((p) => p.value)])]);
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
    this.fixAll();
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
      this.afterLogoSet(); // every ticked placement gets its copy of the logo, ready to be moved
    };
    reader.readAsDataURL(file);
  }

  clearLogo() {
    this.logoPreview.set(null);
    this.logoName.set('');
    this.logoError.set('');
    this.designUpload.setLogo(null);
    this.placements.set([]);
    this.selectedId.set(null);
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
    if (this.ticksFor !== p.id && placements.length) {
      this.ticksFor = p.id;
      let remembered: unknown = [];
      try {
        remembered = JSON.parse(localStorage.getItem(TICKS_KEY) || '[]');
      } catch {
        /* storage is blocked */
      }
      const labels = Array.isArray(remembered) ? remembered : [];
      this.tickedValues.set(placements.filter((o) => labels.includes(o.label)).map((o) => o.value));
    }

    const privateLabels = this.valuesFromProduct(p, 'private_label');
    this.productPrivateLabelOpts.set(privateLabels);
    this.privateLabelValues.set(privateLabels.map((o) => o.value));

    const decor = this.decorationsFromProduct(p);
    this.decorationMethods.set(decor);
    this.decorationValue.set(decor[0] || '');
    this.serviceAddOns.set(this.serviceAddOnsFromProduct(p));
    this.currentStep.set(1);
    this.resetZoom();
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
