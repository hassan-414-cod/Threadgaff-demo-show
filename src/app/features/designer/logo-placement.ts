/**
 * Logos placed on the garment's angle pictures. Each ticked placement (Left Chest, Back Centre, Right Sleeve …)
 * is one copy of the customer's logo, put on the angle picture that belongs to it (the Back picture for Back
 * Centre, the Sleeve picture for a sleeve …). The customer can move and resize it on the preview, lock it
 * with "Fix", and place it again later.
 *
 * Positions are in % of the preview, which has the proportions of the picture it shows, so they map
 * exactly onto it.
 */
export interface Spot {
  /** Centre of the logo, as a % of the preview's width. */
  x: number;
  /** Top of the logo, as a % of the preview's height. */
  y: number;
  /** Width of the logo, as a % of the preview's width. */
  w: number;
}

export interface LogoPlacement extends Spot {
  id: string;
  /** The option it was ticked from. */
  value: string;
  /** What the placement is called (Left Chest, Back Centre …). */
  label: string;
  /** True once the customer pressed Fix on it. */
  fixed: boolean;
  /** The angle picture it sits on, by its slot among the angle pictures (a0, a1 …). */
  angle: string;
}

export const MIN_LOGO_W = 4;
export const MAX_LOGO_W = 90;

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

export function newPlacement(value: string, label: string, angle: string, start: Spot): LogoPlacement {
  return { id: 'pl-' + value, value, label, angle, x: start.x, y: start.y, w: start.w, fixed: false };
}

/** Height of a logo as a % of the preview's height (logoRatio and stageRatio are width / height). */
export function heightPct(w: number, logoRatio: number, stageRatio: number): number {
  return (w * stageRatio) / Math.max(0.05, logoRatio);
}

/** Keeps a spot inside the preview, whole. */
export function keepInside<T extends Spot>(s: T, logoRatio: number, stageRatio: number): T {
  const tallest = (100 * Math.max(0.05, logoRatio)) / stageRatio; // the widest it can be before it is taller than the preview
  const w = clamp(s.w, MIN_LOGO_W, Math.max(MIN_LOGO_W, Math.min(MAX_LOGO_W, tallest)));
  const h = heightPct(w, logoRatio, stageRatio);
  return { ...s, w, x: clamp(s.x, w / 2, 100 - w / 2), y: clamp(s.y, 0, Math.max(0, 100 - h)) };
}

function loadPicture(url: string, anonymous: boolean): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    if (anonymous) img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('The picture could not be loaded'));
    img.src = url;
  });
}

/** A saved picture of the placements on one angle picture. */
export interface RenderedSnapshot {
  blob: Blob;
  /**
   * Set when the browser would not let the garment picture be copied (it comes from another site): the
   * picture is then only the logo layer, the size of the garment picture, and this is the garment
   * picture's address, to be shown underneath it.
   */
  garment?: string;
}

function toBlob(canvas: HTMLCanvasElement, type: string, quality?: number): Promise<Blob> {
  return new Promise<Blob>((resolve, reject) => {
    try {
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Could not save the picture'))), type, quality);
    } catch (e) {
      reject(e);
    }
  });
}

/**
 * Draws the logos at the given spots on the garment picture and returns it as a picture (JPEG) for the
 * enquiry. A garment picture from another site cannot be copied into a saved picture unless that site allows
 * it, so then the logo layer alone is saved (a PNG the size of the garment picture) with the garment
 * picture's address: shown one on top of the other, it looks the same and needs no permission.
 */
export async function renderSnapshot(
  garmentUrl: string,
  logoUrl: string,
  logoRatio: number,
  spots: Spot[],
): Promise<RenderedSnapshot> {
  const remote = /^https?:/i.test(garmentUrl);
  const logo = await loadPicture(logoUrl, false);
  // The picture, readable for copying only when its site allows it; its size can always be read.
  const readable = await loadPicture(garmentUrl, remote).catch(() => null);
  const sized = readable ?? (await loadPicture(garmentUrl, false).catch(() => null));
  const natW = sized?.naturalWidth || 1000;
  const natH = sized?.naturalHeight || 1250;
  const W = Math.min(1000, natW);
  const H = Math.round((W * natH) / natW);

  const draw = (withGarment: HTMLImageElement | null) => {
    const canvas = document.createElement('canvas');
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('No canvas');
    if (withGarment) {
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, W, H);
      ctx.drawImage(withGarment, 0, 0, W, H);
    }
    for (const s of spots) {
      const lw = (s.w / 100) * W;
      const lh = lw / Math.max(0.05, logoRatio);
      ctx.drawImage(logo, (s.x / 100) * W - lw / 2, (s.y / 100) * H, lw, lh);
    }
    return canvas;
  };

  if (readable) {
    try {
      return { blob: await toBlob(draw(readable), 'image/jpeg', 0.86) };
    } catch {
      /* the garment picture taints the canvas: save the logo layer instead */
    }
  }
  const layer = await toBlob(draw(null), 'image/png');
  return remote ? { blob: layer, garment: garmentUrl } : { blob: layer };
}
