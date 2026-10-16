/**
 * Export helpers for the Sales desk: one quotation / invoice / order, or a whole list, as
 * CSV, Word, PDF or a print-ready page. No libraries: the PDF is written by hand.
 */

export interface ExportDoc {
  kind: 'Quotation' | 'Invoice' | 'Order';
  number: string;
  createdAt: string;
  status: string;
  customer: { name: string; company: string; email: string; phone: string };
  enquiryRef: string | null;
  /** Extra label/value lines, e.g. Valid until, Due date, Tracking, linked documents. */
  meta: Array<[string, string]>;
  items: Array<{ description: string; qty: number; unitPrice: number }>;
  currency: string;
  taxPct: number;
  subtotal: number;
  discount: number;
  tax: number;
  total: number;
  notes: string;
}

export interface ExportTable {
  title: string;
  subtitle?: string;
  columns: string[];
  rows: string[][];
  /** Columns to right-align (by index). */
  right?: number[];
}

export type ExportFormat = 'print' | 'pdf' | 'word' | 'csv';

export function money(n: number, currency: string): string {
  try {
    return new Intl.NumberFormat('en-GB', { style: 'currency', currency }).format(n || 0);
  } catch {
    return `${currency} ${(n || 0).toFixed(2)}`;
  }
}

export function fmtDate(iso: string): string {
  const d = new Date(iso);
  return isNaN(d.getTime())
    ? iso || '—'
    : d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

const esc = (s: unknown) =>
  String(s ?? '').replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string,
  );

export function safeFileName(s: string): string {
  return s.replace(/[^a-z0-9._-]+/gi, '-').replace(/^-+|-+$/g, '') || 'document';
}

// ───────────────────────── download / print ─────────────────────────

export function downloadBlob(name: string, blob: Blob): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

/** Opens the page in a new tab and prints it. Returns false if pop-ups are blocked. */
export function openPrint(html: string): boolean {
  const w = window.open('', '_blank');
  if (!w) return false;
  w.document.open();
  w.document.write(html);
  w.document.close();
  return true;
}

// ───────────────────────── CSV ─────────────────────────

const csvCell = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""').replace(/\r?\n/g, ' ')}"`;
const csvBlob = (lines: string[]) =>
  new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' });

export function docToCsv(d: ExportDoc): Blob {
  const row = (...c: unknown[]) => c.map(csvCell).join(',');
  const lines = [
    row(d.kind, d.number),
    row('Date', fmtDate(d.createdAt)),
    row('Status', d.status),
    row('Customer', d.customer.name),
    row('Company', d.customer.company),
    row('Email', d.customer.email),
    row('Phone', d.customer.phone),
    row('Inquiry ref', d.enquiryRef || ''),
    ...d.meta.map(([k, v]) => row(k, v)),
    '',
    row('Description', 'Qty', 'Unit price', 'Amount'),
    ...d.items.map((i) => row(i.description, i.qty, i.unitPrice.toFixed(2), (i.qty * i.unitPrice).toFixed(2))),
    '',
    row('Subtotal', '', '', d.subtotal.toFixed(2)),
    row('Discount', '', '', (-d.discount).toFixed(2)),
    row(`Tax (${d.taxPct}%)`, '', '', d.tax.toFixed(2)),
    row('Total', '', d.currency, d.total.toFixed(2)),
    '',
    row('Notes', d.notes),
  ];
  return csvBlob(lines);
}

export function tableToCsv(t: ExportTable): Blob {
  return csvBlob([t.columns.map(csvCell).join(','), ...t.rows.map((r) => r.map(csvCell).join(','))]);
}

// ───────────────────────── HTML (print + Word) ─────────────────────────

const DOC_CSS = `
body{font-family:Inter,Arial,sans-serif;color:#1c1c1c;margin:40px;font-size:13px}
h1{margin:0;font-size:24px;letter-spacing:.04em} .top{display:flex;justify-content:space-between;border-bottom:2px solid #3d4b37;padding-bottom:14px;margin-bottom:20px}
.brand{font-weight:700;letter-spacing:.2em;color:#3d4b37} table{width:100%;border-collapse:collapse;margin-top:18px}
th{background:#eef2ea;text-align:left;padding:8px;font-size:11px;text-transform:uppercase;letter-spacing:.06em}
td{padding:8px;border-bottom:1px solid #e4e0d6} .r{text-align:right}
.tot{margin-left:auto;width:260px;margin-top:16px} .tot div{display:flex;justify-content:space-between;padding:4px 0}
.tot .g{border-top:2px solid #3d4b37;font-weight:700;font-size:15px;margin-top:4px;padding-top:8px}
.notes{margin-top:26px;color:#555;white-space:pre-wrap}
@media print{body{margin:18px}}`;

function docBody(d: ExportDoc): string {
  const c = d.customer;
  const rows = d.items
    .map(
      (i) =>
        `<tr><td>${esc(i.description)}</td><td class="r">${i.qty}</td><td class="r">${money(i.unitPrice, d.currency)}</td><td class="r">${money(i.qty * i.unitPrice, d.currency)}</td></tr>`,
    )
    .join('');
  return `<div class="top"><div><div class="brand">THREADGAFF</div><div>Custom apparel manufacturing</div></div>
<div style="text-align:right"><h1>${esc(d.kind.toUpperCase())}</h1><div><b>${esc(d.number)}</b></div><div>${esc(fmtDate(d.createdAt))}</div></div></div>
<p><b>Bill to</b><br>${esc(c.name)}${c.company ? '<br>' + esc(c.company) : ''}${c.email ? '<br>' + esc(c.email) : ''}${c.phone ? '<br>' + esc(c.phone) : ''}</p>
${d.enquiryRef ? `<p>Inquiry ref: <b>${esc(d.enquiryRef)}</b></p>` : ''}<p>Status: <b>${esc(d.status)}</b></p>
${d.meta.map(([k, v]) => `<p>${esc(k)}: <b>${esc(v)}</b></p>`).join('')}
<table><thead><tr><th>Description</th><th class="r">Qty</th><th class="r">Unit price</th><th class="r">Amount</th></tr></thead><tbody>${rows}</tbody></table>
<div class="tot"><div><span>Subtotal</span><span>${money(d.subtotal, d.currency)}</span></div>
<div><span>Discount</span><span>− ${money(d.discount, d.currency)}</span></div>
<div><span>Tax (${d.taxPct}%)</span><span>${money(d.tax, d.currency)}</span></div>
<div class="g"><span>Total</span><span>${money(d.total, d.currency)}</span></div></div>
${d.notes ? `<div class="notes"><b>Notes / terms</b><br>${esc(d.notes)}</div>` : ''}`;
}

export function docToHtml(d: ExportDoc, autoPrint: boolean): string {
  return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(d.kind)} ${esc(d.number)}</title><style>${DOC_CSS}</style></head><body>${docBody(d)}${
    autoPrint ? '<script>window.onload=function(){setTimeout(function(){window.print()},250)}</script>' : ''
  }</body></html>`;
}

/** Word opens an HTML file saved as .doc, so no extra library is needed. */
export function docToWord(d: ExportDoc): Blob {
  const html = `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40"><head><meta charset="utf-8"><title>${esc(d.kind)} ${esc(d.number)}</title><style>${DOC_CSS.replace(/display:flex;justify-content:space-between;/g, '')}</style></head><body>${docBody(d)}</body></html>`;
  return new Blob(['﻿' + html], { type: 'application/msword' });
}

const TABLE_CSS = `
body{font-family:Inter,Arial,sans-serif;color:#1c1c1c;margin:32px;font-size:12px}
h1{margin:0 0 4px;font-size:20px} p{margin:0 0 14px;color:#666}
table{width:100%;border-collapse:collapse} th{background:#eef2ea;text-align:left;padding:7px;font-size:10px;text-transform:uppercase;letter-spacing:.06em}
td{padding:7px;border-bottom:1px solid #e4e0d6;vertical-align:top} .r{text-align:right}
@media print{body{margin:14px}}`;

function tableBody(t: ExportTable): string {
  const right = new Set(t.right || []);
  return `<h1>${esc(t.title)}</h1><p>${esc(t.subtitle || '')}</p>
<table><thead><tr>${t.columns.map((c, i) => `<th${right.has(i) ? ' class="r"' : ''}>${esc(c)}</th>`).join('')}</tr></thead>
<tbody>${t.rows.map((r) => `<tr>${r.map((c, i) => `<td${right.has(i) ? ' class="r"' : ''}>${esc(c)}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
}

export function tableToHtml(t: ExportTable, autoPrint: boolean): string {
  return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(t.title)}</title><style>${TABLE_CSS}</style></head><body>${tableBody(t)}${
    autoPrint ? '<script>window.onload=function(){setTimeout(function(){window.print()},250)}</script>' : ''
  }</body></html>`;
}

export function tableToWord(t: ExportTable): Blob {
  const html = `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40"><head><meta charset="utf-8"><title>${esc(t.title)}</title><style>${TABLE_CSS}</style></head><body>${tableBody(t)}</body></html>`;
  return new Blob(['﻿' + html], { type: 'application/msword' });
}

// ───────────────────────── PDF (hand-written) ─────────────────────────

// Helvetica glyph widths (1/1000 em) for ASCII 32..126.
const HELV = [
  278, 278, 355, 556, 556, 889, 667, 191, 333, 333, 389, 584, 278, 333, 278, 278, 556, 556, 556, 556, 556, 556,
  556, 556, 556, 556, 278, 278, 584, 584, 584, 556, 1015, 667, 667, 722, 722, 667, 611, 778, 722, 278, 500, 667,
  556, 833, 722, 778, 667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 278, 278, 278, 469, 556, 333, 556,
  556, 500, 556, 556, 278, 556, 556, 222, 222, 500, 222, 833, 556, 556, 556, 556, 333, 500, 278, 556, 500, 722,
  500, 500, 500, 334, 260, 334, 584,
];

/** Maps text to WinAnsi bytes written as PDF string escapes (pure ASCII output). */
function pdfText(s: string): string {
  const special: Record<string, number> = {
    '£': 0xa3, '€': 0x80, '•': 0x95, '–': 0x96, '—': 0x97, '‘': 0x91, '’': 0x92, '“': 0x93, '”': 0x94,
    '×': 0xd7, '·': 0xb7, '…': 0x85,
  };
  let out = '';
  for (const ch of String(s ?? '')) {
    const code = ch.codePointAt(0) || 63;
    if (ch === '−') out += '-';
    else if (ch === '→') out += '->';
    else if (ch === ' ') out += ' ';
    else if (special[ch] !== undefined) out += '\\' + special[ch].toString(8).padStart(3, '0');
    else if (ch === '(' || ch === ')' || ch === '\\') out += '\\' + ch;
    else if (code >= 32 && code <= 126) out += ch;
    else if (code === 9 || code === 10 || code === 13) out += ' ';
    else out += '?';
  }
  return out;
}

class PdfWriter {
  readonly W = 595.28;
  readonly H = 841.89;
  readonly M = 46;
  private pages: string[] = [];
  private cur: string[] = [];
  y = 0;

  constructor() {
    this.newPage();
  }

  newPage() {
    if (this.cur.length) this.pages.push(this.cur.join('\n'));
    this.cur = [];
    this.y = this.H - this.M;
  }

  ensure(h: number) {
    if (this.y - h < this.M + 14) this.newPage();
  }

  width(s: string, size: number, bold = false): number {
    let w = 0;
    for (const ch of s) {
      const c = ch.codePointAt(0) || 32;
      w += c >= 32 && c <= 126 ? HELV[c - 32] : 556;
    }
    return (w / 1000) * size * (bold ? 1.07 : 1);
  }

  wrap(s: string, maxW: number, size: number, bold = false): string[] {
    const out: string[] = [];
    for (const para of String(s ?? '').split(/\r?\n/)) {
      let line = '';
      for (const word of para.split(/\s+/).filter(Boolean)) {
        const next = line ? line + ' ' + word : word;
        if (this.width(next, size, bold) <= maxW) {
          line = next;
        } else {
          if (line) out.push(line);
          line = word;
          // a single very long word: cut it
          while (this.width(line, size, bold) > maxW && line.length > 1) {
            let n = line.length - 1;
            while (n > 1 && this.width(line.slice(0, n), size, bold) > maxW) n--;
            out.push(line.slice(0, n));
            line = line.slice(n);
          }
        }
      }
      out.push(line);
    }
    return out.length ? out : [''];
  }

  text(s: string, x: number, y: number, size: number, bold = false, rgb = '0.11 0.12 0.11') {
    this.cur.push(`BT /F${bold ? 2 : 1} ${size} Tf ${rgb} rg ${x.toFixed(2)} ${y.toFixed(2)} Td (${pdfText(s)}) Tj ET`);
  }

  textRight(s: string, xRight: number, y: number, size: number, bold = false) {
    this.text(s, xRight - this.width(s, size, bold), y, size, bold);
  }

  rect(x: number, y: number, w: number, h: number, rgb: string) {
    this.cur.push(`${rgb} rg ${x.toFixed(2)} ${y.toFixed(2)} ${w.toFixed(2)} ${h.toFixed(2)} re f`);
  }

  hline(x1: number, x2: number, y: number, weight = 0.6, rgb = '0.89 0.88 0.84') {
    this.cur.push(`${weight} w ${rgb} RG ${x1.toFixed(2)} ${y.toFixed(2)} m ${x2.toFixed(2)} ${y.toFixed(2)} l S`);
  }

  finish(): Blob {
    this.pages.push(this.cur.join('\n'));
    const n = this.pages.length;
    const pages = this.pages.map((p, i) => {
      const foot = `BT /F1 8 Tf 0.45 0.45 0.42 rg ${this.M} 28 Td (Threadgaff - page ${i + 1} of ${n}) Tj ET`;
      return p + '\n' + foot;
    });
    const objs: string[] = [];
    objs[1] = '<< /Type /Catalog /Pages 2 0 R >>';
    const kids = pages.map((_, i) => `${5 + i * 2} 0 R`).join(' ');
    objs[2] = `<< /Type /Pages /Kids [${kids}] /Count ${n} >>`;
    objs[3] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>';
    objs[4] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>';
    pages.forEach((content, i) => {
      const pageNo = 5 + i * 2;
      objs[pageNo] = `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${this.W} ${this.H}] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${pageNo + 1} 0 R >>`;
      objs[pageNo + 1] = `<< /Length ${content.length} >>\nstream\n${content}\nendstream`;
    });
    let out = '%PDF-1.4\n';
    const offsets: number[] = [];
    for (let i = 1; i < objs.length; i++) {
      offsets[i] = out.length;
      out += `${i} 0 obj\n${objs[i]}\nendobj\n`;
    }
    const xref = out.length;
    out += `xref\n0 ${objs.length}\n0000000000 65535 f \n`;
    for (let i = 1; i < objs.length; i++) out += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`;
    out += `trailer\n<< /Size ${objs.length} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
    return new Blob([out], { type: 'application/pdf' });
  }
}

const GREEN = '0.24 0.29 0.22';
const SOFT = '0.93 0.95 0.92';

export function docToPdf(d: ExportDoc): Blob {
  const p = new PdfWriter();
  const L = p.M;
  const R = p.W - p.M;

  // header
  p.text('THREADGAFF', L, p.y - 14, 15, true, GREEN);
  p.text('Custom apparel manufacturing', L, p.y - 28, 9, false, '0.4 0.4 0.38');
  p.textRight(d.kind.toUpperCase(), R, p.y - 14, 20, true);
  p.textRight(d.number, R, p.y - 30, 11, true);
  p.textRight(fmtDate(d.createdAt), R, p.y - 43, 9);
  p.y -= 56;
  p.hline(L, R, p.y, 1.6, GREEN);
  p.y -= 20;

  // parties and meta
  const c = d.customer;
  p.text('BILL TO', L, p.y, 8, true, '0.4 0.4 0.38');
  p.y -= 13;
  for (const line of [c.name, c.company, c.email, c.phone].filter(Boolean)) {
    p.text(line, L, p.y, 10, line === c.name);
    p.y -= 13;
  }
  p.y -= 4;
  const meta: Array<[string, string]> = [
    ...(d.enquiryRef ? ([['Inquiry ref', d.enquiryRef]] as Array<[string, string]>) : []),
    ['Status', d.status],
    ...d.meta,
  ];
  for (const [k, v] of meta) {
    for (const [i, part] of p.wrap(v, R - L - 90, 9.5).entries()) {
      p.ensure(13);
      if (i === 0) p.text(k + ':', L, p.y, 9.5, true);
      p.text(part, L + 90, p.y, 9.5);
      p.y -= 13;
    }
  }
  p.y -= 10;

  // table
  const qtyR = R - 170;
  const unitR = R - 85;
  const descW = qtyR - 56 - L - 8;
  const head = () => {
    p.ensure(30);
    p.rect(L, p.y - 6, R - L, 20, SOFT);
    p.text('DESCRIPTION', L + 6, p.y, 8, true);
    p.textRight('QTY', qtyR, p.y, 8, true);
    p.textRight('UNIT PRICE', unitR, p.y, 8, true);
    p.textRight('AMOUNT', R - 6, p.y, 8, true);
    p.y -= 22;
  };
  head();
  for (const it of d.items) {
    const lines = p.wrap(it.description, descW, 9.5);
    const h = lines.length * 12 + 8;
    if (p.y - h < p.M + 14) {
      p.newPage();
      head();
    }
    lines.forEach((ln, i) => p.text(ln, L + 6, p.y - i * 12, 9.5));
    p.textRight(String(it.qty), qtyR, p.y, 9.5);
    p.textRight(money(it.unitPrice, d.currency), unitR, p.y, 9.5);
    p.textRight(money(it.qty * it.unitPrice, d.currency), R - 6, p.y, 9.5);
    const last = p.y - (lines.length - 1) * 12;
    p.hline(L, R, last - 6);
    p.y = last - 19;
  }
  p.y -= 14;

  // totals
  p.ensure(90);
  const tl = R - 200;
  const totalRow = (label: string, value: string, bold = false) => {
    p.text(label, tl, p.y, bold ? 11 : 9.5, bold);
    p.textRight(value, R - 6, p.y, bold ? 11 : 9.5, bold);
    p.y -= bold ? 16 : 14;
  };
  totalRow('Subtotal', money(d.subtotal, d.currency));
  totalRow('Discount', '- ' + money(d.discount, d.currency));
  totalRow(`Tax (${d.taxPct}%)`, money(d.tax, d.currency));
  p.hline(tl, R, p.y + 9, 1.2, GREEN);
  p.y -= 4;
  totalRow('Total', money(d.total, d.currency), true);

  if (d.notes) {
    p.y -= 14;
    p.ensure(30);
    p.text('NOTES / TERMS', L, p.y, 8, true, '0.4 0.4 0.38');
    p.y -= 13;
    for (const ln of p.wrap(d.notes, R - L, 9.5)) {
      p.ensure(13);
      p.text(ln, L, p.y, 9.5, false, '0.3 0.3 0.28');
      p.y -= 12.5;
    }
  }
  return p.finish();
}

export function tableToPdf(t: ExportTable): Blob {
  const p = new PdfWriter();
  const L = p.M;
  const R = p.W - p.M;
  p.text(t.title, L, p.y - 12, 16, true);
  p.y -= 18;
  if (t.subtitle) {
    p.text(t.subtitle, L, p.y - 4, 9, false, '0.4 0.4 0.38');
    p.y -= 12;
  }
  p.y -= 16;
  const n = t.columns.length;
  const right = new Set(t.right || []);
  // widths proportional to the longest cell (bounded) so short columns stay narrow
  const weight = t.columns.map((c, i) =>
    Math.min(34, Math.max(c.length, ...t.rows.map((r) => (r[i] || '').length), 4)),
  );
  const sum = weight.reduce((a, b) => a + b, 0);
  const widths = weight.map((w) => ((R - L) * w) / sum);
  const xs = widths.reduce<number[]>((acc, w, i) => [...acc, (acc[i] ?? L) + w], [L]);
  const size = n > 7 ? 7 : 8;
  const head = () => {
    p.ensure(30);
    p.rect(L, p.y - 5, R - L, 17, SOFT);
    t.columns.forEach((c, i) => {
      const lines = p.wrap(c.toUpperCase(), widths[i] - 6, 7, true);
      if (right.has(i)) p.textRight(lines[0], xs[i + 1] - 3, p.y, 7, true);
      else p.text(lines[0], xs[i] + 3, p.y, 7, true);
    });
    p.y -= 19;
  };
  head();
  for (const row of t.rows) {
    const cells = row.map((v, i) => p.wrap(v || '', widths[i] - 6, size));
    const lines = Math.max(...cells.map((c) => c.length), 1);
    const h = lines * (size + 3) + 5;
    if (p.y - h < p.M + 14) {
      p.newPage();
      head();
    }
    cells.forEach((c, i) =>
      c.forEach((ln, k) => {
        const y = p.y - k * (size + 3);
        if (right.has(i)) p.textRight(ln, xs[i + 1] - 3, y, size);
        else p.text(ln, xs[i] + 3, y, size);
      }),
    );
    const last = p.y - (lines - 1) * (size + 3);
    p.hline(L, R, last - 4);
    p.y = last - (size + 8);
  }
  if (!t.rows.length) p.text('No records.', L + 3, p.y, 9, false, '0.4 0.4 0.38');
  return p.finish();
}
