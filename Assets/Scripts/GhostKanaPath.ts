/**
 * GhostKanaPath — the stroke-path representation at the heart of the GHOST path engine.
 *
 * Owns:  turning KanaStrokes' normalised character data into cm-space, sheet-local
 *        polylines with arc-length parameterisation, so a brush can move along a
 *        stroke at a constant speed regardless of how the source points are spaced.
 * Shared by: GhostDemoPlayer (the ghost's demonstration) and — deliberately — the
 *        user's-turn tracer and stroke checker that come next. Both must read the
 *        SAME paths the ghost drew, which is why this lives in its own module and
 *        keeps the densified polyline (`points`) public alongside the raw input.
 * Must not: touch SceneObjects, components, materials, or time. Pure logic only.
 *
 * Stroke data credit: KanjiVG by Ulrich Apel, CC BY-SA 3.0.
 */

import { KANA } from "./KanaStrokes";

export interface Pt {
  x: number;
  y: number;
}

/** Arc-length step used to densify source points, in cm. Small enough that the
 *  ink ribbon's miter normals stay stable around tight kana curves. */
const RESAMPLE_CM = 0.18;

/**
 * One stroke, in sheet-local cm (origin = sheet centre, +x right, +y up).
 * Points are in the source's drawing order and direction — never reordered.
 */
export class StrokePath {
  /** The source points, converted to cm but otherwise untouched. */
  readonly raw: Pt[];
  /** `raw` resampled to a uniform arc-length step — what the ribbon and the
   *  (future) stroke checker should both walk. */
  readonly points: Pt[];
  /** Arc length from the start to `points[i]`, in cm. */
  readonly cumulative: number[];
  /** Total arc length, in cm. */
  readonly length: number;

  constructor(raw: Pt[]) {
    this.raw = raw;
    this.points = StrokePath.densify(raw, RESAMPLE_CM);

    const cum: number[] = [0];
    let total = 0;
    for (let i = 1; i < this.points.length; i++) {
      total += StrokePath.dist(this.points[i - 1], this.points[i]);
      cum.push(total);
    }
    this.cumulative = cum;
    this.length = total;
  }

  get start(): Pt {
    return this.points[0];
  }

  get end(): Pt {
    return this.points[this.points.length - 1];
  }

  /** Position at normalised ARC LENGTH t (0..1) — constant speed along the stroke. */
  pointAt(t: number): Pt {
    const n = this.points.length;
    if (n === 0) return { x: 0, y: 0 };
    if (n === 1 || this.length <= 1e-6) return this.points[0];

    const target = Math.max(0, Math.min(1, t)) * this.length;
    let i = 1;
    while (i < n && this.cumulative[i] < target) i++;
    if (i >= n) return this.points[n - 1];

    const segLen = this.cumulative[i] - this.cumulative[i - 1];
    const f = segLen > 1e-6 ? (target - this.cumulative[i - 1]) / segLen : 0;
    const a = this.points[i - 1];
    const b = this.points[i];
    return { x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f };
  }

  private static dist(a: Pt, b: Pt): number {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    return Math.sqrt(dx * dx + dy * dy);
  }

  /** Resample a polyline to a uniform step, always keeping the first and last point. */
  private static densify(src: Pt[], stepCm: number): Pt[] {
    const clean: Pt[] = [];
    for (let i = 0; i < src.length; i++) {
      if (clean.length === 0 || StrokePath.dist(src[i], clean[clean.length - 1]) > 1e-5) {
        clean.push({ x: src[i].x, y: src[i].y });
      }
    }
    if (clean.length === 0) return [{ x: 0, y: 0 }, { x: 0, y: 0 }];
    if (clean.length === 1) {
      return [clean[0], { x: clean[0].x + 1e-3, y: clean[0].y }];
    }

    const out: Pt[] = [clean[0]];
    let carry = 0;
    for (let i = 1; i < clean.length; i++) {
      const a = clean[i - 1];
      const b = clean[i];
      const seg = StrokePath.dist(a, b);
      if (seg <= 1e-6) continue;
      let d = stepCm - carry;
      while (d < seg) {
        const f = d / seg;
        out.push({ x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f });
        d += stepCm;
      }
      carry = seg - (d - stepCm);
    }

    const last = clean[clean.length - 1];
    if (StrokePath.dist(out[out.length - 1], last) > 1e-4) {
      out.push(last);
    } else {
      out[out.length - 1] = last;
    }
    return out;
  }
}

/** One character: its strokes, in the correct writing order. */
export class GlyphPath {
  readonly character: string;
  readonly strokes: StrokePath[];

  constructor(character: string, strokes: StrokePath[]) {
    this.character = character;
    this.strokes = strokes;
  }

  get strokeCount(): number {
    return this.strokes.length;
  }
}

/** True when KanaStrokes has data for this character (any of the 168). */
export function hasCharacter(character: string): boolean {
  return !!KANA[character];
}

/**
 * Build a glyph in sheet-local cm.
 *
 * @param unitCm   cm per 1.0 of normalised character height (the source data uses
 *                 1.0 = full character height, centre origin, +y up).
 * @param recenter centre each character on its own bounding box, so every one of
 *                 the 168 kana sits in the middle of the practice square.
 */
export function buildGlyphPath(character: string, unitCm: number, recenter: boolean): GlyphPath | null {
  const data = KANA[character];
  if (!data || data.length === 0) return null;

  let cx = 0;
  let cy = 0;
  if (recenter) {
    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;
    for (let s = 0; s < data.length; s++) {
      const stroke = data[s];
      for (let p = 0; p < stroke.length; p++) {
        const px = stroke[p][0];
        const py = stroke[p][1];
        if (px < minX) minX = px;
        if (px > maxX) maxX = px;
        if (py < minY) minY = py;
        if (py > maxY) maxY = py;
      }
    }
    cx = (minX + maxX) * 0.5;
    cy = (minY + maxY) * 0.5;
  }

  const strokes: StrokePath[] = [];
  for (let s = 0; s < data.length; s++) {
    const stroke = data[s];
    const pts: Pt[] = [];
    for (let p = 0; p < stroke.length; p++) {
      pts.push({ x: (stroke[p][0] - cx) * unitCm, y: (stroke[p][1] - cy) * unitCm });
    }
    strokes.push(new StrokePath(pts));
  }
  return new GlyphPath(character, strokes);
}
