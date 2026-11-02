/** The view of the garment a logo is drawn on. */
export type ZoneView = 'front' | 'back';

/**
 * Where a customer's logo is drawn on the garment picture for one placement. The picture itself
 * stays as it is; the logo is laid over it at this spot.
 */
export interface LogoZone {
  /** The view of the garment the logo goes on. */
  view: ZoneView;
  /** Centre of the logo, as a % of the preview's width. */
  x: number;
  /** Top of the logo, as a % of the preview's height. */
  y: number;
  /** Width of the logo, as a % of the preview's width. */
  w: number;
  /** A big spot in the middle of the front: an uploaded design file is drawn there too, so the logo steps aside. */
  centre?: boolean;
}

/** The wearer's left chest: on the picture's right, as the garment faces the viewer. */
export const LEFT_CHEST: LogoZone = { view: 'front', x: 66, y: 28, w: 12 };

/**
 * The spot for a placement, from its name (Left Chest, Front Centre, Back Centre, Right Sleeve…).
 * A name that is not recognised is drawn in the middle of the front.
 */
export function logoZoneFor(label: string): LogoZone {
  const t = (label || '').toLowerCase();
  const has = (re: RegExp) => re.test(t);

  if (has(/sleeve/)) {
    // The wearer's right sleeve is on the picture's left.
    return { view: 'front', x: has(/left/) ? 83 : 17, y: 36, w: 9 };
  }
  if (has(/back|nape|yoke/)) {
    return has(/lower|bottom|hem/)
      ? { view: 'back', x: 50, y: 52, w: 24 }
      : { view: 'back', x: 50, y: 20, w: 30 };
  }
  if (has(/hem|bottom|lower/)) return { view: 'front', x: 50, y: 74, w: 16 };
  if (has(/neck|collar|label|tag/)) return { view: 'front', x: 50, y: 9, w: 10 };
  if (has(/left/)) return LEFT_CHEST;
  if (has(/right/)) return { view: 'front', x: 34, y: 28, w: 12 };
  if (has(/centre|center|middle/)) return { view: 'front', x: 50, y: 31, w: 30, centre: true };
  if (has(/chest/)) return { view: 'front', x: 50, y: 24, w: 22, centre: true };
  return { view: 'front', x: 50, y: 31, w: 30, centre: true };
}

/**
 * Which picture of the colour shows a view: the one named after it. With no picture named "front", the
 * first one that is not a back or a close-up stands in for it; a back is never guessed. -1 when none.
 */
export function viewIndexFor(views: ReadonlyArray<{ angle: string }>, want: ZoneView): number {
  const angle = (v: { angle: string }) => (v.angle || '').trim().toLowerCase();
  const named = views.findIndex((v) => angle(v) === want);
  if (named >= 0 || want === 'back') return named;
  const closeUps = ['back', 'sleeve', 'collar', 'side', 'neck', 'detail', 'shoot'];
  return views.findIndex((v) => !closeUps.includes(angle(v)));
}
