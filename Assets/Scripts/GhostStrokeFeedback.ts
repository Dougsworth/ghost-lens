/**
 * GhostStrokeFeedback — how far off is each part of the stroke, right now?
 *
 * Owns:  the per-point error measurement and the banding that turns it into a
 *        handful of coloured segments. Pure logic: no scene access, no state,
 *        so the tolerances can be tuned and reasoned about on their own — the
 *        same split GhostStrokeCheck uses.
 * Must not: draw, score pass/fail, or know what a colour means.
 *
 * Why this is separate from GhostStrokeCheck: that file answers ONE question
 * at the END of a stroke ("did this count?"). This one answers a different
 * question CONTINUOUSLY while the hand is moving ("how am I doing, here?").
 * They deliberately disagree in kind — a stroke can be amber in two bands and
 * still pass, because the pass test is a mean over the whole stroke and the
 * brief's rule is to accept a range, not one exact path.
 *
 * Error is measured to the NEAREST POINT on the guide, not to the
 * corresponding sample by arc length. That matters: a learner who draws the
 * right shape but slightly slowly is not wrong, and arc-length correspondence
 * would paint them red for lagging. Nearest-point asks only "is your ink on
 * the line", which is the thing they can see and correct.
 */

import { Pt, StrokePath } from "./GhostKanaPath";

/** How a band of the stroke is doing. */
export type Band = {
  /** Index of the first live point in this band. */
  from: number;
  /** Index of the last live point in this band, inclusive. */
  to: number;
  /** Mean distance to the guide across the band, in cm. */
  errorCm: number;
  /** 0 = on the line, 1 = close, 2 = off. */
  level: number;
};

/** Distance from a point to the segment ab, in cm. */
function pointToSegment(p: Pt, a: Pt, b: Pt): number {
  const vx = b.x - a.x;
  const vy = b.y - a.y;
  const wx = p.x - a.x;
  const wy = p.y - a.y;
  const len2 = vx * vx + vy * vy;
  let t = len2 > 1e-9 ? (wx * vx + wy * vy) / len2 : 0;
  if (t < 0) t = 0;
  else if (t > 1) t = 1;
  const dx = wx - vx * t;
  const dy = wy - vy * t;
  return Math.sqrt(dx * dx + dy * dy);
}

/** Shortest distance from a point to anywhere on the guide polyline, in cm. */
export function distanceToGuide(p: Pt, guide: StrokePath): number {
  const pts = guide.points;
  if (pts.length === 0) return Infinity;
  if (pts.length === 1) {
    const dx = p.x - pts[0].x;
    const dy = p.y - pts[0].y;
    return Math.sqrt(dx * dx + dy * dy);
  }
  let best = Infinity;
  for (let i = 1; i < pts.length; i++) {
    const d = pointToSegment(p, pts[i - 1], pts[i]);
    if (d < best) best = d;
  }
  return best;
}

/**
 * Grade an error against the two thresholds.
 *
 * Deliberately three levels and not a continuous gradient: the point of the
 * colour is to be readable out of the corner of an eye while the hand is
 * moving, and a smooth ramp from green to red has no moment where anything
 * changes enough to notice.
 */
export function levelFor(errorCm: number, onLineCm: number, closeCm: number): number {
  if (errorCm <= onLineCm) return 0;
  if (errorCm <= closeCm) return 1;
  return 2;
}

/**
 * Split the drawn path into at most `maxBands` contiguous bands and grade each.
 *
 * Bands are cut by POINT COUNT rather than by arc length so that the live
 * stroke's bands stay stable as it grows: an arc-length cut would move every
 * boundary backwards each time the hand travelled further, and the colours
 * would crawl along the ink instead of staying where the mistake was made.
 */
export function gradeBands(
  drawn: Pt[],
  guide: StrokePath,
  maxBands: number,
  onLineCm: number,
  closeCm: number
): Band[] {
  const n = drawn.length;
  if (n < 2) return [];

  // Keep bands from being absurdly short on a stroke that has barely started.
  const bandCount = Math.max(1, Math.min(maxBands, Math.floor(n / 3)));
  const out: Band[] = [];

  for (let b = 0; b < bandCount; b++) {
    const from = Math.floor((b * n) / bandCount);
    // Overlap each band's end into the next band's start by one point, so the
    // rendered segments butt together with no gap at the joins.
    const to = Math.min(n - 1, Math.floor(((b + 1) * n) / bandCount));
    if (to <= from) continue;

    let sum = 0;
    let count = 0;
    for (let i = from; i <= to; i++) {
      sum += distanceToGuide(drawn[i], guide);
      count++;
    }
    const errorCm = count > 0 ? sum / count : Infinity;
    out.push({ from: from, to: to, errorCm: errorCm, level: levelFor(errorCm, onLineCm, closeCm) });
  }
  return out;
}

/** The band that went worst, or null when every band is on the line. */
export function worstBand(bands: Band[]): Band | null {
  let worst: Band | null = null;
  for (let i = 0; i < bands.length; i++) {
    if (bands[i].level === 0) continue;
    if (!worst || bands[i].errorCm > worst.errorCm) worst = bands[i];
  }
  return worst;
}

/**
 * The point on the guide nearest a drawn point — where the ink SHOULD have
 * been. The Fix step pulses here rather than at the stroke's start, because
 * "begin again" is not advice; "this bit, here" is.
 */
export function nearestGuidePoint(p: Pt, guide: StrokePath): Pt {
  const pts = guide.points;
  if (pts.length === 0) return { x: p.x, y: p.y };
  let best = Infinity;
  let bx = pts[0].x;
  let by = pts[0].y;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1];
    const b = pts[i];
    const vx = b.x - a.x;
    const vy = b.y - a.y;
    const len2 = vx * vx + vy * vy;
    let t = len2 > 1e-9 ? ((p.x - a.x) * vx + (p.y - a.y) * vy) / len2 : 0;
    if (t < 0) t = 0;
    else if (t > 1) t = 1;
    const cx = a.x + vx * t;
    const cy = a.y + vy * t;
    const dx = p.x - cx;
    const dy = p.y - cy;
    const d = dx * dx + dy * dy;
    if (d < best) {
      best = d;
      bx = cx;
      by = cy;
    }
  }
  return { x: bx, y: by };
}
