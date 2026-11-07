/**
 * GhostLessonSchema — the shape of a "Teach me anything" lesson, and the gate
 * that decides whether one is safe to play.
 *
 * Owns:  the types and the validator. Pure logic, no scene access.
 * Must not: fetch, render, or know where a lesson came from.
 *
 * A lesson may arrive from an LLM (Remote Service Gateway on device, or the
 * webcam bridge's /lesson endpoint in the preview), so NOTHING here trusts its
 * input. Everything is checked before the engine sees it: a malformed lesson is
 * rejected whole and the caller falls back to a bundled one, rather than half
 * a lesson reaching the scene and failing in the middle of a step.
 *
 * This mirrors tools/webcam-bridge/lesson_llm.py. The two must agree; the
 * Python side rejects early so the user never waits on a lesson this side will
 * refuse, and this side rejects again because the bridge is not the only
 * possible source.
 */

/** 2D point in lesson space: -0.5..0.5, centre origin, +y up. */
export type LessonPt = [number, number];

export type RenderPath = { kind: "path"; strokes: LessonPt[][] };

export type LessonPrimitive = "box" | "cylinder" | "sphere" | "rope" | "sheet";
export type LessonActionType = "move" | "rotate" | "fold" | "pull" | "press";

export type RenderObjects = {
  kind: "objects";
  objects: {
    id: string;
    shape: LessonPrimitive;
    size: number[];
    pos: number[];
  }[];
  actions?: {
    target: string;
    type: LessonActionType;
    to?: number[];
    deg?: number;
  }[];
};

export type RenderSnap3d = {
  kind: "snap3d";
  prompt: string;
  placeholder: "box" | "cylinder" | "sphere";
};

export type RenderHands = {
  kind: "hands";
  handshape: string;
  location?: string;
  palm?: string;
  movement?: string;
  /** Thumb first, 0 = straight, 1 = fully curled. Required if handshape is unknown. */
  curls?: number[];
  approximate?: boolean;
};

/** A guitar chord. GHOST owns a fretboard renderer, so chords route to it. */
export type RenderChord = { kind: "chord"; chord: string };

/** The fallback. Always valid, so a lesson can never fail to have a render. */
export type RenderTip = { kind: "tip" };

export type LessonRender =
  | RenderPath
  | RenderObjects
  | RenderSnap3d
  | RenderHands
  | RenderChord
  | RenderTip;

export type LessonCheck = { kind: "trace" | "pose" | "place" | "got_it" };

export type LessonStep = {
  title: string;
  tip: string;
  render: LessonRender;
  check: LessonCheck;
};

export type LessonQuizItem = {
  question: string;
  options: string[];
  /** Index into options, 0..2. */
  answer: number;
};

export type Lesson = {
  skill: string;
  summary: string;
  steps: LessonStep[];
  quiz: LessonQuizItem[];
  /** True when a second model reviewed and corrected it. */
  reviewed?: boolean;
  /** True when this came from the bundled bank rather than a live model. */
  offline?: boolean;
};

/**
 * Handshapes the engine maps to exact finger curls. Anything outside this set
 * is still allowed, but the lesson must carry its own curls and is shown
 * labelled "approximate" — GHOST would rather admit a shape is a guess than
 * teach a wrong hand with confidence.
 */
export const KNOWN_HANDSHAPES: { [name: string]: number[] } = {
  // thumb, index, middle, ring, little. 0 = straight, 1 = fully curled.
  flat: [0.0, 0.0, 0.0, 0.0, 0.0],
  open: [0.1, 0.05, 0.05, 0.05, 0.05],
  spread: [0.0, 0.0, 0.0, 0.0, 0.0],
  fist: [0.9, 1.0, 1.0, 1.0, 1.0],
  point: [0.8, 0.0, 1.0, 1.0, 1.0],
  claw: [0.5, 0.5, 0.5, 0.5, 0.5],
  bent_v: [0.8, 0.45, 0.45, 1.0, 1.0],
  c: [0.45, 0.5, 0.5, 0.5, 0.5],
  o: [0.75, 0.7, 0.7, 0.7, 0.7],
  pinch: [0.7, 0.65, 0.2, 0.1, 0.1],
  thumbs_up: [0.0, 1.0, 1.0, 1.0, 1.0],
  v: [0.8, 0.0, 0.0, 1.0, 1.0],
  l: [0.0, 0.0, 1.0, 1.0, 1.0],
  y: [0.0, 1.0, 1.0, 1.0, 0.0],
  horns: [0.9, 0.0, 1.0, 1.0, 0.0],
};

function normShape(name: string): string {
  return (name || "").trim().toLowerCase().split(" ").join("_");
}

/** Curls for a handshape: the exact table entry, or the lesson's own. */
export function curlsFor(r: RenderHands): number[] | null {
  const known = KNOWN_HANDSHAPES[normShape(r.handshape)];
  if (known) return known;
  if (r.curls && r.curls.length === 5) return r.curls;
  return null;
}

export function isApproximate(r: RenderHands): boolean {
  return !KNOWN_HANDSHAPES[normShape(r.handshape)];
}

// ── Validation ───────────────────────────────────────────────────────────────

const RENDER_KINDS = ["path", "objects", "snap3d", "hands", "chord", "tip"];
const CHECK_KINDS = ["trace", "pose", "place", "got_it"];
const PRIMITIVES = ["box", "cylinder", "sphere", "rope", "sheet"];
const ACTIONS = ["move", "rotate", "fold", "pull", "press"];
const PLACEHOLDERS = ["box", "cylinder", "sphere"];

function isNum(v: any): boolean {
  return typeof v === "number" && isFinite(v);
}

function isText(v: any): boolean {
  return typeof v === "string" && v.trim().length > 0;
}

function has(list: string[], v: any): boolean {
  return typeof v === "string" && list.indexOf(v) >= 0;
}

export type LessonCheckResult = { ok: boolean; problems: string[] };

/**
 * Check a parsed lesson. Collects EVERY problem rather than failing on the
 * first, so a rejection can be logged once and understood in one read.
 */
export function validateLesson(raw: any): LessonCheckResult {
  const p: string[] = [];
  if (!raw || typeof raw !== "object") {
    return { ok: false, problems: ["lesson is not an object"] };
  }
  if (!isText(raw.skill)) p.push("skill must be a non-empty string");
  if (!isText(raw.summary)) p.push("summary must be a non-empty string");

  const steps = raw.steps;
  if (!Array.isArray(steps) || steps.length < 3 || steps.length > 6) {
    p.push("steps must be a list of 3 to 6 items");
  }
  const stepList: any[] = Array.isArray(steps) ? steps : [];

  for (let i = 0; i < stepList.length; i++) {
    const s = stepList[i];
    const at = "steps[" + i + "]";
    if (!s || typeof s !== "object") {
      p.push(at + " is not an object");
      continue;
    }
    if (!isText(s.title)) p.push(at + ".title must be a non-empty string");
    if (!isText(s.tip)) p.push(at + ".tip must be a non-empty string");

    const r = s.render;
    if (!r || typeof r !== "object" || !has(RENDER_KINDS, r.kind)) {
      p.push(at + ".render.kind must be one of " + RENDER_KINDS.join(", "));
      continue;
    }

    if (r.kind === "path") {
      if (!Array.isArray(r.strokes) || r.strokes.length === 0) {
        p.push(at + ".render.strokes must be a non-empty list");
      } else {
        for (let j = 0; j < r.strokes.length; j++) {
          const st = r.strokes[j];
          if (!Array.isArray(st) || st.length < 2) {
            p.push(at + ".render.strokes[" + j + "] needs 2 or more points");
            continue;
          }
          for (let k = 0; k < st.length; k++) {
            const pt = st[k];
            if (!Array.isArray(pt) || pt.length !== 2 || !isNum(pt[0]) || !isNum(pt[1])) {
              p.push(at + ".render.strokes[" + j + "] has a malformed point");
              break;
            }
            if (pt[0] < -0.5 || pt[0] > 0.5 || pt[1] < -0.5 || pt[1] > 0.5) {
              p.push(at + ".render.strokes[" + j + "] leaves -0.5..0.5");
              break;
            }
          }
        }
      }
    } else if (r.kind === "objects") {
      const objs = Array.isArray(r.objects) ? r.objects : [];
      if (objs.length === 0) p.push(at + ".render.objects must be a non-empty list");
      const ids: string[] = [];
      for (let j = 0; j < objs.length; j++) {
        const o = objs[j];
        if (!o || typeof o !== "object" || !has(PRIMITIVES, o.shape)) {
          p.push(at + ".render.objects[" + j + "].shape must be one of " + PRIMITIVES.join(", "));
          continue;
        }
        if (isText(o.id)) ids.push(o.id);
      }
      const acts = Array.isArray(r.actions) ? r.actions : [];
      for (let j = 0; j < acts.length; j++) {
        const a = acts[j];
        if (!a || typeof a !== "object" || !has(ACTIONS, a.type)) {
          p.push(at + ".render.actions[" + j + "].type must be one of " + ACTIONS.join(", "));
        } else if (ids.indexOf(a.target) < 0) {
          p.push(at + ".render.actions[" + j + "] targets unknown object id");
        }
      }
    } else if (r.kind === "snap3d") {
      if (!isText(r.prompt)) p.push(at + ".render.prompt must be a non-empty string");
      if (!has(PLACEHOLDERS, r.placeholder)) {
        p.push(at + ".render.placeholder must be one of " + PLACEHOLDERS.join(", "));
      }
    } else if (r.kind === "hands") {
      if (!isText(r.handshape)) {
        p.push(at + ".render.handshape must be a non-empty string");
      } else if (!KNOWN_HANDSHAPES[normShape(r.handshape)]) {
        const curls = r.curls;
        const okCurls =
          Array.isArray(curls) &&
          curls.length === 5 &&
          curls.every((c: any) => isNum(c) && c >= 0 && c <= 1);
        if (!okCurls) {
          p.push(at + ".render uses an unknown handshape so it must supply 5 curls in 0..1");
        }
      }
    } else if (r.kind === "chord") {
      if (!isText(r.chord)) p.push(at + ".render.chord must be a chord name");
    }

    const c = s.check;
    if (!c || typeof c !== "object" || !has(CHECK_KINDS, c.kind)) {
      p.push(at + ".check.kind must be one of " + CHECK_KINDS.join(", "));
    } else {
      if (c.kind === "trace" && r.kind !== "path") {
        p.push(at + ".check 'trace' needs a 'path' render");
      }
      if (c.kind === "pose" && r.kind !== "hands") {
        p.push(at + ".check 'pose' needs a 'hands' render");
      }
      if (c.kind === "place" && r.kind !== "chord") {
        p.push(at + ".check 'place' needs a 'chord' render");
      }
    }
  }

  const quiz = raw.quiz;
  if (!Array.isArray(quiz) || quiz.length !== 3) {
    p.push("quiz must be exactly 3 questions");
  }
  const quizList: any[] = Array.isArray(quiz) ? quiz : [];
  for (let i = 0; i < quizList.length; i++) {
    const q = quizList[i];
    const at = "quiz[" + i + "]";
    if (!q || typeof q !== "object") {
      p.push(at + " is not an object");
      continue;
    }
    if (!isText(q.question)) p.push(at + ".question must be a non-empty string");
    if (!Array.isArray(q.options) || q.options.length !== 3 || !q.options.every(isText)) {
      p.push(at + ".options must be 3 non-empty strings");
    }
    if (typeof q.answer !== "number" || q.answer < 0 || q.answer > 2 || q.answer % 1 !== 0) {
      p.push(at + ".answer must be 0, 1 or 2");
    }
  }

  return { ok: p.length === 0, problems: p };
}

/** Parse + validate JSON text. Returns null and logs on any failure. */
export function parseLesson(text: string): Lesson | null {
  let raw: any;
  try {
    raw = JSON.parse(text);
  } catch (e) {
    print("[GhostLesson] reply was not JSON: " + e);
    return null;
  }
  const res = validateLesson(raw);
  if (!res.ok) {
    print("[GhostLesson] rejected: " + res.problems.join("; "));
    return null;
  }
  return raw as Lesson;
}
