/**
 * GhostStrokeCheck — does the user's drag follow the guide stroke?
 *
 * Now a thin adapter: the matching itself lives in GhostSkillCheck, the one
 * checker every pack shares (a stroke is just "one dot moving along a path").
 * This file keeps the writing-specific defaults and the shape the turn
 * controller already expects.
 *
 * The brief's rule is forgiveness: "only the rough shape and direction need to
 * match, not precision". Arc-length resampling plus time warping make the
 * check speed-independent; scoring against the reversed guide catches a
 * stroke drawn the wrong way round.
 */

import { Pt, StrokePath } from "./GhostKanaPath";
import { checkPath, KP } from "./GhostSkillCheck";

/** How many pieces a stroke is split into when finding the worst part. */
export const STROKE_PARTS = 4;

export type StrokeVerdict = {
  ok: boolean;
  /** "ok" | "off" (shape wrong) | "reversed" (right shape, wrong direction) | "short" (barely moved) */
  reason: string;
  /** Mean aligned distance between the drag and the guide, in cm. Useful for tuning. */
  meanErrorCm: number;
  /** Which of the STROKE_PARTS pieces was furthest off (0 = start). */
  worstPart: number;
  /** The guide points of that piece, sheet-local cm, so it can be lit up. */
  worstPoints: Pt[];
};

/** Number of comparison samples. Coarse on purpose — we are matching gesture, not tracing. */
const SAMPLES = 24;

/** DTW band: a sample may pair with samples up to this fraction of the stroke away. */
const TIME_WINDOW = 0.25;

/**
 * Compare a drawn polyline (sheet-local cm) against the guide stroke.
 *
 * @param toleranceCm    mean error allowed, in cm. Larger = more forgiving.
 * @param minLengthRatio drawn length must be at least this fraction of the
 *                       guide's, so a dab at the start point cannot pass.
 * @param maxLengthRatio and at most this multiple, so wild scribbling fails.
 * @param startToleranceCm how far from the start point a drag may begin before
 *                       that offset counts against the shape.
 */
export function checkStroke(
  drawn: Pt[],
  target: StrokePath,
  toleranceCm: number,
  minLengthRatio: number,
  maxLengthRatio: number,
  startToleranceCm: number = 0
): StrokeVerdict {
  const r = checkPath(drawn as KP[], target.points as KP[], {
    tolerance: toleranceCm,
    parts: STROKE_PARTS,
    window: TIME_WINDOW,
    checkDirection: true,
    samples: SAMPLES,
    minLengthRatio: minLengthRatio,
    maxLengthRatio: maxLengthRatio,
    startTolerance: startToleranceCm,
  });
  const pts: Pt[] = [];
  for (let i = 0; i < r.worstPoints.length; i++) pts.push({ x: r.worstPoints[i].x, y: r.worstPoints[i].y });
  return {
    ok: r.ok,
    reason: r.reason,
    meanErrorCm: r.meanError,
    worstPart: r.worstPart,
    worstPoints: pts,
  };
}
