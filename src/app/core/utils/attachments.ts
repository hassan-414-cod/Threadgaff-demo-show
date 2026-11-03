/**
 * Customer files (the Custom Designer's design file and logo, plus any sample) travel with
 * the enquiry and are stored with it in the database. The API only has one text field for
 * them (sampleDataUrl), so several files are packed into that field as a small JSON bundle,
 * together with the details of the request (the full text, the notes, the product picture).
 * One plain file is stored exactly as before (a plain data URL), so older records keep working.
 * The whole request may be at most 100 KB: see prepareEnquiry.
 */

export type AttachmentRole = 'design' | 'logo' | 'sample' | 'snapshot';

export interface Attachment {
  role: AttachmentRole;
  name: string;
  type: string;
  /** Size of the file in bytes (approximate for data stored before sizes were kept). */
  size: number;
  dataUrl: string;
  /** For a logo placement picture that is only the logo layer: the address of the garment picture it goes on. */
  garment?: string;
  /** Set when the picture was saved smaller to fit the enquiry: what it was (name, size, pixels). */
  from?: { name: string; size: number; width?: number; height?: number };
}

export const BUNDLE_PREFIX = 'data:application/json;tgbundle=1,';
/** A picture picked by the customer is first brought below this (as base64 text) so that it can be handled; it is made much smaller when it is sent. */
export const MAX_FILE_CHARS = 3_400_000;

export function roleLabel(role: AttachmentRole): string {
  return role === 'design' ? 'Design file' : role === 'logo' ? 'Logo' : role === 'snapshot' ? 'Logo placement preview' : 'Sample';
}

export function sizeLabel(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

export function fileExt(name: string): string {
  const e = name.includes('.') ? name.split('.').pop() || '' : '';
  return (e || 'file').slice(0, 4).toUpperCase();
}

export function isImageAttachment(a: Pick<Attachment, 'type' | 'dataUrl'>): boolean {
  return /^image\/(png|jpe?g|webp|gif|svg\+xml)$/i.test(a.type) || a.dataUrl.startsWith('data:image/');
}

export function safeName(name: string): string {
  return (name || 'file').replace(/[\\/:*?"<>|\r\n]+/g, '_').slice(0, 120) || 'file';
}

function mimeOf(dataUrl: string): string {
  return /^data:([^;,]+)/.exec(dataUrl)?.[1] || 'application/octet-stream';
}

function bytesOf(dataUrl: string): number {
  const comma = dataUrl.indexOf(',');
  const body = comma >= 0 ? dataUrl.slice(comma + 1) : dataUrl;
  return dataUrl.includes(';base64,') ? Math.floor((body.length * 3) / 4) : body.length;
}

// ───────────────────────── reading files ─────────────────────────

export function fileToDataUrl(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Could not read the file'));
    reader.onload = () => resolve(String(reader.result || ''));
    reader.readAsDataURL(file);
  });
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Could not read the image'));
    img.src = src;
  });
}

/**
 * Prepares a picture for the enquiry WITHOUT touching it unless it is large: anything up to
 * about 1.5 MB (and every SVG) is sent exactly as the customer uploaded it. Only bigger
 * pictures are scaled down, as little as possible (long side 2600 px at high quality first).
 */
export async function compressImageFile(file: File): Promise<{ dataUrl: string; type: string; name: string }> {
  const original = await fileToDataUrl(file);
  if (file.type === 'image/svg+xml' || original.length <= 2_000_000) {
    return { dataUrl: original, type: file.type || mimeOf(original), name: file.name };
  }
  const img = await loadImage(original);
  const draw = (maxPx: number) => {
    const scale = Math.min(1, maxPx / Math.max(img.width, img.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(img.width * scale));
    canvas.height = Math.max(1, Math.round(img.height * scale));
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Could not read the image');
    return { canvas, ctx };
  };
  // Keep transparency for PNG when the result is small enough.
  if (file.type === 'image/png') {
    const { canvas, ctx } = draw(2000);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    const png = canvas.toDataURL('image/png');
    if (png.length <= 2_400_000) return { dataUrl: png, type: 'image/png', name: file.name };
  }
  for (const [maxPx, q] of [[2600, 0.92], [2200, 0.88], [1800, 0.84], [1400, 0.78]] as const) {
    const { canvas, ctx } = draw(maxPx);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    const jpeg = canvas.toDataURL('image/jpeg', q);
    if (jpeg.length <= 2_400_000 || maxPx === 1400) {
      return { dataUrl: jpeg, type: 'image/jpeg', name: file.name.replace(/\.[a-z0-9]+$/i, '') + '.jpg' };
    }
  }
  return { dataUrl: original, type: file.type || mimeOf(original), name: file.name };
}

// ───────────────────────── packing for the enquiry ─────────────────────────

/**
 * The server takes at most 100 KB for a whole enquiry: the text AND every file, as one request. Anything bigger is
 * refused (with an "Internal server error"). So the customer's logo and pictures are fitted into what is left after
 * the text: pictures are saved again smaller (WebP, JPEG or PNG, scaled down as little as possible), the most
 * important first, and a file that cannot be made smaller is left out and reported. If the server is ever allowed
 * bigger requests, raise this number and the files will be sent with more detail.
 */
export const ENQUIRY_BODY_LIMIT = 96_000;
/** The longest message the server accepts. */
export const ENQUIRY_MESSAGE_MAX = 5000;

/** What the customer filled in. */
export interface EnquiryBase {
  name: string;
  company?: string;
  email: string;
  phone?: string;
  segment?: string;
  message?: string;
}

/** Everything about the request in a form the admin can show (the full text, the notes, the product, the logo): it travels in the bundle. */
export type EnquiryDetails = Record<string, unknown>;

export interface PreparedEnquiry {
  payload: EnquiryBase & { sampleName?: string; sampleDataUrl?: string };
  /** The files that go with it (pictures as they are sent, possibly smaller than the originals). */
  sent: Attachment[];
  /** Pictures that were made smaller to fit. */
  reduced: Attachment[];
  /** Files that could not be fitted: they have to be emailed. */
  dropped: Attachment[];
  /** The size of the whole request in bytes. */
  bytes: number;
}

export function utf8Size(text: string): number {
  return new TextEncoder().encode(text).length;
}

const PRIORITY: AttachmentRole[] = ['logo', 'design', 'snapshot', 'sample'];
/** How the room is shared: the logo gets the most, the pictures of the placements a little each. */
const WEIGHT: Record<AttachmentRole, number> = { logo: 6, design: 3, snapshot: 2, sample: 2 };
/** The JSON around each file, with its quotes escaped once more inside the request. */
const FILE_OVERHEAD = 420;

function renameExt(name: string, type: string): string {
  const ext = type === 'image/webp' ? 'webp' : type === 'image/png' ? 'png' : 'jpg';
  return name.replace(/\.[a-z0-9]{1,5}$/i, '') + '.' + ext;
}

let webpEncoding: boolean | null = null;
function canEncodeWebp(): boolean {
  if (webpEncoding === null) {
    try {
      webpEncoding = document.createElement('canvas').toDataURL('image/webp').startsWith('data:image/webp');
    } catch {
      webpEncoding = false;
    }
  }
  return webpEncoding;
}

function hasTransparency(img: HTMLImageElement): boolean {
  const w = img.naturalWidth || 1;
  const h = img.naturalHeight || 1;
  const s = Math.min(1, 96 / Math.max(w, h));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(w * s));
  canvas.height = Math.max(1, Math.round(h * s));
  const ctx = canvas.getContext('2d');
  if (!ctx) return false;
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  try {
    const d = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    for (let i = 3; i < d.length; i += 4) if (d[i] < 250) return true;
  } catch {
    /* unreadable: treat it as opaque */
  }
  return false;
}

/**
 * A picture saved again so that it is at most `maxChars` characters as a data URL: the biggest size and best quality that
 * fits (WebP keeps the transparency of a logo; without WebP a logo stays a PNG and a photo becomes a JPEG). A picture that
 * already fits is returned as it is. Null when it cannot be made small enough.
 */
export async function shrinkImage(a: Attachment, maxChars: number): Promise<Attachment | null> {
  if (a.dataUrl.length <= maxChars) return a;
  let img: HTMLImageElement;
  try {
    img = await loadImage(a.dataUrl);
  } catch {
    return null;
  }
  const natW = img.naturalWidth || 800;
  const natH = img.naturalHeight || 600;
  const long = Math.max(natW, natH);
  const alpha = hasTransparency(img);
  const tries: Array<[string, number | undefined]> = canEncodeWebp()
    ? [['image/webp', 0.92], ['image/webp', 0.78], ['image/webp', 0.6]]
    : alpha
      ? [['image/png', undefined]]
      : [['image/jpeg', 0.88], ['image/jpeg', 0.7], ['image/jpeg', 0.5]];
  const sizes = [...new Set([Math.min(long, 1400), 1000, 720, 520, 380, 280, 200, 140].filter((n) => n <= long))];
  for (const px of sizes) {
    const scale = px / long;
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(natW * scale));
    canvas.height = Math.max(1, Math.round(natH * scale));
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    if (!alpha) {
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    for (const [type, quality] of tries) {
      const url = canvas.toDataURL(type, quality);
      if (url.startsWith('data:' + type) && url.length <= maxChars) {
        return {
          ...a,
          dataUrl: url,
          type,
          name: renameExt(a.name, type),
          size: Math.floor(url.length * 0.75),
          from: a.from ?? { name: a.name, size: a.size, width: natW, height: natH },
        };
      }
    }
  }
  return null;
}

/**
 * Builds the enquiry to send and makes sure the whole request is within `limit` bytes. `details` is called with the files
 * that will go (after they were made smaller) and returns what the admin should be told about the request.
 */
export async function prepareEnquiry(
  base: EnquiryBase,
  files: Attachment[],
  opts: { limit?: number; details?: (sent: Attachment[]) => EnquiryDetails | null } = {},
): Promise<PreparedEnquiry> {
  const limit = opts.limit ?? ENQUIRY_BODY_LIMIT;
  const measure = (sent: Attachment[], details: EnquiryDetails | null) => {
    const packed = packAttachments(sent, details);
    const payload = { ...base, ...(packed ?? {}) };
    return { payload, bytes: utf8Size(JSON.stringify(payload)) };
  };
  // the text and the details come first; the files share what is left
  const detailsBytes = opts.details ? Math.ceil(utf8Size(JSON.stringify(opts.details([]) ?? {})) * 1.3) + 400 : 0;
  let budget = limit - utf8Size(JSON.stringify({ ...base, sampleName: '', sampleDataUrl: '' })) - 160 - detailsBytes;

  const sorted = [...files].sort((a, b) => PRIORITY.indexOf(a.role) - PRIORITY.indexOf(b.role));
  let weightLeft = sorted.reduce((n, a) => n + WEIGHT[a.role], 0);
  const sent: Attachment[] = [];
  const reduced: Attachment[] = [];
  const dropped: Attachment[] = [];
  for (const a of sorted) {
    const w = WEIGHT[a.role];
    const overhead = FILE_OVERHEAD + a.name.length * 2 + (a.garment?.length ?? 0) * 2;
    const image = isImageAttachment(a);
    // a picture gets its share of what is left; a file that cannot be made smaller may use more of it
    const share = Math.floor((budget * w) / Math.max(w, weightLeft));
    weightLeft -= w;
    const room = (image ? share : Math.max(share, Math.floor(budget * 0.7))) - overhead;
    if (room < 1200) {
      dropped.push(a);
      continue;
    }
    if (a.dataUrl.length <= room) {
      sent.push(a);
      budget -= a.dataUrl.length + overhead;
      continue;
    }
    const small = image ? await shrinkImage(a, room) : null;
    if (small) {
      sent.push(small);
      reduced.push(small);
      budget -= small.dataUrl.length + overhead;
    } else {
      dropped.push(a);
    }
  }

  let details = opts.details ? opts.details(sent) : null;
  let m = measure(sent, details);
  // a safety net: still over the limit (long names, escapes …): make the pictures smaller once more, then leave out the least important files
  for (let round = 0; m.bytes > limit && round < 3; round++) {
    for (let i = sent.length - 1; i >= 0 && m.bytes > limit; i--) {
      if (!isImageAttachment(sent[i])) continue;
      const smaller = await shrinkImage(sent[i], Math.floor(sent[i].dataUrl.length * 0.75));
      if (!smaller || smaller === sent[i]) continue;
      const ri = reduced.indexOf(sent[i]);
      if (ri >= 0) reduced[ri] = smaller;
      else reduced.push(smaller);
      sent[i] = smaller;
      details = opts.details ? opts.details(sent) : null;
      m = measure(sent, details);
    }
  }
  while (m.bytes > limit && sent.length) {
    const last = sent.pop() as Attachment;
    const ri = reduced.indexOf(last);
    if (ri >= 0) reduced.splice(ri, 1);
    dropped.push(last);
    details = opts.details ? opts.details(sent) : null;
    m = measure(sent, details);
  }
  return { payload: m.payload, sent, reduced, dropped, bytes: m.bytes };
}

/** Packs the files (and the details) into the one text field the API has; one plain file without details is stored as it always was. */
export function packAttachments(
  list: Attachment[],
  details?: EnquiryDetails | null,
): { sampleName: string; sampleDataUrl: string } | null {
  if (!list.length && !details) return null;
  if (list.length === 1 && !list[0].garment && !list[0].from && !details) return { sampleName: list[0].name, sampleDataUrl: list[0].dataUrl };
  const files = list.map((a) => ({ role: a.role, name: a.name, type: a.type, size: a.size, dataUrl: a.dataUrl, garment: a.garment, from: a.from }));
  return {
    sampleName: (list.map((a) => a.name).join(' + ') || 'Enquiry details').slice(0, 200),
    sampleDataUrl: BUNDLE_PREFIX + JSON.stringify({ v: 1, files, details: details ?? undefined }),
  };
}

function readBundle(sampleDataUrl?: string | null): { files?: Array<Partial<Attachment>>; details?: EnquiryDetails } | null {
  const url = sampleDataUrl || '';
  if (!url.startsWith(BUNDLE_PREFIX)) return null;
  try {
    return JSON.parse(url.slice(BUNDLE_PREFIX.length));
  } catch {
    return null;
  }
}

/** Reads the files back out of an enquiry (a bundle, or one plain file saved the old way). */
export function unpackAttachments(sampleName?: string | null, sampleDataUrl?: string | null): Attachment[] {
  const url = sampleDataUrl || '';
  if (!url) return [];
  if (url.startsWith(BUNDLE_PREFIX)) {
    const data = readBundle(url);
    return (data?.files || [])
      .filter((f) => typeof f.dataUrl === 'string' && f.dataUrl)
      .map((f) => {
        const from = f.from && typeof f.from === 'object' ? (f.from as Attachment['from']) : undefined;
        return {
          role: (f.role === 'design' || f.role === 'logo' || f.role === 'snapshot' ? f.role : 'sample') as AttachmentRole,
          name: String(f.name || 'file'),
          type: String(f.type || mimeOf(f.dataUrl as string)),
          size: Number(f.size) || bytesOf(f.dataUrl as string),
          dataUrl: f.dataUrl as string,
          garment: typeof f.garment === 'string' && /^https?:/i.test(f.garment) ? f.garment : undefined,
          from: from && typeof from.name === 'string' ? from : undefined,
        };
      });
  }
  return [
    {
      role: 'sample',
      name: sampleName || 'file',
      type: url.startsWith('data:') ? mimeOf(url) : 'image/jpeg',
      size: bytesOf(url),
      dataUrl: url,
    },
  ];
}

/** What the customer's request says about itself (the full text, the notes, the product and its picture, the logo), when it was sent with the details. */
export function unpackDetails(sampleDataUrl?: string | null): EnquiryDetails | null {
  const d = readBundle(sampleDataUrl)?.details;
  return d && typeof d === 'object' ? d : null;
}

// ───────────────────────── download ─────────────────────────

export function dataUrlToBlob(dataUrl: string): Blob {
  const comma = dataUrl.indexOf(',');
  const head = dataUrl.slice(0, comma);
  const body = dataUrl.slice(comma + 1);
  const type = mimeOf(dataUrl);
  if (!head.includes(';base64')) return new Blob([decodeURIComponent(body)], { type });
  const bin = atob(body);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type });
}

export function downloadAttachment(a: Attachment): void {
  const url = URL.createObjectURL(dataUrlToBlob(a.dataUrl));
  const link = document.createElement('a');
  link.href = url;
  link.download = safeName(a.name);
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 3000);
}

/** Opens a PDF in a new tab (other types, SVG included, are only ever downloaded). */
export function openAttachment(a: Attachment): void {
  if (a.type !== 'application/pdf') return downloadAttachment(a);
  const url = URL.createObjectURL(dataUrlToBlob(a.dataUrl));
  window.open(url, '_blank', 'noopener');
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
