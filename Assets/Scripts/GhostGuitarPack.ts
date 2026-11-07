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
