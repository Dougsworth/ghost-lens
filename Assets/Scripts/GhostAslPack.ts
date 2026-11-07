/**
 * GhostAslPack — the ASL pose pack.
 *
 * Owns:  the five signs as sequences of hand poses. This is the second of the
 *        brief's three pack types (path / pose / step), and it is deliberately
 *        DATA: the same engine shape as the kana pack, so adding JSL or guitar
 *        chords later means adding a file, not code.
 * Must not: draw, animate, or know about the scene.
 *
 * A pose is per-finger curl plus a wrist placement. Curl runs 0 (straight) to
 * 1 (fully folded), in thumb, index, middle, ring, little order — the same
 * order MediaPipe and SIK use, so a future pose CHECK can compare against the
 * user's real hand without remapping anything.
 */

export interface HandPose {
  /** Curl per finger, 0 = straight, 1 = folded. Order: thumb, index, middle, ring, little. */
  curl: number[];
  /** Fingers fanned apart, 0 = together, 1 = spread. */
  spread: number;
  /** Wrist offset from the sign's anchor, in cm. +x right, +y up, +z toward the user. */
  offsetCm: number[];
  /** Wrist rotation as Euler degrees (pitch, yaw, roll). */
  rotationDeg: number[];
  /** Seconds to travel INTO this pose from the previous one. */
  holdSec: number;
}

export interface AslSign {
  id: string;
  /** English gloss shown under the hands. */
  label: string;
  /** Plain-language description of the movement, for the caption. */
  hint: string;
  poses: HandPose[];
}

const FLAT = [0.05, 0.05, 0.05, 0.05, 0.05];
const FIST = [0.85, 0.95, 0.95, 0.95, 0.95];
const TWO_FINGER = [0.2, 0.1, 0.1, 0.95, 0.95];

/** The five signs of the ASL pack's first lesson set. */
export const ASL_SIGNS: AslSign[] = [
  {
    id: "hello",
    label: "hello",
    hint: "flat hand at the brow, out and away",
    poses: [
      { curl: FLAT, spread: 0.25, offsetCm: [-3, 5, 2], rotationDeg: [0, 0, -10], holdSec: 0.5 },
      { curl: FLAT, spread: 0.35, offsetCm: [4, 4, 6], rotationDeg: [0, -25, -25], holdSec: 0.6 },
      { curl: FLAT, spread: 0.35, offsetCm: [8, 2, 8], rotationDeg: [0, -40, -35], holdSec: 0.5 },
    ],
  },
  {
    id: "thankyou",
    label: "thank you",
    hint: "fingertips at the chin, forward and down",
    poses: [
      { curl: FLAT, spread: 0.1, offsetCm: [0, 3, 1], rotationDeg: [25, 0, 0], holdSec: 0.5 },
      { curl: FLAT, spread: 0.15, offsetCm: [0, 0, 7], rotationDeg: [10, 0, 0], holdSec: 0.6 },
      { curl: FLAT, spread: 0.2, offsetCm: [0, -2, 10], rotationDeg: [0, 0, 0], holdSec: 0.5 },
    ],
  },
  {
    id: "please",
    label: "please",
    hint: "flat palm circling on the chest",
    poses: [
      { curl: FLAT, spread: 0.15, offsetCm: [0, 0, 2], rotationDeg: [20, 0, 0], holdSec: 0.45 },
      { curl: FLAT, spread: 0.15, offsetCm: [3, 3, 2], rotationDeg: [20, 0, 0], holdSec: 0.35 },
      { curl: FLAT, spread: 0.15, offsetCm: [0, 5, 2], rotationDeg: [20, 0, 0], holdSec: 0.35 },
      { curl: FLAT, spread: 0.15, offsetCm: [-3, 3, 2], rotationDeg: [20, 0, 0], holdSec: 0.35 },
      { curl: FLAT, spread: 0.15, offsetCm: [0, 0, 2], rotationDeg: [20, 0, 0], holdSec: 0.35 },
    ],
  },
  {
    id: "yes",
    label: "yes",
    hint: "a fist nodding like a head",
    poses: [
      { curl: FIST, spread: 0, offsetCm: [0, 2, 3], rotationDeg: [-10, 0, 0], holdSec: 0.4 },
      { curl: FIST, spread: 0, offsetCm: [0, 0, 3], rotationDeg: [35, 0, 0], holdSec: 0.3 },
      { curl: FIST, spread: 0, offsetCm: [0, 2, 3], rotationDeg: [-10, 0, 0], holdSec: 0.3 },
      { curl: FIST, spread: 0, offsetCm: [0, 0, 3], rotationDeg: [35, 0, 0], holdSec: 0.3 },
    ],
  },
  {
    id: "no",
    label: "no",
    hint: "two fingers closing onto the thumb",
    poses: [
      { curl: TWO_FINGER, spread: 0.5, offsetCm: [0, 2, 4], rotationDeg: [0, 0, 0], holdSec: 0.45 },
      { curl: [0.45, 0.55, 0.55, 0.95, 0.95], spread: 0.05, offsetCm: [0, 2, 4], rotationDeg: [0, 0, 0], holdSec: 0.35 },
      { curl: TWO_FINGER, spread: 0.5, offsetCm: [0, 2, 4], rotationDeg: [0, 0, 0], holdSec: 0.35 },
      { curl: [0.45, 0.55, 0.55, 0.95, 0.95], spread: 0.05, offsetCm: [0, 2, 4], rotationDeg: [0, 0, 0], holdSec: 0.35 },
    ],
  },
];

export function findSign(id: string): AslSign | null {
  for (let i = 0; i < ASL_SIGNS.length; i++) {
    if (ASL_SIGNS[i].id === id) return ASL_SIGNS[i];
  }
  return null;
}
