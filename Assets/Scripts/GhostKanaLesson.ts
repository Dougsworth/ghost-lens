/**
 * GhostKanaLesson — the words GHOST says about a character.
 *
 * Owns:  romaji, a memory hook, and a one-line tip per stroke. Pure data, no
 *        scene access, so the writing can be edited without touching the engine.
 * Must not: know how any of it is laid out or when it is shown.
 *
 * Tone rules, from the brief's "show one thing at a time":
 *   - One line at a time. Never two sentences where one will do.
 *   - Tips describe the MOVEMENT, not the shape ("curve down and around", not
 *     "draw a loop"), because the hand is what is being taught.
 *   - Hooks are deliberately silly. A hook you can picture beats a correct
 *     description you cannot.
 *
 * Stroke data credit: KanjiVG by Ulrich Apel, CC BY-SA 3.0.
 */

export type KanaLesson = {
  /** Large, under the character: how it sounds. */
  romaji: string;
  /** Tiny, under the romaji: something to picture. */
  hook: string;
  /** One line per stroke, in stroke order. Shown just before that stroke. */
  tips: string[];
};

export const KANA_LESSON: { [ch: string]: KanaLesson } = {
  "あ": {
    romaji: "a",
    hook: "an Apple with a stem",
    tips: ["left to right", "straight down through it", "curve down and around"],
  },
  "い": {
    romaji: "i",
    hook: "two eels swimming",
    tips: ["down, then flick up", "a short stroke down"],
  },
  "う": {
    romaji: "u",
    hook: "a bird's beak, pointing up",
    tips: ["a small mark on top", "across, then curve down and in"],
  },
  "え": {
    romaji: "e",
    hook: "an Exotic bird on a perch",
    tips: ["a small mark on top", "across, down and out to the right"],
  },
  "お": {
    romaji: "o",
    hook: "like あ, with a tail",
    tips: ["left to right", "down and loop around", "a short flick on the right"],
  },
};

/** Lesson text for a character, or null if this pack has nothing to say yet. */
export function lessonFor(ch: string): KanaLesson | null {
  const l = KANA_LESSON[ch];
  return l ? l : null;
}

/**
 * The tip for one stroke. Falls back to an empty string rather than inventing
 * guidance: a wrong instruction is worse than none.
 */
export function tipFor(ch: string, strokeIndex: number): string {
  const l = KANA_LESSON[ch];
  if (!l || strokeIndex < 0 || strokeIndex >= l.tips.length) return "";
  return l.tips[strokeIndex];
}

/**
 * Said once when a stroke is accepted. Cycled rather than random so the same
 * word never lands twice in a row, which is what makes praise feel automatic.
 */
export const PRAISE = ["nice", "clean stroke", "that's it", "good line", "steady"];

export function praiseFor(n: number): string {
  if (PRAISE.length === 0) return "";
  const i = ((n % PRAISE.length) + PRAISE.length) % PRAISE.length;
  return PRAISE[i];
}

/** Shown once, the first time a lesson opens. */
export const INTRO_LINE = "Watch the brush, then pinch to paint.";
