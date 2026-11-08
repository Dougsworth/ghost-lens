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
 *   sign hello         -> hands   (opens the ASL pack)
 *   play an Em chord   -> chord   (the guitar fretboard)
 *   tie a simple knot  -> objects (primitives and actions)
 *
 * Star geometry is generated, not eyeballed: a 5-pointed star of radius 0.46
 * drawn as one continuous stroke, visiting every second vertex.
 */

import { Lesson, LessonStep } from "./GhostLessonSchema";
import { KANA } from "./KanaStrokes";

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


// ── Generated shapes for the extra trace lessons ───────────────────────────
// Same convention as the star: normalised -0.5..0.5, y up. Every shape is
// computed rather than typed, so the curves are smooth and the steps join.

type P = [number, number];
const r3 = (v: number): number => Math.round(v * 1000) / 1000;

/** A straight line with enough points for the trace checker to follow. */
function line(a: P, b: P, n: number = 8): P[] {
  const out: P[] = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    out.push([r3(a[0] + (b[0] - a[0]) * t), r3(a[1] + (b[1] - a[1]) * t)]);
  }
  return out;
}

/** A polyline through several corners, one stroke. */
function poly(pts: P[]): P[] {
  let out: P[] = [];
  for (let i = 0; i + 1 < pts.length; i++) {
    const seg = line(pts[i], pts[i + 1]);
    out = out.concat(i === 0 ? seg : seg.slice(1));
  }
  return out;
}

/** Half a heart, from the top dip round to the bottom tip. side -1 = left. */
function heartHalf(side: number): P[] {
  const out: P[] = [];
  const n = 28;
  for (let i = 0; i <= n; i++) {
    const t = (i / n) * Math.PI;
    const x = 16 * Math.pow(Math.sin(t), 3);
    const y = 13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t);
    out.push([r3(side * x * 0.027), r3(y * 0.027 + 0.06)]);
  }
  return out;
}

/** An Archimedean spiral from the centre outward, between two turn counts. */
function spiral(fromTurn: number, toTurn: number): P[] {
  const out: P[] = [];
  const turns = 2.5;
  const n = Math.round((toTurn - fromTurn) * 36);
  for (let i = 0; i <= n; i++) {
    const turn = fromTurn + (toTurn - fromTurn) * (i / n);
    const a = turn * Math.PI * 2;
    const r = 0.03 + (0.42 * turn) / turns;
    out.push([r3(Math.cos(a) * r), r3(Math.sin(a) * r)]);
  }
  return out;
}

/** One wave crest and trough, left to right. */
function wave(x0: number, x1: number, amp: number): P[] {
  const out: P[] = [];
  const n = 24;
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    out.push([r3(x0 + (x1 - x0) * t), r3(Math.sin(t * Math.PI * 2) * amp)]);
  }
  return out;
}

const EXTRA_LESSONS: { [key: string]: Lesson } = {
  "draw a heart": {
    skill: "Draw a heart",
    summary: "Two curves that meet at the bottom.",
    offline: true,
    steps: [
      {
        title: "The left curve",
        tip: "from the dip, round the left and down to the tip",
        render: { kind: "path", strokes: [heartHalf(-1)] },
        check: { kind: "trace" },
      },
      {
        title: "The right curve",
        tip: "same again on the right, meeting at the tip",
        render: { kind: "path", strokes: [heartHalf(1)] },
        check: { kind: "trace" },
      },
    ],
    quiz: [
      { question: "Where do both curves start?", options: ["The dip at the top", "The bottom tip", "The far left"], answer: 0 },
      { question: "Where do they meet?", options: ["The bottom tip", "The middle", "They never meet"], answer: 0 },
    ],
  },

  "draw a lightning bolt": {
    skill: "Draw a lightning bolt",
    summary: "Three sharp zigs, top to bottom.",
    offline: true,
    steps: [
      {
        title: "Strike down",
        tip: "from the top right, down and to the left",
        render: { kind: "path", strokes: [line([0.18, 0.46], [-0.16, 0.02])] },
        check: { kind: "trace" },
      },
      {
        title: "Kick across",
        tip: "a short sharp line to the right",
        render: { kind: "path", strokes: [line([-0.16, 0.02], [0.14, 0.02], 6)] },
        check: { kind: "trace" },
      },
      {
        title: "Strike again",
        tip: "all the way down to the bottom left",
        render: { kind: "path", strokes: [line([0.14, 0.02], [-0.18, -0.46])] },
        check: { kind: "trace" },
      },
    ],
    quiz: [
      { question: "Which line is flat?", options: ["The middle one", "The first", "The last"], answer: 0 },
      { question: "Where does the bolt end?", options: ["Bottom left", "Bottom right", "Top left"], answer: 0 },
    ],
  },

  "draw a spiral": {
    skill: "Draw a spiral",
    summary: "Start in the middle and keep going round, wider each time.",
    offline: true,
    steps: [
      {
        title: "The tight centre",
        tip: "small circles out from the middle, slowly",
        render: { kind: "path", strokes: [spiral(0, 1.25)] },
        check: { kind: "trace" },
      },
      {
        title: "Open it out",
        tip: "keep the same turn, just wider",
        render: { kind: "path", strokes: [spiral(1.25, 2.5)] },
        check: { kind: "trace" },
      },
    ],
    quiz: [
      { question: "Where does a spiral start?", options: ["In the middle", "At the outside", "At the top"], answer: 0 },
      { question: "What changes as you go round?", options: ["It gets wider", "It gets faster", "Nothing"], answer: 0 },
    ],
  },

  "draw a house": {
    skill: "Draw a house",
    summary: "Walls, floor, then the roof on top.",
    offline: true,
    steps: [
      {
        title: "Left wall",
        tip: "straight down",
        render: { kind: "path", strokes: [line([-0.32, 0.08], [-0.32, -0.42])] },
        check: { kind: "trace" },
      },
      {
        title: "The floor",
        tip: "straight across to the right",
        render: { kind: "path", strokes: [line([-0.32, -0.42], [0.32, -0.42])] },
        check: { kind: "trace" },
      },
      {
        title: "Right wall",
        tip: "straight back up",
        render: { kind: "path", strokes: [line([0.32, -0.42], [0.32, 0.08])] },
        check: { kind: "trace" },
      },
      {
        title: "The roof",
        tip: "up to the peak, then down the other side",
        render: { kind: "path", strokes: [poly([[0.4, 0.08], [0, 0.46], [-0.4, 0.08]])] },
        check: { kind: "trace" },
      },
    ],
    quiz: [
      { question: "What goes on last?", options: ["The roof", "The floor", "The left wall"], answer: 0 },
      { question: "How many lines is the roof?", options: ["One, with a bend", "Three", "None"], answer: 0 },
    ],
  },

  "draw a wave": {
    skill: "Draw a wave",
    summary: "Smooth up and down, like the sea.",
    offline: true,
    steps: [
      {
        title: "First wave",
        tip: "up over the crest, down through the trough",
        render: { kind: "path", strokes: [wave(-0.45, 0, 0.2)] },
        check: { kind: "trace" },
      },
      {
        title: "Second wave",
        tip: "the same shape again, keep it smooth",
        render: { kind: "path", strokes: [wave(0, 0.45, 0.2)] },
        check: { kind: "trace" },
      },
    ],
    quiz: [
      { question: "Should a wave have sharp corners?", options: ["No, keep it smooth", "Yes", "Only at the top"], answer: 0 },
    ],
  },
};


// ── Real language lessons: write actual Japanese words ─────────────────────
// Each step is ONE character, drawn from the same KanjiVG stroke data the
// Japanese pack uses, so the ghost demonstrates the real stroke order and the
// checker grades it. The tip gives the sound and a memory hook, so by the end
// you can read and write the word, not just trace shapes.

function kana(ch: string, sound: string, hook: string): LessonStep {
  const strokes = (KANA[ch] || []) as [number, number][][];
  return {
    title: ch + "  \u00b7  " + sound,
    tip: hook,
    render: { kind: "path", strokes: strokes },
    check: { kind: "trace" },
  };
}

const WORD_LESSONS: { [key: string]: Lesson } = {
  "write sushi in japanese": {
    skill: "Write sushi in Japanese",
    summary: "\u3059\u3057 \u00b7 su-shi. Your first word, three strokes.",
    offline: true,
    steps: [
      kana("\u3059", "su", "a line across, then a loop that swings down"),
      kana("\u3057", "shi", "one stroke, like a fishing hook"),
    ],
    quiz: [
      { question: "How do you say \u3059?", options: ["su", "shi", "sa"], answer: 0 },
      { question: "\u3057 looks like a...", options: ["Fishing hook", "Circle", "Cross"], answer: 0 },
    ],
  },

  "write cat in japanese": {
    skill: "Write cat in Japanese",
    summary: "\u306d\u3053 \u00b7 ne-ko. Cat.",
    offline: true,
    steps: [
      kana("\u306d", "ne", "a line down, then a loop with a curled tail, like a cat napping"),
      kana("\u3053", "ko", "two short lines, like two whiskers"),
    ],
    quiz: [
      { question: "What does \u306d\u3053 mean?", options: ["Cat", "Dog", "Fish"], answer: 0 },
      { question: "How many strokes is \u3053?", options: ["Two", "One", "Three"], answer: 0 },
    ],
  },

  "write hello in japanese": {
    skill: "Write hello in Japanese",
    summary: "\u3053\u3093\u306b\u3061\u306f \u00b7 kon-ni-chi-wa. Hello.",
    offline: true,
    steps: [
      kana("\u3053", "ko", "two short lines"),
      kana("\u3093", "n", "one flowing stroke, like a cursive n"),
      kana("\u306b", "ni", "a tall line, then two short lines beside it"),
      kana("\u3061", "chi", "a cross on top, then a curve like the number 5"),
      kana("\u306f", "wa", "written ha, but said wa when it means 'as for'"),
    ],
    quiz: [
      { question: "When is \u306f said 'wa'?", options: ["In hello and as a particle", "Never", "Only at the start of a word"], answer: 0 },
      { question: "Which character looks like a 5?", options: ["\u3061", "\u3053", "\u306b"], answer: 0 },
    ],
  },

  "write thank you in japanese": {
    skill: "Write thank you in Japanese",
    summary: "\u3042\u308a\u304c\u3068\u3046 \u00b7 a-ri-ga-to-u. Thank you.",
    offline: true,
    steps: [
      kana("\u3042", "a", "a cross, then a big loop: the first letter of the alphabet"),
      kana("\u308a", "ri", "two strokes, like reeds by a river"),
      kana("\u304c", "ga", "ka with two little marks: they make it buzz, ka becomes ga"),
      kana("\u3068", "to", "a short slash, then a curve like a toe"),
      kana("\u3046", "u", "a dash on top, then a curve, like an ear listening"),
    ],
    quiz: [
      { question: "What do the two little marks on \u304c do?", options: ["Turn ka into ga", "Make it louder", "Nothing"], answer: 0 },
      { question: "Which is the first character of the alphabet?", options: ["\u3042", "\u3046", "\u3068"], answer: 0 },
    ],
  },

  "write ramen in katakana": {
    skill: "Write ramen in katakana",
    summary: "\u30e9\u30fc\u30e1\u30f3 \u00b7 ra-a-me-n. Katakana is for foreign words.",
    offline: true,
    steps: [
      kana("\u30e9", "ra", "a short line, then a hook like a 7 with a hat"),
      kana("\u30e1", "me", "a long slash and a short tick, like a cross that missed"),
      kana("\u30f3", "n", "a dot and a rising sweep, different from \u30bd so"),
    ],
    quiz: [
      { question: "What is katakana mostly used for?", options: ["Foreign words", "Verbs", "Names of cities only"], answer: 0 },
      { question: "The line in \u30e9\u30fc\u30e1\u30f3 does what?", options: ["Makes the vowel long", "Ends the word", "Nothing"], answer: 0 },
    ],
  },
};

export const LESSON_BANK: { [key: string]: Lesson } = {
  ...WORD_LESSONS,
  ...EXTRA_LESSONS,

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

  "sign hello": {
    skill: "Sign hello",
    summary: "A flat hand from your forehead, out like a salute.",
    offline: true,
    steps: [
      {
        title: "Hello",
        tip: "flat hand at your forehead, then sweep it out",
        render: {
          kind: "hands",
          handshape: "flat",
          location: "at your forehead",
          palm: "facing out",
          movement: "sweep outward",
        },
        check: { kind: "pose" },
      },
    ],
    quiz: [
      { question: "Where does hello start?", options: ["At your forehead", "At your chest", "At your chin"], answer: 0 },
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
  "write hello in japanese",
  "play an em chord",
  "write cat in japanese",
  "sign hello",
  "write sushi in japanese",
  "write thank you in japanese",
  "draw a star",
  "write ramen in katakana",
  "draw a heart",
  "draw a spiral",
  // "tie a simple knot" stays in the bank but is not offered: this build has
  // no screen that can teach objects, so it would be a dead end on stage.
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
