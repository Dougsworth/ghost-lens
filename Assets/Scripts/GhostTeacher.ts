/**
 * GhostTeacher — one coach for every skill.
 *
 * Like teaching a child to ride a bike:
 *   Watch  -> the ghost shows it
 *   Shadow -> copy it with a solid ghost (holding the seat)
 *   Faded  -> the ghost is faint (letting go a little)
 *   Hint   -> no ghost unless you get stuck
 *   Solo   -> on your own; a pass here, and only here, earns the stamp
 *
 * After every try: a pass moves one level up (less help), a miss moves one
 * level down (more help). Stamped items come back later, shuffled in among
 * newer ones, as quick Solo reviews. When every piece of a group is stamped,
 * the group itself becomes a new item to learn (strokes -> the whole letter,
 * letters -> a word).
 *
 * This is the motor-learning research in one loop: guidance fades with
 * performance (not a timer), comes back when the learner struggles, and the
 * reward is only ever given for an unaided attempt.
 *
 * Owns:  per-item help level, stamps, the review schedule, chunking. Pure
 *        logic: no scene access, no timers, no rendering.
 * Must not: know what an item IS. A kana, a sign, a chord and a knot step are
 *        all just ids here; each pack decides what each level looks like.
 */

export enum Help {
  Watch = 0,
  Shadow = 1,
  Faded = 2,
  Hint = 3,
  Solo = 4,
}

/** Short learner-facing names, in level order. */
export const HELP_NAMES: string[] = ["Watch", "Trace", "Faded guide", "Hint only", "Solo"];

export interface TeacherOptions {
  /** Level an item starts at once its demonstration has been watched. */
  firstTryLevel: Help;
  /** The lowest level a miss can drop to (Watch would mean replaying the demo). */
  floorLevel: Help;
  /**
   * Review spacing, counted in stamps earned since: [1, 3] means an item comes
   * back after the next stamp, and again three stamps after that.
   */
  reviewGaps: number[];
}

export const DEFAULT_TEACHER: TeacherOptions = {
  firstTryLevel: Help.Shadow,
  floorLevel: Help.Shadow,
  reviewGaps: [1, 3],
};

interface ItemState {
  level: Help;
  stamped: boolean;
  /** Stamp-count values at which this item is due for review. */
  dueAt: number[];
  tries: number;
  passes: number;
}

export interface TryOutcome {
  id: string;
  previous: Help;
  level: Help;
  /** True only for a pass at Solo: the moment the stamp is earned. */
  stamped: boolean;
  /** True if this pass was a review of an item already stamped. */
  wasReview: boolean;
  /** Groups whose every member is now stamped, newly ready to learn as a whole. */
  chunksReady: string[];
}

export class SkillTeacher {
  private readonly opts: TeacherOptions;
  private readonly items: { [id: string]: ItemState } = {};
  private readonly groups: { [id: string]: string[] } = {};
  private readonly chunksOffered: { [id: string]: boolean } = {};
  private stampCount = 0;
  private random: () => number;

  constructor(opts: TeacherOptions = DEFAULT_TEACHER, random: () => number = Math.random) {
    this.opts = opts;
    this.random = random;
  }

  private item(id: string): ItemState {
    let s = this.items[id];
    if (!s) {
      s = { level: Help.Watch, stamped: false, dueAt: [], tries: 0, passes: 0 };
      this.items[id] = s;
    }
    return s;
  }

  level(id: string): Help {
    return this.item(id).level;
  }

  isStamped(id: string): boolean {
    return this.item(id).stamped;
  }

  /** The demonstration has been seen: the first try begins with full help. */
  watched(id: string): Help {
    const s = this.item(id);
    if (s.level < this.opts.firstTryLevel) s.level = this.opts.firstTryLevel;
    return s.level;
  }

  /** A miss: one level more help, never below the floor. */
  recordMiss(id: string): TryOutcome {
    const s = this.item(id);
    const prev = s.level;
    s.tries++;
    s.level = Math.max(this.opts.floorLevel, s.level - 1);
    return { id: id, previous: prev, level: s.level, stamped: false, wasReview: false, chunksReady: [] };
  }

  /** A pass: one level less help, or the stamp if it was already Solo. */
  recordPass(id: string): TryOutcome {
    const s = this.item(id);
    const prev = s.level;
    s.tries++;
    s.passes++;
    if (s.level < Help.Solo) {
      s.level = s.level + 1;
      return { id: id, previous: prev, level: s.level, stamped: false, wasReview: false, chunksReady: [] };
    }

    const wasReview = s.stamped;
    if (!s.stamped) {
      s.stamped = true;
      this.stampCount++;
      s.dueAt = [];
      for (let i = 0; i < this.opts.reviewGaps.length; i++) {
        // Gaps accumulate: [1, 3] -> due 1 stamp later, then 3 after that.
        let at = this.stampCount;
        for (let k = 0; k <= i; k++) at += this.opts.reviewGaps[k];
        s.dueAt.push(at);
      }
    }
    return {
      id: id,
      previous: prev,
      level: s.level,
      stamped: true,
      wasReview: wasReview,
      chunksReady: this.newChunks(),
    };
  }

  /**
   * Declare that `groupId` is made of `members`. Once every member is stamped
   * the group is offered (once) through TryOutcome.chunksReady.
   */
  defineGroup(groupId: string, members: string[]): void {
    this.groups[groupId] = members.slice();
  }

  private newChunks(): string[] {
    const ready: string[] = [];
    for (const g in this.groups) {
      if (this.chunksOffered[g]) continue;
      const members = this.groups[g];
      let all = members.length > 0;
      for (let i = 0; i < members.length; i++) {
        if (!this.item(members[i]).stamped) {
          all = false;
          break;
        }
      }
      if (all) {
        this.chunksOffered[g] = true;
        ready.push(g);
      }
    }
    return ready;
  }

  /**
   * A stamped item due for review now, chosen at random among those due (the
   * shuffle is the point: mixed review beats the same order every time), or
   * null. Taking it consumes that review slot.
   */
  takeDueReview(exclude: string = ""): string | null {
    const due: string[] = [];
    for (const id in this.items) {
      const s = this.items[id];
      if (!s.stamped || id === exclude) continue;
      if (s.dueAt.length > 0 && s.dueAt[0] <= this.stampCount) due.push(id);
    }
    if (due.length === 0) return null;
    const pick = due[Math.floor(this.random() * due.length) % due.length];
    this.items[pick].dueAt.shift();
    return pick;
  }

  /** Total stamps earned this session. */
  get stamps(): number {
    return this.stampCount;
  }
}
