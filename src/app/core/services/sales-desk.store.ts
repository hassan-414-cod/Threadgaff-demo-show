import { Injectable, computed, signal } from '@angular/core';
import type { Enquiry } from './catalog.service';

export interface LineItem {
  description: string;
  qty: number;
  unitPrice: number;
}

export interface Party {
  name: string;
  company: string;
  email: string;
  phone: string;
}

export type QuotationStatus = 'draft' | 'sent' | 'accepted' | 'rejected';
export type InvoiceStatus = 'unpaid' | 'paid' | 'void';
export type OrderStage =
  | 'confirmed'
  | 'production'
  | 'shipped'
  | 'delivered'
  | 'cancelled';

interface DocBase {
  id: string;
  number: string;
  enquiryId: string | null;
  enquiryRef: string | null;
  customer: Party;
  items: LineItem[];
  taxPct: number;
  discount: number;
  currency: string;
  notes: string;
  createdAt: string;
}

export interface Quotation extends DocBase {
  status: QuotationStatus;
  validUntil: string;
}

export interface Invoice extends DocBase {
  status: InvoiceStatus;
  dueDate: string;
  quotationId: string | null;
  quotationNumber: string | null;
  paidAt: string | null;
}

export interface SalesOrder extends DocBase {
  stage: OrderStage;
  invoiceId: string | null;
  invoiceNumber: string | null;
  quotationNumber: string | null;
  tracking: string;
  history: Array<{ stage: OrderStage; at: string }>;
}

const KEY = 'tg_sales_desk_v1';

export function docTotals(d: Pick<DocBase, 'items' | 'taxPct' | 'discount'>) {
  const subtotal = d.items.reduce(
    (s, i) => s + (Number(i.qty) || 0) * (Number(i.unitPrice) || 0),
    0,
  );
  const discount = Math.min(Number(d.discount) || 0, subtotal);
  const taxable = subtotal - discount;
  const tax = (taxable * (Number(d.taxPct) || 0)) / 100;
  return { subtotal, discount, tax, total: taxable + tax };
}

@Injectable({ providedIn: 'root' })
export class SalesDeskStore {
  readonly quotations = signal<Quotation[]>([]);
  readonly invoices = signal<Invoice[]>([]);
  readonly orders = signal<SalesOrder[]>([]);

  readonly revenuePaid = computed(() =>
    this.invoices()
      .filter((i) => i.status === 'paid')
      .reduce((s, i) => s + docTotals(i).total, 0),
  );
  readonly outstanding = computed(() =>
    this.invoices()
      .filter((i) => i.status === 'unpaid')
      .reduce((s, i) => s + docTotals(i).total, 0),
  );
  readonly openOrders = computed(
    () =>
      this.orders().filter((o) => o.stage !== 'delivered' && o.stage !== 'cancelled')
        .length,
  );

  constructor() {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) {
        const d = JSON.parse(raw);
        this.quotations.set(d.quotations || []);
        this.invoices.set(d.invoices || []);
        this.orders.set(d.orders || []);
      }
    } catch {
      /* ignore corrupt storage */
    }
  }

  private persist() {
    try {
      localStorage.setItem(
        KEY,
        JSON.stringify({
          quotations: this.quotations(),
          invoices: this.invoices(),
          orders: this.orders(),
        }),
      );
    } catch {
      /* storage full / unavailable */
    }
  }

  private nextNumber(prefix: string, list: Array<{ number: string }>): string {
    const year = new Date().getFullYear();
    const max = list
      .map((d) => Number(d.number.split('-').pop()))
      .filter((n) => !isNaN(n))
      .reduce((a, b) => Math.max(a, b), 0);
    return `${prefix}-${year}-${String(max + 1).padStart(4, '0')}`;
  }

  private uid(): string {
    return Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
  }

  partyFromEnquiry(e: Enquiry): Party {
    return {
      name: e.name || '',
      company: e.company || '',
      email: e.email || '',
      phone: e.phone || '',
    };
  }

  emptyParty(): Party {
    return { name: '', company: '', email: '', phone: '' };
  }

  // ---- Quotations ----
  createQuotation(input: {
    enquiry: Enquiry | null;
    customer: Party;
    items: LineItem[];
    taxPct: number;
    discount: number;
    currency: string;
    notes: string;
    validUntil: string;
    status: QuotationStatus;
  }): Quotation {
    const q: Quotation = {
      id: this.uid(),
      number: this.nextNumber('QT', this.quotations()),
      enquiryId: input.enquiry?.id ?? null,
      enquiryRef: input.enquiry?.ref ?? null,
      customer: input.customer,
      items: input.items,
      taxPct: input.taxPct,
      discount: input.discount,
      currency: input.currency,
      notes: input.notes,
      validUntil: input.validUntil,
      status: input.status,
      createdAt: new Date().toISOString(),
    };
    this.quotations.update((l) => [q, ...l]);
    this.persist();
    return q;
  }

  updateQuotation(id: string, patch: Partial<Quotation>) {
    this.quotations.update((l) => l.map((q) => (q.id === id ? { ...q, ...patch } : q)));
    this.persist();
  }

  deleteQuotation(id: string) {
    this.quotations.update((l) => l.filter((q) => q.id !== id));
    this.persist();
  }

  // ---- Invoices ----
  createInvoiceFromQuotation(q: Quotation, dueInDays = 14): Invoice {
    const due = new Date();
    due.setDate(due.getDate() + dueInDays);
    const inv: Invoice = {
      id: this.uid(),
      number: this.nextNumber('INV', this.invoices()),
      enquiryId: q.enquiryId,
      enquiryRef: q.enquiryRef,
      customer: { ...q.customer },
      items: q.items.map((i) => ({ ...i })),
      taxPct: q.taxPct,
      discount: q.discount,
      currency: q.currency,
      notes: q.notes,
      createdAt: new Date().toISOString(),
      status: 'unpaid',
      dueDate: due.toISOString().slice(0, 10),
      quotationId: q.id,
      quotationNumber: q.number,
      paidAt: null,
    };
    this.invoices.update((l) => [inv, ...l]);
    this.updateQuotation(q.id, { status: 'accepted' });
    this.persist();
    return inv;
  }

  setInvoiceStatus(id: string, status: InvoiceStatus) {
    this.invoices.update((l) =>
      l.map((i) =>
        i.id === id
          ? {
              ...i,
              status,
              paidAt: status === 'paid' ? new Date().toISOString() : null,
            }
          : i,
      ),
    );
    this.persist();
  }

  deleteInvoice(id: string) {
    this.invoices.update((l) => l.filter((i) => i.id !== id));
    this.persist();
  }

  // ---- Orders ----
  createOrderFromInvoice(inv: Invoice): SalesOrder {
    const now = new Date().toISOString();
    const o: SalesOrder = {
      id: this.uid(),
      number: this.nextNumber('ORD', this.orders()),
      enquiryId: inv.enquiryId,
      enquiryRef: inv.enquiryRef,
      customer: { ...inv.customer },
      items: inv.items.map((i) => ({ ...i })),
      taxPct: inv.taxPct,
      discount: inv.discount,
      currency: inv.currency,
      notes: inv.notes,
      createdAt: now,
      stage: 'confirmed',
      invoiceId: inv.id,
      invoiceNumber: inv.number,
      quotationNumber: inv.quotationNumber,
      tracking: '',
      history: [{ stage: 'confirmed', at: now }],
    };
    this.orders.update((l) => [o, ...l]);
    this.persist();
    return o;
  }

  setOrderStage(id: string, stage: OrderStage) {
    this.orders.update((l) =>
      l.map((o) =>
        o.id === id && o.stage !== stage
          ? {
              ...o,
              stage,
              history: [...o.history, { stage, at: new Date().toISOString() }],
            }
          : o,
      ),
    );
    this.persist();
  }

  setOrderTracking(id: string, tracking: string) {
    this.orders.update((l) => l.map((o) => (o.id === id ? { ...o, tracking } : o)));
    this.persist();
  }

  deleteOrder(id: string) {
    this.orders.update((l) => l.filter((o) => o.id !== id));
    this.persist();
  }
}
