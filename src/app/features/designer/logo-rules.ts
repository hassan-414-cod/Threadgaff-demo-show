import { formatFileSize } from '../../core/services/design-upload.store';

/**
 * What a logo has to be to go on a garment: a picture without a background, small enough to travel
 * with the enquiry exactly as it was uploaded (the enquiry keeps a file up to this size untouched).
 */
export const LOGO_MAX_BYTES = 1.5 * 1024 * 1024;
/** Narrowest logo that still prints acceptably; a wider one (1000 px or more) is recommended. */
export const LOGO_MIN_PX = 300;
export const LOGO_ACCEPT = '.png,.svg,.webp,image/png,image/svg+xml,image/webp';

/** The requirements shown next to the upload box. */
export const LOGO_RULES: readonly string[] = [
  'PNG, SVG or WebP',
  'Transparent background: no white or coloured box around the logo',
  `Up to ${formatFileSize(LOGO_MAX_BYTES)}`,
  'At least 1000 px wide for a sharp print',
];

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('unreadable'));
    img.src = url;
  });
}

/**
 * Looks at the picture's outer edge: a logo with no background is see-through there. Returns false when
 * most of the edge is solid (a white or coloured box around the logo).
 */
async function hasNoBackground(img: HTMLImageElement): Promise<boolean> {
  const side = 160;
  const scale = Math.min(1, side / Math.max(img.naturalWidth, img.naturalHeight));
  const w = Math.max(2, Math.round(img.naturalWidth * scale));
  const h = Math.max(2, Math.round(img.naturalHeight * scale));
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return true;
  ctx.drawImage(img, 0, 0, w, h);
  const data = ctx.getImageData(0, 0, w, h).data;
  const alpha = (x: number, y: number) => data[(y * w + x) * 4 + 3];
  let solid = 0;
  let total = 0;
  for (let x = 0; x < w; x++) {
    for (const y of [0, h - 1]) {
      total++;
      if (alpha(x, y) >= 250) solid++;
    }
  }
  for (let y = 1; y < h - 1; y++) {
    for (const x of [0, w - 1]) {
      total++;
      if (alpha(x, y) >= 250) solid++;
    }
  }
  return solid / total < 0.9;
}

/** Returns what is wrong with the logo (to show the customer), or null when it meets the requirements. */
export async function checkLogo(file: File): Promise<string | null> {
  const ext = (file.name.split('.').pop() || '').toLowerCase();
  const type = (file.type || '').toLowerCase();
  const isSvg = type === 'image/svg+xml' || ext === 'svg';
  const isPng = type === 'image/png' || ext === 'png';
  const isWebp = type === 'image/webp' || ext === 'webp';

  if (!isSvg && !isPng && !isWebp) {
    return /jpe?g/.test(ext + type)
      ? 'A JPG cannot have a transparent background. Upload a PNG, SVG or WebP with the background removed.'
      : 'That file type is not accepted. Upload a PNG, SVG or WebP logo with a transparent background.';
  }
  if (file.size === 0) return 'That file is empty.';
  if (file.size > LOGO_MAX_BYTES) {
    return `That file is ${formatFileSize(file.size)}. A logo can be up to ${formatFileSize(LOGO_MAX_BYTES)}.`;
  }
  if (isSvg) {
    const text = await file.text().catch(() => '');
    return /<svg[\s>]/i.test(text) ? null : 'That SVG could not be read.';
  }

  const url = URL.createObjectURL(file);
  try {
    const img = await loadImage(url);
    if (Math.max(img.naturalWidth, img.naturalHeight) < LOGO_MIN_PX) {
      return `That logo is only ${img.naturalWidth} × ${img.naturalHeight} px. It needs to be at least ${LOGO_MIN_PX} px wide to print (1000 px or more is best).`;
    }
    if (!(await hasNoBackground(img))) {
      return 'This logo has a solid background (a box around it). Upload a PNG, SVG or WebP with a transparent background.';
    }
    return null;
  } catch {
    return 'That picture could not be read. Try another PNG, SVG or WebP file.';
  } finally {
    URL.revokeObjectURL(url);
  }
}
