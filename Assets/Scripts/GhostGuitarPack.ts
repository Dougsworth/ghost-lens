/**
 * GhostGuitarPack — the guitar chord pack.
 *
 * Owns:  five beginner chords as per-string fret and finger data. This is the
 *        third data pack on the same engine (path / pose / step), and like the
 *        kana and ASL packs it is deliberately DATA: adding more chords, or a
 *        ukulele, means adding entries here, not writing code.
 * Must not: draw, animate, sound, or know about the scene.
 *
 * Chord shapes credit: chords-db by tombatossals
 * (github.com/tombatossals/chords-db), guitar data, MIT licence.
 *
 * Convention, matching every chord diagram a learner will ever meet:
 *   - Strings are listed LOW E FIRST (6th string) through HIGH E (1st string),
 *     which is left-to-right on a diagram and left-to-right on GHOST's board.
 *   - `frets[s]`: -1 muted (×), 0 open (○), 1..5 a fretted note.
 *   - `fingers[s]`: 0 none, 1 index, 2 middle, 3 ring, 4 little. The ghost
 *     places them in ascending finger order, which is also how a teacher says
 *     it: "index first, then middle, then ring."
 *
 * The fret numbers here are the SAME table the audio generator reads
 * (tempAssetGen/gen_chords_guitar.js), so the pitch that sounds can never
 * disagree with the dots drawn on the board — both are (open string + fret).
 */

/** Standard tuning, low E first, as MIDI note numbers. Shared with the generator. */
export const OPEN_STRING_MIDI = [40, 45, 50, 55, 59, 64];

/**
 * String names as a player says them, low E first. The low and high E are
 * written "E" and "e" because that is how every chord book and every teacher
 * tells them apart, and a learner reading the board should meet the notation
 * they will meet everywhere else.
 */
export const STRING_NAMES = ["E", "A", "D", "G", "B", "e"];

/**
 * One colour per finger, so a numbered circle can be told from its neighbours
 * at a glance. Additive display: these are EMITTED light, separated by hue and
 * kept uniformly bright — a darker colour would simply read as more
 * transparent, so brightness cannot be used to tell fingers apart.
 */
export const FINGER_COLORS: vec4[] = [
  new vec4(1.00, 0.95, 0.86, 1), // 0 unused — the ink value, as a safe default
  new vec4(1.00, 0.74, 0.34, 1), // 1 index  — amber
  new vec4(0.52, 0.95, 0.58, 1), // 2 middle — green
  new vec4(0.50, 0.78, 1.00, 1), // 3 ring   — sky
  new vec4(1.00, 0.62, 0.88, 1), // 4 little — pink
];

export function fingerColor(finger: number): vec4 {
  const i = Math.max(0, Math.min(FINGER_COLORS.length - 1, finger));
  return FINGER_COLORS[i];
}

export interface Chord {
  /** Stable id; also the audio clip name, Assets/GeneratedSFX/Chord_<id>.wav. */
  id: string;
  /** Printed above the board. */
  name: string;
  /** Fret per string, low E first. -1 muted, 0 open. */
  frets: number[];
  /** Finger per string, low E first. 0 none, 1 index, 2 middle, 3 ring, 4 little. */
  fingers: number[];
}

/** The five chords of the guitar pack's first lesson set, easiest shape first. */
export const GUITAR_CHORDS: Chord[] = [
  // Two fingers, nothing muted — the gentlest first chord on the instrument.
  { id: "Em", name: "Em", frets: [0, 2, 2, 0, 0, 0], fingers: [0, 2, 3, 0, 0, 0] },
  // Em's shape moved across one string, plus the index on the B string.
  { id: "Am", name: "Am", frets: [-1, 0, 2, 2, 1, 0], fingers: [0, 0, 2, 3, 1, 0] },
  { id: "C", name: "C", frets: [-1, 3, 2, 0, 1, 0], fingers: [0, 3, 2, 0, 1, 0] },
  // The three-finger beginner G; the four-finger voicing comes later.
  { id: "G", name: "G", frets: [3, 2, 0, 0, 0, 3], fingers: [2, 1, 0, 0, 0, 3] },
  { id: "D", name: "D", frets: [-1, -1, 0, 2, 3, 2], fingers: [0, 0, 0, 1, 3, 2] },
];

/** One fingertip the user has to place: which string, which fret, which finger. */
export interface FingerTarget {
  /** 0 = low E, 5 = high E. */
  stringIndex: number;
  /** 1..5. */
  fret: number;
  /** 1 index, 2 middle, 3 ring, 4 little. */
  finger: number;
}

/**
 * The fingertips of a chord, in the order they are placed — ascending finger
 * number, so index leads. Ordering lives here rather than in the controller
 * because it is part of how the chord is TAUGHT, which is pack data.
 */
export function fingerTargets(chord: Chord): FingerTarget[] {
  const out: FingerTarget[] = [];
  for (let s = 0; s < chord.frets.length; s++) {
    if (chord.frets[s] > 0 && chord.fingers[s] > 0) {
      out.push({ stringIndex: s, fret: chord.frets[s], finger: chord.fingers[s] });
    }
  }
  out.sort((a, b) => a.finger - b.finger);
  return out;
}

/** The sounding pitch of each string in a chord, or null where it is muted. */
export function chordMidi(chord: Chord): (number | null)[] {
  const out: (number | null)[] = [];
  for (let s = 0; s < chord.frets.length; s++) {
    out.push(chord.frets[s] < 0 ? null : OPEN_STRING_MIDI[s] + chord.frets[s]);
  }
  return out;
}

export function findChord(id: string): Chord | null {
  for (let i = 0; i < GUITAR_CHORDS.length; i++) {
    if (GUITAR_CHORDS[i].id === id) return GUITAR_CHORDS[i];
  }
  return null;
}
