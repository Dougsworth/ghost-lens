/**
 * GhostGame — the game layer: points, combo, streak, levels, badges, the race
 * win, and the celebrations that make each one feel earned.
 *
 * Owns:  the player's progress (saved on the device, so it survives a Lens
 *        restart), the HUD in the left column, the floating "+points", the
 *        banners and the particle bursts, and the game sounds.
 * Must not: decide whether a stroke or a chord is right. GhostMain reports
 *        what happened (a clean stroke, a miss, a finished character...) and
 *        this only scores it and celebrates. Pull it out and every lesson
 *        works exactly as before.
 *
 * ── The rules, in one place ───────────────────────────────────────────────────
 *   clean stroke         10 x combo multiplier
 *   miss                 combo back to 0 (no points lost: never punish trying)
 *   character finished   +25, +25 more if every stroke was clean
 *   finger on a chord    +5;   chord strummed +30
 *   sign finished (ASL)  +30
 *   multiplier           x1, x1.5 at combo 3, x2 at 6, x2.5 at 9, x3 at 12+
 *   level n -> n+1       needs 60 * n points (60, 120, 180 ...)
 *
 * Plain class, not a component, so it needs no scene wiring: GhostMain builds
 * it under its own object and ticks it from its own UpdateEvent.
 */

import { GhostAudio } from "./GhostAudio";
import { createDot } from "./GhostInkRibbon";
import { applyTextRole, TextRole } from "./GhostSheetUI";

// ── Rules ────────────────────────────────────────────────────────────────────

const PTS_STROKE = 10;
const PTS_CHARACTER = 25;
const PTS_CLEAN_BONUS = 25;
const PTS_FINGER = 5;
const PTS_CHORD = 30;
const PTS_SIGN = 30;

function multiplierFor(combo: number): number {
  return Math.min(3, 1 + 0.5 * Math.floor(combo / 3));
}

/** Points needed to go from level n to n+1. */
function levelCost(n: number): number {
  return 60 * n;
}

const LEVEL_TITLES = [
  "", "Beginner", "Apprentice", "Student", "Practitioner",
  "Artisan", "Expert", "Master", "Sensei",
];

function titleFor(level: number): string {
  return LEVEL_TITLES[Math.min(level, LEVEL_TITLES.length - 1)] || "Sensei";
}

type Badge = { id: string; name: string; how: string };

/** Every badge, in the order they are usually earned. */
export const BADGES: Badge[] = [
  { id: "first_stroke", name: "First Stroke", how: "Write your first clean stroke" },
  { id: "combo5", name: "On Fire", how: "5 clean strokes in a row" },
  { id: "combo12", name: "Unstoppable", how: "12 clean strokes in a row" },
  { id: "first_char", name: "First Character", how: "Finish a character" },
  { id: "clean3", name: "Steady Hand", how: "3 perfect characters in a row" },
  { id: "kana5", name: "Five Kana", how: "Finish 5 characters" },
  { id: "kana20", name: "Kana Collector", how: "Finish 20 characters" },
  { id: "first_chord", name: "First Chord", how: "Strum your first chord" },
  { id: "chords5", name: "Campfire Ready", how: "Strum all 5 chords" },
  { id: "first_sign", name: "Hello Hands", how: "Finish an ASL sign" },
  { id: "study_buddy", name: "Study Buddy", how: "Join a Study Together room" },
  { id: "champion", name: "Champion", how: "Win a race" },
  { id: "level5", name: "Artisan", how: "Reach level 5" },
];

type Saved = {
  xp: number;
  level: number;
  bestCombo: number;
  characters: number;
  chords: string[];
  signs: number;
  badges: string[];
};

const STORE_KEY = "ghost.game.v1";

// ── Look ─────────────────────────────────────────────────────────────────────

const GOLD = new vec4(1.0, 0.82, 0.38, 1);
const AMBER = new vec4(1.0, 0.62, 0.25, 1);
const HOT = new vec4(1.0, 0.36, 0.22, 1);
const CYAN = new vec4(0.45, 0.9, 1.0, 1);
const PINK = new vec4(1.0, 0.5, 0.75, 1);
const DIM = new vec4(0.32, 0.29, 0.24, 1);
const TEXT = new vec4(0.95, 0.9, 0.8, 1);
const BURST_COLORS = [GOLD, CYAN, PINK, AMBER, TEXT];

/** Left column, shared with the race board (y -2.5) and room note (y +2.5). */
const HUD_X = -10.3;
const PIPS = 10;
const PARTICLES = 40;

type Particle = { obj: SceneObject; pass: Pass; color: vec4; pos: vec3; vel: vec3; life: number; age: number };
type Floater = { text: Text; age: number; from: vec3 };

export class GhostGame {
  private s: Saved;
  private combo = 0;
  private cleanRunChars = 0;
  /** Points the HUD counter shows; it counts up toward the real total. */
  private shownXp = 0;

  private root: SceneObject;
  private hud: SceneObject;
  private levelText: Text;
  private xpText: Text;
  private pips: { obj: SceneObject; pass: Pass }[] = [];
  private comboText: Text;
  private comboPopT = -1;
  private banner: Text;
  private bannerSub: Text;
  private bannerT = -1;
  private bannerDur = 0;
  private bannerColor = GOLD;
  private queue: { title: string; sub: string; color: vec4; dur: number; sound: () => void }[] = [];
  private particles: Particle[] = [];
  /** Badges toast quietly in the left column; the centre banner is kept for
   *  level ups and wins, so earning three badges at once never covers the
   *  sheet mid-stroke. */
  private toastHead: Text;
  private toastName: Text;
  private toastT = -1;
  private toastQueue: Badge[] = [];
  private floaters: Floater[] = [];

  constructor(parent: SceneObject, private audio: GhostAudio) {
    this.s = this.load();
    this.shownXp = this.s.xp;

    this.root = global.scene.createSceneObject("GhostGame");
    this.root.setParent(parent);

    // HUD: level + title, points, a ten-pip bar to the next level, combo.
    this.hud = global.scene.createSceneObject("GameHud");
    this.hud.setParent(this.root);
    this.levelText = this.text(this.hud, "GameLevel", new vec3(HUD_X, 7.6, 0.05), "Body", GOLD);
    this.xpText = this.text(this.hud, "GamePoints", new vec3(HUD_X, 6.0, 0.05), "Headline1", TEXT);
    for (let i = 0; i < PIPS; i++) {
      const d = createDot(this.hud, "GamePip" + i, 0.22, DIM, 0.05, 12);
      const o = d.getSceneObject();
      o.getTransform().setLocalPosition(new vec3(HUD_X - 2.2 + i * (4.4 / (PIPS - 1)), 4.9, 0.05));
      this.pips.push({ obj: o, pass: d.mainMaterial.mainPass });
    }
    this.comboText = this.text(this.hud, "GameCombo", new vec3(HUD_X, -6.6, 0.05), "Body", AMBER);

    this.toastHead = this.text(this.hud, "GameToastHead", new vec3(HUD_X, -8.6, 0.05), "Caption", CYAN);
    this.toastName = this.text(this.hud, "GameToastName", new vec3(HUD_X, -9.5, 0.05), "Headline1", CYAN);
    this.toastHead.getSceneObject().enabled = false;
    this.toastName.getSceneObject().enabled = false;

    // Banner: the one big moment (level up, badge, win), over the sheet.
    this.banner = this.text(this.root, "GameBanner", new vec3(0, 1.0, 2.2), "Title1", GOLD);
    this.bannerSub = this.text(this.root, "GameBannerSub", new vec3(0, -1.6, 2.2), "Body", TEXT);
    this.banner.getSceneObject().enabled = false;
    this.bannerSub.getSceneObject().enabled = false;

    for (let i = 0; i < PARTICLES; i++) {
      const d = createDot(this.root, "Spark" + i, 0.16 + (i % 3) * 0.06, GOLD, 0, 10);
      const o = d.getSceneObject();
      o.enabled = false;
      this.particles.push({ obj: o, pass: d.mainMaterial.mainPass, color: GOLD,
        pos: vec3.zero(), vel: vec3.zero(), life: 1, age: 2 });
    }
    for (let i = 0; i < 4; i++) {
      const t = this.text(this.root, "GameFloat" + i, vec3.zero(), "Body", GOLD);
      t.getSceneObject().enabled = false;
      this.floaters.push({ text: t, age: 9, from: vec3.zero() });
    }
    this.refreshHud(true);
  }

  // ── Events from GhostMain ─────────────────────────────────────────────────

  /** A stroke was accepted. `at` is where to float the points (GHOST-local cm). */
  strokeClean(at: vec3): void {
    this.combo++;
    const mult = multiplierFor(this.combo);
    const before = multiplierFor(this.combo - 1);
    const pts = Math.round(PTS_STROKE * mult);
    this.float("+" + pts + (mult > 1 ? "  x" + mult : ""), at, mult > 1 ? AMBER : GOLD);
    if (mult > before) {
      this.audio.playGameCombo();
      this.comboPopT = 0;
      this.burst(new vec3(HUD_X, -6.6, 0.3), 10, 0.6);
    } else {
      this.audio.playGameTick();
    }
    this.s.bestCombo = Math.max(this.s.bestCombo, this.combo);
    this.award(pts);
    this.unlock("first_stroke");
    if (this.combo >= 5) this.unlock("combo5");
    if (this.combo >= 12) this.unlock("combo12");
  }

  /** A stroke was missed: the combo breaks, nothing is taken away. */
  strokeMissed(): void {
    if (this.combo >= 3) this.float("combo lost", new vec3(HUD_X, -5.2, 0.3), DIM);
    this.combo = 0;
    this.cleanRunChars = 0;
    this.refreshHud(false);
  }

  /** A character is finished. `at` is the stamp's spot, for the burst. */
  characterDone(clean: boolean, at: vec3): void {
    this.s.characters++;
    let pts = PTS_CHARACTER;
    if (clean) {
      pts += PTS_CLEAN_BONUS;
      this.cleanRunChars++;
    } else {
      this.cleanRunChars = 0;
    }
    this.burst(at, clean ? 28 : 16, clean ? 1.2 : 0.8);
    this.float((clean ? "PERFECT  +" : "+") + pts, new vec3(at.x, at.y + 2.4, at.z + 0.5), clean ? GOLD : TEXT);
    this.award(pts);
    this.unlock("first_char");
    if (this.cleanRunChars >= 3) this.unlock("clean3");
    if (this.s.characters >= 5) this.unlock("kana5");
    if (this.s.characters >= 20) this.unlock("kana20");
  }

  fingerPlaced(at: vec3): void {
    this.audio.playGameTick();
    this.float("+" + PTS_FINGER, at, GOLD);
    this.award(PTS_FINGER);
  }

  chordPlayed(id: string, at: vec3): void {
    if (this.s.chords.indexOf(id) < 0) this.s.chords.push(id);
    this.burst(at, 24, 1.0);
    this.float("+" + PTS_CHORD, new vec3(at.x, at.y + 2, at.z + 0.5), GOLD);
    this.award(PTS_CHORD);
    this.unlock("first_chord");
    if (this.s.chords.length >= 5) this.unlock("chords5");
  }

  signDone(at: vec3): void {
    this.s.signs++;
    this.burst(at, 20, 1.0);
    this.float("+" + PTS_SIGN, at, GOLD);
    this.award(PTS_SIGN);
    this.unlock("first_sign");
  }

  joinedRoom(): void {
    this.unlock("study_buddy");
  }

  /** The race ended. `winner` is "You" or the peer's name. */
  raceOver(youWon: boolean, winner: string): void {
    if (youWon) {
      this.show("YOU WIN!", "First to the finish. Champion.", GOLD, 3.0, () => this.audio.playGameWin());
      this.burst(new vec3(0, 0, 2), PARTICLES, 1.6);
      this.unlock("champion");
    } else {
      this.show(winner + " wins", "So close. Next round is yours.", CYAN, 2.6, () => this.audio.playGotIt());
    }
  }

  /** Show the HUD on lesson screens; hide it on the front door. */
  setHudVisible(on: boolean): void {
    this.hud.enabled = on;
    if (!on) this.combo = 0;
    this.refreshHud(true);
  }

  /** Wipe saved progress (tests, or a "start over" button). */
  reset(): void {
    this.s = { xp: 0, level: 1, bestCombo: 0, characters: 0, chords: [], signs: 0, badges: [] };
    this.combo = 0;
    this.cleanRunChars = 0;
    this.queue = [];
    this.toastQueue = [];
    this.save();
    this.refreshHud(true);
  }

  get level(): number {
    return this.s.level;
  }

  get badgesEarned(): number {
    return this.s.badges.length;
  }

  /** One line for the front door: "Level 3 Student - 4/13 badges". */
  get summary(): string {
    return "Level " + this.s.level + " " + titleFor(this.s.level) +
      "  -  " + this.s.badges.length + "/" + BADGES.length + " badges";
  }

  // ── Scoring ───────────────────────────────────────────────────────────────

  private award(pts: number): void {
    this.s.xp += pts;
    // Level ups can chain on a big award; each gets its own banner.
    while (this.s.xp >= this.xpAtLevel(this.s.level + 1)) {
      this.s.level++;
      const lv = this.s.level;
      this.show("LEVEL " + lv, titleFor(lv), GOLD, 1.8, () => this.audio.playGameLevelUp());
      this.burst(new vec3(0, 1, 2), PARTICLES, 1.5);
      if (lv >= 5) this.unlock("level5");
    }
    this.save();
    this.refreshHud(false);
  }

  /** Total points at which `level` begins. */
  private xpAtLevel(level: number): number {
    let total = 0;
    for (let n = 1; n < level; n++) total += levelCost(n);
    return total;
  }

  private unlock(id: string): void {
    if (this.s.badges.indexOf(id) >= 0) return;
    const b = BADGES.filter((x) => x.id === id)[0];
    if (!b) return;
    this.s.badges.push(id);
    this.save();
    this.toastQueue.push(b);
    if (this.toastT < 0) this.nextToast();
  }

  // ── HUD ───────────────────────────────────────────────────────────────────

  private refreshHud(snap: boolean): void {
    if (snap) this.shownXp = this.s.xp;
    this.levelText.text = "LV " + this.s.level + "  " + titleFor(this.s.level);
    this.xpText.text = Math.round(this.shownXp) + " pts";
    const from = this.xpAtLevel(this.s.level);
    const to = this.xpAtLevel(this.s.level + 1);
    const f = Math.max(0, Math.min(1, (this.s.xp - from) / Math.max(1, to - from)));
    const lit = Math.floor(f * PIPS + 1e-6);
    for (let i = 0; i < PIPS; i++) this.pips[i].pass.baseColor = i < lit ? GOLD : DIM;
    const mult = multiplierFor(this.combo);
    this.comboText.text = this.combo >= 2 ? "COMBO " + this.combo + (mult > 1 ? "  x" + mult : "") : "";
    this.comboText.getSceneObject().enabled = this.combo >= 2;
    const heat = Math.min(1, this.combo / 12);
    this.comboText.textFill.color = new vec4(
      AMBER.x + (HOT.x - AMBER.x) * heat, AMBER.y + (HOT.y - AMBER.y) * heat,
      AMBER.z + (HOT.z - AMBER.z) * heat, 1);
  }

  // ── Effects ───────────────────────────────────────────────────────────────

  /** A spray of sparks from `at`, flung outward and falling. */
  burst(at: vec3, count: number, power: number): void {
    let used = 0;
    for (let i = 0; i < this.particles.length && used < count; i++) {
      const p = this.particles[i];
      if (p.age < p.life) continue;
      const a = Math.random() * Math.PI * 2;
      const sp = (8 + Math.random() * 14) * power;
      p.pos = at;
      p.vel = new vec3(Math.cos(a) * sp, Math.sin(a) * sp + 6 * power, (Math.random() - 0.3) * 6);
      p.age = 0;
      p.life = 0.8 + Math.random() * 0.6;
      p.color = BURST_COLORS[Math.floor(Math.random() * BURST_COLORS.length)];
      p.obj.enabled = true;
      used++;
    }
  }

  private float(label: string, at: vec3, color: vec4): void {
    let f = this.floaters[0];
    for (const x of this.floaters) if (x.age > f.age) f = x;
    f.text.text = label;
    f.text.textFill.color = color;
    f.from = at;
    f.age = 0;
    f.text.getSceneObject().enabled = true;
  }

  private show(title: string, sub: string, color: vec4, dur: number, sound: () => void): void {
    this.queue.push({ title, sub, color, dur, sound });
    if (this.bannerT < 0) this.nextBanner();
  }

  private nextBanner(): void {
    const b = this.queue.shift();
    if (!b) {
      this.bannerT = -1;
      this.banner.getSceneObject().enabled = false;
      this.bannerSub.getSceneObject().enabled = false;
      return;
    }
    this.banner.text = b.title;
    this.bannerSub.text = b.sub;
    this.bannerColor = b.color;
    this.bannerDur = b.dur;
    this.bannerT = 0;
    this.banner.getSceneObject().enabled = true;
    this.bannerSub.getSceneObject().enabled = true;
    b.sound();
  }

  private nextToast(): void {
    const b = this.toastQueue.shift();
    const on = !!b;
    this.toastHead.getSceneObject().enabled = on;
    this.toastName.getSceneObject().enabled = on;
    if (!b) {
      this.toastT = -1;
      return;
    }
    this.toastHead.text = "NEW BADGE";
    this.toastName.text = b.name;
    this.toastT = 0;
    this.audio.playGameBadge();
    const p = this.toastName.getSceneObject().getTransform().getLocalPosition();
    this.burst(new vec3(p.x, p.y, 0.3), 8, 0.5);
  }

  update(dt: number): void {
    // Badge toast: pop in, hold 2 s, fade; then the next one.
    if (this.toastT >= 0) {
      this.toastT += dt;
      const t = this.toastT;
      const k = t < 0.2 ? 1.4 - 0.4 * (t / 0.2) : 1;
      this.toastName.getSceneObject().getTransform().setLocalScale(new vec3(k, k, 1));
      const a = Math.min(1, t / 0.12) * (t > 2.0 ? Math.max(0, (2.4 - t) / 0.4) : 1);
      this.toastHead.textFill.color = new vec4(CYAN.x, CYAN.y, CYAN.z, a);
      this.toastName.textFill.color = new vec4(CYAN.x, CYAN.y, CYAN.z, a);
      if (t >= 2.4) this.nextToast();
    }

    // Points counter rolls up instead of jumping.
    if (this.shownXp < this.s.xp) {
      this.shownXp = Math.min(this.s.xp, this.shownXp + Math.max(1, (this.s.xp - this.shownXp) * 8 * dt));
      this.xpText.text = Math.round(this.shownXp) + " pts";
    }

    // Combo pop: grows 35% and settles.
    if (this.comboPopT >= 0) {
      this.comboPopT += dt;
      const f = Math.min(1, this.comboPopT / 0.3);
      const k = 1 + 0.35 * Math.sin(Math.PI * f);
      this.comboText.getSceneObject().getTransform().setLocalScale(new vec3(k, k, 1));
      if (f >= 1) this.comboPopT = -1;
    }

    // Banner: slam in from 1.6x with an overshoot, hold, fade.
    if (this.bannerT >= 0) {
      this.bannerT += dt;
      const t = this.bannerT;
      const inF = Math.min(1, t / 0.22);
      const k = t < 0.22 ? 1.6 - 0.7 * (1 - (1 - inF) * (1 - inF)) : (t < 0.34 ? 0.9 + 0.1 * ((t - 0.22) / 0.12) : 1);
      this.banner.getSceneObject().getTransform().setLocalScale(new vec3(k, k, 1));
      const a = Math.min(1, t / 0.1) * (t > this.bannerDur - 0.4 ? Math.max(0, (this.bannerDur - t) / 0.4) : 1);
      const c = this.bannerColor;
      this.banner.textFill.color = new vec4(c.x, c.y, c.z, a);
      this.bannerSub.textFill.color = new vec4(TEXT.x, TEXT.y, TEXT.z, a);
      if (t >= this.bannerDur) this.nextBanner();
    }

    // Sparks: ballistic, fading out (additive: dimmer = more transparent).
    for (const p of this.particles) {
      if (p.age >= p.life) continue;
      p.age += dt;
      if (p.age >= p.life) {
        p.obj.enabled = false;
        continue;
      }
      p.vel = new vec3(p.vel.x * (1 - 1.5 * dt), p.vel.y - 30 * dt, p.vel.z);
      p.pos = p.pos.add(p.vel.uniformScale(dt));
      p.obj.getTransform().setLocalPosition(p.pos);
      const fade = 1 - p.age / p.life;
      p.pass.baseColor = new vec4(p.color.x * fade, p.color.y * fade, p.color.z * fade, 1);
    }

    // Floating points: rise 2.5 cm and fade over a second.
    for (const f of this.floaters) {
      if (f.age > 1.1) continue;
      f.age += dt;
      const so = f.text.getSceneObject();
      if (f.age > 1.1) {
        so.enabled = false;
        continue;
      }
      so.getTransform().setLocalPosition(new vec3(f.from.x, f.from.y + 2.5 * f.age, f.from.z + 0.6));
      const c = f.text.textFill.color;
      const a = f.age < 0.7 ? 1 : Math.max(0, 1 - (f.age - 0.7) / 0.4);
      f.text.textFill.color = new vec4(c.x, c.y, c.z, a);
    }
  }

  // ── Plumbing ──────────────────────────────────────────────────────────────

  private text(parent: SceneObject, name: string, pos: vec3, role: TextRole, color: vec4): Text {
    const so = global.scene.createSceneObject(name);
    so.setParent(parent);
    so.getTransform().setLocalPosition(pos);
    const t = so.createComponent("Component.Text") as Text;
    t.text = "";
    t.depthTest = false;
    applyTextRole(t, role);
    t.textFill.color = color;
    t.horizontalAlignment = HorizontalAlignment.Center;
    t.verticalAlignment = VerticalAlignment.Center;
    t.horizontalOverflow = HorizontalOverflow.Overflow;
    t.verticalOverflow = VerticalOverflow.Overflow;
    return t;
  }

  private load(): Saved {
    const fresh: Saved = { xp: 0, level: 1, bestCombo: 0, characters: 0, chords: [], signs: 0, badges: [] };
    try {
      const raw = global.persistentStorageSystem.store.getString(STORE_KEY);
      if (!raw) return fresh;
      const v = JSON.parse(raw);
      return {
        xp: Number(v.xp) || 0, level: Math.max(1, Number(v.level) || 1),
        bestCombo: Number(v.bestCombo) || 0, characters: Number(v.characters) || 0,
        chords: Array.isArray(v.chords) ? v.chords.map(String) : [],
        signs: Number(v.signs) || 0,
        badges: Array.isArray(v.badges) ? v.badges.map(String) : [],
      };
    } catch (e) {
      return fresh;
    }
  }

  private save(): void {
    try {
      global.persistentStorageSystem.store.putString(STORE_KEY, JSON.stringify(this.s));
    } catch (e) {
      // Storage can be unavailable in some preview states; progress then
      // lasts for this session only, which is fine.
    }
  }
}
