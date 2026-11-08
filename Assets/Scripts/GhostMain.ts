/**
 * GhostMain — the orchestrator for GHOST.
 *
 * Owns:  the lens state machine and every decision in it — shelf, the three
 *        packs (Japanese paths, ASL poses, guitar chords), and Ask GHOST. Every
 *        pack runs the same beat: ghost demo -> the user's turn -> stamp -> next.
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
import { InkRibbon } from "./GhostInkRibbon";
import { Pt } from "./GhostKanaPath";
import { buildGlyphPath, GlyphPath, hasCharacter } from "./GhostKanaPath";
import { findAskWord } from "./GhostAskWords";
import WorldCameraFinderProvider from "SpectaclesInteractionKit.lspkg/Providers/CameraProvider/WorldCameraFinderProvider";
import { GhostAslUI } from "./GhostAslUI";
import { GhostAslController } from "./GhostAslController";
import { ASL_SIGNS } from "./GhostAslPack";
import {
  SAY_MISS, SAY_WATCH, SAY_YOUR_TURN, lessonFor, praiseFor, strokeOf, tipFor,
} from "./GhostKanaLesson";
import { GhostGuitarUI } from "./GhostGuitarUI";
import { GhostGuitarController } from "./GhostGuitarController";
import { GUITAR_CHORDS } from "./GhostGuitarPack";
import { GhostFrontDoorUI } from "./GhostFrontDoorUI";
import { GhostLessonSource, LessonResult } from "./GhostLessonSource";
import { GhostCoach } from "./GhostCoach";
import { GhostSpeech } from "./GhostSpeech";
import { GhostRoom, Peer, RoomEvent } from "./GhostRoom";
import { Lesson } from "./GhostLessonSchema";
import { glyphFromStep, traceableSteps } from "./GhostLessonPath";
import {
  GUITAR_LEGEND,
  GUITAR_STRUM_LINE,
  lineFor as guitarLineFor,
  praiseFor as guitarPraiseFor,
  stepLine,
} from "./GhostGuitarLesson";

/** What the sheet is currently doing. */
type Mode = "front" | "shelf" | "demo" | "turn" | "finished" | "ask" | "asl" | "guitar";

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
  @hint("Group root holding the guitar pack's fretboard and tabs.")
  guitarRoot!: SceneObject;

  @input
  @hint("The guitar lesson's chord name, progress and tabs.")
  guitarUI!: GhostGuitarUI;

  @input
  @hint("The fretboard lesson: the ghost places the chord, then the user does.")
  guitar!: GhostGuitarController;

  @input
  @hint("Group root holding the front door sheet.")
  frontRoot!: SceneObject;

  @input
  @hint("The front door: what do you want to learn?")
  frontUI!: GhostFrontDoorUI;

  @input
  @hint("Plans a lesson, or falls back to a bundled one. Never fails.")
  lessonSource!: GhostLessonSource;

  @input
  @hint("One short line after each attempt. Never blocks the lesson.")
  coach!: GhostCoach;

  @input
  @hint("Say a skill out loud. In the preview the tracker page listens; the typed suggestions are the fallback.")
  speech!: GhostSpeech;

  @input
  @hint("Study Together: the room relay. Optional — with it absent the solo lesson is completely unaffected.")
  room!: GhostRoom;

  @input
  @hint("Brush, paper, stamp and spoken-character sounds.")
  audio!: GhostAudio;
  @ui.group_end

  @ui.separator
  @ui.label('<span style="color: #60A5FA;">Settings</span>')
  @ui.group_start("Settings")
  @input
  @hint("Characters taught by the Japanese pack, in order. SIMPLEST FIRST: い う え are two strokes, あ お are three. Starting on the easiest shape and adding a stroke later is what lets the guide outline be withdrawn without the lesson falling over. The engine can read any of KanaStrokes' 168 kana.")
  lessonSequence: string = "いうえあお";

  @input
  @hint("Drop the shelf and the sheet in front of wherever the user is standing when they open, instead of at a fixed spot in the room. Turn off to pin GHOST to the world origin.")
  reanchorOnOpen: boolean = true;

  @input
  @hint("How far in front of the user GHOST appears, in cm. The brief's writing distance is 45.")
  @widget(new SliderWidget(25, 90, 1))
  anchorDistanceCm: number = 45;

  @input
  @hint("Characters written with no missed strokes before the guide outline starts to fade. Set high to keep the full outline forever.")
  @widget(new SliderWidget(1, 6, 1))
  cleanRunsBeforeFade: number = 1;

  @input
  @hint("Seconds the finished sheet rests with its stamp before the page turns.")
  @widget(new SliderWidget(0.2, 3, 0.1))
  stampHoldSec: number = 1.1;

  @input("vec4", "{0.52,0.58,1,1}")
  @hint("A peer's ink. Indigo so it reads as someone else's hand without competing with your own warm ink; additive display, so it is an emitted blue.")
  @widget(new ColorWidget())
  peerInkColor: vec4;

  @input
  @hint("Wireframe every collider and body in the scene, so pinch hit-zones can be checked. Takes effect on preview restart.")
  debugColliders: boolean = false;
  @ui.group_end

  private characters: string[] = [];
  /** Characters finished with no miss, in a row. Drives the guide fade. */
  private cleanRun = 0;
  /** True while the character on the sheet has not been missed once. */
  private cleanCharacter = true;
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
      !this.aslRoot || !this.aslUI || !this.asl ||
      !this.guitarRoot || !this.guitarUI || !this.guitar ||
      !this.frontRoot || !this.frontUI || !this.lessonSource || !this.coach ||
      !this.speech || !this.room
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

    this.frontUI.onSkillPicked.add((skill: string) => this.onSkillPicked(skill));
    this.frontUI.onMicPressed.add(() => this.onMicPressed());
    this.frontUI.onNotebookPicked.add((id: string) => this.onPackSelected(id));
    this.coach.onTip.add((tip: string) => this.onCoachTip(tip));
    this.speech.onHeard.add((text: string) => this.onHeard(text));
    this.speech.onGaveUp.add(() => this.onSpeechGaveUp());

    this.frontUI.onStudyTogether.add(() => this.onStudyTogether());
    this.room.onJoined.add((code: string) => this.onRoomJoined(code));
    this.room.onPeerJoined.add((p: Peer) => this.onPeerJoined(p));
    this.room.onPeerLeft.add((p: Peer) => this.onPeerLeft(p));
    this.room.onEvent.add((e: RoomEvent) => this.onRoomEvent(e));
    this.room.onError.add((why: string) => this.onRoomError(why));

    this.guitarUI.onReplay.add(() => this.onGuitarReplay());
    this.guitarUI.onNext.add(() => this.onGuitarNext());
    this.guitarUI.onPacks.add(() => this.onPacks());
    this.guitar.onDemoFinished.add((id: string) => this.onChordDemoFinished(id));
    this.guitar.onFingerPlaced.add((f: number) => this.onFingerPlaced(f));
    this.guitar.onAllFingersPlaced.add(() => this.onAllFingersPlaced());
    this.guitar.onChordPlayed.add((id: string) => this.onChordPlayed(id));
    this.guitar.onStepChanged.add((i: number) => this.onGuitarStepChanged(i));

    if (this.debugColliders) this.setColliderDebugAll(this.sceneObject, true);


    // UIKit Frames, BackPlates and Buttons bind initialize() to OnStartEvent,
    // and a SceneObject disabled before OnStart never initialises at all. Wait a
    // beat so every control finishes building before hiding the unused halves.
    const ready = this.createEvent("DelayedCallbackEvent");
    ready.bind(() => this.showFrontDoor());
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
    this.guitar.clear();
    this.lessonRoot.enabled = false;
    this.askRoot.enabled = false;
    this.aslRoot.enabled = false;
    this.guitarRoot.enabled = false;
    this.frontRoot.enabled = false;
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
    this.sheetUI.clearSay();

    this.cleanCharacter = true;
    this.demo.setGuideStrength(this.guideStrengthNow());

    this.shelfRoot.enabled = false;
    this.askRoot.enabled = false;
    this.aslRoot.enabled = false;
    this.guitarRoot.enabled = false;
    this.frontRoot.enabled = false;
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
    // The ghost is showing the stroke; its own brush is the marker.
    this.sheetUI.clearTurnMarkers();
    this.demo.setBrushVisible(true);
    // Nothing to do during WATCH, so nothing to reach for.
    this.sheetUI.setTabsVisible([]);
    this.sheetUI.say(SAY_WATCH, 1.4);
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
    // The ghost's own furniture comes down as the sheet is handed over: its
    // scattered stroke numbers, and its brush. Both are replaced by the single
    // numbered start marker below, which says the same thing for the one
    // stroke that matters and nothing for the others.
    this.sheetUI.clearStrokeNumbers();
    this.demo.setBrushVisible(false);
    this.turn.begin(this.glyph);
    this.showTurnMarkers(0);
    // Only what is useful mid-stroke. The brief asks for Replay and Next
    // alone; Packs stays until rule 4's palm-up menu exists to carry it,
    // because without it there is no way out of a lesson at all.
    this.sheetUI.setTabsVisible(["Replay", "Next", "Packs"]);
    this.sayTurnSequence(0);

  }

  /**
   * The three big words that open a stroke: YOUR TURN, which stroke it is, and
   * how to move. One at a time, each replacing the last, so there is never a
   * second line on screen.
   */
  private sayTurnSequence(strokeIndex: number): void {
    if (!this.glyph) return;
    this.sheetUI.say(SAY_YOUR_TURN, 1.1);

    const n = this.glyph.strokeCount;
    const which = this.createEvent("DelayedCallbackEvent");
    which.bind(() => {
      if (this.mode !== "turn") return;
      this.sheetUI.say(strokeOf(strokeIndex, n), 1.1);
      const how = this.createEvent("DelayedCallbackEvent");
      how.bind(() => {
        if (this.mode !== "turn") return;
        this.showStrokeTip(strokeIndex);
      });
      how.reset(1.5);
    });
    which.reset(1.5);
  }

  /**
   * How much guide outline this character gets: the full outline, then a
   * ghost of it, then none.
   *
   * The ladder is earned per CHARACTER rather than per stroke, because one
   * lucky stroke is not evidence and withdrawing the outline mid-character
   * would change the task halfway through it.
   */
  private guideStrengthNow(): number {
    const n = Math.max(1, this.cleanRunsBeforeFade);
    if (this.cleanRun < n) return 1;
    if (this.cleanRun < n * 2) return 0.45;
    return 0;
  }

  /**
   * Put the start dot, the direction arrow and the end dot on ONE stroke: the
   * one the user is about to draw. Clears them when there is no such stroke.
   */
  private showTurnMarkers(strokeIndex: number): void {
    if (!this.glyph || strokeIndex < 0 || strokeIndex >= this.glyph.strokeCount) {
      this.sheetUI.clearTurnMarkers();
      return;
    }
    const s = this.glyph.strokes[strokeIndex];
    // The heading is taken a little way along the stroke rather than from the
    // very next point: adjacent points are a fraction of a millimetre apart
    // after the spline densification, and their direction is noise.
    const headAt = Math.min(s.points.length - 1, Math.max(1, Math.floor(s.points.length * 0.12)));
    this.sheetUI.showTurnMarkers(strokeIndex + 1, s.start, s.points[headAt], s.end);
  }

  /** The one line above the sheet: how to move for the stroke about to be drawn. */
  private showStrokeTip(strokeIndex: number): void {
    // A planned lesson carries its own tip per STEP; the kana pack has one per
    // stroke. Both end up in the same single line.
    const tip = this.playingPlanned
      ? this.plannedTip
      : tipFor(this.currentChar, strokeIndex);
    // Hold 0: the instruction for the stroke you are about to draw stays up
    // until something replaces it, unlike the transient WATCH / NICE words.
    this.sheetUI.say(tip, 0);
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
      const back = this.redemoIndex;
      this.redemoIndex = -1;
      this.mode = "turn";
      this.turn.resume();
      this.showTurnMarkers(back);
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
    // The marker hops to the start of the next stroke. The ghost's brush used
    // to do this, but it is hidden during the user's turn now — parkBrushAt
    // re-enables it as a side effect, so calling it here would bring it back.
    this.showTurnMarkers(index + 1 < this.glyph.strokeCount ? index + 1 : -1);
    this.sheetUI.setStrokeCounter(Math.min(index + 2, this.glyph.strokeCount), this.glyph.strokeCount);

    // A word, then the next instruction. Praise alone would leave the user
    // without a next step; the tip alone would feel like silence after effort.
    // Share it. Downsampled, because a stroke is a few hundred points and the
    // peer only needs its shape — and because this rides the same socket the
    // hand bridge uses at 30 fps.
    this.shareStroke(index);

    const last = index >= this.glyph.strokeCount - 1;
    this.sheetUI.say(praiseFor(this.praiseCount), 0.9);
    if (this.playingPlanned && last) this.askCoach(index, "ok");
    this.praiseCount++;
    if (!last) {
      const then = this.createEvent("DelayedCallbackEvent");
      then.bind(() => {
        if (this.mode !== "turn") return;
        this.sheetUI.say(strokeOf(index + 1, this.glyph ? this.glyph.strokeCount : 0), 1.0);
        const how = this.createEvent("DelayedCallbackEvent");
        how.bind(() => {
          if (this.mode === "turn") this.showStrokeTip(index + 1);
        });
        how.reset(1.4);
      });
      then.reset(1.3);
    }
  }

  private onStrokeMissed(info: MissInfo): void {
    // No harsh error and no red X — a soft sound, and the missed part pulses.
    this.audio.playMiss();
    // Struggling: give the outline straight back, at full strength, and start
    // earning the fade again. Guidance that only ever goes away is a trap.
    this.cleanCharacter = false;
    this.cleanRun = 0;
    this.demo.setGuideStrength(1);
    this.sheetUI.say(SAY_MISS, 1.0);
    // The coach answers after TRY AGAIN has had its moment. It always answers,
    // so there is no branch here for "no planner" — see GhostCoach.
    this.askCoach(info.index, info.reason);
    // Re-show the movement for THIS stroke once TRY AGAIN has had its moment.
    // Saying nothing after a miss reads as a dead end; repeating the tip is
    // the quietest useful answer.
    const again = this.createEvent("DelayedCallbackEvent");
    again.bind(() => {
      if (this.mode === "turn") this.showStrokeTip(info.index);
    });
    again.reset(1.3);
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
    this.sheetUI.clearTurnMarkers();
    this.sheetUI.showAllTabs();
    if (this.cleanCharacter) this.cleanRun++;
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
    this.clearPeerInk();
    if (this.playingPlanned) {
      this.beginPlannedStep(this.lessonPos + 1);
      return;
    }
    this.openLesson(this.lessonIndex + 1);
  }

  /**
   * Ask the coach about the attempt just made.
   *
   * Only during a planned lesson: the kana pack already has hand-written tips
   * per stroke, and a model's line would be competing with writing that was
   * tuned for the character rather than generated for it.
   */
  private askCoach(strokeIndex: number, reason: string): void {
    if (!this.playingPlanned || !this.glyph) return;
    this.coach.ask({
      skill: this.lessonSkill,
      step: "stroke " + (strokeIndex + 1) + " of " + this.glyph.strokeCount,
      reason: reason,
      detail: this.plannedTip,
    });
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
    if (id === "guitar") {
      this.openGuitar(0);
      return;
    }
    // Chinese and Knots are covers only — the brief's out-of-scope list.
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
    // The front door is the home now; the shelf is only reachable from it.
    this.showFrontDoor();
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
    this.guitarRoot.enabled = false;
    this.frontRoot.enabled = false;
    this.guitar.clear();
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
    this.guitarRoot.enabled = false;
    this.frontRoot.enabled = false;
    this.guitar.clear();
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

  // ── Front door ────────────────────────────────────────────────────────────
  //
  // The hero. The Lens opens here, not on the shelf: the question comes first
  // and the built-in packs are a small row underneath it, because "teach me
  // anything" is the product and the three packs are examples of it.

  /** The planned lesson being taught, and where we are in it. */
  private lesson: Lesson | null = null;
  private lessonSkill = "";
  private lessonSteps: number[] = [];
  private lessonPos = 0;
  private pending: { cancel: () => void } | null = null;
  /** Rotates the three suggestions so each launch offers something different. */
  private suggestionSeed = 0;

  private showFrontDoor(): void {
    this.mode = "front";
    this.anchorInFrontOfUser();
    this.demo.stop();
    this.turn.stop();
    this.turn.clearAll();
    this.sheet.hide();
    this.asl.stop();
    this.asl.setVisible(false);
    this.guitar.clear();
    this.lesson = null;
    this.lessonSteps = [];
    if (this.pending) {
      this.pending.cancel();
      this.pending = null;
    }

    this.shelfRoot.enabled = false;
    this.lessonRoot.enabled = false;
    this.askRoot.enabled = false;
    this.aslRoot.enabled = false;
    this.guitarRoot.enabled = false;
    this.frontRoot.enabled = true;

    this.frontUI.setSuggestions(this.pickSuggestions());
    this.frontUI.showPicker();
  }

  /**
   * Three lines, rotated per launch so the front door does not feel static.
   * Drawn from the bundled bank, which is also exactly the set that still
   * works with no planner — so a suggestion can never lead to a dead end.
   */
  private pickSuggestions(): string[] {
    const all = this.lessonSource.offlineSkills();
    if (all.length <= 3) return all.slice();
    const out: string[] = [];
    for (let i = 0; i < 3; i++) {
      out.push(all[(this.suggestionSeed + i) % all.length]);
    }
    this.suggestionSeed = (this.suggestionSeed + 1) % all.length;
    return out;
  }

  /**
   * The mic. VoiceML is not wired in this build, so rather than pretend to
   * listen the mic offers the typed list — which is the brief's own stand-in
   * rule, and leaves the flow after it identical either way.
   */
  /**
   * The mic. The tracker page opens the microphone and hands the words back.
   *
   * If speech is unavailable at all — no bridge, no page, no Internet Module —
   * this falls straight through to the typed suggestions rather than making
   * the user watch "Listening..." time out. Same flow either way: whatever
   * arrives is treated exactly as a pinched suggestion.
   */
  private onMicPressed(): void {
    this.audio.playTap();
    if (!this.speech.startListening()) {
      this.onSpeechGaveUp();
      return;
    }
    this.frontUI.setWaiting("Listening...");
  }

  private onHeard(text: string): void {
    if (this.mode !== "front") return;
    this.frontUI.setWaiting("");
    this.onSkillPicked(text);
  }

  private onSpeechGaveUp(): void {
    if (this.mode !== "front") return;
    this.frontUI.setSuggestions(this.pickSuggestions());
    this.frontUI.setWaiting("Did not catch that — pick one of these.");
  }

  /**
   * A suggestion was pinched. Plan the lesson in visible stages.
   *
   * The three stages are real work, not a decorated wait:
   *   0.00 - 0.55   "Planning your steps"   the plan call
   *   0.55 - 0.85   "Checking it"           the review call, running BEHIND
   *                                         the step titles already on screen
   *   0.85 - 1.00   "Drawing it out"        the titles inking on
   * Within each the line creeps but cannot pass its cap, so it is always
   * moving and never lies about how far along the work is.
   */
  private onSkillPicked(skill: string): void {
    // On the Study Together screen the suggestion rows are rooms, not skills.
    if (this.tryJoinFromRow(skill)) return;
    this.audio.playTap();
    this.lessonSkill = skill;
    this.frontUI.leaveRoomScreen();
    this.frontUI.beginOutline(skill);
    this.frontUI.setWaiting("");
    this.frontUI.beginStage("Planning your steps", 0, 0.55);
    this.audio.playUnroll();

    // Two honest escalations, both measured from the pinch.
    const nudge = this.createEvent("DelayedCallbackEvent");
    nudge.bind(() => {
      if (this.mode === "front" && this.pending) {
        this.frontUI.setStageLabel("Still writing, nearly there");
      }
    });
    nudge.reset(15);

    const giveUp = this.createEvent("DelayedCallbackEvent");
    giveUp.bind(() => {
      if (this.mode !== "front" || !this.pending) return;
      // Thirty seconds is past the point where waiting is respectful. The
      // bundled lesson is a real lesson, so this is a swap, not a failure.
      this.pending.cancel();
      this.pending = null;
      const l = this.lessonSource.bundledFor(skill);
      this.frontUI.setStageLabel("Drawing it out");
      this.onLessonReady({
        lesson: l, origin: "bank",
        note: "The planner was slow, so this one is from the notebook.",
      });
    });
    giveUp.reset(30);

    this.pending = this.lessonSource.requestStaged(
      skill,
      (planned: Lesson) => {
        if (this.mode !== "front") return;
        // Stage 1 is done the moment real titles exist. They go up NOW and
        // the review runs behind them — that is the whole reason for the split.
        this.frontUI.beginStage("Checking it", 0.55, 0.85);
        this.lesson = planned;
        this.inkOutline(planned, 0);
      },
      (r: LessonResult) => {
        this.pending = null;
        if (this.mode !== "front") return;
        this.onLessonReady(r);
      }
    );
  }

  /**
   * Ink the step titles on, one at a time.
   *
   * Called as soon as the PLAN lands. If the review later changes a title it
   * is rewritten in place by onLessonReady — quietly, because a line that
   * re-animates after you have read it is worse than one that just corrects.
   */
  private inkOutline(lesson: Lesson, i: number): void {
    if (this.mode !== "front") return;
    const steps = lesson.steps || [];
    if (i >= steps.length) return;
    this.frontUI.addOutlineLine(steps[i].title);
    this.audio.playBrush();
    const next = this.createEvent("DelayedCallbackEvent");
    next.bind(() => this.inkOutline(lesson, i + 1));
    next.reset(0.4);
  }

  /** The reviewed lesson has landed. Correct the outline quietly, then begin. */
  private onLessonReady(r: LessonResult): void {
    this.lesson = r.lesson;
    this.lessonSteps = traceableSteps(r.lesson);
    this.lessonPos = 0;
    this.frontUI.setWaiting(r.origin === "bank" ? r.note : "");

    this.frontUI.beginStage("Drawing it out", 0.85, 0.97);

    // The review may have reworded a title that is already on screen. It is
    // replaced in place rather than re-animated: a line that brushes itself on
    // a second time reads as a glitch, not as a correction.
    const steps = r.lesson.steps || [];
    const alreadyInked = this.frontUI.outlineCount();
    this.frontUI.replaceOutline(steps);
    for (let i = alreadyInked; i < steps.length; i++) {
      this.frontUI.addOutlineLine(steps[i].title);
    }

    const go = this.createEvent("DelayedCallbackEvent");
    go.bind(() => {
      this.frontUI.finishProgress();
      const start = this.createEvent("DelayedCallbackEvent");
      start.bind(() => this.startPlannedLesson());
      start.reset(0.5);
    });
    go.reset(0.8);
  }

  /**
   * Teach the planned lesson on the practice sheet.
   *
   * Only the path steps are taught here: they are the ones the engine can
   * actually check. A lesson with none of them has nothing this build can
   * grade, so it returns to the front door rather than opening an empty sheet.
   */
  private startPlannedLesson(): void {
    if (!this.lesson || this.lessonSteps.length === 0) {
      this.frontUI.setWaiting("That one needs hands, which this build cannot check yet.");
      return;
    }
    this.frontRoot.enabled = false;
    this.beginPlannedStep(0);
  }

  private beginPlannedStep(pos: number): void {
    if (!this.lesson) return;
    if (pos >= this.lessonSteps.length) {
      this.showFrontDoor();
      return;
    }
    this.lessonPos = pos;
    const step = this.lesson.steps[this.lessonSteps[pos]];
    const glyph = glyphFromStep(step, this.lessonSkill, this.demo.glyphUnitCm);
    if (!glyph) {
      this.beginPlannedStep(pos + 1);
      return;
    }

    this.glyph = glyph;
    this.currentChar = "";
    this.plannedTip = step.tip;

    this.turn.stop();
    this.turn.clearAll();
    this.demo.setGlyph(glyph);
    this.sheetUI.clearStrokeNumbers();
    this.sheetUI.clearTurnMarkers();
    this.sheetUI.setStrokeCounter(1, glyph.strokeCount);
    this.sheetUI.setRomaji("");
    this.sheetUI.setHook("");
    this.sheetUI.setProgress(this.lessonSteps.length, pos, pos);
    this.sheetUI.setCaption(step.title);

    this.shelfRoot.enabled = false;
    this.askRoot.enabled = false;
    this.aslRoot.enabled = false;
    this.guitarRoot.enabled = false;
    this.frontRoot.enabled = false;
    this.lessonRoot.enabled = true;

    this.cleanCharacter = true;
    this.demo.setGuideStrength(this.guideStrengthNow());
    this.anchorInFrontOfUser();
    this.sheet.showUnroll();
    this.audio.playUnroll();
  }

  /** The planned step's own tip, used instead of the kana table's. */
  private plannedTip = "";

  /** True while a planned lesson, not a built-in pack, is on the sheet. */
  private get playingPlanned(): boolean {
    return this.lesson !== null && this.lessonSteps.length > 0;
  }

  private onCoachTip(tip: string): void {
    if (this.mode !== "turn") return;
    this.sheetUI.say(tip, 2.2);
  }

  // ── Study together ────────────────────────────────────────────────────────
  //
  // Additive throughout. Every handler below begins by checking it is actually
  // in a room, so with no relay — or a relay that dies mid-lesson — none of
  // this does anything and the solo lesson carries on untouched. That is the
  // one rule of this feature.

  /** Peer ink, kept so it can be cleared when the page turns. */
  private peerInk: InkRibbon[] = [];

  /**
   * Study together. One pinch, and you are either in a room or looking at one
   * you can join with a second pinch.
   *
   * The old version created a room and left the front door looking identical
   * apart from one small grey line, which reads as nothing having happened -
   * the room WAS created and the relay had it, but there was no way to tell.
   * Now the screen changes, your code is the title, and any room already open
   * is listed so joining never needs a code read out loud or typed.
   */
  private onStudyTogether(): void {
    this.audio.playTap();
    this.frontUI.setRoomScreen("", [], "Looking for rooms...");

    this.room.listRooms((rooms) => {
      if (this.mode !== "front") return;
      const joinable: string[] = [];
      for (let i = 0; i < rooms.length && joinable.length < 2; i++) {
        const r = rooms[i];
        if (!r || !r.room) continue;
        // Do not offer the room we are already in.
        if (this.room.isJoined && r.room === this.room.roomCode) continue;
        const who = (r.members && r.members.length)
          ? r.members.join(", ")
          : "waiting";
        joinable.push("Join " + r.room + "  (" + who + ")");
      }
      this.joinableRooms = joinable;

      if (this.room.isJoined) {
        this.frontUI.setRoomScreen(this.room.roomCode, joinable,
          "Your room. Others can pinch it from their front door.");
        return;
      }
      // Nothing open: make one, so the screen is never a dead end.
      this.frontUI.setRoomScreen("", joinable,
        joinable.length ? "Pinch a room to join, or wait for yours."
                        : "Opening a room...");
      this.room.create();
    });
  }

  /** Rooms currently offered on the Study Together screen, in row order. */
  private joinableRooms: string[] = [];

  /** A row was pinched on the Study Together screen: join that room. */
  private tryJoinFromRow(label: string): boolean {
    if (!this.frontUI.isRoomScreen) return false;
    // "Join TIGER  (Me)" -> TIGER
    const parts = label.split(" ");
    if (parts.length < 2 || parts[0] !== "Join") return false;
    this.audio.playTap();
    this.frontUI.setRoomScreen("", [], "Joining " + parts[1] + "...");
    this.room.join(parts[1]);
    return true;
  }

  private onRoomJoined(code: string): void {
    this.audio.playUnroll();
    this.frontUI.setRoomScreen(code, this.joinableRooms,
      "In room " + code + ". Pick a skill and you both learn it.");
  }

  private onPeerJoined(p: Peer): void {
    this.audio.playGotIt();
    if (this.mode === "front") {
      this.frontUI.setRoomScreen(this.room.roomCode, [],
        p.name + " joined. Pick a skill and you both learn it.");
    } else {
      this.sheetUI.say(p.name + " JOINED", 1.4);
    }
  }

  private onPeerLeft(p: Peer): void {
    if (this.mode === "front") {
      this.frontUI.setRoomScreen(this.room.roomCode, [], p.name + " left.");
    } else {
      this.sheetUI.say(p.name + " LEFT", 1.2);
    }
    this.clearPeerInk();
  }

  private onRoomError(why: string): void {
    // Refused, not broken. Back to the front door with the reason.
    this.frontUI.leaveRoomScreen();
    this.frontUI.setWaiting(why);
  }

  /**
   * Send the stroke just accepted, downsampled to its shape.
   *
   * Points are normalised by the glyph unit so the peer renders it at THEIR
   * sheet size, not ours — the two Lenses may be anchored differently.
   */
  private shareStroke(index: number): void {
    if (!this.room.isJoined || !this.glyph) return;
    const stroke = this.glyph.strokes[index];
    const pts = stroke.points;
    if (!pts || pts.length < 2) return;

    const unit = Math.max(0.001, this.demo.glyphUnitCm);
    const MAX = 24;
    const step = Math.max(1, Math.floor(pts.length / MAX));
    const out: number[][] = [];
    for (let i = 0; i < pts.length; i += step) {
      out.push([
        Math.round((pts[i].x / unit) * 1000) / 1000,
        Math.round((pts[i].y / unit) * 1000) / 1000,
      ]);
    }
    const last = pts[pts.length - 1];
    out.push([
      Math.round((last.x / unit) * 1000) / 1000,
      Math.round((last.y / unit) * 1000) / 1000,
    ]);

    this.room.send({ kind: "stroke", index: index, pts: out });
  }

  /** A peer finished a stroke: draw it on our sheet in their colour. */
  private onRoomEvent(e: RoomEvent): void {
    const d = e.data;
    if (!d || d.kind !== "stroke" || !d.pts || !this.sheet) return;
    if (this.mode !== "turn" && this.mode !== "demo" && this.mode !== "finished") return;

    const unit = Math.max(0.001, this.demo.glyphUnitCm);
    const raw: Pt[] = [];
    for (let i = 0; i < d.pts.length; i++) {
      const p = d.pts[i];
      if (p && p.length === 2) raw.push({ x: p[0] * unit, y: p[1] * unit });
    }
    if (raw.length < 2) return;

    const ribbon = new InkRibbon(
      this.sheet.inkRoot, "PeerStroke" + this.peerInk.length,
      this.peerInkColor, 0.42, 0.002
    );
    ribbon.setUniformWidth(true);
    ribbon.setRawPoints(raw);
    this.peerInk.push(ribbon);
    this.audio.playInkDry();
  }

  private clearPeerInk(): void {
    for (let i = 0; i < this.peerInk.length; i++) this.peerInk[i].sceneObject.destroy();
    this.peerInk = [];
  }

  // ── Guitar pack ───────────────────────────────────────────────────────────
  //
  // The third pack on the same engine, and the second POSE pack: a chord is a
  // sequence of fingertip placements, checked the same tiered way ASL's
  // handshapes are. The shape of this section is deliberately the ASL section's
  // — demonstrate, hand it over, satisfy the step, stamp, next — because that
  // is the engine, and a pack that needed its own flow would mean the engine
  // had not actually generalised.

  private guitarIndex = 0;
  private guitarPraiseCount = 0;

  /** Open the guitar notebook: the ghost places a chord on the fretboard. */
  private openGuitar(index: number): void {
    const n = GUITAR_CHORDS.length;
    this.guitarIndex = ((index % n) + n) % n;
    const chord = GUITAR_CHORDS[this.guitarIndex];

    this.mode = "guitar";
    this.turn.stop();
    this.demo.stop();
    this.sheet.hide();
    this.asl.stop();
    this.asl.setVisible(false);
    this.shelfRoot.enabled = false;
    this.lessonRoot.enabled = false;
    this.askRoot.enabled = false;
    this.aslRoot.enabled = false;
    this.guitarRoot.enabled = true;
    this.anchorInFrontOfUser();

    this.guitarUI.setChordName(chord.name);
    this.guitarUI.setProgress(this.guitarIndex, n);
    this.guitarUI.setLegend(GUITAR_LEGEND);
    // While the ghost demonstrates, the single line says what the chord IS.
    // It becomes the step-by-step instruction the moment the board is handed
    // over, so there is never more than one thing to read.
    this.guitarUI.setStep(guitarLineFor(chord.id));
    this.fretboardStamp(false);

    this.audio.playUnroll();
    this.guitar.playDemo(chord);
  }

  /**
   * The ghost has laid the last fingertip and is about to brush the strings:
   * sound the chord. The controller fires this at the top of its own strum
   * animation, so the sound and the sweep start together — audio timing is
   * GhostMain's job, which is why the controller asks rather than plays.
   */
  private onChordDemoFinished(id: string): void {
    if (this.mode !== "guitar") return;
    this.audio.playChord(id);

    // A beat to let the chord ring, then it is the user's turn on a clean board.
    const handOver = this.createEvent("DelayedCallbackEvent");
    handOver.bind(() => {
      if (this.mode !== "guitar") return;
      // beginTurn fires onStepChanged, which is what writes the first
      // instruction — so there is exactly one place that decides the words.
      this.guitar.beginTurn(GUITAR_CHORDS[this.guitarIndex]);
    });
    handOver.reset(1.5);
  }

  /**
   * One fingertip landed — the ghost's during the demo, or the user's during
   * their turn. Both want the same small dry tick: the ink-dry sound the kana
   * pack uses when a stroke sets, which is the same event in a different pack.
   */
  private onFingerPlaced(finger: number): void {
    if (this.mode !== "guitar") return;
    this.audio.playInkDry();
    // The words are not written here: onStepChanged fires straight after this
    // and replaces the line with the NEXT instruction, so a praise word written
    // here would be overwritten within the same frame. Praise rides along with
    // the next step instead -- see onGuitarStepChanged.
    if (!this.guitar.isDemonstrating) this.guitarPraiseCount++;
  }

  /**
   * The one instruction, rewritten. -1 means every finger is down and only the
   * strum is left. This is the single place the guitar pack decides what the
   * user is being asked to do, which is what keeps "one thing at a time" true
   * rather than aspirational.
   */
  private onGuitarStepChanged(index: number): void {
    if (this.mode !== "guitar") return;
    if (index < 0) {
      this.guitarUI.setStep(GUITAR_STRUM_LINE);
      return;
    }
    const target = this.guitar.currentTarget;
    if (!target) return;
    this.guitarUI.setStep(
      stepLine(
        GUITAR_CHORDS[this.guitarIndex].name,
        target.finger,
        this.guitar.stringNameOf(target),
        target.fret,
        index
      )
    );
  }

  /**
   * Every circle is placed. The instruction was already switched to the strum
   * by onStepChanged(-1); this is here for the sound and anything else that
   * should mark the moment the chord is fully fretted.
   */
  private onAllFingersPlaced(): void {
    if (this.mode !== "guitar") return;
  }

  /** The user strummed: sound the chord, stamp it, move on. */
  private onChordPlayed(id: string): void {
    if (this.mode !== "guitar") return;
    this.audio.playChord(id);
    this.guitarUI.setStep(guitarPraiseFor(this.guitarPraiseCount));

    const stamp = this.createEvent("DelayedCallbackEvent");
    stamp.bind(() => {
      if (this.mode !== "guitar") return;
      this.audio.playStamp();
      this.fretboardStamp(true);
      const next = this.createEvent("DelayedCallbackEvent");
      next.bind(() => {
        if (this.mode !== "guitar") return;
        this.audio.playPageTurn();
        this.openGuitar(this.guitarIndex + 1);
      });
      next.reset(this.stampHoldSec + 0.5);
    });
    stamp.reset(0.7);
  }

  private onGuitarReplay(): void {
    this.audio.playTap();
    this.openGuitar(this.guitarIndex);
  }

  private onGuitarNext(): void {
    this.audio.playTap();
    this.openGuitar(this.guitarIndex + 1);
  }

  /** The hanko on the board. Lives on the fretboard, so it goes through it. */
  private fretboardStamp(on: boolean): void {
    const board = this.guitar.board;
    if (!board) return;
    if (on) board.showStamp();
    else board.hideStamp();
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
