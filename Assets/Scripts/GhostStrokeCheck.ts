/**
 * GhostStrokeCheck — does the user's drag follow the guide stroke?
 *
 * Owns:  the matching rule and nothing else. Pure logic: no scene access, no
 *        state, no side effects, so the tolerance can be tuned and reasoned
 *        about on its own.
 * Reads: the SAME StrokePath the ghost brush drew (GhostKanaPath), which is why
 *        that representation is shared rather than re-derived here.
 *
 * The brief's rule is forgiveness: "only the rough shape and direction need to
 * match, not precision". So the test is deliberately coarse — resample both
 * paths to the same number of points by ARC LENGTH, then compare corresponding
 * points. Arc-length resampling is what makes the check speed-independent: a
 * slow careful drag and a quick confident one produce the same samples.
 *
 * Direction is checked by also scoring against the reversed guide. If backwards
 * fits better, the user drew it the wrong way — which is a real mistake worth
 * catching, because stroke direction is most of what kana practice teaches.
 */

import { Pt, StrokePath } from "./GhostKanaPath";

export type StrokeVerdict = {
  ok: boolean;
  /** "ok" | "off" (shape wrong) | "reversed" (right shape, wrong direction) | "short" (barely moved) */
  reason: string;
  /** Mean distance between corresponding samples, in cm. Useful for tuning. */
  meanErrorCm: number;
};

/** Number of comparison samples. Coarse on purpose — we are matching gesture, not tracing. */
const SAMPLES = 24;

/** Walk a polyline and return `count` points spaced evenly by arc length. */
function resampleByArcLength(points: Pt[], count: number): Pt[] {
  if (points.length === 0) return [];
  if (points.length === 1) {
    const out: Pt[] = [];
    for (let i = 0; i < count; i++) out.push(points[0]);
    return out;
  }

  const cum: number[] = [0];
  let total = 0;
  for (let i = 1; i < points.length; i++) {
    const dx = points[i].x - points[i - 1].x;
    const dy = points[i].y - points[i - 1].y;
    total += Math.sqrt(dx * dx + dy * dy);
    cum.push(total);
  }
  if (total <= 1e-6) {
    const out: Pt[] = [];
    for (let i = 0; i < count; i++) out.push(points[0]);
    return out;
  }

  const out: Pt[] = [];
  let seg = 1;
  for (let i = 0; i < count; i++) {
    const target = (i / (count - 1)) * total;
    while (seg < points.length - 1 && cum[seg] < target) seg++;
    const segLen = cum[seg] - cum[seg - 1];
    const f = segLen > 1e-6 ? (target - cum[seg - 1]) / segLen : 0;
    const a = points[seg - 1];
    const b = points[seg];
    out.push({ x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f });
  }
  return out;
}

function polylineLength(points: Pt[]): number {
  let total = 0;
  for (let i = 1; i < points.length; i++) {
    const dx = points[i].x - points[i - 1].x;
    const dy = points[i].y - points[i - 1].y;
    total += Math.sqrt(dx * dx + dy * dy);
  }
  return total;
}

function meanDistance(a: Pt[], b: Pt[]): number {
  let sum = 0;
  const n = Math.min(a.length, b.length);
  if (n === 0) return Infinity;
  for (let i = 0; i < n; i++) {
    const dx = a[i].x - b[i].x;
    const dy = a[i].y - b[i].y;
    sum += Math.sqrt(dx * dx + dy * dy);
  }
  return sum / n;
}

/**
 * Compare a drawn polyline (sheet-local cm) against the guide stroke.
 *
 * @param toleranceCm    mean error allowed, in cm. Larger = more forgiving.
 * @param minLengthRatio drawn length must be at least this fraction of the
 *                       guide's, so a dab at the start point cannot pass.
 * @param maxLengthRatio and at most this multiple, so wild scribbling fails.
 */
export function checkStroke(
  drawn: Pt[],
  target: StrokePath,
  toleranceCm: number,
  minLengthRatio: number,
  maxLengthRatio: number,
  startToleranceCm: number = 0
): StrokeVerdict {
  if (drawn.length < 2) {
    return { ok: false, reason: "short", meanErrorCm: Infinity };
  }

  const drawnLen = polylineLength(drawn);
  const ratio = target.length > 1e-6 ? drawnLen / target.length : 0;
  if (ratio < minLengthRatio) {
    return { ok: false, reason: "short", meanErrorCm: Infinity };
  }

  const a = resampleByArcLength(drawn, SAMPLES);
  const b = resampleByArcLength(target.points, SAMPLES);
  let forward = meanDistance(a, b);

  // Start-point forgiveness.
  //
  // Beginning a drag a little away from the stroke's start shifts EVERY sample
  // by that same offset, so a perfectly shaped stroke that merely started 2 cm
  // high used to fail on shape. If the start is within startToleranceCm, score
  // the shape again with that offset removed and keep whichever reading is
  // kinder. The offset is bounded, so a stroke drawn in the wrong place still
  // fails -- this forgives WHERE you began, not WHAT you drew.
  if (startToleranceCm > 0 && a.length > 0 && b.length > 0) {
    const ox = a[0].x - b[0].x;
    const oy = a[0].y - b[0].y;
    if (Math.sqrt(ox * ox + oy * oy) <= startToleranceCm) {
      const shifted: Pt[] = [];
      for (let i = 0; i < a.length; i++) shifted.push({ x: a[i].x - ox, y: a[i].y - oy });
      forward = Math.min(forward, meanDistance(shifted, b));
    }
  }

  const reversedTarget: Pt[] = [];
  for (let i = b.length - 1; i >= 0; i--) reversedTarget.push(b[i]);
  const backward = meanDistance(a, reversedTarget);

  // Drawn backwards: the shape is right but the direction is wrong. Report it
  // separately so the lesson can say something more useful than "missed".
  if (backward < forward && backward <= toleranceCm) {
    return { ok: false, reason: "reversed", meanErrorCm: backward };
  }

  if (ratio > maxLengthRatio) {
    return { ok: false, reason: "off", meanErrorCm: forward };
  }

  if (forward <= toleranceCm) {
    return { ok: true, reason: "ok", meanErrorCm: forward };
  }
  return { ok: false, reason: "off", meanErrorCm: forward };
}
