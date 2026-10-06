import { Component, OnInit, computed, inject, input, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { CatalogService, Enquiry } from '../../core/services/catalog.service';
import {
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

interface QuoteForm {
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
            <button type="button" class="btn" (click)="exportEnquiriesCsv()">Export CSV</button>
            <button type="button" class="btn" (click)="loadEnquiries()">Refresh</button>
          }
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
                      <td>{{ e.sampleDataUrl ? '📎 ' + (e.sampleName || 'file') : '—' }}</td>
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
                    <tr>
                      <td><b>{{ q.number }}</b><small>{{ fmt(q.createdAt) }}</small></td>
                      <td>{{ q.customer.name }}<small>{{ q.customer.company || q.customer.email }}</small></td>
                      <td>{{ q.enquiryRef || '—' }}</td>
                      <td>{{ q.validUntil || '—' }}</td>
                      <td class="right">{{ money(totals(q).total, q.currency) }}</td>
                      <td>
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
                      <td class="right nowrap">
                        <button type="button" class="btn btn-sm" (click)="print('Quotation', q)">Print / PDF</button>
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
          <div class="kpi"><span>Paid</span><b>{{ money(store.revenuePaid(), 'USD') }}</b></div>
          <div class="kpi"><span>Outstanding</span><b>{{ money(store.outstanding(), 'USD') }}</b></div>
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
                    <tr>
                      <td><b>{{ i.number }}</b><small>{{ fmt(i.createdAt) }}</small></td>
                      <td>{{ i.customer.name }}<small>{{ i.customer.company || i.customer.email }}</small></td>
                      <td>{{ i.quotationNumber || '—' }}</td>
                      <td [class.overdue]="isOverdue(i)">{{ i.dueDate }}{{ isOverdue(i) ? ' · overdue' : '' }}</td>
                      <td class="right">{{ money(totals(i).total, i.currency) }}</td>
                      <td><span class="badge" [class]="'b-' + i.status">{{ i.status }}</span></td>
                      <td class="right nowrap">
                        @if (i.status === 'unpaid') {
                          <button type="button" class="btn btn-sm" (click)="store.setInvoiceStatus(i.id, 'paid')">Mark paid</button>
                        } @else if (i.status === 'paid') {
                          <button type="button" class="btn btn-sm" (click)="store.setInvoiceStatus(i.id, 'unpaid')">Mark unpaid</button>
                        }
                        <button type="button" class="btn btn-sm" (click)="print('Invoice', i)">Print / PDF</button>
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
                        (click)="store.setOrderStage(o.id, s.key)"
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
                  <button type="button" class="btn btn-sm" (click)="print('Order', o)">Print</button>
                  @if (o.stage !== 'cancelled' && o.stage !== 'delivered') {
                    <button type="button" class="btn btn-sm btn-danger" (click)="store.setOrderStage(o.id, 'cancelled')">Cancel</button>
                  } @else if (o.stage === 'cancelled') {
                    <button type="button" class="btn btn-sm" (click)="store.setOrderStage(o.id, 'confirmed')">Reopen</button>
                  }
                  <button type="button" class="btn btn-sm btn-danger" (click)="removeOrder(o)">Delete</button>
                </div>
              </article>
            }
          </div>
        }
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

          @if (e.sampleDataUrl) {
            <section>
              <h3>Uploaded logo / design</h3>
              @if (isImage(e.sampleDataUrl)) {
                <img class="sample" [src]="sampleSrc(e.sampleDataUrl)" [alt]="e.sampleName || 'Uploaded design'" />
              }
              <a class="btn btn-sm" [href]="sampleSrc(e.sampleDataUrl)" target="_blank" rel="noopener" [attr.download]="e.sampleName || 'design'">
                Open / download {{ e.sampleName || 'file' }}
              </a>
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
                    <b>{{ q.number }}</b> · {{ q.status }} · {{ money(totals(q).total, q.currency) }}
                  </li>
                }
              </ul>
            </section>
          }
        </div>
        <footer>
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
          <h2>New quotation{{ f.enquiry ? ' · ' + f.enquiry.ref : '' }}</h2>
          <button type="button" class="x" (click)="quoteForm.set(null)" aria-label="Close">×</button>
        </header>
        <div class="modal-body">
          <div class="grid2">
            <label>Customer name<input type="text" [(ngModel)]="f.customer.name" /></label>
            <label>Company<input type="text" [(ngModel)]="f.customer.company" /></label>
            <label>Email<input type="email" [(ngModel)]="f.customer.email" /></label>
            <label>Phone<input type="text" [(ngModel)]="f.customer.phone" /></label>
          </div>

          <h3>Line items</h3>
          <div class="items">
            <div class="item head"><span>Description</span><span>Qty</span><span>Unit price</span><span>Amount</span><span></span></div>
            @for (it of f.items; track $index) {
              <div class="item">
                <input type="text" [(ngModel)]="it.description" placeholder="e.g. Custom hoodie · 380 GSM" />
                <input type="number" min="0" [(ngModel)]="it.qty" />
                <input type="number" min="0" step="0.01" [(ngModel)]="it.unitPrice" />
                <span class="amt">{{ money((it.qty || 0) * (it.unitPrice || 0), f.currency) }}</span>
                <button type="button" class="x" (click)="removeItem(f, $index)" aria-label="Remove line">×</button>
              </div>
            }
            <button type="button" class="btn btn-sm" (click)="addItem(f)">+ Add line</button>
          </div>

          <div class="grid4">
            <label>Currency
              <select [(ngModel)]="f.currency">
                <option>USD</option><option>EUR</option><option>GBP</option><option>PKR</option><option>AED</option>
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

      @media (max-width: 720px) {
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

  exportEnquiriesCsv() {
    const rows = this.filteredEnquiries();
    const head = ['Ref', 'Received', 'Name', 'Company', 'Email', 'Phone', 'Segment', 'Status', 'Message'];
    const esc = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""').replace(/\r?\n/g, ' ')}"`;
    const csv = [head.join(',')]
      .concat(
        rows.map((e) =>
          [e.ref, e.createdAt, e.name, e.company, e.email, e.phone, e.segment, e.status, e.message]
            .map(esc)
            .join(','),
        ),
      )
      .join('\n');
    this.download(`inquiries-${new Date().toISOString().slice(0, 10)}.csv`, csv, 'text/csv');
  }

  private download(name: string, content: string, type: string) {
    const url = URL.createObjectURL(new Blob([content], { type }));
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    a.click();
    URL.revokeObjectURL(url);
  }

  // ---------- Quotations ----------
  openQuoteForm(e: Enquiry | null) {
    const valid = new Date();
    valid.setDate(valid.getDate() + 14);
    this.quoteForm.set({
      enquiry: e,
      customer: e ? this.store.partyFromEnquiry(e) : this.store.emptyParty(),
      items: [
        {
          description: e?.segment ? `${e.segment} – custom apparel` : '',
          qty: 1,
          unitPrice: 0,
        },
      ],
      taxPct: 0,
      discount: 0,
      currency: 'USD',
      notes: 'Payment: 50% advance, 50% before dispatch. Prices exclude shipping.',
      validUntil: valid.toISOString().slice(0, 10),
    });
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
        description: i.description.trim(),
        qty: Number(i.qty) || 0,
        unitPrice: Number(i.unitPrice) || 0,
      }));
    if (!items.length) {
      this.error.set('Add at least one line item with a description.');
      return;
    }
    this.error.set('');
    const q = this.store.createQuotation({
      enquiry: f.enquiry,
      customer: f.customer,
      items,
      taxPct: Number(f.taxPct) || 0,
      discount: Number(f.discount) || 0,
      currency: f.currency,
      notes: f.notes,
      validUntil: f.validUntil,
      status,
    });
    this.quoteForm.set(null);
    this.flash(`${q.number} created`);
    if (f.enquiry && f.enquiry.status === 'new') {
      this.catalog.updateEnquiry(f.enquiry.id, { status: 'quoted' }).subscribe({
        next: () => this.loadEnquiries(),
        error: () => undefined,
      });
    }
  }

  setQuoteStatus(q: Quotation, status: QuotationStatus) {
    this.store.updateQuotation(q.id, { status });
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

  stageLabel(stage: OrderStage): string {
    return STAGES.find((s) => s.key === stage)?.label || 'Cancelled';
  }

  // ---------- helpers ----------
  totals(d: Parameters<typeof docTotals>[0]) {
    return docTotals(d);
  }

  money(n: number, currency: string): string {
    try {
      return new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(n || 0);
    } catch {
      return `${currency} ${(n || 0).toFixed(2)}`;
    }
  }

  fmt(iso: string): string {
    const d = new Date(iso);
    return isNaN(d.getTime())
      ? '—'
      : d.toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' });
  }

  private flash(msg: string) {
    this.note.set(msg);
    setTimeout(() => {
      if (this.note() === msg) this.note.set('');
    }, 3500);
  }

  /** Opens a print-ready document; use the browser's "Save as PDF". */
  print(kind: 'Quotation' | 'Invoice' | 'Order', d: Quotation | Invoice | SalesOrder) {
    const esc = (s: unknown) =>
      String(s ?? '').replace(/[&<>"']/g, (c) =>
        ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string,
      );
    const t = docTotals(d);
    const extra =
      'validUntil' in d
        ? `<p>Valid until: <b>${esc(d.validUntil || '—')}</b></p>`
        : 'dueDate' in d
          ? `<p>Due date: <b>${esc(d.dueDate)}</b> · Status: <b>${esc(d.status)}</b></p>`
          : `<p>Stage: <b>${esc(this.stageLabel((d as SalesOrder).stage))}</b>${
              (d as SalesOrder).tracking ? ' · Tracking: <b>' + esc((d as SalesOrder).tracking) + '</b>' : ''
            }</p>`;
    const rows = d.items
      .map(
        (i) =>
          `<tr><td>${esc(i.description)}</td><td class="r">${i.qty}</td><td class="r">${this.money(i.unitPrice, d.currency)}</td><td class="r">${this.money(i.qty * i.unitPrice, d.currency)}</td></tr>`,
      )
      .join('');
    const html = `<!doctype html><html><head><meta charset="utf-8"><title>${kind} ${esc(d.number)}</title>
<style>
body{font-family:Inter,Arial,sans-serif;color:#1c1c1c;margin:40px;font-size:13px}
h1{margin:0;font-size:24px;letter-spacing:.04em} .top{display:flex;justify-content:space-between;border-bottom:2px solid #3d4b37;padding-bottom:14px;margin-bottom:20px}
.brand{font-weight:700;letter-spacing:.2em;color:#3d4b37} table{width:100%;border-collapse:collapse;margin-top:18px}
th{background:#eef2ea;text-align:left;padding:8px;font-size:11px;text-transform:uppercase;letter-spacing:.06em}
td{padding:8px;border-bottom:1px solid #e4e0d6} .r{text-align:right}
.tot{margin-left:auto;width:260px;margin-top:16px} .tot div{display:flex;justify-content:space-between;padding:4px 0}
.tot .g{border-top:2px solid #3d4b37;font-weight:700;font-size:15px;margin-top:4px;padding-top:8px}
.notes{margin-top:26px;color:#555;white-space:pre-wrap}
@media print{body{margin:18px}}
</style></head><body>
<div class="top"><div><div class="brand">THREADGAFF</div><div>Custom apparel manufacturing</div></div>
<div style="text-align:right"><h1>${kind.toUpperCase()}</h1><div><b>${esc(d.number)}</b></div><div>${this.fmt(d.createdAt)}</div></div></div>
<p><b>Bill to</b><br>${esc(d.customer.name)}${d.customer.company ? '<br>' + esc(d.customer.company) : ''}${
      d.customer.email ? '<br>' + esc(d.customer.email) : ''
    }${d.customer.phone ? '<br>' + esc(d.customer.phone) : ''}</p>
${d.enquiryRef ? `<p>Inquiry ref: <b>${esc(d.enquiryRef)}</b></p>` : ''}${extra}
<table><thead><tr><th>Description</th><th class="r">Qty</th><th class="r">Unit price</th><th class="r">Amount</th></tr></thead><tbody>${rows}</tbody></table>
<div class="tot"><div><span>Subtotal</span><span>${this.money(t.subtotal, d.currency)}</span></div>
<div><span>Discount</span><span>− ${this.money(t.discount, d.currency)}</span></div>
<div><span>Tax (${d.taxPct}%)</span><span>${this.money(t.tax, d.currency)}</span></div>
<div class="g"><span>Total</span><span>${this.money(t.total, d.currency)}</span></div></div>
${d.notes ? `<div class="notes"><b>Notes / terms</b><br>${esc(d.notes)}</div>` : ''}
<script>window.onload=function(){setTimeout(function(){window.print()},250)}</script>
</body></html>`;
    const w = window.open('', '_blank');
    if (!w) {
      this.error.set('Pop-up blocked. Allow pop-ups to print or save as PDF.');
      return;
    }
    w.document.open();
    w.document.write(html);
    w.document.close();
  }
}
