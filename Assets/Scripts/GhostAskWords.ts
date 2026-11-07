/**
 * GhostAskWords — Ask GHOST's offline word list.
 *
 * Owns:  the fixed set of words the user can pick when the Remote Service
 *        Gateway is unavailable. The design brief names this list as the
 *        fallback that lets Ask GHOST pass on its own: "picking 'friend' from
 *        the fallback list of 10 words does exactly the same thing".
 * Must not: call out to anything. It is data.
 *
 * Every word is spelled in kana that KanaStrokes can draw, so the path engine
 * writes it stroke by stroke exactly as it writes a lesson character.
 */

export interface AskWord {
  /** English prompt shown on the pickable tile. */
  english: string;
  /** Kana spelling GHOST will write, one character at a time. */
  kana: string;
  /** Short meaning shown in small type beside the sheet. */
  meaning: string;
}

/** The ten-word offline list. "friend" is the brief's worked example. */
export const ASK_WORDS: AskWord[] = [
  { english: "friend", kana: "ともだち", meaning: "friend" },
  { english: "cat", kana: "ねこ", meaning: "cat" },
  { english: "dog", kana: "いぬ", meaning: "dog" },
  { english: "water", kana: "みず", meaning: "water" },
  { english: "mountain", kana: "やま", meaning: "mountain" },
  { english: "sea", kana: "うみ", meaning: "sea" },
  { english: "sky", kana: "そら", meaning: "sky" },
  { english: "flower", kana: "はな", meaning: "flower" },
  { english: "person", kana: "ひと", meaning: "person" },
  { english: "rain", kana: "あめ", meaning: "rain" },
];

/** Find a word by its English prompt, case-insensitively. */
export function findAskWord(english: string): AskWord | null {
  const q = english.trim().toLowerCase();
  for (let i = 0; i < ASK_WORDS.length; i++) {
    if (ASK_WORDS[i].english.toLowerCase() === q) return ASK_WORDS[i];
  }
  return null;
}
