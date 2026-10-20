/**
 * Customer files (the Custom Designer's design file and logo, plus any sample) travel with
 * the enquiry and are stored with it in the database. The API only has one text field for
 * them (sampleDataUrl), so several files are packed into that field as a small JSON bundle.
 * One file is stored exactly as before (a plain data URL), so older records keep working.
 */

export type AttachmentRole = 'design' | 'logo' | 'sample';

export interface Attachment {
  role: AttachmentRole;
  name: string;
  type: string;
  /** Size of the file in bytes (approximate for data stored before sizes were kept). */
  size: number;
  dataUrl: string;
}

export const BUNDLE_PREFIX = 'data:application/json;tgbundle=1,';
/** A file larger than this (as base64 text, about 2.5 MB of file) is not sent with the form. */
export const MAX_FILE_CHARS = 3_400_000;
/** All files together, as text, must stay below this. */
export const MAX_TOTAL_CHARS = 4_600_000;

export function roleLabel(role: AttachmentRole): string {
  return role === 'design' ? 'Design file' : role === 'logo' ? 'Logo' : 'Sample';
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
 * Shrinks a picture so it fits comfortably in the enquiry (long side 1600 px, then smaller if
 * still large). Small PNGs and SVGs are kept as they are, so logos stay sharp and transparent.
 */
export async function compressImageFile(file: File): Promise<{ dataUrl: string; type: string; name: string }> {
  const original = await fileToDataUrl(file);
  if (file.type === 'image/svg+xml' || original.length <= 350_000) {
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
    const { canvas, ctx } = draw(1200);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    const png = canvas.toDataURL('image/png');
    if (png.length <= 700_000) return { dataUrl: png, type: 'image/png', name: file.name };
  }
  for (const [maxPx, q] of [[1600, 0.82], [1300, 0.74], [1000, 0.66]] as const) {
    const { canvas, ctx } = draw(maxPx);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    const jpeg = canvas.toDataURL('image/jpeg', q);
    if (jpeg.length <= 900_000 || maxPx === 1000) {
      return { dataUrl: jpeg, type: 'image/jpeg', name: file.name.replace(/\.[a-z0-9]+$/i, '') + '.jpg' };
    }
  }
  return { dataUrl: original, type: file.type || mimeOf(original), name: file.name };
}

// ───────────────────────── packing for the enquiry ─────────────────────────

/** Keeps files in priority order while they fit; the rest are reported back. */
export function fitAttachments(list: Attachment[]): { send: Attachment[]; skipped: Attachment[] } {
  const order: AttachmentRole[] = ['design', 'logo', 'sample'];
  const sorted = [...list].sort((a, b) => order.indexOf(a.role) - order.indexOf(b.role));
  const send: Attachment[] = [];
  const skipped: Attachment[] = [];
  let total = 0;
  for (const a of sorted) {
    const n = a.dataUrl.length;
    if (n > MAX_FILE_CHARS || total + n > MAX_TOTAL_CHARS) skipped.push(a);
    else {
      send.push(a);
      total += n;
    }
  }
  return { send, skipped };
}

export function packAttachments(list: Attachment[]): { sampleName: string; sampleDataUrl: string } | null {
  if (!list.length) return null;
  if (list.length === 1) return { sampleName: list[0].name, sampleDataUrl: list[0].dataUrl };
  const files = list.map((a) => ({ role: a.role, name: a.name, type: a.type, size: a.size, dataUrl: a.dataUrl }));
  return {
    sampleName: list.map((a) => a.name).join(' + ').slice(0, 200),
    sampleDataUrl: BUNDLE_PREFIX + JSON.stringify({ v: 1, files }),
  };
}

/** Reads the files back out of an enquiry (a bundle, or one plain file saved the old way). */
export function unpackAttachments(sampleName?: string | null, sampleDataUrl?: string | null): Attachment[] {
  const url = sampleDataUrl || '';
  if (!url) return [];
  if (url.startsWith(BUNDLE_PREFIX)) {
    try {
      const data = JSON.parse(url.slice(BUNDLE_PREFIX.length)) as { files?: Partial<Attachment>[] };
      return (data.files || [])
        .filter((f) => typeof f.dataUrl === 'string' && f.dataUrl)
        .map((f) => ({
          role: (f.role === 'design' || f.role === 'logo' ? f.role : 'sample') as AttachmentRole,
          name: String(f.name || 'file'),
          type: String(f.type || mimeOf(f.dataUrl as string)),
          size: Number(f.size) || bytesOf(f.dataUrl as string),
          dataUrl: f.dataUrl as string,
        }));
    } catch {
      return [];
    }
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
