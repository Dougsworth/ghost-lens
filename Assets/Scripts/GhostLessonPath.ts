/**
 * GhostLessonPath — turn a planned lesson's "path" step into something the
 * kana engine can already draw.
 *
 * Owns:  the one conversion, and nothing else. Pure logic, no scene access.
 * Must not: fetch, play, or decide which step is next.
 *
 * Why this is three lines of real work: the lesson schema's path coordinates
 * use EXACTLY the convention KanaStrokes already uses — normalised -0.5..0.5,
 * centre origin, +y up, strokes in drawing order. That was not a coincidence
 * when the schema was written, and it is what lets an LLM-planned lesson run
 * on the same demo player, the same stroke checker and the same Watch/Try/Fix
 * loop as あ, with no second engine and no special case anywhere downstream.
 *
 * Everything this module does is scale the numbers into sheet centimetres and
 * hand back the same GlyphPath type the kana pack produces.
 */

import { GlyphPath, Pt, StrokePath } from "./GhostKanaPath";
import { Lesson, LessonStep, RenderPath } from "./GhostLessonSchema";

/** True when this step is one the path engine can actually teach and check. */
export function isTraceable(step: LessonStep): boolean {
  return !!step && !!step.render && step.render.kind === "path";
}

/**
 * Build a drawable glyph from a path step.
 *
 * `unitCm` is cm per 1.0 of normalised height — the same number the kana pack
 * passes, so a planned lesson lands at the same size on the same sheet.
 * Returns null when the step is not a path, so the caller can fall back to a
 * "got it" style step rather than guessing at geometry.
 */
export function glyphFromStep(step: LessonStep, label: string, unitCm: number): GlyphPath | null {
  if (!isTraceable(step)) return null;
  const render = step.render as RenderPath;
  const strokes: StrokePath[] = [];

  for (let s = 0; s < render.strokes.length; s++) {
    const src = render.strokes[s];
    if (!src || src.length < 2) continue;
    const pts: Pt[] = [];
    for (let i = 0; i < src.length; i++) {
      pts.push({ x: src[i][0] * unitCm, y: src[i][1] * unitCm });
    }
    strokes.push(new StrokePath(pts));
  }
  if (strokes.length === 0) return null;
  return new GlyphPath(label, strokes);
}

/**
 * The steps of a lesson that can actually be drawn and checked.
 *
 * A planned lesson may mix path steps with hands, objects or plain tips. This
 * build teaches the path ones; the rest are shown as their title and tip and
 * self-checked, which is the brief's tier-3 behaviour and the same thing the
 * ASL pack does.
 */
export function traceableSteps(lesson: Lesson): number[] {
  const out: number[] = [];
  if (!lesson || !lesson.steps) return out;
  for (let i = 0; i < lesson.steps.length; i++) {
    if (isTraceable(lesson.steps[i])) out.push(i);
  }
  return out;
}
