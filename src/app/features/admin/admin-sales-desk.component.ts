import { Component, ElementRef, OnInit, computed, inject, input, signal, viewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AttributeDefinition, CatalogService, Enquiry } from '../../core/services/catalog.service';
import { Product } from '../../core/models/catalog.models';
import {
  attributeLabelsOf,
  effectiveUnitPrice,
  quantityTierFactor,
  quantityTierLabel,
  serviceAddOnsOf,
} from '../../core/utils/price';
import {
  ExportDoc,
  ExportFormat,
  ExportTable,
  docToCsv,
  docToHtml,
  docToPdf,
  docToWord,
  downloadBlob,
  fmtDate,
  money as fmtMoney,
  openPrint,
  prepareFilesForPdf,
  safeFileName,
  tableToCsv,
  tableToHtml,
  tableToPdf,
  tableToWord,
} from '../../core/utils/sales-export';
import {
  Attachment,
  downloadAttachment,
  fileExt,
  isImageAttachment,
  openAttachment,
  roleLabel,
  sizeLabel,
  unpackAttachments,
} from '../../core/utils/attachments';
import {
  DocChain,
  Invoice,
  LineItem,
  Party,
  Quotation,
  QuotationStatus,
  SalesDeskStore,
  SalesOrder,
  OrderStage,
  docTotals,
} from '../../core/services/sales-desk.store';

export type SalesSection = 'enquiries' | 'quotations' | 'invoices' | 'orders';

type DocKind = 'quotation' | 'invoice' | 'order';

interface QuoteForm {
  /** Set when an existing quotation is being edited. */
  id: string | null;
  enquiry: Enquiry | null;
  customer: Party;
  items: LineItem[];
  taxPct: number;
  discount: number;
  currency: string;
  notes: string;
  validUntil: string;
}

const STAGES: Array<{ key: OrderStage; label: string }> = [
  { key: 'confirmed', label: 'Confirmed' },
  { key: 'production', label: 'In production' },
  { key: 'shipped', label: 'Shipped' },
  { key: 'delivered', label: 'Delivered' },
];

@Component({
  selector: 'tg-admin-sales-desk',
  standalone: true,
  imports: [FormsModule],
  template: `
    <div class="sd">
      <header class="sd-head">
        <div>
          <p class="sd-kicker">Sales desk</p>
          <h1>{{ titles[section()] }}</h1>
          <p class="sd-sub">{{ subtitles[section()] }}</p>
        </div>
        <div class="sd-head-actions">
          @if (section() === 'enquiries') {
            <button type="button" class="btn" (click)="loadEnquiries()">Refresh</button>
          }
          <select class="sel exp" aria-label="Export this list" (change)="onListExport($event)">
            <option value="">Export list…</option>
            <option value="csv">CSV (Excel)</option>
            <option value="pdf">PDF</option>
            <option value="word">Word</option>
            <option value="print">Print</option>
          </select>
          @if (section() === 'quotations') {
            <button type="button" class="btn btn-dark" (click)="openQuoteForm(null)">
              + New quotation
            </button>
          }
        </div>
      </header>

      <nav class="sd-flow" aria-label="Sales pipeline">
        <div class="flow-step" [class.on]="section() === 'enquiries'">
          <b>{{ enquiries().length }}</b><span>Inquiries</span>
        </div>
        <i>→</i>
        <div class="flow-step" [class.on]="section() === 'quotations'">
          <b>{{ store.quotations().length }}</b><span>Quotations</span>
        </div>
        <i>→</i>
        <div class="flow-step" [class.on]="section() === 'invoices'">
          <b>{{ store.invoices().length }}</b><span>Invoices</span>
        </div>
        <i>→</i>
        <div class="flow-step" [class.on]="section() === 'orders'">
          <b>{{ store.orders().length }}</b><span>Orders</span>
        </div>
      </nav>

      @if (error()) {
        <div class="alert">{{ error() }}</div>
      }
      @if (note()) {
        <div class="note">{{ note() }}</div>
      }

      <!-- ===================== ENQUIRIES ===================== -->
      @if (section() === 'enquiries') {
        <div class="panel">
          <div class="toolbar">
            <input
              class="search"
              type="search"
              placeholder="Search ref, name, company, email, message…"
              [ngModel]="enqSearch()"
              (ngModelChange)="enqSearch.set($event)"
            />
            <div class="chips">
              @for (s of enqStatuses; track s.key) {
                <button
                  type="button"
                  class="chip"
                  [class.active]="enqStatus() === s.key"
                  (click)="enqStatus.set(s.key)"
                >
                  {{ s.label }} <em>{{ enqCount(s.key) }}</em>
                </button>
              }
            </div>
          </div>

          @if (loading()) {
            <div class="empty">Loading inquiries…</div>
          } @else if (!filteredEnquiries().length) {
            <div class="empty">No inquiries match.</div>
          } @else {
            <div class="table-wrap">
              <table class="data">
                <thead>
                  <tr>
                    <th>Ref</th>
                    <th>Received</th>
                    <th>Customer</th>
                    <th>Segment</th>
                    <th>Attachment</th>
                    <th>Status</th>
                    <th>Pipeline</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  @for (e of filteredEnquiries(); track e.id) {
                    <tr class="row-click" (click)="openEnquiry(e)">
                      <td><b>{{ e.ref }}</b></td>
                      <td>{{ fmt(e.createdAt) }}</td>
                      <td>
                        {{ e.name }}
                        <small>{{ e.company || e.email }}</small>
                      </td>
                      <td>{{ e.segment || '—' }}</td>
                      <td>{{ attLabel(e) }}</td>
                      <td><span class="badge" [class]="'b-' + e.status">{{ e.status }}</span></td>
                      <td>
                        @if (quotesFor(e).length) {
                          <span class="pill">{{ quotesFor(e).length }} quote</span>
                        } @else {
                          <span class="muted">—</span>
                        }
                      </td>
                      <td class="right">
                        <button type="button" class="btn btn-sm" (click)="openEnquiry(e); $event.stopPropagation()">
                          Open
                        </button>
                      </td>
                    </tr>
                  }
                </tbody>
              </table>
            </div>
          }
        </div>
      }

      <!-- ===================== QUOTATIONS ===================== -->
      @if (section() === 'quotations') {
        <div class="panel">
          <div class="toolbar">
            <input
              class="search"
              type="search"
              placeholder="Search quotation no., customer…"
              [ngModel]="docSearch()"
              (ngModelChange)="docSearch.set($event)"
            />
          </div>
          @if (!filteredQuotations().length) {
            <div class="empty">
              No quotations yet. Open an inquiry and choose “Create quotation”, or start a blank one.
            </div>
          } @else {
            <div class="table-wrap">
              <table class="data">
                <thead>
                  <tr>
                    <th>No.</th>
                    <th>Customer</th>
                    <th>Inquiry</th>
                    <th>Valid until</th>
                    <th class="right">Total</th>
                    <th>Status</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  @for (q of filteredQuotations(); track q.id) {
                    <tr class="row-click" (click)="openDoc('quotation', q.id)">
                      <td><b>{{ q.number }}</b><small>{{ fmt(q.createdAt) }}</small></td>
                      <td>{{ q.customer.name }}<small>{{ q.customer.company || q.customer.email }}</small></td>
                      <td>{{ q.enquiryRef || '—' }}</td>
                      <td>{{ q.validUntil || '—' }}</td>
                      <td class="right">{{ money(totals(q).total, q.currency) }}</td>
                      <td (click)="$event.stopPropagation()">
                        <select
                          class="sel"
                          [ngModel]="q.status"
                          (ngModelChange)="setQuoteStatus(q, $event)"
                        >
                          <option value="draft">draft</option>
                          <option value="sent">sent</option>
                          <option value="accepted">accepted</option>
                          <option value="rejected">rejected</option>
                        </select>
                      </td>
                      <td class="right nowrap" (click)="$event.stopPropagation()">
                        <button type="button" class="btn btn-sm" (click)="openDoc('quotation', q.id)">View</button>
                        <select class="sel exp" aria-label="Export quotation" (change)="onDocExport($event, 'quotation', q)">
                          <option value="">Export…</option>
                          <option value="print">Print</option>
                          <option value="pdf">PDF</option>
                          <option value="word">Word</option>
                          <option value="csv">CSV</option>
                        </select>
                        <button type="button" class="btn btn-sm btn-dark" (click)="makeInvoice(q)" [disabled]="invoiceFor(q)">
                          {{ invoiceFor(q) ? 'Invoiced' : 'Create invoice' }}
                        </button>
                        <button type="button" class="btn btn-sm btn-danger" (click)="removeQuote(q)">Delete</button>
                      </td>
                    </tr>
                  }
                </tbody>
              </table>
            </div>
          }
        </div>
      }

      <!-- ===================== INVOICES ===================== -->
      @if (section() === 'invoices') {
        <div class="kpis">
          <div class="kpi"><span>Paid</span><b>{{ kpi('paid') }}</b></div>
          <div class="kpi"><span>Outstanding</span><b>{{ kpi('unpaid') }}</b></div>
          <div class="kpi"><span>Invoices</span><b>{{ store.invoices().length }}</b></div>
        </div>
        <div class="panel">
          <div class="toolbar">
            <input
              class="search"
              type="search"
              placeholder="Search invoice no., customer…"
              [ngModel]="docSearch()"
              (ngModelChange)="docSearch.set($event)"
            />
          </div>
          @if (!filteredInvoices().length) {
            <div class="empty">
              No invoices yet. Create one from an accepted quotation under Quotations.
            </div>
          } @else {
            <div class="table-wrap">
              <table class="data">
                <thead>
                  <tr>
                    <th>No.</th>
                    <th>Customer</th>
                    <th>From quotation</th>
                    <th>Due</th>
                    <th class="right">Total</th>
                    <th>Status</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  @for (i of filteredInvoices(); track i.id) {
                    <tr class="row-click" (click)="openDoc('invoice', i.id)">
                      <td><b>{{ i.number }}</b><small>{{ fmt(i.createdAt) }}</small></td>
                      <td>{{ i.customer.name }}<small>{{ i.customer.company || i.customer.email }}</small></td>
                      <td>{{ i.quotationNumber || '—' }}</td>
                      <td [class.overdue]="isOverdue(i)">{{ i.dueDate }}{{ isOverdue(i) ? ' · overdue' : '' }}</td>
                      <td class="right">{{ money(totals(i).total, i.currency) }}</td>
                      <td><span class="badge" [class]="'b-' + i.status">{{ i.status }}</span></td>
                      <td class="right nowrap" (click)="$event.stopPropagation()">
                        @if (i.status === 'unpaid') {
                          <button type="button" class="btn btn-sm" (click)="markPaid(i)">Mark paid</button>
                        } @else if (i.status === 'paid') {
                          <button type="button" class="btn btn-sm" (click)="store.setInvoiceStatus(i.id, 'unpaid')">Mark unpaid</button>
                        }
                        <button type="button" class="btn btn-sm" (click)="openDoc('invoice', i.id)">View</button>
                        <select class="sel exp" aria-label="Export invoice" (change)="onDocExport($event, 'invoice', i)">
                          <option value="">Export…</option>
                          <option value="print">Print</option>
                          <option value="pdf">PDF</option>
                          <option value="word">Word</option>
                          <option value="csv">CSV</option>
                        </select>
                        <button type="button" class="btn btn-sm btn-dark" (click)="makeOrder(i)" [disabled]="orderFor(i)">
                          {{ orderFor(i) ? 'Ordered' : 'Create order' }}
                        </button>
                        <button type="button" class="btn btn-sm btn-danger" (click)="removeInvoice(i)">Delete</button>
                      </td>
                    </tr>
                  }
                </tbody>
              </table>
            </div>
          }
        </div>
      }

      <!-- ===================== ORDERS ===================== -->
      @if (section() === 'orders') {
        <div class="chips top-chips">
          @for (s of orderFilters; track s.key) {
            <button
              type="button"
              class="chip"
              [class.active]="orderFilter() === s.key"
              (click)="orderFilter.set(s.key)"
            >
              {{ s.label }} <em>{{ orderCount(s.key) }}</em>
            </button>
          }
        </div>
        @if (!filteredOrders().length) {
          <div class="panel">
            <div class="empty">
              No orders here. Create an order from a paid or unpaid invoice under Invoices.
            </div>
          </div>
        } @else {
          <div class="order-grid">
            @for (o of filteredOrders(); track o.id) {
              <article class="order-card">
                <header>
                  <div>
                    <b>{{ o.number }}</b>
                    <small>{{ o.customer.name }}{{ o.customer.company ? ' · ' + o.customer.company : '' }}</small>
                  </div>
                  <span class="badge" [class]="'b-' + o.stage">{{ stageLabel(o.stage) }}</span>
                </header>
                <ul class="order-items">
                  @for (it of o.items; track $index) {
                    <li><span>{{ it.description }}</span><em>× {{ it.qty }}</em></li>
                  }
                </ul>
                <div class="order-meta">
                  <span>Invoice {{ o.invoiceNumber || '—' }}</span>
                  <b>{{ money(totals(o).total, o.currency) }}</b>
                </div>
                @if (o.stage !== 'cancelled') {
                  <div class="stepper">
                    @for (s of stages; track s.key; let idx = $index) {
                      <button
                        type="button"
                        class="step"
                        [class.done]="stageIndex(o.stage) >= idx"
                        (click)="setStage(o, s.key)"
                      >
                        <i>{{ idx + 1 }}</i>{{ s.label }}
                      </button>
                    }
                  </div>
                }
                <div class="order-foot">
                  <input
                    class="track"
                    type="text"
                    placeholder="Tracking / courier ref"
                    [ngModel]="o.tracking"
                    (blur)="store.setOrderTracking(o.id, $any($event.target).value)"
                  />
                  <button type="button" class="btn btn-sm" (click)="openDoc('order', o.id)">View</button>
                  <select class="sel exp" aria-label="Export order" (change)="onDocExport($event, 'order', o)">
                    <option value="">Export…</option>
                    <option value="print">Print</option>
                    <option value="pdf">PDF</option>
                    <option value="word">Word</option>
                    <option value="csv">CSV</option>
                  </select>
                  @if (o.stage !== 'cancelled' && o.stage !== 'delivered') {
                    <button type="button" class="btn btn-sm btn-danger" (click)="setStage(o, 'cancelled')">Cancel</button>
                  } @else if (o.stage === 'cancelled') {
                    <button type="button" class="btn btn-sm" (click)="setStage(o, 'confirmed')">Reopen</button>
                  }
                  <button type="button" class="btn btn-sm btn-danger" (click)="removeOrder(o)">Delete</button>
                </div>
              </article>
            }
          </div>
        }
      }
      @if (section() !== 'enquiries') {
        <p class="backup">
          Quotations, invoices and orders are saved in this browser.
          <button type="button" class="link" (click)="downloadBackup()">Download a backup</button> ·
          <button type="button" class="link" (click)="chooseBackup()">Restore from a backup</button>
          <input #restoreFile type="file" accept="application/json,.json" hidden (change)="restoreBackup($event)" />
        </p>
      }
    </div>

    <!-- ===================== ENQUIRY DRAWER ===================== -->
    @if (selected(); as e) {
      <div class="scrim" (click)="closeEnquiry()"></div>
      <aside class="drawer" role="dialog" aria-label="Inquiry details">
        <header>
          <div>
            <b>{{ e.ref }}</b>
            <small>Received {{ fmt(e.createdAt) }}</small>
          </div>
          <button type="button" class="x" (click)="closeEnquiry()" aria-label="Close">×</button>
        </header>
        <div class="drawer-body">
          <section>
            <h3>Customer</h3>
            <dl>
              <dt>Name</dt><dd>{{ e.name }}</dd>
              <dt>Company</dt><dd>{{ e.company || '—' }}</dd>
              <dt>Email</dt><dd><a [href]="'mailto:' + e.email">{{ e.email }}</a></dd>
              <dt>Phone</dt><dd>{{ e.phone || '—' }}</dd>
              <dt>Segment</dt><dd>{{ e.segment || '—' }}</dd>
            </dl>
          </section>

          <section>
            <h3>Request</h3>
            <pre class="msg">{{ e.message || 'No message provided.' }}</pre>
          </section>

          @if (filesFor(e.id).length) {
            <section>
              <h3>Customer design files</h3>
              <ul class="att-list">
                @for (a of filesFor(e.id); track $index) {
                  <li class="att">
                    @if (isImg(a)) {
                      <img [src]="a.dataUrl" [alt]="a.name" />
                    } @else {
                      <span class="att-ext">{{ ext(a.name) }}</span>
                    }
                    <span class="att-text"><strong>{{ a.name }}</strong><small>{{ role(a.role) }} · {{ size(a.size) }}</small></span>
                    @if (a.type === 'application/pdf') {
                      <button type="button" class="btn btn-sm" (click)="openFile(a)">Open</button>
                    }
                    <button type="button" class="btn btn-sm" (click)="downloadFile(a)">Download</button>
                  </li>
                }
              </ul>
              @if (filesFor(e.id).length > 1) {
                <button type="button" class="btn btn-sm" (click)="downloadAll(filesFor(e.id))">Download all</button>
              }
            </section>
          }

          <section>
            <h3>Status</h3>
            <div class="chips">
              @for (s of enqStatusOnly; track s) {
                <button type="button" class="chip" [class.active]="e.status === s" (click)="setEnquiryStatus(e, s)">
                  {{ s }}
                </button>
              }
            </div>
          </section>

          <section>
            <h3>Internal notes</h3>
            <textarea rows="4" [(ngModel)]="notesDraft" placeholder="Visible to admins only"></textarea>
            <button type="button" class="btn btn-sm" (click)="saveNotes(e)">Save notes</button>
          </section>

          @if (quotesFor(e).length) {
            <section>
              <h3>Quotations</h3>
              <ul class="plain">
                @for (q of quotesFor(e); track q.id) {
                  <li>
                    <button type="button" class="link" (click)="openQuoteDoc(q)"><b>{{ q.number }}</b></button>
                    · {{ q.status }} · {{ money(totals(q).total, q.currency) }}
                    @if (chainOf(q).invoice; as inv) {
                      → <button type="button" class="link" (click)="openDoc('invoice', inv.id)">{{ inv.number }}</button> ({{ inv.status }})
                    }
                    @if (chainOf(q).order; as ord) {
                      → <button type="button" class="link" (click)="openDoc('order', ord.id)">{{ ord.number }}</button> ({{ stageLabel(ord.stage) }})
                    }
                  </li>
                }
              </ul>
            </section>
          }
        </div>
        <footer>
          <select class="sel exp" aria-label="Export inquiry" (change)="onEnquiryExport($event, e)">
            <option value="">Export…</option>
            <option value="print">Print</option>
            <option value="pdf">PDF</option>
            <option value="word">Word</option>
            <option value="csv">CSV</option>
          </select>
          <a class="btn" [href]="'mailto:' + e.email + '?subject=' + encode('Re: ' + e.ref)">Reply by email</a>
          <button type="button" class="btn btn-dark" (click)="openQuoteForm(e)">Create quotation</button>
        </footer>
      </aside>
    }

    <!-- ===================== QUOTATION FORM ===================== -->
    @if (quoteForm(); as f) {
      <div class="scrim" (click)="quoteForm.set(null)"></div>
      <div class="modal" role="dialog" aria-label="Quotation">
        <header>
          <h2>{{ f.id ? 'Edit quotation' : 'New quotation' }}{{ f.enquiry ? ' · ' + f.enquiry.ref : '' }}</h2>
          <button type="button" class="x" (click)="quoteForm.set(null)" aria-label="Close">×</button>
        </header>
        <div class="modal-body">
          <div class="grid2">
            <label>Customer name<input type="text" [(ngModel)]="f.customer.name" /></label>
            <label>Company<input type="text" [(ngModel)]="f.customer.company" /></label>
            <label>Email<input type="email" [(ngModel)]="f.customer.email" /></label>
            <label>Phone<input type="text" [(ngModel)]="f.customer.phone" /></label>
          </div>

          @if (f.enquiry && filesFor(f.enquiry.id).length) {
            <div class="cust-files" aria-label="Files the customer sent">
              <b>Customer files</b>
              @for (a of filesFor(f.enquiry.id); track $index) {
                <button type="button" class="file-chip" (click)="downloadFile(a)" [title]="'Download ' + a.name">
                  @if (isImg(a)) { <img [src]="a.dataUrl" alt="" /> } @else { <i>{{ ext(a.name) }}</i> }
                  {{ a.name }}
                </button>
              }
            </div>
          }
          <h3>Line items</h3>
          <div class="picker" aria-label="Add a product from the catalogue">
            <select [(ngModel)]="pick.productId" (ngModelChange)="onPickProduct()" aria-label="Product">
              <option value="">Add a catalogue product…</option>
              @for (p of products(); track p.id) {
                <option [value]="p.id">{{ p.name }}{{ p.isActive ? '' : ' (off)' }}</option>
              }
            </select>
            @if (pickProduct(); as pp) {
              <select [(ngModel)]="pick.colorId" aria-label="Colour">
                @for (c of pp.colors || []; track c.id) {
                  <option [value]="c.id">{{ c.name }}</option>
                }
              </select>
              <select [(ngModel)]="pick.decoration" aria-label="Decoration">
                <option value="">No decoration</option>
                @for (d of pickDecorations(); track d) {
                  <option [value]="d">{{ d }}</option>
                }
              </select>
              <input type="number" min="1" [(ngModel)]="pick.qty" aria-label="Quantity" />
              <span class="pick-price">{{ money(pickUnit(), f.currency) }} / unit<small>{{ tierLabel(pick.qty) }}</small></span>
              <button type="button" class="btn btn-sm btn-dark" (click)="addProductLine(f)">Add</button>
            }
          </div>
          <div class="items">
            <div class="item head"><span>Description</span><span>Qty</span><span>Unit price</span><span>Amount</span><span></span></div>
            @for (it of f.items; track $index) {
              <div class="item">
                <input type="text" [(ngModel)]="it.description" placeholder="e.g. Custom hoodie · 380 GSM" />
                <input type="number" min="0" [(ngModel)]="it.qty" (ngModelChange)="onQty(it)" />
                <input type="number" min="0" step="0.01" [(ngModel)]="it.unitPrice" (ngModelChange)="onPrice(it)" />
                <span class="amt">{{ money((it.qty || 0) * (it.unitPrice || 0), f.currency) }}</span>
                <button type="button" class="x" (click)="removeItem(f, $index)" aria-label="Remove line">×</button>
              </div>
              @if (isCatalogueLine(it)) {
                <div class="item-hint">
                  @if (isManualPrice(it)) {
                    Price typed by hand.
                    <button type="button" class="link" (click)="resetPrice(it)">Use catalogue price ({{ money(priceFor(it), f.currency) }})</button>
                  } @else {
                    Catalogue price, {{ tierLabel(it.qty) }} (×{{ tierFactor(it.qty) }}). Changes with the quantity.
                  }
                </div>
              }
            }
            <button type="button" class="btn btn-sm" (click)="addItem(f)">+ Add line</button>
          </div>

          <div class="grid4">
            <label>Currency
              <select [(ngModel)]="f.currency">
                <option>GBP</option><option>USD</option><option>EUR</option><option>PKR</option><option>AED</option>
              </select>
            </label>
            <label>Tax %<input type="number" min="0" [(ngModel)]="f.taxPct" /></label>
            <label>Discount<input type="number" min="0" [(ngModel)]="f.discount" /></label>
            <label>Valid until<input type="date" [(ngModel)]="f.validUntil" /></label>
          </div>
          <label>Notes / terms<textarea rows="3" [(ngModel)]="f.notes" placeholder="Payment terms, lead time, MOQ…"></textarea></label>

          <div class="totals">
            <div><span>Subtotal</span><b>{{ money(formTotals(f).subtotal, f.currency) }}</b></div>
            <div><span>Discount</span><b>− {{ money(formTotals(f).discount, f.currency) }}</b></div>
            <div><span>Tax</span><b>{{ money(formTotals(f).tax, f.currency) }}</b></div>
            <div class="grand"><span>Total</span><b>{{ money(formTotals(f).total, f.currency) }}</b></div>
          </div>
        </div>
        <footer>
          <button type="button" class="btn" (click)="quoteForm.set(null)">Cancel</button>
          <button type="button" class="btn" (click)="saveQuote('draft')">Save draft</button>
          <button type="button" class="btn btn-dark" (click)="saveQuote('sent')">Save as sent</button>
        </footer>
      </div>
    }

    <!-- ===================== DOCUMENT VIEW ===================== -->
    @if (docView(); as v) {
      <div class="scrim" (click)="closeDoc()"></div>
      <div class="modal doc-modal" role="dialog" [attr.aria-label]="v.title + ' ' + v.doc.number">
        <header>
          <div>
            <h2>{{ v.title }} {{ v.doc.number }}</h2>
            <small class="muted">{{ fmt(v.doc.createdAt) }} · {{ v.statusLabel }}</small>
          </div>
          <button type="button" class="x" (click)="closeDoc()" aria-label="Close">×</button>
        </header>
        <div class="modal-body">
          <div class="chain" aria-label="Linked documents">
            @if (v.chain.enquiryRef) {
              <button type="button" class="chain-chip" [disabled]="!enquiryOf(v.chain.enquiryId)" (click)="openEnquiryById(v.chain.enquiryId)">
                <small>Inquiry</small>{{ v.chain.enquiryRef }}
              </button>
              <i>→</i>
            }
            <button type="button" class="chain-chip" [class.on]="v.kind === 'quotation'" [disabled]="!v.chain.quotation" (click)="v.chain.quotation && openDoc('quotation', v.chain.quotation.id)">
              <small>Quotation</small>{{ v.chain.quotation?.number || '—' }}
            </button>
            <i>→</i>
            <button type="button" class="chain-chip" [class.on]="v.kind === 'invoice'" [disabled]="!v.chain.invoice" (click)="v.chain.invoice && openDoc('invoice', v.chain.invoice.id)">
              <small>Invoice</small>{{ v.chain.invoice?.number || '—' }}
            </button>
            <i>→</i>
            <button type="button" class="chain-chip" [class.on]="v.kind === 'order'" [disabled]="!v.chain.order" (click)="v.chain.order && openDoc('order', v.chain.order.id)">
              <small>Order</small>{{ v.chain.order?.number || '—' }}
            </button>
          </div>

          <div class="grid2 doc-parties">
            <div>
              <h3>Customer</h3>
              <p class="lines">
                <b>{{ v.doc.customer.name }}</b>
                @if (v.doc.customer.company) { <br />{{ v.doc.customer.company }} }
                @if (v.doc.customer.email) { <br />{{ v.doc.customer.email }} }
                @if (v.doc.customer.phone) { <br />{{ v.doc.customer.phone }} }
              </p>
            </div>
            <div>
              <h3>Details</h3>
              <p class="lines">
                @for (m of v.export.meta; track m[0]) { {{ m[0] }}: <b>{{ m[1] }}</b><br /> }
              </p>
            </div>
          </div>

          <table class="data doc-items">
            <thead><tr><th>Description</th><th class="right">Qty</th><th class="right">Unit price</th><th class="right">Amount</th></tr></thead>
            <tbody>
              @for (it of v.doc.items; track $index) {
                <tr>
                  <td>{{ it.description }}</td>
                  <td class="right">{{ it.qty }}</td>
                  <td class="right">{{ money(it.unitPrice, v.doc.currency) }}</td>
                  <td class="right">{{ money(it.qty * it.unitPrice, v.doc.currency) }}</td>
                </tr>
              }
            </tbody>
          </table>
          <div class="totals">
            <div><span>Subtotal</span><b>{{ money(v.export.subtotal, v.doc.currency) }}</b></div>
            <div><span>Discount</span><b>− {{ money(v.export.discount, v.doc.currency) }}</b></div>
            <div><span>Tax ({{ v.doc.taxPct }}%)</span><b>{{ money(v.export.tax, v.doc.currency) }}</b></div>
            <div class="grand"><span>Total</span><b>{{ money(v.export.total, v.doc.currency) }}</b></div>
          </div>
          @if (v.doc.notes) {
            <h3>Notes / terms</h3>
            <pre class="msg">{{ v.doc.notes }}</pre>
          }
          @if (filesFor(v.chain.enquiryId).length) {
            <h3>Customer design files <small class="muted">(from {{ v.chain.enquiryRef }})</small></h3>
            <ul class="att-list">
              @for (a of filesFor(v.chain.enquiryId); track $index) {
                <li class="att">
                  @if (isImg(a)) {
                    <img [src]="a.dataUrl" [alt]="a.name" />
                  } @else {
                    <span class="att-ext">{{ ext(a.name) }}</span>
                  }
                  <span class="att-text"><strong>{{ a.name }}</strong><small>{{ role(a.role) }} · {{ size(a.size) }}</small></span>
                  @if (a.type === 'application/pdf') {
                    <button type="button" class="btn btn-sm" (click)="openFile(a)">Open</button>
                  }
                  <button type="button" class="btn btn-sm" (click)="downloadFile(a)">Download</button>
                </li>
              }
            </ul>
            @if (filesFor(v.chain.enquiryId).length > 1) {
              <button type="button" class="btn btn-sm" (click)="downloadAll(filesFor(v.chain.enquiryId))">Download all</button>
            }
          }
        </div>
        <footer>
          <select class="sel exp" aria-label="Export" (change)="onDocExport($event, v.kind, v.doc)">
            <option value="">Export…</option>
            <option value="print">Print</option>
            <option value="pdf">PDF</option>
            <option value="word">Word</option>
            <option value="csv">CSV</option>
          </select>
          @if (v.kind === 'quotation') {
            <button type="button" class="btn" (click)="editQuote(v.chain.quotation!)" [disabled]="!!v.chain.invoice" [attr.title]="v.chain.invoice ? 'Already invoiced: edit the invoice instead' : null">Edit</button>
            <button type="button" class="btn btn-dark" (click)="makeInvoice(v.chain.quotation!)" [disabled]="!!v.chain.invoice">{{ v.chain.invoice ? 'Invoiced' : 'Create invoice' }}</button>
          }
          @if (v.kind === 'invoice') {
            @if (v.chain.invoice!.status === 'unpaid') {
              <button type="button" class="btn" (click)="markPaid(v.chain.invoice!)">Mark paid</button>
            } @else if (v.chain.invoice!.status === 'paid') {
              <button type="button" class="btn" (click)="store.setInvoiceStatus(v.chain.invoice!.id, 'unpaid')">Mark unpaid</button>
            }
            <button type="button" class="btn btn-dark" (click)="makeOrder(v.chain.invoice!)" [disabled]="!!v.chain.order">{{ v.chain.order ? 'Ordered' : 'Create order' }}</button>
          }
          @if (v.kind === 'order') {
            <select class="sel" aria-label="Order stage" [ngModel]="v.chain.order!.stage" (ngModelChange)="setStage(v.chain.order!, $event)">
              @for (st of stages; track st.key) { <option [value]="st.key">{{ st.label }}</option> }
              <option value="cancelled">Cancelled</option>
            </select>
          }
        </footer>
      </div>
    }
  `,
  styles: [
    `
      :host {
        display: block;
        --ui-card: #fff;
        --ui-line: #e4e0d6;
        --ui-primary: #3d4b37;
        --ui-soft: #eef2ea;
        --ui-muted: #7b776c;
      }
      .sd-head {
        display: flex;
        justify-content: space-between;
        align-items: flex-end;
        gap: 16px;
        margin-bottom: 14px;
      }
      .sd-kicker {
        font-size: 0.7rem;
        text-transform: uppercase;
        letter-spacing: 0.14em;
        color: var(--ui-muted);
        margin: 0 0 4px;
      }
      h1 { margin: 0; font-size: 1.6rem; }
      .sd-sub { margin: 4px 0 0; color: var(--ui-muted); font-size: 0.9rem; }
      .sd-head-actions { display: flex; gap: 8px; }

      .sd-flow {
        display: flex;
        align-items: center;
        gap: 10px;
        margin-bottom: 16px;
        flex-wrap: wrap;
      }
      .sd-flow i { color: var(--ui-muted); font-style: normal; }
      .flow-step {
        background: var(--ui-card);
        border: 1px solid var(--ui-line);
        border-radius: 10px;
        padding: 8px 16px;
        display: flex;
        align-items: baseline;
        gap: 8px;
        opacity: 0.7;
      }
      .flow-step b { font-size: 1.15rem; }
      .flow-step span { font-size: 0.78rem; color: var(--ui-muted); }
      .flow-step.on { opacity: 1; border-color: var(--ui-primary); background: var(--ui-soft); }

      .alert { background: #fbe9e7; border: 1px solid #f1c5bd; padding: 10px 14px; border-radius: 8px; margin-bottom: 12px; }
      .note { background: var(--ui-soft); border: 1px solid #d3dcc9; padding: 10px 14px; border-radius: 8px; margin-bottom: 12px; }

      .panel { background: var(--ui-card); border: 1px solid var(--ui-line); border-radius: 12px; overflow: hidden; }
      .toolbar { display: flex; gap: 12px; align-items: center; padding: 12px 14px; border-bottom: 1px solid var(--ui-line); flex-wrap: wrap; }
      .search { flex: 1 1 260px; padding: 9px 12px; border: 1px solid var(--ui-line); border-radius: 8px; font: inherit; }
      .chips { display: flex; gap: 6px; flex-wrap: wrap; }
      .top-chips { margin-bottom: 14px; }
      .chip {
        border: 1px solid var(--ui-line); background: #fff; border-radius: 999px;
        padding: 6px 12px; font: inherit; font-size: 0.8rem; cursor: pointer; text-transform: capitalize;
      }
      .chip em { font-style: normal; color: var(--ui-muted); margin-left: 4px; }
      .chip.active { background: var(--ui-primary); color: #fff; border-color: var(--ui-primary); }
      .chip.active em { color: #dfe8d8; }

      .table-wrap { overflow-x: auto; }
      table.data { width: 100%; border-collapse: collapse; font-size: 0.88rem; }
      table.data th { text-align: left; font-size: 0.7rem; text-transform: uppercase; letter-spacing: 0.08em; color: var(--ui-muted); padding: 10px 14px; border-bottom: 1px solid var(--ui-line); white-space: nowrap; }
      table.data td { padding: 12px 14px; border-bottom: 1px solid #f0ede5; vertical-align: top; }
      table.data td small { display: block; color: var(--ui-muted); font-size: 0.76rem; margin-top: 2px; }
      table.data tr:last-child td { border-bottom: 0; }
      .row-click { cursor: pointer; }
      .row-click:hover td { background: #faf8f3; }
      .right { text-align: right; }
      .nowrap { white-space: nowrap; }
      .overdue { color: #b3261e; font-weight: 600; }
      .muted { color: var(--ui-muted); }
      .empty { padding: 36px 20px; text-align: center; color: var(--ui-muted); }

      .badge { display: inline-block; padding: 3px 10px; border-radius: 999px; font-size: 0.72rem; font-weight: 600; text-transform: capitalize; background: #eee; color: #444; }
      .b-new { background: #fff1d6; color: #8a5a00; }
      .b-quoted, .b-confirmed, .b-unpaid { background: #e3ecfb; color: #1d4f9c; }
      .b-closed, .b-void, .b-cancelled { background: #ececec; color: #555; }
      .b-paid, .b-delivered { background: #dcf1de; color: #1e6a2b; }
      .b-production { background: #fbe8d4; color: #9a4a00; }
      .b-shipped { background: #e6e0f7; color: #4a2f9a; }
      .pill { font-size: 0.74rem; background: var(--ui-soft); border-radius: 999px; padding: 2px 9px; }

      .btn { border: 1px solid var(--ui-line); background: #fff; padding: 9px 14px; border-radius: 8px; cursor: pointer; font: inherit; font-size: 0.85rem; text-decoration: none; color: inherit; display: inline-block; }
      .btn:hover:not(:disabled) { border-color: var(--ui-primary); }
      .btn:disabled { opacity: 0.5; cursor: default; }
      .btn-sm { padding: 5px 10px; font-size: 0.76rem; margin-left: 4px; }
      .btn-dark { background: var(--ui-primary); color: #fff; border-color: var(--ui-primary); }
      .btn-danger { color: #b3261e; background: #fdf0ee; border-color: #f1c5bd; }
      .sel { padding: 5px 8px; border: 1px solid var(--ui-line); border-radius: 6px; font: inherit; font-size: 0.8rem; }

      .kpis { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 12px; margin-bottom: 14px; }
      .kpi { background: var(--ui-card); border: 1px solid var(--ui-line); border-radius: 12px; padding: 14px 16px; }
      .kpi span { display: block; font-size: 0.72rem; text-transform: uppercase; letter-spacing: 0.08em; color: var(--ui-muted); }
      .kpi b { font-size: 1.4rem; }

      .order-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(340px, 1fr)); gap: 14px; }
      .order-card { background: var(--ui-card); border: 1px solid var(--ui-line); border-radius: 12px; padding: 16px; display: flex; flex-direction: column; gap: 12px; }
      .order-card header { display: flex; justify-content: space-between; gap: 10px; }
      .order-card header small { display: block; color: var(--ui-muted); font-size: 0.78rem; }
      .order-items { list-style: none; margin: 0; padding: 0; font-size: 0.85rem; }
      .order-items li { display: flex; justify-content: space-between; padding: 3px 0; border-bottom: 1px dashed #eee; }
      .order-items em { font-style: normal; color: var(--ui-muted); }
      .order-meta { display: flex; justify-content: space-between; font-size: 0.82rem; color: var(--ui-muted); }
      .order-meta b { color: #111; }
      .stepper { display: grid; grid-template-columns: repeat(4, 1fr); gap: 6px; }
      .step { border: 1px solid var(--ui-line); background: #fff; border-radius: 8px; padding: 7px 4px; font: inherit; font-size: 0.7rem; cursor: pointer; display: flex; flex-direction: column; align-items: center; gap: 4px; }
      .step i { font-style: normal; width: 20px; height: 20px; border-radius: 50%; background: #eee; display: grid; place-items: center; font-size: 0.7rem; }
      .step.done { border-color: var(--ui-primary); background: var(--ui-soft); }
      .step.done i { background: var(--ui-primary); color: #fff; }
      .order-foot { display: flex; gap: 6px; align-items: center; flex-wrap: wrap; }
      .track { flex: 1 1 140px; padding: 6px 10px; border: 1px solid var(--ui-line); border-radius: 6px; font: inherit; font-size: 0.8rem; }

      .scrim { position: fixed; inset: 0; background: rgba(20, 22, 18, 0.45); z-index: 80; }
      .drawer { position: fixed; top: 0; right: 0; bottom: 0; width: min(520px, 100vw); background: #fff; z-index: 90; display: flex; flex-direction: column; box-shadow: -12px 0 40px rgba(0,0,0,0.18); animation: slidein 0.22s ease; }
      @keyframes slidein { from { transform: translateX(40px); opacity: 0; } to { transform: none; opacity: 1; } }
      .drawer header, .modal header { display: flex; justify-content: space-between; align-items: center; padding: 16px 20px; border-bottom: 1px solid var(--ui-line); }
      .drawer header small { display: block; color: var(--ui-muted); font-size: 0.78rem; }
      .drawer-body { flex: 1; overflow-y: auto; padding: 8px 20px 20px; }
      .drawer-body section { padding: 14px 0; border-bottom: 1px solid #f0ede5; }
      .drawer-body h3, .modal h3 { margin: 0 0 8px; font-size: 0.72rem; text-transform: uppercase; letter-spacing: 0.1em; color: var(--ui-muted); }
      dl { display: grid; grid-template-columns: 90px 1fr; gap: 6px 10px; margin: 0; font-size: 0.88rem; }
      dt { color: var(--ui-muted); }
      dd { margin: 0; word-break: break-word; }
      .msg { white-space: pre-wrap; font: inherit; font-size: 0.88rem; margin: 0; background: #faf8f3; border: 1px solid var(--ui-line); border-radius: 8px; padding: 12px; max-height: 260px; overflow: auto; }
      .att-list { list-style: none; margin: 0 0 8px; padding: 0; display: flex; flex-direction: column; gap: 6px; }
      .att { display: flex; align-items: center; gap: 10px; padding: 8px 10px; border: 1px solid var(--ui-line); border-radius: 10px; background: #fff; }
      .att img { width: 56px; height: 56px; object-fit: contain; border-radius: 6px; background: repeating-conic-gradient(#f3f1ea 0 25%, #fff 0 50%) 0 / 12px 12px; flex: none; }
      .att-ext { width: 56px; height: 56px; border-radius: 6px; background: var(--ui-soft); color: var(--ui-primary); display: inline-flex; align-items: center; justify-content: center; font-size: 0.72rem; font-weight: 800; flex: none; }
      .att-text { flex: 1; min-width: 0; display: flex; flex-direction: column; }
      .att-text strong { font-size: 0.86rem; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .att-text small { font-size: 0.72rem; color: var(--ui-muted); }
      .cust-files { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; margin: 4px 0 12px; font-size: 0.8rem; }
      .file-chip { display: inline-flex; align-items: center; gap: 6px; border: 1px solid var(--ui-line); border-radius: 999px; background: #fff; padding: 3px 10px 3px 4px; font: inherit; font-size: 0.76rem; cursor: pointer; }
      .file-chip img { width: 22px; height: 22px; object-fit: cover; border-radius: 50%; }
      .file-chip i { font-style: normal; font-weight: 800; font-size: 0.6rem; background: var(--ui-soft); border-radius: 50%; width: 22px; height: 22px; display: inline-flex; align-items: center; justify-content: center; }
      .sample { max-width: 100%; max-height: 260px; display: block; margin-bottom: 8px; border: 1px solid var(--ui-line); border-radius: 8px; background: repeating-conic-gradient(#f3f1ea 0 25%, #fff 0 50%) 0 / 16px 16px; object-fit: contain; }
      textarea, .modal input, .modal select { width: 100%; box-sizing: border-box; padding: 9px 11px; border: 1px solid var(--ui-line); border-radius: 8px; font: inherit; font-size: 0.88rem; }
      textarea { margin-bottom: 8px; resize: vertical; }
      ul.plain { margin: 0; padding-left: 18px; font-size: 0.86rem; }
      .drawer footer, .modal footer { display: flex; justify-content: flex-end; gap: 8px; padding: 14px 20px; border-top: 1px solid var(--ui-line); }

      .modal { position: fixed; z-index: 90; top: 5vh; left: 50%; transform: translateX(-50%); width: min(820px, 94vw); max-height: 90vh; background: #fff; border-radius: 14px; display: flex; flex-direction: column; box-shadow: 0 30px 80px rgba(0,0,0,0.3); }
      .modal header h2 { margin: 0; font-size: 1.1rem; }
      .modal-body { overflow-y: auto; padding: 16px 20px; }
      .modal label { display: block; font-size: 0.74rem; color: var(--ui-muted); margin-bottom: 10px; }
      .modal label input, .modal label select, .modal label textarea { margin-top: 4px; color: #111; }
      .grid2 { display: grid; grid-template-columns: 1fr 1fr; gap: 0 12px; }
      .grid4 { display: grid; grid-template-columns: repeat(4, 1fr); gap: 0 12px; margin-top: 8px; }
      .items { display: flex; flex-direction: column; gap: 6px; margin-bottom: 8px; }
      .item { display: grid; grid-template-columns: 1fr 80px 110px 110px 28px; gap: 6px; align-items: center; }
      .item.head { font-size: 0.7rem; text-transform: uppercase; letter-spacing: 0.08em; color: var(--ui-muted); }
      .item .amt { text-align: right; font-size: 0.85rem; }
      .x { border: 0; background: transparent; font-size: 1.3rem; cursor: pointer; line-height: 1; color: var(--ui-muted); }
      .totals { margin-left: auto; width: 280px; margin-top: 8px; }
      .totals div { display: flex; justify-content: space-between; padding: 4px 0; font-size: 0.88rem; }
      .totals .grand { border-top: 1px solid var(--ui-line); margin-top: 4px; padding-top: 8px; font-size: 1.05rem; }

      .sel.exp, .doc-modal footer select, .drawer footer select { width: auto; flex: none; }
      .doc-modal footer, .drawer footer { align-items: center; flex-wrap: wrap; }
      .sel.exp { padding: 6px 8px; border: 1px solid var(--ui-line); border-radius: 8px; background: #fff; font: inherit; font-size: 0.78rem; cursor: pointer; }
      .backup { margin: 14px 2px 0; font-size: 0.8rem; color: var(--ui-muted); }
      .link { border: 0; background: none; padding: 0; font: inherit; color: var(--ui-primary); text-decoration: underline; cursor: pointer; }
      .picker { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; padding: 10px; margin-bottom: 10px; background: var(--ui-soft); border: 1px solid #d8e0d1; border-radius: 10px; }
      .picker select, .picker input { padding: 7px 8px; margin: 0; width: auto; border: 1px solid var(--ui-line); border-radius: 8px; background: #fff; font: inherit; font-size: 0.82rem; max-width: 100%; }
      .picker > select:first-child { flex: 1 1 100%; }
      .picker > select:not(:first-child) { flex: 1 1 130px; min-width: 0; }
      .picker input { width: 84px; }
      .pick-price { display: flex; flex-direction: column; font-size: 0.86rem; font-weight: 700; margin-left: auto; }
      .pick-price small { font-weight: 400; color: var(--ui-muted); font-size: 0.7rem; }
      .item-hint { font-size: 0.72rem; color: var(--ui-muted); margin: -2px 0 4px 2px; }
      .doc-modal { width: min(860px, 94vw); }
      .doc-modal header { display: flex; justify-content: space-between; align-items: flex-start; padding: 14px 20px; border-bottom: 1px solid var(--ui-line); }
      .chain { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; margin-bottom: 14px; }
      .chain i { font-style: normal; color: var(--ui-muted); }
      .chain-chip { display: flex; flex-direction: column; text-align: left; border: 1px solid var(--ui-line); background: #fff; border-radius: 10px; padding: 6px 12px; font: inherit; font-size: 0.82rem; font-weight: 700; cursor: pointer; }
      .chain-chip small { font-weight: 400; font-size: 0.66rem; text-transform: uppercase; letter-spacing: 0.08em; color: var(--ui-muted); }
      .chain-chip.on { border-color: var(--ui-primary); background: var(--ui-soft); }
      .chain-chip:disabled { opacity: 0.45; cursor: default; }
      .doc-parties h3 { margin: 0 0 6px; font-size: 0.78rem; text-transform: uppercase; letter-spacing: 0.08em; color: var(--ui-muted); }
      .lines { margin: 0 0 12px; font-size: 0.88rem; line-height: 1.5; }
      .doc-items { width: 100%; border-collapse: collapse; margin-top: 4px; }
      .doc-items th, .doc-items td { padding: 8px; border-bottom: 1px solid var(--ui-line); text-align: left; font-size: 0.86rem; }
      .doc-items th.right, .doc-items td.right { text-align: right; }
      .muted { color: var(--ui-muted); }

      @media (max-width: 720px) {
        .picker { flex-direction: column; align-items: stretch; }
        .pick-price { margin-left: 0; }
        .grid2, .grid4 { grid-template-columns: 1fr 1fr; }
        .item { grid-template-columns: 1fr 60px 80px; }
        .item .amt, .item.head span:nth-child(4) { display: none; }
        .sd-head { flex-direction: column; align-items: flex-start; }
      }
    `,
  ],
})
export class AdminSalesDeskComponent implements OnInit {
  readonly section = input.required<SalesSection>();

  private readonly catalog = inject(CatalogService);
  readonly store = inject(SalesDeskStore);

  readonly titles: Record<SalesSection, string> = {
    enquiries: 'Inquiries',
    quotations: 'Quotations',
    invoices: 'Invoices',
    orders: 'Orders',
  };
  readonly subtitles: Record<SalesSection, string> = {
    enquiries: 'Quote requests and uploaded logos/designs from customers.',
    quotations: 'Price offers built from inquiries. Send, print or convert to an invoice.',
    invoices: 'Bills raised from accepted quotations. Track payment status.',
    orders: 'Production and delivery pipeline for confirmed orders.',
  };

  readonly stages = STAGES;
  readonly enqStatuses = [
    { key: '', label: 'All' },
    { key: 'new', label: 'New' },
    { key: 'quoted', label: 'Quoted' },
    { key: 'closed', label: 'Closed' },
  ];
  readonly enqStatusOnly: Array<Enquiry['status']> = ['new', 'quoted', 'closed'];
  readonly orderFilters = [
    { key: '', label: 'All' },
    { key: 'confirmed', label: 'Confirmed' },
    { key: 'production', label: 'In production' },
    { key: 'shipped', label: 'Shipped' },
    { key: 'delivered', label: 'Delivered' },
    { key: 'cancelled', label: 'Cancelled' },
  ];

  readonly enquiries = signal<Enquiry[]>([]);
  /** The files each inquiry holds, read out of the database copy once per load. */
  private readonly filesByEnquiry = computed(() => {
    const map = new Map<string, Attachment[]>();
    for (const e of this.enquiries()) {
      const list = unpackAttachments(e.sampleName, e.sampleDataUrl);
      if (list.length) map.set(e.id, list);
    }
    return map;
  });
  readonly loading = signal(false);
  readonly error = signal('');
  readonly note = signal('');
  readonly enqSearch = signal('');
  readonly enqStatus = signal('');
  readonly docSearch = signal('');
  readonly orderFilter = signal('');
  readonly selected = signal<Enquiry | null>(null);
  readonly quoteForm = signal<QuoteForm | null>(null);
  notesDraft = '';

  readonly products = signal<Product[]>([]);
  readonly attrDefs = signal<AttributeDefinition[]>([]);
  readonly viewRef = signal<{ kind: DocKind; id: string } | null>(null);
  readonly restoreInput = viewChild<ElementRef<HTMLInputElement>>('restoreFile');
  /** The product row above the quotation lines. */
  pick = { productId: '', colorId: '', decoration: '', qty: 300 };

  /** The opened quotation / invoice / order with everything linked to it. */
  readonly docView = computed(() => {
    const ref = this.viewRef();
    if (!ref) return null;
    const doc: Quotation | Invoice | SalesOrder | undefined =
      ref.kind === 'quotation'
        ? this.store.quotations().find((d) => d.id === ref.id)
        : ref.kind === 'invoice'
          ? this.store.invoices().find((d) => d.id === ref.id)
          : this.store.orders().find((d) => d.id === ref.id);
    if (!doc) return null;
    const exp = this.toExportDoc(ref.kind, doc);
    return {
      kind: ref.kind,
      doc,
      chain: this.store.chainOf(doc),
      export: exp,
      title: exp.kind,
      statusLabel: exp.status,
    };
  });

  readonly filteredEnquiries = computed(() => {
    const q = this.enqSearch().trim().toLowerCase();
    const st = this.enqStatus();
    return this.enquiries().filter((e) => {
      if (st && e.status !== st) return false;
      if (!q) return true;
      return [e.ref, e.name, e.company, e.email, e.phone, e.segment, e.message]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(q));
    });
  });

  readonly filteredQuotations = computed(() => {
    const q = this.docSearch().trim().toLowerCase();
    return this.store
      .quotations()
      .filter(
        (d) =>
          !q ||
          [d.number, d.customer.name, d.customer.company, d.customer.email, d.enquiryRef]
            .filter(Boolean)
            .some((v) => String(v).toLowerCase().includes(q)),
      );
  });

  readonly filteredInvoices = computed(() => {
    const q = this.docSearch().trim().toLowerCase();
    return this.store
      .invoices()
      .filter(
        (d) =>
          !q ||
          [d.number, d.quotationNumber, d.customer.name, d.customer.company, d.customer.email]
            .filter(Boolean)
            .some((v) => String(v).toLowerCase().includes(q)),
      );
  });

  readonly filteredOrders = computed(() => {
    const f = this.orderFilter();
    return this.store.orders().filter((o) => !f || o.stage === f);
  });

  ngOnInit() {
    this.catalog.getAttributes().subscribe({
      next: (d) => this.attrDefs.set(d),
      error: () => undefined,
    });
    this.catalog.getAdminProducts({ limit: 100 }).subscribe({
      next: (r) => this.products.set(r.items || []),
      error: () => undefined,
    });
    this.loadEnquiries();
  }

  // ---------- Enquiries ----------
  loadEnquiries() {
    this.loading.set(true);
    this.catalog.getEnquiries().subscribe({
      next: (list) => {
        this.enquiries.set(list);
        this.loading.set(false);
        this.error.set('');
        const sel = this.selected();
        if (sel) this.selected.set(list.find((e) => e.id === sel.id) || null);
      },
      error: () => {
        this.loading.set(false);
        this.error.set('Failed to load inquiries. Check your connection or sign in again.');
      },
    });
  }

  enqCount(status: string): number {
    return status
      ? this.enquiries().filter((e) => e.status === status).length
      : this.enquiries().length;
  }

  openEnquiry(e: Enquiry) {
    this.selected.set(e);
    this.notesDraft = e.adminNotes || '';
  }

  closeEnquiry() {
    this.selected.set(null);
  }

  setEnquiryStatus(e: Enquiry, status: Enquiry['status']) {
    if (e.status === status) return;
    this.catalog.updateEnquiry(e.id, { status }).subscribe({
      next: () => {
        this.flash(`${e.ref} marked ${status}`);
        this.loadEnquiries();
      },
      error: (err) => this.error.set(err?.error?.message || 'Failed to update inquiry'),
    });
  }

  saveNotes(e: Enquiry) {
    this.catalog.updateEnquiry(e.id, { adminNotes: this.notesDraft }).subscribe({
      next: () => {
        this.flash('Notes saved');
        this.loadEnquiries();
      },
      error: (err) => this.error.set(err?.error?.message || 'Failed to save notes'),
    });
  }

  quotesFor(e: Enquiry): Quotation[] {
    return this.store.quotations().filter((q) => q.enquiryId === e.id);
  }

  isImage(url: string): boolean {
    return !url.startsWith('data:') || url.startsWith('data:image/');
  }

  sampleSrc(url: string): string {
    return url.startsWith('data:') ? url : this.catalog.normalizeMediaUrl(url);
  }

  encode(s: string): string {
    return encodeURIComponent(s);
  }

  // ---------- Quotations ----------
  openQuoteForm(e: Enquiry | null, existing?: Quotation) {
    this.pick = { productId: '', colorId: '', decoration: '', qty: 300 };
    if (existing) {
      this.quoteForm.set({
        id: existing.id,
        enquiry: this.enquiries().find((x) => x.id === existing.enquiryId) ?? null,
        customer: { ...existing.customer },
        items: existing.items.map((i) => ({ ...i, addons: i.addons ? [...i.addons] : undefined })),
        taxPct: existing.taxPct,
        discount: existing.discount,
        currency: existing.currency,
        notes: existing.notes,
        validUntil: existing.validUntil,
      });
      return;
    }
    const valid = new Date();
    valid.setDate(valid.getDate() + 14);
    this.quoteForm.set({
      id: null,
      enquiry: e,
      customer: e ? this.store.partyFromEnquiry(e) : this.store.emptyParty(),
      items: [e ? this.lineFromEnquiry(e) : { description: '', qty: 1, unitPrice: 0 }],
      taxPct: 0,
      discount: 0,
      currency: 'GBP',
      notes: 'Payment: 50% advance, 50% before dispatch. Prices exclude shipping.',
      validUntil: valid.toISOString().slice(0, 10),
    });
  }

  editQuote(q: Quotation) {
    this.closeDoc();
    this.openQuoteForm(null, q);
  }

  addItem(f: QuoteForm) {
    f.items.push({ description: '', qty: 1, unitPrice: 0 });
  }

  removeItem(f: QuoteForm, i: number) {
    f.items.splice(i, 1);
    if (!f.items.length) this.addItem(f);
  }

  formTotals(f: QuoteForm) {
    return docTotals(f);
  }

  // ---------- Pricing ----------
  /** Catalogue price per unit: colour price + add-ons, adjusted for the quantity band. */
  priceFor(it: LineItem): number {
    const p = this.products().find((x) => x.id === it.productId);
    if (!p) return Number(it.unitPrice) || 0;
    const base = effectiveUnitPrice(p, it.colorId);
    const prices = serviceAddOnsOf(p);
    const add = (it.addons || []).reduce((sum, k) => sum + (prices[k] || 0), 0);
    return Math.round((base + add) * quantityTierFactor(it.qty) * 100) / 100;
  }

  isCatalogueLine(it: LineItem): boolean {
    return !!it.productId;
  }

  isManualPrice(it: LineItem): boolean {
    return !!it.manualPrice;
  }

  tierFactor(qty: number): number {
    return quantityTierFactor(qty);
  }

  tierLabel(qty: number): string {
    return quantityTierLabel(qty);
  }

  onQty(it: LineItem) {
    if (it.productId && !it.manualPrice) it.unitPrice = this.priceFor(it);
  }

  onPrice(it: LineItem) {
    if (it.productId) it.manualPrice = true;
  }

  resetPrice(it: LineItem) {
    it.manualPrice = false;
    it.unitPrice = this.priceFor(it);
  }

  pickProduct(): Product | undefined {
    return this.products().find((p) => p.id === this.pick.productId);
  }

  pickDecorations(): string[] {
    return attributeLabelsOf(this.pickProduct(), 'decoration', this.attrDefs());
  }

  onPickProduct() {
    const p = this.pickProduct();
    this.pick.colorId = (p?.colors?.find((c) => c.isDefault) || p?.colors?.[0])?.id || '';
    this.pick.decoration = '';
  }

  private pickItem(): LineItem {
    return {
      description: '',
      qty: Math.max(1, Number(this.pick.qty) || 1),
      unitPrice: 0,
      productId: this.pick.productId,
      colorId: this.pick.colorId,
      addons: this.pick.decoration ? ['decoration:' + this.pick.decoration] : [],
    };
  }

  pickUnit(): number {
    return this.pick.productId ? this.priceFor(this.pickItem()) : 0;
  }

  addProductLine(f: QuoteForm) {
    const p = this.pickProduct();
    if (!p) return;
    const item = this.pickItem();
    const colour = p.colors?.find((c) => c.id === this.pick.colorId)?.name;
    item.description = [p.name, colour, this.pick.decoration].filter(Boolean).join(' · ');
    item.unitPrice = this.priceFor(item);
    const first = f.items[0];
    if (f.items.length === 1 && !first.description.trim() && !Number(first.unitPrice)) f.items = [item];
    else f.items.push(item);
  }

  /** Builds the first quotation line from what the customer sent (the Custom Designer's summary). */
  private lineFromEnquiry(e: Enquiry): LineItem {
    const spec: Record<string, string> = {};
    for (const line of (e.message || '').split(/\r?\n/)) {
      const i = line.indexOf(':');
      if (i > 0) spec[line.slice(0, i).trim().toLowerCase()] = line.slice(i + 1).trim();
    }
    const num = (v?: string) => Number((v || '').replace(/[^0-9.]/g, '')) || 0;
    const garment = spec['garment'];
    const product = garment
      ? this.products().find((p) => p.name.toLowerCase() === garment.toLowerCase())
      : undefined;
    const colour = product?.colors?.find((c) => c.name.toLowerCase() === (spec['colour'] || '').toLowerCase());
    const addons: string[] = [];
    if (spec['decoration']) addons.push('decoration:' + spec['decoration']);
    if (spec['placement']) addons.push('placement:' + spec['placement']);
    if (spec['gsm']) addons.push('gsm:' + spec['gsm']);
    for (const pl of (spec['private label'] || '').split(',').map((x) => x.trim()).filter(Boolean)) {
      addons.push('private_label:' + pl);
    }
    const description =
      [garment, spec['colour'], spec['style / neckline'], spec['sleeve'], spec['decoration'], spec['placement'], spec['fabric'], spec['gsm']]
        .filter(Boolean)
        .join(' · ') || (e.segment ? e.segment + ' – custom apparel' : '');
    const item: LineItem = { description, qty: num(spec['quantity']) || 1, unitPrice: 0 };
    if (product) {
      item.productId = product.id;
      item.colorId = colour?.id || (product.colors?.find((c) => c.isDefault) || product.colors?.[0])?.id || '';
      item.addons = addons;
      item.unitPrice = this.priceFor(item);
    } else if (num(spec['unit price'])) {
      item.unitPrice = num(spec['unit price']);
    }
    return item;
  }

  saveQuote(status: QuotationStatus) {
    const f = this.quoteForm();
    if (!f) return;
    if (!f.customer.name.trim()) {
      this.error.set('Customer name is required.');
      return;
    }
    const items = f.items
      .filter((i) => i.description.trim())
      .map((i) => ({
        ...i,
        description: i.description.trim(),
        qty: Number(i.qty) || 0,
        unitPrice: Number(i.unitPrice) || 0,
      }));
    if (!items.length) {
      this.error.set('Add at least one line item with a description.');
      return;
    }
    this.error.set('');
    const fields = {
      customer: f.customer,
      items,
      taxPct: Number(f.taxPct) || 0,
      discount: Number(f.discount) || 0,
      currency: f.currency,
      notes: f.notes,
      validUntil: f.validUntil,
      status,
    };
    this.quoteForm.set(null);
    if (f.id) {
      this.store.updateQuotation(f.id, fields);
      this.flash('Quotation updated');
      if (status === 'sent') this.syncEnquiry(f.enquiry?.id ?? null, 'quoted');
      return;
    }
    const q = this.store.createQuotation({ enquiry: f.enquiry, ...fields });
    this.flash(q.number + ' created');
    this.syncEnquiry(f.enquiry?.id ?? null, 'quoted');
  }

  /** Keeps the inquiry's status in step with its quotation / order. */
  private syncEnquiry(id: string | null, status: Enquiry['status']) {
    if (!id) return;
    const e = this.enquiries().find((x) => x.id === id);
    if (!e || e.status === status) return;
    if (status === 'quoted' && e.status !== 'new') return;
    this.catalog.updateEnquiry(id, { status }).subscribe({
      next: () => this.loadEnquiries(),
      error: () => undefined,
    });
  }

  setQuoteStatus(q: Quotation, status: QuotationStatus) {
    this.store.updateQuotation(q.id, { status });
    if (status === 'sent') this.syncEnquiry(q.enquiryId, 'quoted');
  }

  openQuoteDoc(q: Quotation) {
    this.closeEnquiry();
    this.openDoc('quotation', q.id);
  }

  removeQuote(q: Quotation) {
    if (confirm(`Delete quotation ${q.number}?`)) this.store.deleteQuotation(q.id);
  }

  invoiceFor(q: Quotation): Invoice | undefined {
    return this.store.invoices().find((i) => i.quotationId === q.id);
  }

  makeInvoice(q: Quotation) {
    const inv = this.store.createInvoiceFromQuotation(q);
    this.flash(`${inv.number} created from ${q.number}`);
  }

  // ---------- Invoices / Orders ----------
  isOverdue(i: Invoice): boolean {
    return i.status === 'unpaid' && !!i.dueDate && i.dueDate < new Date().toISOString().slice(0, 10);
  }

  orderFor(i: Invoice): SalesOrder | undefined {
    return this.store.orders().find((o) => o.invoiceId === i.id);
  }

  removeInvoice(i: Invoice) {
    if (confirm(`Delete invoice ${i.number}?`)) this.store.deleteInvoice(i.id);
  }

  makeOrder(i: Invoice) {
    const o = this.store.createOrderFromInvoice(i);
    this.flash(`${o.number} created from ${i.number}`);
  }

  /** Paying an invoice moves the business on: the order is created if it does not exist yet. */
  markPaid(i: Invoice) {
    this.store.setInvoiceStatus(i.id, 'paid');
    if (!this.orderFor(i)) {
      const o = this.store.createOrderFromInvoice(i);
      this.flash(`${i.number} paid · ${o.number} created`);
    } else {
      this.flash(`${i.number} marked paid`);
    }
  }

  setStage(o: SalesOrder, stage: OrderStage) {
    this.store.setOrderStage(o.id, stage);
    if (stage === 'delivered') this.syncEnquiry(o.enquiryId, 'closed');
  }

  kpi(status: 'paid' | 'unpaid'): string {
    const by = new Map<string, number>();
    for (const i of this.store.invoices().filter((x) => x.status === status)) {
      by.set(i.currency, (by.get(i.currency) || 0) + docTotals(i).total);
    }
    return by.size ? [...by].map(([c, n]) => this.money(n, c)).join(' + ') : this.money(0, 'GBP');
  }

  removeOrder(o: SalesOrder) {
    if (confirm(`Delete order ${o.number}?`)) this.store.deleteOrder(o.id);
  }

  orderCount(key: string): number {
    return key
      ? this.store.orders().filter((o) => o.stage === key).length
      : this.store.orders().length;
  }

  stageIndex(stage: OrderStage): number {
    return STAGES.findIndex((s) => s.key === stage);
  }

  // ---------- Customer files ----------
  filesFor(enquiryId: string | null | undefined): Attachment[] {
    return (enquiryId && this.filesByEnquiry().get(enquiryId)) || [];
  }

  attLabel(e: Enquiry): string {
    const n = this.filesFor(e.id).length;
    return n ? `📎 ${n} file${n === 1 ? '' : 's'}` : '—';
  }

  isImg(a: Attachment): boolean {
    return isImageAttachment(a);
  }
  ext(name: string): string {
    return fileExt(name);
  }
  role(r: Attachment['role']): string {
    return roleLabel(r);
  }
  size(n: number): string {
    return sizeLabel(n);
  }
  downloadFile(a: Attachment) {
    downloadAttachment(a);
  }
  openFile(a: Attachment) {
    openAttachment(a);
  }

  downloadAll(list: Attachment[]) {
    list.forEach((a, i) => setTimeout(() => downloadAttachment(a), i * 350));
  }

  stageLabel(stage: OrderStage): string {
    return STAGES.find((s) => s.key === stage)?.label || 'Cancelled';
  }

  chainOf(d: Quotation | Invoice | SalesOrder): DocChain {
    return this.store.chainOf(d);
  }

  // ---------- helpers ----------
  totals(d: Parameters<typeof docTotals>[0]) {
    return docTotals(d);
  }

  money(n: number, currency: string): string {
    return fmtMoney(n, currency);
  }

  fmt(iso: string): string {
    return fmtDate(iso);
  }

  private flash(msg: string) {
    this.note.set(msg);
    setTimeout(() => {
      if (this.note() === msg) this.note.set('');
    }, 3500);
  }

  // ---------- Document view ----------
  openDoc(kind: DocKind, id: string) {
    this.viewRef.set({ kind, id });
  }

  closeDoc() {
    this.viewRef.set(null);
  }

  enquiryOf(id: string | null): Enquiry | undefined {
    return id ? this.enquiries().find((e) => e.id === id) : undefined;
  }

  openEnquiryById(id: string | null) {
    const e = this.enquiryOf(id);
    if (!e) return;
    this.closeDoc();
    this.openEnquiry(e);
  }

  // ---------- Export ----------
  toExportDoc(kind: DocKind, d: Quotation | Invoice | SalesOrder): ExportDoc {
    const t = docTotals(d);
    const chain = this.store.chainOf(d);
    const meta: Array<[string, string]> = [];
    let status = '';
    let label: ExportDoc['kind'] = 'Quotation';
    if (kind === 'quotation') {
      const q = d as Quotation;
      status = q.status;
      meta.push(['Valid until', q.validUntil || '—']);
      if (chain.invoice) meta.push(['Invoice', chain.invoice.number]);
    } else if (kind === 'invoice') {
      const i = d as Invoice;
      label = 'Invoice';
      status = i.status;
      meta.push(['Due date', i.dueDate]);
      if (i.quotationNumber) meta.push(['From quotation', i.quotationNumber]);
      if (i.paidAt) meta.push(['Paid on', fmtDate(i.paidAt)]);
      if (chain.order) meta.push(['Order', chain.order.number]);
    } else {
      const o = d as SalesOrder;
      label = 'Order';
      status = this.stageLabel(o.stage);
      if (o.tracking) meta.push(['Tracking', o.tracking]);
      if (o.invoiceNumber) meta.push(['Invoice', o.invoiceNumber]);
      if (o.quotationNumber) meta.push(['Quotation', o.quotationNumber]);
    }
    return {
      kind: label,
      number: d.number,
      createdAt: d.createdAt,
      status,
      files: this.filesFor(d.enquiryId).map((a) => ({
        name: a.name,
        role: roleLabel(a.role),
        type: a.type,
        size: a.size,
        dataUrl: isImageAttachment(a) ? a.dataUrl : undefined,
      })),
      customer: { ...d.customer },
      enquiryRef: d.enquiryRef,
      meta,
      items: d.items.map((i) => ({ description: i.description, qty: i.qty, unitPrice: i.unitPrice })),
      currency: d.currency,
      taxPct: d.taxPct,
      subtotal: t.subtotal,
      discount: t.discount,
      tax: t.tax,
      total: t.total,
      notes: d.notes,
    };
  }

  async exportDoc(kind: DocKind, d: Quotation | Invoice | SalesOrder, format: ExportFormat) {
    const doc = this.toExportDoc(kind, d);
    const base = safeFileName(`${doc.kind}-${doc.number}`);
    if (format === 'print') this.printHtml(docToHtml(doc, true));
    else if (format === 'pdf') downloadBlob(base + '.pdf', docToPdf(await prepareFilesForPdf(doc)));
    else if (format === 'word') downloadBlob(base + '.doc', docToWord(doc));
    else downloadBlob(base + '.csv', docToCsv(doc));
  }

  onDocExport(ev: Event, kind: DocKind, d: Quotation | Invoice | SalesOrder) {
    const sel = ev.target as HTMLSelectElement;
    const format = sel.value as ExportFormat | '';
    sel.value = '';
    if (format) this.exportDoc(kind, d, format);
  }

  private exportTable(t: ExportTable, file: string, format: ExportFormat) {
    const base = safeFileName(file + '-' + new Date().toISOString().slice(0, 10));
    if (format === 'print') this.printHtml(tableToHtml(t, true));
    else if (format === 'pdf') downloadBlob(base + '.pdf', tableToPdf(t));
    else if (format === 'word') downloadBlob(base + '.doc', tableToWord(t));
    else downloadBlob(base + '.csv', tableToCsv(t));
  }

  private printHtml(html: string) {
    if (!openPrint(html)) this.error.set('Pop-up blocked. Allow pop-ups to print.');
  }

  /** The list on screen (with its search / filters) as a table. */
  private listTable(format: ExportFormat): { table: ExportTable; file: string } {
    const sub = new Date().toLocaleDateString('en-GB') + ' · Threadgaff';
    const sec = this.section();
    if (sec === 'enquiries') {
      const columns = ['Ref', 'Received', 'Name', 'Company', 'Email', 'Phone', 'Segment', 'Status'];
      if (format === 'csv') columns.push('Message');
      return {
        file: 'inquiries',
        table: {
          title: 'Inquiries',
          subtitle: sub,
          columns,
          rows: this.filteredEnquiries().map((e) => {
            const row = [e.ref, fmtDate(e.createdAt), e.name, e.company || '', e.email, e.phone || '', e.segment || '', e.status];
            if (format === 'csv') row.push(e.message || '');
            return row;
          }),
        },
      };
    }
    if (sec === 'quotations') {
      return {
        file: 'quotations',
        table: {
          title: 'Quotations',
          subtitle: sub,
          columns: ['No.', 'Date', 'Customer', 'Company', 'Inquiry', 'Valid until', 'Total', 'Status'],
          right: [6],
          rows: this.filteredQuotations().map((q) => [
            q.number, fmtDate(q.createdAt), q.customer.name, q.customer.company, q.enquiryRef || '',
            q.validUntil || '', fmtMoney(docTotals(q).total, q.currency), q.status,
          ]),
        },
      };
    }
    if (sec === 'invoices') {
      return {
        file: 'invoices',
        table: {
          title: 'Invoices',
          subtitle: sub,
          columns: ['No.', 'Date', 'Customer', 'Quotation', 'Due', 'Total', 'Status'],
          right: [5],
          rows: this.filteredInvoices().map((i) => [
            i.number, fmtDate(i.createdAt), i.customer.name, i.quotationNumber || '', i.dueDate,
            fmtMoney(docTotals(i).total, i.currency), i.status,
          ]),
        },
      };
    }
    return {
      file: 'orders',
      table: {
        title: 'Orders',
        subtitle: sub,
        columns: ['No.', 'Date', 'Customer', 'Invoice', 'Items', 'Total', 'Stage', 'Tracking'],
        right: [5],
        rows: this.filteredOrders().map((o) => [
          o.number, fmtDate(o.createdAt), o.customer.name, o.invoiceNumber || '',
          o.items.map((x) => x.description + ' × ' + x.qty).join('; '),
          fmtMoney(docTotals(o).total, o.currency), this.stageLabel(o.stage), o.tracking || '',
        ]),
      },
    };
  }

  onListExport(ev: Event) {
    const sel = ev.target as HTMLSelectElement;
    const format = sel.value as ExportFormat | '';
    sel.value = '';
    if (!format) return;
    const { table, file } = this.listTable(format);
    this.exportTable(table, file, format);
  }

  onEnquiryExport(ev: Event, e: Enquiry) {
    const sel = ev.target as HTMLSelectElement;
    const format = sel.value as ExportFormat | '';
    sel.value = '';
    if (!format) return;
    const table: ExportTable = {
      title: 'Inquiry ' + e.ref,
      subtitle: 'Received ' + fmtDate(e.createdAt),
      columns: ['Field', 'Value'],
      rows: [
        ['Name', e.name], ['Company', e.company || ''], ['Email', e.email], ['Phone', e.phone || ''],
        ['Segment', e.segment || ''], ['Status', e.status], ['Attachment', e.sampleName || ''],
        ['Message', e.message || ''], ['Internal notes', e.adminNotes || ''],
      ],
    };
    this.exportTable(table, 'inquiry-' + e.ref, format);
  }

  // ---------- Backup ----------
  downloadBackup() {
    downloadBlob(
      `sales-desk-backup-${new Date().toISOString().slice(0, 10)}.json`,
      new Blob([this.store.exportBackup()], { type: 'application/json' }),
    );
  }

  chooseBackup() {
    this.restoreInput()?.nativeElement.click();
  }

  restoreBackup(ev: Event) {
    const input = ev.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    if (!confirm('Replace the quotations, invoices and orders in this browser with the ones in this backup?')) return;
    file
      .text()
      .then((t) => this.flash(`Backup restored (${this.store.importBackup(t)} documents)`))
      .catch((err: Error) => this.error.set(err.message || 'Could not read that backup file.'));
  }
}
