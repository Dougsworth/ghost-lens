/**
 * GhostGuitarLesson — the words GHOST says about a chord.
 *
 * Owns:  one short line per chord, plus the handful of lines the turn itself
 *        needs. Pure data, no scene access, so the writing can be edited
 *        without touching the engine — the same split GhostKanaLesson uses.
 * Must not: know how any of it is laid out or when it is shown.
 *
 * Tone rules, inherited from the kana pack:
 *   - One line at a time. Never two sentences where one will do.
 *   - Say what the HAND does, not what the chord is in theory. "Two fingers,
 *     all six strings ring" teaches; "E minor triad" does not.
 *   - Name the thing that most often goes wrong, once, and only for the chord
 *     where it actually goes wrong.
 */

export type ChordLesson = {
  /** The one line shown while this chord is being learnt. */
  line: string;
};

export const GUITAR_LESSON: { [id: string]: ChordLesson } = {
  Em: { line: "Em: two fingers, side by side. All six strings ring." },
  Am: { line: "Am: the same shape, moved over one, with your index on top." },
  C: { line: "C: a diagonal — ring, middle, index, stepping down." },
  G: { line: "G: fingers spread wide. Reach the little one up to the top." },
  D: { line: "D: a tight triangle on the thin three. Strum only four." },
};

/** The line for a chord, or an empty string rather than an invented one. */
export function lineFor(id: string): string {
  const l = GUITAR_LESSON[id];
  return l ? l.line : "";
}

/** Shown once, the first time the guitar notebook opens. */
export const GUITAR_INTRO_LINE = "Watch the hand, then pinch each dot in order.";

/** Shown when every dot is placed and only the strum is left. */
export const GUITAR_STRUM_LINE = "Now brush down across the strings.";

/**
 * Said as each fingertip lands. Cycled rather than random so the same word
 * never lands twice running, which is what makes praise feel automatic.
 */
export const GUITAR_PRAISE = ["good", "that's it", "nice reach", "steady"];

export function praiseFor(n: number): string {
  if (GUITAR_PRAISE.length === 0) return "";
  const i = ((n % GUITAR_PRAISE.length) + GUITAR_PRAISE.length) % GUITAR_PRAISE.length;
  return GUITAR_PRAISE[i];
}

/** Which finger is coming next, in words. Index 1..4. */
export function fingerName(finger: number): string {
  if (finger === 1) return "index";
  if (finger === 2) return "middle";
  if (finger === 3) return "ring";
  if (finger === 4) return "little";
  return "";
}
