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
  Em: { line: "Two fingers, side by side. All six strings ring." },
  Am: { line: "Em's shape moved over one, plus your index." },
  C: { line: "A diagonal: ring, middle, index, stepping down." },
  G: { line: "Spread wide. The ring finger reaches the thin E." },
  D: { line: "A tight triangle on the thin three. Strum four." },
};

/** The line for a chord, or an empty string rather than an invented one. */
export function lineFor(id: string): string {
  const l = GUITAR_LESSON[id];
  return l ? l.line : "";
}

/** Shown once, the first time the guitar notebook opens. */
export const GUITAR_INTRO_LINE = "Watch the hand, then pinch each circle in order.";

/** Shown when every circle is placed and only the strum is left. */
export const GUITAR_STRUM_LINE = "Strum all strings";

/** Under the neck, always. The two marks a chord box uses and nothing else. */
export const GUITAR_LEGEND = "o = play open     x = don't play";

/**
 * The one instruction visible at any moment, in the words a teacher would use:
 * which finger, which string by NAME, which fret by NUMBER. Never a list — the
 * brief's "show one thing at a time" is the whole point of this function
 * existing instead of a block of text.
 *
 * `ordinal` is which step of the chord this is, so the first reads as an
 * opening instruction and the rest as continuations.
 */
export function stepLine(
  chordName: string,
  finger: number,
  stringName: string,
  fret: number,
  ordinal: number
): string {
  const who = fingerName(finger);
  const where = "the " + stringName + " string, fret " + fret;
  if (ordinal === 0) {
    return chordName + ": put finger " + finger + " (" + who + ") on " + where;
  }
  return "Now finger " + finger + " (" + who + ") on " + where;
}

/** Which finger is coming next, in words. Index 1..4. */
export function fingerName(finger: number): string {
  if (finger === 1) return "index";
  if (finger === 2) return "middle";
  if (finger === 3) return "ring";
  if (finger === 4) return "little";
  return "";
}

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
