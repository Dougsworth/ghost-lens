/**
 * GhostLessonStore — the notebook actually remembers.
 *
 * Owns:  saving a planned lesson to persistent storage, listing what has been
 *        learnt, and handing a saved lesson back without regenerating it.
 * Must not: plan, play, or render. GhostLessonSource asks here first and only
 *        calls the planner on a miss.
 *
 * ── Why this exists ─────────────────────────────────────────────────────────
 * It did not before, and the gap was invisible: GhostLessonBank is a
 * hardcoded, read-only table, so every generated lesson was thrown away the
 * moment you left it. "Your notebook" showed three fixed packs and nothing you
 * had actually done, re-opening a skill paid for two LLM calls again, and
 * nothing survived a restart. Checked, not assumed: there was no reference to
 * persistentStorageSystem anywhere in the project.
 *
 * ── Shape on disk ───────────────────────────────────────────────────────────
 * One index key holding the skill names in most-recent-first order, plus one
 * key per lesson holding its JSON. Two keys rather than one blob so that a
 * single corrupt lesson loses that lesson, not the whole notebook — anything
 * that fails to parse is dropped from the index on read and the rest survives.
 *
 * Storage is small and shared with everything else the Lens keeps, so the
 * index is capped. Falling off the end means the lesson is planned again,
 * which is a slow path, not a broken one.
 */

import { Lesson, validateLesson } from "./GhostLessonSchema";

const INDEX_KEY = "ghost.lessons.index";
const LESSON_PREFIX = "ghost.lesson.";
/** Most-recent-first; the oldest drops off the end. */
const MAX_REMEMBERED = 12;

function store(): GeneralDataStore | null {
  try {
    return global.persistentStorageSystem.store;
  } catch (e) {
    // No persistent storage in this context. Everything below degrades to
    // "nothing is remembered", which is exactly the old behaviour.
    return null;
  }
}

/** Skills are matched case- and space-insensitively, as the bank does. */
function keyFor(skill: string): string {
  return LESSON_PREFIX + (skill || "").trim().toLowerCase();
}

export function rememberedSkills(): string[] {
  const s = store();
  if (!s) return [];
  try {
    const raw = s.getStringArray(INDEX_KEY);
    return raw ? raw.slice() : [];
  } catch (e) {
    return [];
  }
}

/**
 * The saved lesson for a skill, or null.
 *
 * Validates on the way out as well as in. A lesson that no longer fits the
 * schema — because the schema moved under it between builds — is treated as
 * absent and quietly forgotten, rather than reaching the engine and failing
 * somewhere less obvious.
 */
export function recallLesson(skill: string): Lesson | null {
  const s = store();
  if (!s) return null;
  let text = "";
  try {
    text = s.getString(keyFor(skill)) || "";
  } catch (e) {
    return null;
  }
  if (!text) return null;

  let raw: any;
  try {
    raw = JSON.parse(text);
  } catch (e) {
    forgetLesson(skill);
    return null;
  }
  const check = validateLesson(raw);
  if (!check.ok) {
    print("[GhostLessonStore] dropping a stored lesson that no longer validates: " +
      check.problems.join("; "));
    forgetLesson(skill);
    return null;
  }
  return raw as Lesson;
}

/** Save a planned lesson and put it at the front of the notebook. */
export function rememberLesson(skill: string, lesson: Lesson): void {
  const s = store();
  if (!s || !skill || !lesson) return;
  const name = skill.trim();
  if (!name) return;

  try {
    s.putString(keyFor(name), JSON.stringify(lesson));
  } catch (e) {
    print("[GhostLessonStore] could not save '" + name + "': " + e);
    return;
  }

  // Most recent first, no duplicates.
  const index = rememberedSkills();
  const lower = name.toLowerCase();
  const out: string[] = [name];
  for (let i = 0; i < index.length; i++) {
    if (index[i].trim().toLowerCase() === lower) continue;
    out.push(index[i]);
  }
  while (out.length > MAX_REMEMBERED) {
    const dropped = out.pop();
    if (dropped) {
      try {
        s.putString(keyFor(dropped), "");
      } catch (e) {}
    }
  }
  try {
    s.putStringArray(INDEX_KEY, out);
  } catch (e) {}
}

export function forgetLesson(skill: string): void {
  const s = store();
  if (!s) return;
  try {
    s.putString(keyFor(skill), "");
  } catch (e) {}
  const lower = (skill || "").trim().toLowerCase();
  const out: string[] = [];
  const index = rememberedSkills();
  for (let i = 0; i < index.length; i++) {
    if (index[i].trim().toLowerCase() !== lower) out.push(index[i]);
  }
  try {
    s.putStringArray(INDEX_KEY, out);
  } catch (e) {}
}

/** True when this skill can be reopened without paying for the planner. */
export function isRemembered(skill: string): boolean {
  return recallLesson(skill) !== null;
}
