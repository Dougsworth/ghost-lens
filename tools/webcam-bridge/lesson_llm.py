"""GHOST lesson planner — turns "teach me X" into a strict JSON lesson.

Two passes, as the brief asks:
  1. PLAN    — an LLM writes the lesson.
  2. REVIEW  — a second call re-reads it, fixes errors, returns the corrected
               lesson. A planner that checks its own work in one pass tends to
               defend what it just wrote; a fresh call reading it as input does
               not.
Each pass validates; an invalid pass is retried ONCE with the validator's own
complaints fed back, then gives up and the caller falls back to a bundled
lesson. A lesson must never fail to exist.

Provider is chosen from whichever key is in the environment — ANTHROPIC_API_KEY
or OPENAI_API_KEY. Deliberately stdlib-only (urllib): this file is imported by
the webcam bridge, which the user runs from a tiny venv, so it must not drag an
SDK into that environment.

NOTHING here reads or writes a credentials file that is committed. Keys come
from the environment only.
"""
import json
import os
import re
import urllib.error
import urllib.request

ANTHROPIC_MODEL = "claude-opus-5-5"
OPENAI_MODEL = "gpt-5"
TIMEOUT_S = 90

# ── Schema ───────────────────────────────────────────────────────────────────
# Mirrored on the Lens side in Assets/Scripts/GhostLessonSchema.ts. Keep both in
# step; the engine refuses anything that does not validate, so a drift here
# shows up as "lesson rejected", not as a broken scene.

RENDER_KINDS = {"path", "objects", "snap3d", "hands", "chord", "tip"}
CHECK_KINDS = {"trace", "pose", "place", "got_it"}
PRIMITIVES = {"box", "cylinder", "sphere", "rope", "sheet"}
ACTIONS = {"move", "rotate", "fold", "pull", "press"}

# Handshapes the engine maps to exact finger curls. Anything outside this set is
# allowed, but the LLM must supply curls and the step is labelled approximate.
KNOWN_HANDSHAPES = {
    "flat", "fist", "point", "claw", "bent_v", "c", "o", "pinch",
    "open", "thumbs_up", "v", "l", "y", "horns", "spread",
}

SCHEMA_DOC = """Return ONE JSON object, no prose, no markdown fence:

{
  "skill": "<short name of the skill>",
  "summary": "<one calm sentence saying what the learner will do>",
  "steps": [            // 3 to 6 steps
    {
      "title": "<3-6 words>",
      "tip": "<one short line describing the MOVEMENT, not the shape>",
      "render": { ... one of the render forms below ... },
      "check": { "kind": "trace" | "pose" | "got_it" }
    }
  ],
  "quiz": [             // exactly 3
    { "question": "<short>", "options": ["a","b","c"], "answer": 0 }
  ]
}

RENDER FORMS — pick the most reliable one that genuinely fits the step:

1. path — for drawing, writing, any 2D figure traced by a fingertip.
   { "kind": "path", "strokes": [ [[x,y],[x,y],...], ... ] }
   x and y are numbers in -0.5..0.5, origin at centre, +y UP. Stroke order is
   the order they are drawn. 6-40 points per stroke. PREFER THIS when the skill
   is anything that can be drawn: it is the only form the engine can check
   precisely.

2. objects — for physical manipulation built from primitives.
   { "kind": "objects",
     "objects": [ {"id":"a","shape":"box|cylinder|sphere|rope|sheet",
                   "size":[w,h,d],"pos":[x,y,z]} ],
     "actions": [ {"target":"a","type":"move|rotate|fold|pull|press",
                   "to":[x,y,z],"deg":0} ] }
   Sizes and positions in centimetres, the scene is about 30 cm wide.

3. snap3d — when a real object is needed and no primitive is close.
   { "kind": "snap3d", "prompt": "<short object description>",
     "placeholder": "box|cylinder|sphere" }
   Loads asynchronously; the placeholder shows meanwhile.

4. hands — for signs, finger positions, grips. Describe it the way sign
   notation does, NOT as joint angles.
   { "kind": "hands", "handshape": "<name>", "location": "<where, in words>",
     "palm": "<which way the palm faces>", "movement": "<what it does>",
     "curls": [0..1 x5], "approximate": false }
   Known handshapes, rendered exactly: %s
   If none fits, invent a name AND supply "curls" (thumb first, 0 = straight,
   1 = fully curled) AND set "approximate": true.

5. chord — a guitar chord. GHOST already owns a fretboard renderer, so a
   chord must use this rather than being described as hands or objects.
   { "kind": "chord", "chord": "Em" }
   Use the standard open-position name (Em, Am, C, G, D, E, A, Dm, F).

6. tip — the fallback. Always valid, never fails.
   { "kind": "tip" }
   Use it when no other form can honestly represent the step.

CHECK FORMS: "trace" only with a path render, "pose" only with a hands render,
"place" only with a chord render, "got_it" with anything.

RULES
- One idea per step. Short, calm lines. No exclamation marks.
- Never invent a render form or a primitive outside the lists above.
- Prefer a HONEST "tip" step over a path you are not confident in.
- Quiz answers must be decidable from the lesson itself.""" % ", ".join(sorted(KNOWN_HANDSHAPES))


class LessonInvalid(Exception):
    pass


def _num(v):
    return isinstance(v, (int, float)) and not isinstance(v, bool)


def validate(lesson, problems=None):
    """Raise LessonInvalid with EVERY problem found, so one retry can fix all."""
    p = [] if problems is None else problems

    if not isinstance(lesson, dict):
        raise LessonInvalid(["top level is not an object"])
    for k in ("skill", "summary"):
        if not isinstance(lesson.get(k), str) or not lesson[k].strip():
            p.append("%s must be a non-empty string" % k)

    steps = lesson.get("steps")
    if not isinstance(steps, list) or not (3 <= len(steps) <= 6):
        p.append("steps must be a list of 3 to 6 items")
        steps = steps if isinstance(steps, list) else []

    for i, s in enumerate(steps):
        at = "steps[%d]" % i
        if not isinstance(s, dict):
            p.append("%s is not an object" % at)
            continue
        for k in ("title", "tip"):
            if not isinstance(s.get(k), str) or not s[k].strip():
                p.append("%s.%s must be a non-empty string" % (at, k))

        r = s.get("render")
        if not isinstance(r, dict) or r.get("kind") not in RENDER_KINDS:
            p.append("%s.render.kind must be one of %s" % (at, sorted(RENDER_KINDS)))
            r = {"kind": "tip"}

        kind = r.get("kind")
        if kind == "path":
            strokes = r.get("strokes")
            if not isinstance(strokes, list) or not strokes:
                p.append("%s.render.strokes must be a non-empty list" % at)
            else:
                for j, st in enumerate(strokes):
                    if not isinstance(st, list) or len(st) < 2:
                        p.append("%s.render.strokes[%d] needs 2+ points" % (at, j))
                        continue
                    for pt in st:
                        if (not isinstance(pt, list) or len(pt) != 2
                                or not all(_num(c) for c in pt)):
                            p.append("%s.render.strokes[%d] has a bad point" % (at, j))
                            break
                        if not all(-0.5 <= c <= 0.5 for c in pt):
                            p.append("%s.render.strokes[%d] is outside -0.5..0.5" % (at, j))
                            break
        elif kind == "objects":
            objs = r.get("objects")
            if not isinstance(objs, list) or not objs:
                p.append("%s.render.objects must be a non-empty list" % at)
                objs = []
            ids = set()
            for o in objs:
                if not isinstance(o, dict) or o.get("shape") not in PRIMITIVES:
                    p.append("%s.render has an object with a bad shape" % at)
                    continue
                ids.add(o.get("id"))
            for a in (r.get("actions") or []):
                if not isinstance(a, dict) or a.get("type") not in ACTIONS:
                    p.append("%s.render has an action with a bad type" % at)
                elif a.get("target") not in ids:
                    p.append("%s.render action targets unknown id %r" % (at, a.get("target")))
        elif kind == "snap3d":
            if not isinstance(r.get("prompt"), str) or not r["prompt"].strip():
                p.append("%s.render.prompt must be a non-empty string" % at)
            if r.get("placeholder") not in {"box", "cylinder", "sphere"}:
                p.append("%s.render.placeholder must be box, cylinder or sphere" % at)
        elif kind == "hands":
            if not isinstance(r.get("handshape"), str) or not r["handshape"].strip():
                p.append("%s.render.handshape must be a non-empty string" % at)
            else:
                known = r["handshape"].strip().lower().replace(" ", "_") in KNOWN_HANDSHAPES
                curls = r.get("curls")
                ok_curls = (isinstance(curls, list) and len(curls) == 5
                            and all(_num(c) and 0 <= c <= 1 for c in curls))
                if not known and not ok_curls:
                    p.append("%s.render uses unknown handshape %r so it must supply "
                             "5 curls in 0..1" % (at, r.get("handshape")))
                if not known and not r.get("approximate"):
                    p.append("%s.render uses an unknown handshape so approximate "
                             "must be true" % at)

        elif kind == "chord":
            if not isinstance(r.get("chord"), str) or not r["chord"].strip():
                p.append("%s.render.chord must be a chord name like 'Em'" % at)

        c = s.get("check")
        if not isinstance(c, dict) or c.get("kind") not in CHECK_KINDS:
            p.append("%s.check.kind must be one of %s" % (at, sorted(CHECK_KINDS)))
        else:
            if c["kind"] == "trace" and kind != "path":
                p.append("%s.check 'trace' needs a 'path' render" % at)
            if c["kind"] == "pose" and kind != "hands":
                p.append("%s.check 'pose' needs a 'hands' render" % at)
            if c["kind"] == "place" and kind != "chord":
                p.append("%s.check 'place' needs a 'chord' render" % at)

    quiz = lesson.get("quiz")
    if not isinstance(quiz, list) or len(quiz) != 3:
        p.append("quiz must be exactly 3 questions")
        quiz = quiz if isinstance(quiz, list) else []
    for i, q in enumerate(quiz):
        at = "quiz[%d]" % i
        if not isinstance(q, dict):
            p.append("%s is not an object" % at)
            continue
        if not isinstance(q.get("question"), str) or not q["question"].strip():
            p.append("%s.question must be a non-empty string" % at)
        opts = q.get("options")
        if not isinstance(opts, list) or len(opts) != 3 or not all(
                isinstance(o, str) and o.strip() for o in opts):
            p.append("%s.options must be 3 non-empty strings" % at)
        a = q.get("answer")
        if not isinstance(a, int) or isinstance(a, bool) or not (0 <= a <= 2):
            p.append("%s.answer must be 0, 1 or 2" % at)

    if p:
        raise LessonInvalid(p)
    return lesson


# ── Providers ────────────────────────────────────────────────────────────────

def _post(url, headers, payload):
    req = urllib.request.Request(
        url, data=json.dumps(payload).encode("utf-8"), headers=headers, method="POST")
    with urllib.request.urlopen(req, timeout=TIMEOUT_S) as r:
        return json.loads(r.read().decode("utf-8"))


def _anthropic(system, user, key):
    body = _post(
        "https://api.anthropic.com/v1/messages",
        {"content-type": "application/json",
         "x-api-key": key,
         "anthropic-version": "2023-06-01"},
        {"model": ANTHROPIC_MODEL,
         "max_tokens": 16000,
         "system": system,
         "messages": [{"role": "user", "content": user}]},
    )
    return "".join(b.get("text", "") for b in body.get("content", [])
                   if b.get("type") == "text")


def _openai(system, user, key):
    body = _post(
        "https://api.openai.com/v1/chat/completions",
        {"content-type": "application/json", "authorization": "Bearer " + key},
        {"model": OPENAI_MODEL,
         "response_format": {"type": "json_object"},
         "messages": [{"role": "system", "content": system},
                      {"role": "user", "content": user}]},
    )
    return body["choices"][0]["message"]["content"]


def provider():
    """(name, key) for whichever key is present. Anthropic wins if both are."""
    k = os.environ.get("ANTHROPIC_API_KEY")
    if k:
        return "anthropic", k
    k = os.environ.get("OPENAI_API_KEY")
    if k:
        return "openai", k
    return None, None


def _call(system, user):
    name, key = provider()
    if not name:
        raise RuntimeError(
            "No LLM key. Export ANTHROPIC_API_KEY or OPENAI_API_KEY before "
            "starting the bridge. GHOST falls back to its bundled lessons.")
    return (_anthropic if name == "anthropic" else _openai)(system, user, key)


def _parse(text):
    """Pull the JSON object out, tolerating a stray fence or preamble."""
    text = (text or "").strip()
    if text.startswith("```"):
        text = re.sub(r"^```[a-zA-Z]*\s*", "", text)
        text = re.sub(r"\s*```$", "", text)
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        i, j = text.find("{"), text.rfind("}")
        if i >= 0 and j > i:
            return json.loads(text[i:j + 1])
        raise


PLAN_SYSTEM = (
    "You design short hands-on AR lessons for a headset that shows a ghost "
    "demonstration the learner copies with their hands. Be concrete and calm. "
    "You output JSON only.\n\n" + SCHEMA_DOC
)

REVIEW_SYSTEM = (
    "You are reviewing a lesson another model wrote, for a hands-on AR headset. "
    "Find real errors: wrong or impossible steps, steps out of order, a render "
    "form that cannot represent what the step says, coordinates outside the "
    "range, a quiz answer that is wrong or not decidable from the lesson, "
    "waffle. Fix them. Keep what is already good; do not rewrite for taste. "
    "Return the corrected lesson as JSON only, same schema.\n\n" + SCHEMA_DOC
)


def _attempt(system, user):
    """One call plus at most one repair round, fed the validator's complaints."""
    raw = _call(system, user)
    try:
        return validate(_parse(raw))
    except (LessonInvalid, json.JSONDecodeError, KeyError) as e:
        problems = e.args[0] if isinstance(e, LessonInvalid) else [str(e)]
        repair = (
            "Your previous reply was rejected. Fix exactly these problems and "
            "return the WHOLE corrected JSON object:\n- "
            + "\n- ".join(str(x) for x in problems)
            + "\n\nYour previous reply was:\n" + (raw or "")[:12000]
        )
        return validate(_parse(_call(system, repair)))


def build_lesson(skill):
    """Plan, then review. Returns a validated lesson dict."""
    planned = _attempt(PLAN_SYSTEM, "Teach me: " + skill)
    try:
        reviewed = _attempt(
            REVIEW_SYSTEM,
            "The learner asked to be taught: " + skill
            + "\n\nLesson to review:\n" + json.dumps(planned, ensure_ascii=False),
        )
        reviewed["reviewed"] = True
        return reviewed
    except Exception:
        # The review is an improvement, not a gate. A lesson that passed
        # validation is still a usable lesson.
        planned["reviewed"] = False
        return planned
