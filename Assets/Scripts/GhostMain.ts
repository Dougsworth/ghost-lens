/**
 * GhostMain — the orchestrator for GHOST.
 *
 * Owns:  the lens state machine and every decision in it — shelf, lesson
 *        (ghost demo -> the user's turn -> stamp -> page turn), and Ask GHOST.
 *        This is the ONLY script that talks to a UI module: data goes out
 *        through setters, user intent comes back through events, so the flow
 *        stays one-way and each other script stays testable on its own.
 * Must not: create text, import UIKit, or draw anything itself.
 *
 * Stroke data credit: KanjiVG by Ulrich Apel, CC BY-SA 3.0.
 */

import { GhostAudio } from "./GhostAudio";
import { GhostDemoPlayer } from "./GhostDemoPlayer";
import { GhostSheet } from "./GhostSheet";
import { GhostSheetUI } from "./GhostSheetUI";
import { GhostShelfUI } from "./GhostShelfUI";
import { GhostAskUI } from "./GhostAskUI";
import { GhostTurnController, MissInfo } from "./GhostTurnController";
import { GhostPinchInput } from "./GhostPinchInput";
import { buildGlyphPath, GlyphPath, hasCharacter } from "./GhostKanaPath";
import { findAskWord } from "./GhostAskWords";
import WorldCameraFinderProvider from "SpectaclesInteractionKit.lspkg/Providers/CameraProvider/WorldCameraFinderProvider";
import { GhostAslUI } from "./GhostAslUI";
import { GhostAslController } from "./GhostAslController";
import { ASL_SIGNS } from "./GhostAslPack";
import { INTRO_LINE, lessonFor, praiseFor, tipFor } from "./GhostKanaLesson";

/** What the sheet is currently doing. */
type Mode = "shelf" | "demo" | "turn" | "finished" | "ask" | "asl";

@component
export class GhostMain extends BaseScriptComponent {
  @ui.label('<span style="color: #60A5FA;">GhostMain &ndash; shelf, lesson, your turn, Ask GHOST</span>')
  @ui.separator

  @ui.label('<span style="color: #60A5FA;">References</span>')
  @ui.group_start("References")
  @input
  @hint("Group root holding the notebook shelf.")
  shelfRoot!: SceneObject;

  @input
  @hint("Group root holding the practice sheet and its bookmark tabs.")
  lessonRoot!: SceneObject;

  @input
  @hint("Group root holding the Ask GHOST word picker.")
  askRoot!: SceneObject;

  @input
  @hint("The notebook shelf UI module.")
  shelfUI!: GhostShelfUI;

  @input
  @hint("The sheet's stroke counter, caption and bookmark tabs.")
  sheetUI!: GhostSheetUI;

  @input
  @hint("The Ask GHOST word picker.")
  askUI!: GhostAskUI;

  @input
  @hint("The washi practice sheet.")
  sheet!: GhostSheet;

  @input
  @hint("The ghost brush that demonstrates a character.")
  demo!: GhostDemoPlayer;

  @input
  @hint("The user's turn: pinch, drag, check, dry.")
  turn!: GhostTurnController;

  @input
  @hint("Pinch source shared by the turn controller.")
  pinchInput!: GhostPinchInput;

  @input
  @hint("Group root holding the ASL pack's ghost hands and tabs.")
  aslRoot!: SceneObject;

  @input
  @hint("The ASL lesson's sign name, hint and Got it tab.")
  aslUI!: GhostAslUI;

  @input
  @hint("The ghost hands that demonstrate each ASL sign.")
  asl!: GhostAslController;

  @input
  @hint("Brush, paper, stamp and spoken-character sounds.")
  audio!: GhostAudio;
  @ui.group_end

  @ui.separator
  @ui.label('<span style="color: #60A5FA;">Settings</span>')
  @ui.group_start("Settings")
  @input
  @hint("Characters taught by the Japanese pack, in order. The engine can read any of KanaStrokes' 168 kana.")
  lessonSequence: string = "あいうえお";

  @input
  @hint("Drop the shelf and the sheet in front of wherever the user is standing when they open, instead of at a fixed spot in the room. Turn off to pin GHOST to the world origin.")
  reanchorOnOpen: boolean = true;

  @input
  @hint("How far in front of the user GHOST appears, in cm. The brief's writing distance is 45.")
  @widget(new SliderWidget(25, 90, 1))
  anchorDistanceCm: number = 45;

  @input
  @hint("Seconds the finished sheet rests with its stamp before the page turns.")
  @widget(new SliderWidget(0.2, 3, 0.1))
  stampHoldSec: number = 1.1;

  @input
  @hint("Wireframe every collider and body in the scene, so pinch hit-zones can be checked. Takes effect on preview restart.")
  debugColliders: boolean = false;
  @ui.group_end

  private characters: string[] = [];
  private introShown = false;
  private praiseCount = 0;
  private currentChar = "";
  private lessonIndex = 0;
  private glyph: GlyphPath | null = null;
  private mode: Mode = "shelf";
  /** >= 0 while the ghost is re-showing one stroke after repeated misses. */
  private redemoIndex = -1;

  // Ask GHOST writes a whole word, one character at a time.
  private askChars: string[] = [];
  private askPos = 0;
  private askCaption = "";

  onAwake(): void {
    // Cross-component access is NOT safe in onAwake: a ScriptComponent reached
    // through an @input has not run its own onAwake yet, so its Event fields do
    // not exist. Lens Studio runs every onAwake before any onStart.
    this.createEvent("OnStartEvent").bind(() => this.onStart());
  }

  private onStart(): void {
    if (
      !this.shelfRoot || !this.lessonRoot || !this.askRoot ||
      !this.shelfUI || !this.sheetUI || !this.askUI ||
      !this.sheet || !this.demo || !this.turn || !this.pinchInput || !this.audio ||
      !this.aslRoot || !this.aslUI || !this.asl
    ) {
      print("[GhostMain] ERROR: a required @input is not wired. Check the scene bootstrap's input-wiring pass.");
      return;
    }

    this.characters = this.parseLesson(this.lessonSequence);
    if (this.characters.length === 0) {
      print("[GhostMain] ERROR: no usable characters in lessonSequence.");
      return;
    }

    this.shelfUI.onPackSelected.add((id: string) => this.onPackSelected(id));

    this.sheetUI.onReplay.add(() => this.onReplay());
    this.sheetUI.onSlower.add(() => this.onSlower());
    this.sheetUI.onNext.add(() => this.onNext());
    this.sheetUI.onPacks.add(() => this.onPacks());
    this.sheetUI.onAsk.add(() => this.onAsk());

    this.askUI.onWordPicked.add((w: string) => this.onWordPicked(w));
    this.askUI.onBack.add(() => this.onAskBack());

    this.demo.onStrokeStarted.add((i: number) => this.onDemoStrokeStarted(i));
    this.demo.onDemoFinished.add(() => this.onDemoFinished());
    this.sheet.onUnrollComplete.add(() => this.onUnrollComplete());
    this.sheet.onPageTurnComplete.add(() => this.onPageTurnComplete());

    this.turn.onStrokeAccepted.add((i: number) => this.onStrokeAccepted(i));
    this.turn.onStrokeMissed.add((m: MissInfo) => this.onStrokeMissed(m));
    this.turn.onNeedsDemo.add((i: number) => this.onNeedsDemo(i));
    this.turn.onCharacterComplete.add(() => this.onCharacterComplete());

    this.aslUI.onGotIt.add(() => this.onAslGotIt());
    this.aslUI.onReplay.add(() => this.onAslReplay());
    this.aslUI.onPacks.add(() => this.onPacks());
    this.asl.onSignFinished.add(() => this.onSignFinished());

    if (this.debugColliders) this.setColliderDebugAll(this.sceneObject, true);


    // UIKit Frames, BackPlates and Buttons bind initialize() to OnStartEvent,
    // and a SceneObject disabled before OnStart never initialises at all. Wait a
    // beat so every control finishes building before hiding the unused halves.
    const ready = this.createEvent("DelayedCallbackEvent");
    ready.bind(() => this.showShelf());
    ready.reset(0.1);
  }

  // ── State ─────────────────────────────────────────────────────────────────

  private showShelf(): void {
    this.mode = "shelf";
    this.anchorInFrontOfUser();
    this.demo.stop();
    this.turn.stop();
    this.turn.clearAll();
    this.sheet.hide();
    this.askChars = [];
    this.askCaption = "";
    this.asl.stop();
    this.asl.setVisible(false);
    this.lessonRoot.enabled = false;
    this.askRoot.enabled = false;
    this.aslRoot.enabled = false;
    this.shelfRoot.enabled = true;
  }

  /** Open a character's sheet: unroll it in, then the ghost writes. */
  private openLesson(index: number): void {
    if (this.characters.length === 0) return;
    const n = this.characters.length;
    this.lessonIndex = ((index % n) + n) % n;
    this.askChars = [];
    this.askCaption = "";
    this.sheetUI.setCaption("");
    this.beginCharacter(this.characters[this.lessonIndex], true);
  }

  /** Shared by the lesson and by Ask GHOST: put one character on a fresh sheet. */
  private beginCharacter(character: string, unroll: boolean): void {
    this.glyph = buildGlyphPath(character, this.demo.glyphUnitCm, true);
    if (!this.glyph) {
      print("[GhostMain] ERROR: no stroke data for '" + character + "'.");
      return;
    }

    this.turn.stop();
    this.turn.clearAll();
    this.demo.setGlyph(this.glyph);
    this.sheetUI.clearStrokeNumbers();
    this.sheetUI.setStrokeCounter(1, this.glyph.strokeCount);

    // How it sounds, and something to picture — the fixed block under the sheet.
    this.currentChar = character;
    const lesson = lessonFor(character);
    this.sheetUI.setRomaji(lesson ? lesson.romaji : "");
    this.sheetUI.setHook(lesson ? lesson.hook : "");
    this.sheetUI.setProgress(this.characters.length, this.lessonIndex, this.lessonIndex);
    this.sheetUI.setLine("");

    this.shelfRoot.enabled = false;
    this.askRoot.enabled = false;
    this.aslRoot.enabled = false;
    this.lessonRoot.enabled = true;

    if (unroll) {
      this.anchorInFrontOfUser();
      this.sheet.showUnroll();
      this.audio.playUnroll();
      // The demonstration starts from sheet.onUnrollComplete.
    } else {
      this.sheet.showImmediate();
      this.startDemo(false);
    }
  }

  private startDemo(slow: boolean): void {
    if (!this.glyph) return;
    this.mode = "demo";
    this.redemoIndex = -1;
    this.turn.stop();
    this.sheetUI.clearStrokeNumbers();
    this.sheetUI.setStrokeCounter(1, this.glyph.strokeCount);
    this.demo.setBrushVisible(true);
    this.demo.play(slow);
  }

  /** The ghost is done; hand the brush to the user. */
  private beginUserTurn(): void {
    if (!this.glyph) return;
    this.mode = "turn";
    this.sheetUI.setStrokeCounter(1, this.glyph.strokeCount);
    this.demo.parkBrushAt(0);
    this.turn.begin(this.glyph);

    // First lesson only: say what to do, once, then get out of the way. After
    // that the line carries the per-stroke tip instead.
    if (!this.introShown) {
      this.introShown = true;
      this.sheetUI.setLine(INTRO_LINE);
      const clear = this.createEvent("DelayedCallbackEvent");
      clear.bind(() => this.showStrokeTip(0));
      clear.reset(3.0);
      return;
    }
    this.showStrokeTip(0);
  }

  /** The one line above the sheet: how to move for the stroke about to be drawn. */
  private showStrokeTip(strokeIndex: number): void {
    this.sheetUI.setLine(tipFor(this.currentChar, strokeIndex));
  }


  // ── Events in ─────────────────────────────────────────────────────────────

  private onUnrollComplete(): void {
    if (this.mode === "ask") {
      this.demo.setBrushVisible(true);
      this.demo.play(false);
      return;
    }
    this.startDemo(false);
  }

  private onDemoStrokeStarted(index: number): void {
    if (!this.glyph) return;
    this.audio.playBrush();
    this.sheetUI.setStrokeCounter(index + 1, this.glyph.strokeCount);
    const start = this.glyph.strokes[index].start;
    this.sheetUI.showStrokeNumber(index + 1, start.x, start.y);
  }

  private onDemoFinished(): void {
    if (!this.glyph) return;

    // Re-showed one stroke after misses: give the sheet straight back.
    if (this.redemoIndex >= 0) {
      this.redemoIndex = -1;
      this.mode = "turn";
      this.turn.resume();
      return;
    }

    this.audio.playCharacterSound(this.glyph.character);

    if (this.mode === "ask") {
      this.advanceAsk();
      return;
    }

    this.beginUserTurn();
  }

  private onStrokeAccepted(index: number): void {
    if (!this.glyph) return;
    this.audio.playInkDry();
    // The brush hops to the start of the next stroke.
    const next = Math.min(index + 1, this.glyph.strokeCount - 1);
    this.demo.parkBrushAt(next);
    this.sheetUI.setStrokeCounter(Math.min(index + 2, this.glyph.strokeCount), this.glyph.strokeCount);

    // A word, then the next instruction. Praise alone would leave the user
    // without a next step; the tip alone would feel like silence after effort.
    const last = index >= this.glyph.strokeCount - 1;
    this.sheetUI.setLine(praiseFor(this.praiseCount));
    this.praiseCount++;
    if (!last) {
      const then = this.createEvent("DelayedCallbackEvent");
      then.bind(() => this.showStrokeTip(index + 1));
      then.reset(1.1);
    }
  }

  private onStrokeMissed(info: MissInfo): void {
    // No harsh error and no red X — a soft sound, and the start point pulses.
    this.audio.playMiss();
    // Re-show the movement for THIS stroke. Saying nothing after a miss reads
    // as a dead end; repeating the tip is the quietest useful answer.
    this.showStrokeTip(info.index);
  }

  private onNeedsDemo(index: number): void {
    if (!this.glyph) return;
    this.redemoIndex = index;
    this.mode = "demo";
    this.demo.setBrushVisible(true);
    this.demo.playSingle(index, false);
  }

  private onCharacterComplete(): void {
    this.mode = "finished";
    this.audio.playStamp();
    this.sheet.showStamp();
    const after = this.createEvent("DelayedCallbackEvent");
    after.bind(() => {
      this.audio.playPageTurn();
      this.sheet.playPageTurn();
    });
    after.reset(this.stampHoldSec);
  }

  private onPageTurnComplete(): void {
    if (this.mode !== "finished") return;
    this.openLesson(this.lessonIndex + 1);
  }


  private onPackSelected(id: string): void {
    this.audio.playTap();
    if (id === "japanese") {
      this.openLesson(0);
      return;
    }
    if (id === "asl") {
      this.openAsl(0);
      return;
    }
    // Guitar Chords, Chinese and Knots are covers only — the brief's out-of-scope list.
    print("[GhostMain] pack '" + id + "' is a cover only in this build.");
  }

  // ── Tabs ──────────────────────────────────────────────────────────────────

  private onReplay(): void {
    this.audio.playTap();
    if (!this.glyph) return;
    this.sheet.showImmediate();
    this.startDemo(false);
  }

  private onSlower(): void {
    this.audio.playTap();
    if (!this.glyph) return;
    this.sheet.showImmediate();
    this.startDemo(true);
  }

  private onNext(): void {
    this.audio.playTap();
    this.openLesson(this.lessonIndex + 1);
  }

  private onPacks(): void {
    this.audio.playTap();
    this.showShelf();
  }

  private onAsk(): void {
    this.audio.playTap();
    this.mode = "ask";
    this.turn.stop();
    this.demo.stop();
    this.lessonRoot.enabled = false;
    this.shelfRoot.enabled = false;
    this.aslRoot.enabled = false;
    this.asl.stop();
    this.asl.setVisible(false);
    this.askRoot.enabled = true;
    // Ask opens as its own surface, so it needs placing in front of the user
    // just like the shelf and the sheet do — otherwise it is left behind at
    // wherever GHOST was last anchored.
    this.anchorInFrontOfUser();
  }

  private onAskBack(): void {
    this.audio.playTap();
    this.askRoot.enabled = false;
    this.openLesson(this.lessonIndex);
  }

  // ── Ask GHOST ─────────────────────────────────────────────────────────────

  private onWordPicked(english: string): void {
    this.audio.playTap();
    const word = findAskWord(english);
    if (!word) {
      print("[GhostMain] no word '" + english + "' in the offline list.");
      return;
    }
    this.askChars = [];
    for (let i = 0; i < word.kana.length; i++) {
      const c = word.kana.charAt(i);
      if (hasCharacter(c)) this.askChars.push(c);
    }
    if (this.askChars.length === 0) return;

    this.askPos = 0;
    this.askCaption = word.kana + "  —  " + word.meaning;
    this.mode = "ask";
    this.askRoot.enabled = false;
    this.beginCharacter(this.askChars[0], true);
    this.sheetUI.setCaption(this.askCaption);
  }

  /** Move to the next character of the asked word, or stop on the last one. */
  private advanceAsk(): void {
    this.askPos++;
    if (this.askPos >= this.askChars.length) {
      // Word finished: leave the last character and its meaning on the sheet.
      return;
    }
    const next = this.createEvent("DelayedCallbackEvent");
    next.bind(() => {
      this.beginCharacter(this.askChars[this.askPos], false);
      this.sheetUI.setCaption(this.askCaption);
    });
    next.reset(0.6);
  }

  // ── ASL pack ──────────────────────────────────────────────────────────────

  private aslIndex = 0;

  /** Open the ASL notebook: ghost hands sign at hand height, in place of the sheet. */
  private openAsl(index: number): void {
    const n = ASL_SIGNS.length;
    this.aslIndex = ((index % n) + n) % n;
    const sign = ASL_SIGNS[this.aslIndex];

    this.mode = "asl";
    this.turn.stop();
    this.demo.stop();
    this.sheet.hide();
    this.shelfRoot.enabled = false;
    this.lessonRoot.enabled = false;
    this.askRoot.enabled = false;
    this.aslRoot.enabled = true;
    this.anchorInFrontOfUser();

    this.aslUI.setSign(sign.label, sign.hint);
    this.aslUI.setGotItVisible(false);
    this.audio.playUnroll();
    this.asl.play(sign);
  }

  /** The ghost has finished signing — now the user self-checks. */
  private onSignFinished(): void {
    if (this.mode !== "asl") return;
    // Tier 3 of the brief's ASL input ladder: no hand-pose check is possible
    // without real hands, so the Got it tab carries the step.
    this.aslUI.setGotItVisible(true);
  }

  private onAslGotIt(): void {
    this.audio.playGotIt();
    this.aslUI.setGotItVisible(false);
    this.openAsl(this.aslIndex + 1);
  }

  private onAslReplay(): void {
    this.audio.playTap();
    this.openAsl(this.aslIndex);
  }

  /**
   * Put GHOST in front of the user, level with their eye line, facing them —
   * then leave it there. The brief anchors the sheet "in the world where it
   * appears at the start of the lesson", which means in front of wherever the
   * user actually is, not at a fixed spot in the room. Once placed it does NOT
   * follow the head: the user can lean in and walk around their own writing.
   *
   * Yaw only. Copying the head's pitch and roll would tilt the paper with every
   * nod, which is exactly the queasy head-locked feel the brief rules out.
   */
  private anchorInFrontOfUser(): void {
    if (!this.reanchorOnOpen) return;
    const cam = WorldCameraFinderProvider.getInstance().getComponent().getTransform();
    const eye = cam.getWorldPosition();
    const fwd = cam.forward.uniformScale(-1);
    const flat = new vec3(fwd.x, 0, fwd.z);
    if (flat.length < 1e-4) return;
    const dir = flat.normalize();

    const t = this.sceneObject.getTransform();
    t.setWorldPosition(
      new vec3(eye.x + dir.x * this.anchorDistanceCm, eye.y, eye.z + dir.z * this.anchorDistanceCm)
    );
    // GHOST is authored sitting at -Z and facing BACK toward the camera, so its
    // local +Z must end up pointing along -dir. Yaw = atan2(-dir.x, -dir.z);
    // verified against the identity case (looking down -Z must give yaw 0).
    // Note this is NOT the usual atan2(dir.x, -dir.z) used for a mesh whose
    // front is -Z — the sign differs because this content faces +Z.
    t.setWorldRotation(quat.fromEulerAngles(0, Math.atan2(-dir.x, -dir.z), 0));
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  private parseLesson(sequence: string): string[] {
    const out: string[] = [];
    for (let i = 0; i < sequence.length; i++) {
      const ch = sequence.charAt(i);
      if (ch === " " || ch === ",") continue;
      if (hasCharacter(ch)) out.push(ch);
      else print("[GhostMain] skipping '" + ch + "' - no stroke data.");
    }
    return out;
  }

  private setColliderDebugAll(root: SceneObject, on: boolean): void {
    const collider = root.getComponent("Physics.ColliderComponent") as ColliderComponent | null;
    if (collider) collider.debugDrawEnabled = on;
    const body = root.getComponent("Physics.BodyComponent") as BodyComponent | null;
    if (body) body.debugDrawEnabled = on;
    for (let i = 0; i < root.getChildrenCount(); i++) {
      this.setColliderDebugAll(root.getChild(i), on);
    }
  }
}
