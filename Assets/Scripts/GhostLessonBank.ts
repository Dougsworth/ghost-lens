/**
 * GhostLessonBank — the lessons GHOST can teach with no network at all.
 *
 * Owns:  four hand-written lessons, in the same schema an LLM returns.
 * Must not: fetch anything, or know that a planner exists.
 *
 * The brief's rule is that a lesson never fails. These are the floor: if the
 * Remote Service Gateway is unavailable on device, and the webcam bridge's
 * /lesson endpoint is unreachable or has no API key in the preview, "Teach me
 * anything" still opens and still teaches something. They are also the fastest
 * way to demonstrate the feature, since they need no key and no latency.
 *
 * Each one deliberately exercises a DIFFERENT renderer, so the bank doubles as
 * a check that every render path works:
 *   draw a star        -> path    (traced, checked precisely)
 *   count 1 to 5       -> hands   (handshapes, mirrored by the user)
 *   play an Em chord   -> chord   (the guitar fretboard)
 *   tie a simple knot  -> objects (primitives and actions)
 *
 * Star geometry is generated, not eyeballed: a 5-pointed star of radius 0.46
 * drawn as one continuous stroke, visiting every second vertex.
 */

import { Lesson } from "./GhostLessonSchema";

const STAR: [number, number][] = [
  [0.0, 0.46], [-0.045, 0.321], [-0.09, 0.183], [-0.135, 0.044], [-0.18, -0.095],
  [-0.225, -0.233], [-0.27, -0.372], [-0.152, -0.286], [-0.034, -0.201],
  [0.084, -0.115], [0.202, -0.029], [0.32, 0.056], [0.437, 0.142], [0.292, 0.142],
  [0.146, 0.142], [0.0, 0.142], [-0.146, 0.142], [-0.292, 0.142], [-0.437, 0.142],
  [-0.32, 0.056], [-0.202, -0.029], [-0.084, -0.115], [0.034, -0.201],
  [0.152, -0.286], [0.27, -0.372], [0.225, -0.233], [0.18, -0.095],
  [0.135, 0.044], [0.09, 0.183], [0.045, 0.321], [0.0, 0.46],
];

/** The star, split into the five edges so each one is its own step. */
function starEdge(from: number, to: number): [number, number][] {
  return STAR.slice(from, to + 1);
}

export const LESSON_BANK: { [key: string]: Lesson } = {
  "draw a star": {
    skill: "Draw a star",
    summary: "One line, five points, without lifting your hand.",
    offline: true,
    steps: [
      {
        title: "Down to the left",
        tip: "from the top point, straight down and left",
        render: { kind: "path", strokes: [starEdge(0, 6)] },
        check: { kind: "trace" },
      },
      {
        title: "Up to the right",
        tip: "climb back up across the middle",
        render: { kind: "path", strokes: [starEdge(6, 12)] },
        check: { kind: "trace" },
      },
      {
        title: "Straight across",
        tip: "left along the flat line",
        render: { kind: "path", strokes: [starEdge(12, 18)] },
        check: { kind: "trace" },
      },
      {
        title: "Down to the right",
        tip: "down and across to the far corner",
        render: { kind: "path", strokes: [starEdge(18, 24)] },
        check: { kind: "trace" },
      },
      {
        title: "Close it up",
        tip: "back up to where you began",
        render: { kind: "path", strokes: [starEdge(24, 30)] },
        check: { kind: "trace" },
      },
    ],
    quiz: [
      {
        question: "How many times do you lift your hand?",
        options: ["None", "Twice", "Five times"],
        answer: 0,
      },
      {
        question: "Where does the star finish?",
        options: ["At the top, where it started", "At the bottom left", "In the middle"],
        answer: 0,
      },
      {
        question: "Which stroke is the flat one?",
        options: ["The third", "The first", "The last"],
        answer: 0,
      },
    ],
  },

  "count 1 to 5 in sign": {
    skill: "Count 1 to 5 in sign",
    summary: "Five handshapes, held one at a time.",
    offline: true,
    steps: [
      {
        title: "One",
        tip: "index finger up, the rest closed",
        render: {
          kind: "hands",
          handshape: "point",
          location: "in front of your shoulder",
          palm: "facing out",
          movement: "held still",
        },
        check: { kind: "pose" },
      },
      {
        title: "Two",
        tip: "add the middle finger",
        render: {
          kind: "hands",
          handshape: "v",
          location: "in front of your shoulder",
          palm: "facing out",
          movement: "held still",
        },
        check: { kind: "pose" },
      },
      {
        title: "Three",
        tip: "thumb, index and middle",
        render: {
          kind: "hands",
          handshape: "three",
          location: "in front of your shoulder",
          palm: "facing out",
          movement: "held still",
          curls: [0.0, 0.0, 0.0, 1.0, 1.0],
          approximate: true,
        },
        check: { kind: "pose" },
      },
      {
        title: "Four",
        tip: "four fingers up, thumb tucked",
        render: {
          kind: "hands",
          handshape: "four",
          location: "in front of your shoulder",
          palm: "facing out",
          movement: "held still",
          curls: [0.9, 0.0, 0.0, 0.0, 0.0],
          approximate: true,
        },
        check: { kind: "pose" },
      },
      {
        title: "Five",
        tip: "open the whole hand",
        render: {
          kind: "hands",
          handshape: "spread",
          location: "in front of your shoulder",
          palm: "facing out",
          movement: "held still",
        },
        check: { kind: "pose" },
      },
    ],
    quiz: [
      {
        question: "What changes between one and two?",
        options: ["The middle finger joins", "The palm turns around", "The hand moves up"],
        answer: 0,
      },
      {
        question: "Where is the thumb for four?",
        options: ["Tucked in", "Straight up", "Pointing sideways"],
        answer: 0,
      },
      {
        question: "Which way does the palm face throughout?",
        options: ["Out, away from you", "Towards you", "Down at the floor"],
        answer: 0,
      },
    ],
  },

  "play an em chord": {
    skill: "Play an Em chord",
    summary: "Two fingers, and every string rings.",
    offline: true,
    steps: [
      {
        title: "Find the shape",
        tip: "two fingers, side by side, on the second fret",
        render: { kind: "chord", chord: "Em" },
        check: { kind: "place" },
      },
      {
        title: "Place your fingers",
        tip: "press just behind the fret, not on it",
        render: { kind: "chord", chord: "Em" },
        check: { kind: "place" },
      },
      {
        title: "Strum it",
        tip: "sweep down across all six strings",
        render: { kind: "chord", chord: "Em" },
        check: { kind: "got_it" },
      },
    ],
    quiz: [
      {
        question: "How many fingers does Em need?",
        options: ["Two", "Three", "Four"],
        answer: 0,
      },
      {
        question: "Which strings do you play?",
        options: ["All six", "Only the top three", "All but the lowest"],
        answer: 0,
      },
      {
        question: "Where should a finger press?",
        options: ["Just behind the fret", "Directly on the fret", "Halfway between frets"],
        answer: 0,
      },
    ],
  },

  "tie a simple knot": {
    skill: "Tie a simple knot",
    summary: "A loop, a tuck, and a pull.",
    offline: true,
    steps: [
      {
        title: "Lay the rope out",
        tip: "straight across in front of you",
        render: {
          kind: "objects",
          objects: [{ id: "rope", shape: "rope", size: [24, 0.6, 0.6], pos: [0, 0, 0] }],
          actions: [],
        },
        check: { kind: "got_it" },
      },
      {
        title: "Make a loop",
        tip: "bring the right end over the left",
        render: {
          kind: "objects",
          objects: [{ id: "rope", shape: "rope", size: [24, 0.6, 0.6], pos: [0, 0, 0] }],
          actions: [{ target: "rope", type: "fold", to: [-4, 0, 0], deg: 180 }],
        },
        check: { kind: "got_it" },
      },
      {
        title: "Tuck the end through",
        tip: "under, then up through the loop",
        render: {
          kind: "objects",
          objects: [{ id: "rope", shape: "rope", size: [24, 0.6, 0.6], pos: [0, 0, 0] }],
          actions: [{ target: "rope", type: "move", to: [0, 2.5, -1.5] }],
        },
        check: { kind: "got_it" },
      },
      {
        title: "Pull it tight",
        tip: "both ends, steadily apart",
        render: {
          kind: "objects",
          objects: [{ id: "rope", shape: "rope", size: [24, 0.6, 0.6], pos: [0, 0, 0] }],
          actions: [{ target: "rope", type: "pull", to: [9, 0, 0] }],
        },
        check: { kind: "got_it" },
      },
    ],
    quiz: [
      {
        question: "What comes after the loop?",
        options: ["Tuck the end through it", "Pull it tight", "Lay the rope flat"],
        answer: 0,
      },
      {
        question: "Which way does the end go through?",
        options: ["Under, then up", "Over, then down", "Straight across"],
        answer: 0,
      },
      {
        question: "How do you finish?",
        options: ["Pull both ends apart", "Push the ends together", "Twist the loop"],
        answer: 0,
      },
    ],
  },
};

/** The skills offered when there is no planner — the picker's fallback list. */
export const BANK_KEYS = [
  "draw a star",
  "count 1 to 5 in sign",
  "play an em chord",
  "tie a simple knot",
];

/**
 * Nearest bundled lesson for whatever the user asked for.
 *
 * Matching is loose on purpose: this runs when the planner could not be
 * reached, so "show me a star" or "star" should still find the star lesson
 * rather than dropping the user back to a menu.
 */
export function bankLessonFor(skill: string): Lesson | null {
  const q = (skill || "").trim().toLowerCase();
  if (!q) return null;
  if (LESSON_BANK[q]) return LESSON_BANK[q];

  let best: string | null = null;
  let bestScore = 0;
  const words = q.split(" ");
  for (let i = 0; i < BANK_KEYS.length; i++) {
    const key = BANK_KEYS[i];
    let score = 0;
    for (let w = 0; w < words.length; w++) {
      const word = words[w];
      if (word.length > 2 && key.indexOf(word) >= 0) score++;
    }
    if (score > bestScore) {
      bestScore = score;
      best = key;
    }
  }
  return best ? LESSON_BANK[best] : null;
}
