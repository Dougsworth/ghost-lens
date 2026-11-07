/**
 * GhostSkillCheck — one checker for every skill.
 *
 * The idea: every skill is DOTS THAT MOVE.
 *   writing a kana   -> 1 dot (the brush tip) moving along a path
 *   a guitar chord   -> 21 dots (hand joints) holding a shape
 *   an ASL sign      -> 21 dots per hand, a shape and then a movement
 *   a knot / origami -> points on the object, step after step
 *
 * So the learner's attempt and the ghost's target are both a Track: a list of
 * Frames over time, each Frame a list of keypoints. Checking is always the
 * same three moves:
 *   1. line them up in SPACE — measure from an anchor and scale to size, so a
 *      big あ and a small あ (or a big and a small hand) compare fairly;
 *   2. line them up in TIME — dynamic time warping, so going faster or slower
 *      than the ghost is not an error;
 *   3. score each PART — the overall error decides pass/fail, and the worst
 *      part is what the lesson lights up ("just this finger", "the end of
 *      stroke 2").
 * A still pose skips step 2; a path is mostly step 2.
 *
 * Owns:  the maths only. Pure functions: no scene access, no state, no side
 *        effects, so tolerances can be tuned and reasoned about on their own.
 * Must not: know what skill it is checking. A pack supplies target dots, an
 *        anchor and a tolerance; nothing else.
 */

/** One keypoint. 2D for paths on a surface, 3D for hands and objects. */
export interface KP {
  x: number;
  y: number;
  z?: number;
}

/** Every keypoint at one moment: 1 brush tip, or 21 hand joints, or N object points. */
export type Frame = KP[];

/** Keypoints over time. A still pose is a Track of length 1. */
export type Track = Frame[];

/** Where measuring starts from, and what counts as "1 unit" of size. */
export interface Anchor {
  origin: KP;
  scale: number;
}

export type CheckReason = "ok" | "off" | "reversed" | "short";

export interface CheckResult {
  ok: boolean;
  reason: CheckReason;
  /** Mean aligned error, in anchor units (cm for a sheet anchored at scale 1). */
  meanError: number;
  /** 0..1, 1 = perfect. Derived from meanError against the tolerance; for display. */
  score: number;
  /** Mean error of each part, in order (stroke segments, or finger groups). */
  partErrors: number[];
  /** Index into partErrors of the part furthest off. */
  worstPart: number;
  /** For paths: the target points of the worst part, so it can be lit up. */
  worstPoints: KP[];
}

// ── Small vector helpers ────────────────────────────────────────────────────

function dist(a: KP, b: KP): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  const dz = (a.z || 0) - (b.z || 0);
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

/** Mean keypoint-to-keypoint distance between two frames of the same shape. */
export function frameDistance(a: Frame, b: Frame): number {
  const n = Math.min(a.length, b.length);
  if (n === 0) return Infinity;
  let sum = 0;
  for (let i = 0; i < n; i++) sum += dist(a[i], b[i]);
  return sum / n;
}

// ── Move 1: line up in SPACE ────────────────────────────────────────────────

/** Express every keypoint relative to the anchor, in anchor units. */
export function normalizeFrame(frame: Frame, anchor: Anchor): Frame {
  const s = anchor.scale > 1e-6 ? anchor.scale : 1;
  const o = anchor.origin;
  const out: Frame = [];
  for (let i = 0; i < frame.length; i++) {
    const p = frame[i];
    out.push({ x: (p.x - o.x) / s, y: (p.y - o.y) / s, z: ((p.z || 0) - (o.z || 0)) / s });
  }
  return out;
}

export function normalizeTrack(track: Track, anchor: Anchor): Track {
  const out: Track = [];
  for (let i = 0; i < track.length; i++) out.push(normalizeFrame(track[i], anchor));
  return out;
}

/**
 * A hand anchors to itself: origin at the wrist (joint 0), one unit = wrist to
 * middle-finger knuckle (joint 9). MediaPipe / SIK 21-joint order.
 */
export function handAnchor(frame: Frame): Anchor {
  if (frame.length < 10) return { origin: { x: 0, y: 0, z: 0 }, scale: 1 };
  return { origin: frame[0], scale: dist(frame[0], frame[9]) };
}

/** Finger groups for a 21-joint hand, so "worst part" can name a finger. */
export const HAND_PARTS: number[][] = [
  [1, 2, 3, 4], // thumb
  [5, 6, 7, 8], // index
  [9, 10, 11, 12], // middle
  [13, 14, 15, 16], // ring
  [17, 18, 19, 20], // little
];
export const HAND_PART_NAMES = ["thumb", "index finger", "middle finger", "ring finger", "little finger"];

/** Resample a single-dot path to `count` points spaced evenly by arc length. */
export function resamplePath(points: KP[], count: number): KP[] {
  const out: KP[] = [];
  if (points.length === 0) return out;
  const cum: number[] = [0];
  let total = 0;
  for (let i = 1; i < points.length; i++) {
    total += dist(points[i - 1], points[i]);
    cum.push(total);
  }
  if (points.length === 1 || total <= 1e-6) {
    for (let i = 0; i < count; i++) out.push(points[0]);
    return out;
  }
  let seg = 1;
  for (let i = 0; i < count; i++) {
    const target = (i / (count - 1)) * total;
    while (seg < points.length - 1 && cum[seg] < target) seg++;
    const segLen = cum[seg] - cum[seg - 1];
    const f = segLen > 1e-6 ? (target - cum[seg - 1]) / segLen : 0;
    const a = points[seg - 1];
    const b = points[seg];
    out.push({
      x: a.x + (b.x - a.x) * f,
      y: a.y + (b.y - a.y) * f,
      z: (a.z || 0) + ((b.z || 0) - (a.z || 0)) * f,
    });
  }
  return out;
}

export function pathLength(points: KP[]): number {
  let total = 0;
  for (let i = 1; i < points.length; i++) total += dist(points[i - 1], points[i]);
  return total;
}

// ── Move 2: line up in TIME (dynamic time warping) ──────────────────────────

export interface Alignment {
  /** Mean frame distance along the best alignment path. */
  meanCost: number;
  /** For each TARGET frame, the mean distance of the attempt frames matched to it. */
  perTarget: number[];
}

/**
 * Dynamic time warping: find the cheapest way to pair attempt frames with
 * target frames, in order, letting either side "wait" while the other moves.
 * That is what lets a slow first half and a quick second half still match.
 *
 * `window` (0..1) is a Sakoe-Chiba band: a frame may only pair with frames
 * within that fraction of the track of its own position. It stops DTW from
 * "cheating" by matching the whole attempt to one corner of the target.
 */
export function alignDTW(attempt: Track, target: Track, window: number): Alignment {
  const n = attempt.length;
  const m = target.length;
  if (n === 0 || m === 0) return { meanCost: Infinity, perTarget: [] };

  const w = Math.max(Math.abs(n - m), Math.ceil(Math.max(n, m) * Math.max(0, Math.min(1, window))), 1);
  const INF = Number.MAX_VALUE;
  const D: number[][] = [];
  for (let i = 0; i <= n; i++) {
    const row: number[] = [];
    for (let j = 0; j <= m; j++) row.push(INF);
    D.push(row);
  }
  D[0][0] = 0;
  for (let i = 1; i <= n; i++) {
    const lo = Math.max(1, Math.round((i * m) / n) - w);
    const hi = Math.min(m, Math.round((i * m) / n) + w);
    for (let j = lo; j <= hi; j++) {
      const c = frameDistance(attempt[i - 1], target[j - 1]);
      D[i][j] = c + Math.min(D[i - 1][j], D[i][j - 1], D[i - 1][j - 1]);
    }
  }
  if (D[n][m] >= INF) return { meanCost: Infinity, perTarget: [] };

  // Walk back along the cheapest path to see which attempt frames each target
  // frame was matched with.
  const sums: number[] = [];
  const counts: number[] = [];
  for (let j = 0; j < m; j++) {
    sums.push(0);
    counts.push(0);
  }
  let i = n;
  let j = m;
  let steps = 0;
  let total = 0;
  while (i > 0 && j > 0) {
    const c = frameDistance(attempt[i - 1], target[j - 1]);
    sums[j - 1] += c;
    counts[j - 1] += 1;
    total += c;
    steps++;
    const diag = D[i - 1][j - 1];
    const up = D[i - 1][j];
    const left = D[i][j - 1];
    if (diag <= up && diag <= left) {
      i--;
      j--;
    } else if (up < left) {
      i--;
    } else {
      j--;
    }
  }
  const perTarget: number[] = [];
  for (let k = 0; k < m; k++) perTarget.push(counts[k] > 0 ? sums[k] / counts[k] : 0);
  return { meanCost: steps > 0 ? total / steps : Infinity, perTarget: perTarget };
}

// ── Move 3: score each PART ─────────────────────────────────────────────────

function splitIntoParts(perTarget: number[], parts: number): number[] {
  const out: number[] = [];
  const m = perTarget.length;
  const p = Math.max(1, Math.min(parts, m));
  for (let k = 0; k < p; k++) {
    const a = Math.floor((k * m) / p);
    const b = Math.max(a + 1, Math.floor(((k + 1) * m) / p));
    let s = 0;
    for (let i = a; i < b; i++) s += perTarget[i];
    out.push(s / (b - a));
  }
  return out;
}

function worstIndex(values: number[]): number {
  let best = 0;
  for (let i = 1; i < values.length; i++) if (values[i] > values[best]) best = i;
  return best;
}

function scoreFrom(meanError: number, tolerance: number): number {
  if (!isFinite(meanError)) return 0;
  const t = tolerance > 1e-6 ? tolerance : 1;
  return Math.max(0, Math.min(1, 1 - meanError / (2 * t)));
}

// ── The two shapes of check ─────────────────────────────────────────────────

export interface MotionOptions {
  /** Mean aligned error allowed, in anchor units. Bigger = more forgiving. */
  tolerance: number;
  /** How many parts to report (e.g. 4 for a stroke: start, early, late, end). */
  parts: number;
  /** DTW band, 0..1. */
  window: number;
  /** Also test the reversed target, and report "reversed" if that fits better. */
  checkDirection: boolean;
}

/**
 * A MOVING target: a path, or a pose sequence. Both tracks must already be in
 * the same anchor space (see normalizeTrack).
 */
export function checkMotion(attempt: Track, target: Track, opts: MotionOptions): CheckResult {
  const fwd = alignDTW(attempt, target, opts.window);
  const partErrors = splitIntoParts(fwd.perTarget, opts.parts);
  const worst = worstIndex(partErrors);

  // A path drawn the right shape but the wrong way round is a real, specific
  // mistake (stroke direction is most of what kana practice teaches).
  if (opts.checkDirection) {
    const reversed: Track = [];
    for (let i = target.length - 1; i >= 0; i--) reversed.push(target[i]);
    const back = alignDTW(attempt, reversed, opts.window);
    if (back.meanCost < fwd.meanCost && back.meanCost <= opts.tolerance) {
      return {
        ok: false,
        reason: "reversed",
        meanError: back.meanCost,
        score: scoreFrom(back.meanCost, opts.tolerance),
        partErrors: partErrors,
        worstPart: 0,
        worstPoints: partPoints(target, 0, opts.parts),
      };
    }
  }

  const ok = fwd.meanCost <= opts.tolerance;
  return {
    ok: ok,
    reason: ok ? "ok" : "off",
    meanError: fwd.meanCost,
    score: scoreFrom(fwd.meanCost, opts.tolerance),
    partErrors: partErrors,
    worstPart: worst,
    worstPoints: partPoints(target, worst, opts.parts),
  };
}

/** The first keypoint of every frame in one part of a track (paths: the dot itself). */
function partPoints(track: Track, part: number, parts: number): KP[] {
  const m = track.length;
  const p = Math.max(1, Math.min(parts, m));
  const a = Math.floor((part * m) / p);
  const b = Math.max(a + 1, Math.floor(((part + 1) * m) / p));
  const out: KP[] = [];
  // Include the boundary point so adjacent parts visually join.
  for (let i = a; i < Math.min(m, b + 1); i++) if (track[i].length > 0) out.push(track[i][0]);
  return out;
}

/**
 * A STILL target: one hand shape (a chord, a handshape). Time alignment drops
 * out; each frame is normalised to its own wrist so hand position and size do
 * not count, then the error is grouped by finger.
 */
export function checkPose(attempt: Frame, target: Frame, tolerance: number, groups: number[][]): CheckResult {
  const a = normalizeFrame(attempt, handAnchor(attempt));
  const b = normalizeFrame(target, handAnchor(target));
  const partErrors: number[] = [];
  let sum = 0;
  let count = 0;
  for (let g = 0; g < groups.length; g++) {
    let s = 0;
    let c = 0;
    for (let k = 0; k < groups[g].length; k++) {
      const idx = groups[g][k];
      if (idx >= a.length || idx >= b.length) continue;
      const d = dist(a[idx], b[idx]);
      s += d;
      c++;
    }
    partErrors.push(c > 0 ? s / c : 0);
    sum += s;
    count += c;
  }
  const mean = count > 0 ? sum / count : Infinity;
  const ok = mean <= tolerance;
  return {
    ok: ok,
    reason: ok ? "ok" : "off",
    meanError: mean,
    score: scoreFrom(mean, tolerance),
    partErrors: partErrors,
    worstPart: worstIndex(partErrors),
    worstPoints: [],
  };
}

// ── Paths: the writing adapter ──────────────────────────────────────────────

export interface PathOptions extends MotionOptions {
  /** Comparison samples per path. Coarse on purpose: matching gesture, not tracing. */
  samples: number;
  /** Drawn length must be at least this fraction of the target's (a dab cannot pass). */
  minLengthRatio: number;
  /** And at most this multiple (scribbling cannot pass). */
  maxLengthRatio: number;
  /**
   * Starting a little away from the start point shifts every sample by that
   * offset. Within this distance the offset is forgiven: it forgives WHERE you
   * began, not WHAT you drew.
   */
  startTolerance: number;
}

/** Turn a single-dot path into a Track (one keypoint per frame). */
export function pathToTrack(points: KP[]): Track {
  const out: Track = [];
  for (let i = 0; i < points.length; i++) out.push([points[i]]);
  return out;
}

/**
 * Check one drawn stroke against its target stroke. Both are in the same
 * surface space (sheet-local cm), so the anchor is the sheet itself and step 1
 * is already done; arc-length resampling plus DTW handle step 2.
 */
export function checkPath(drawn: KP[], target: KP[], opts: PathOptions): CheckResult {
  const fail = (reason: CheckReason): CheckResult => ({
    ok: false,
    reason: reason,
    meanError: Infinity,
    score: 0,
    partErrors: [],
    worstPart: 0,
    worstPoints: [],
  });
  if (drawn.length < 2) return fail("short");

  const targetLen = pathLength(target);
  const ratio = targetLen > 1e-6 ? pathLength(drawn) / targetLen : 0;
  if (ratio < opts.minLengthRatio) return fail("short");

  const a = resamplePath(drawn, opts.samples);
  const b = resamplePath(target, opts.samples);
  const tb = pathToTrack(b);
  let result = checkMotion(pathToTrack(a), tb, opts);

  // Start-point forgiveness: rescore with the start offset removed, and keep
  // the kinder reading. Bounded, so a stroke in the wrong place still fails.
  if (opts.startTolerance > 0) {
    const ox = a[0].x - b[0].x;
    const oy = a[0].y - b[0].y;
    if (Math.sqrt(ox * ox + oy * oy) <= opts.startTolerance) {
      const shifted: KP[] = [];
      for (let i = 0; i < a.length; i++) shifted.push({ x: a[i].x - ox, y: a[i].y - oy });
      const again = checkMotion(pathToTrack(shifted), tb, opts);
      if (again.meanError < result.meanError) result = again;
    }
  }

  if (result.reason !== "reversed" && ratio > opts.maxLengthRatio) {
    return {
      ok: false,
      reason: "off",
      meanError: result.meanError,
      score: result.score,
      partErrors: result.partErrors,
      worstPart: result.worstPart,
      worstPoints: result.worstPoints,
    };
  }
  return result;
}

/** Plain-words name for a part of a path split into `parts` pieces. */
export function pathPartName(part: number, parts: number): string {
  if (parts <= 1) return "the stroke";
  if (part === 0) return "the start";
  if (part === parts - 1) return "the end";
  return part < parts / 2 ? "the first half" : "the second half";
}
