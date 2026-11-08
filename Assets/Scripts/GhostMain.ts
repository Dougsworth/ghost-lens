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
import { GhostStudyTogether, RoomPeer } from "./GhostStudyTogether";
import { GhostARActivities } from "./GhostARActivities";
import { Lesson } from "./GhostLessonSchema";
import { BANK_KEYS } from "./GhostLessonBank";
import { glyphFromStep, traceableSteps } from "./GhostLessonPath";
import { Help, SkillTeacher } from "./GhostTeacher";
import { validateLesson } from "./GhostLessonSchema";
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
  @allowUndefined
  @hint("Study Together: rooms, live peer ink, shared lesson, race and cheers, through the bridge (and Supabase across desktops). Optional; without it the solo lesson is unaffected.")
  studyTogether: GhostStudyTogether;
  @input
  @allowUndefined
  @hint("Optional native pinchable 3D/quiz/matching activity component. Wire in Lens Studio.")
  arActivities: GhostARActivities;
  private activityLessonToken = 0;
  /** Last room roster printed, so it is logged only when it changes. */
  private lastPresence = "";
  private remoteInk: InkRibbon[] = [];
  private remoteInkCounter = 0;
  private peerLive: {[key: string]: InkRibbon} = {};
  private peerLiveIds: {[key: string]: number} = {};
  private raceScores: {[key: string]: number} = {};
  private raceLabel = "";
  private sharedLessonToken = "";

  @input
  @hint("Stable local learner ID for saved course progress. Set a different ID for each learner.")
  learnerId: string = "learner-a";
  private savedProgress: {[key: string]: number} = {};
  private libraryOpen = false;
  private libraryCourses: {skill: string; courseId: string; step: number; totalSteps: number}[] = [];

  private courseApi(path: string, method: string, payload: any, onData?: (data: any) => void): void {
    if (!this.lessonSource || !this.lessonSource.internetModule) return;
    const base = this.lessonSource.bridgeUrl.replace(/\/lesson.*$/, "");
    let url = base + path;
    const opts: any = { method: method };
    if (payload) {
      opts.headers = { "Content-Type": "application/json" };
      opts.body = JSON.stringify(payload);
    }
    try {
      this.lessonSource.internetModule.fetch(new Request(url, opts))
        .then((response: Response) => {
          if (response.status !== 200 || !onData) return;
          response.text().then((raw: string) => {
            try { onData(JSON.parse(raw)); } catch (e) { print("[GHOST courses] bad response: " + e); }
          });
        })
        .catch((e: any) => print("[GHOST courses] offline: " + e));
    } catch (e) { print("[GHOST courses] request failed: " + e); }
  }

  private saveCourseProgress(pos: number): void {
    if (!this.lesson || !(this.lesson as any).courseId) return;
    const courseId = (this.lesson as any).courseId;
    const completed: number[] = [];
    for (let i = 0; i < pos; i++) completed.push(this.lessonSteps[i]);
    this.courseApi("/progress", "POST", {
      learner: this.learnerId, courseId: courseId,
      step: pos, completed: completed, score: pos
    });
  }

  private remoteLessonNames: {[key: string]: string} = {};

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
  @hint("Once the guide has faded away completely, show just the current stroke as a hint after the user has been idle this many seconds. Help when stuck, never before.")
  @widget(new SliderWidget(0.5, 8, 0.5))
  hintAfterSec: number = 2.5;

  @input
  @hint("Brightness of that one-stroke hint, 0..1 of the full outline.")
  @widget(new SliderWidget(0.1, 1, 0.05))
  hintGuideStrength: number = 0.5;

  @input
  @hint("Seconds the finished sheet rests with its stamp before the page turns.")
  @widget(new SliderWidget(0.2, 3, 0.1))
  stampHoldSec: number = 1.1;


  @input
  @hint("Wireframe every collider and body in the scene, so pinch hit-zones can be checked. Takes effect on preview restart.")
  debugColliders: boolean = false;
  @ui.group_end

  private characters: string[] = [];
  /** Characters finished with no miss, in a row. Drives the guide fade. */
  private cleanRun = 0;
  /** True while the character on the sheet has not been missed once. */
  private cleanCharacter = true;

  /**
   * The shared coach (GhostTeacher), used here for spaced, shuffled review:
   * every finished character is "stamped", and comes back later — after the
   * next stamp, then three after that — to be written with no demonstration
   * and no guide. The guide fade itself stays the cleanRun ladder above, which
   * keeps one stamp per character as the brief asks. Items start at Solo so
   * each completion counts as the stamp.
   */
  private teacher = new SkillTeacher({ firstTryLevel: Help.Solo, floorLevel: Help.Solo, reviewGaps: [1, 3] });
  /** True while the sheet holds a review of an already-finished character. */
  private reviewing = false;
  /** True once the stuck-hint has been shown for the current stroke. */
  private hintShown = false;
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

  /**
   * Per frame, one job: hint only when stuck. Once the guide has faded to
   * nothing, a learner who sits still for hintAfterSec gets just the stroke
   * they are on, faintly — the current target, not the whole path.
   */
  private onUpdate(): void {
    if (this.mode !== "turn" || this.hintShown || !this.glyph || !this.turn || !this.demo) return;
    if (this.demo.currentGuideStrength > 0.01) return;
    if (this.turn.idleSeconds < this.hintAfterSec) return;
    this.hintShown = true;
    this.demo.showHint(this.turn.currentStroke, this.hintGuideStrength);
  }

  /** Put the guide back to its earned strength and re-arm the stuck timer. */
  private clearHint(): void {
    if (this.hintShown && this.demo) this.demo.setGuideStrength(this.demo.currentGuideStrength);
    this.hintShown = false;
  }

  onAwake(): void {
    this.createEvent("UpdateEvent").bind(() => this.onUpdate());
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
      !this.speech
    ) {
      print("[GhostMain] ERROR: a required @input is not wired. Check the scene bootstrap's input-wiring pass.");
      return;
    }

    if (this.arActivities) {
      this.arActivities.onFinished.add(() => {
        if (this.mode === "front") this.frontUI.setWaiting("Activity complete! Ask for another lesson.");
      });
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
    this.turn.onLiveStroke.add((points: {x: number; y: number}[]) => {
      if (this.studyTogether) this.studyTogether.sendLivePath(points);
    });
    this.turn.onStrokePath.add((points: {x: number; y: number}[]) => {
      if (this.studyTogether) {
        this.studyTogether.sendPath(points);
        this.studyTogether.finishLivePath();
      }
    });
    this.turn.onStrokeMissed.add((m: MissInfo) => this.onStrokeMissed(m));
    this.turn.onNeedsDemo.add((i: number) => this.onNeedsDemo(i));
    this.turn.onCharacterComplete.add(() => this.onCharacterComplete());

    this.aslUI.onGotIt.add(() => this.onAslGotIt());
    this.aslUI.onReplay.add(() => this.onAslReplay());
    this.aslUI.onPacks.add(() => this.onPacks());
    this.asl.onSignFinished.add(() => this.onSignFinished());

    this.frontUI.onSkillPicked.add((skill: string) => this.onSkillPicked(skill));
    this.frontUI.onMicPressed.add(() => this.onMicPressed());
    this.frontUI.onNotebookPicked.add((id: string) => {
      if (id === "library") this.openLibrary();
      else this.onPackSelected(id);
    });
    this.coach.onTip.add((tip: string) => this.onCoachTip(tip));
    this.speech.onHeard.add((text: string) => this.onHeard(text));
    if (this.studyTogether) {
      this.studyTogether.onScores.add((label: string) => {
        this.raceLabel = label;
        if (this.mode !== "front" && this.sheetUI) this.sheetUI.setScoreboard(label);
      });
      this.studyTogether.onPresence.add((summary: string) => {
        // Avoid overwriting active lesson UI; presence is available in Logger.
        // Only on change: it arrives every poll (~0.7 s) and flooded the log.
        if (summary && summary !== this.lastPresence) print("[GHOST room] " + summary);
        this.lastPresence = summary;
      });
      this.studyTogether.onRemoteEvent.add((event: any) => {
        const data = event.data || {};
        print("[GHOST room] " + event.from + " " + data.type);
        if (data.type === "lesson" && typeof data.skill === "string") {
          this.remoteLessonNames[event.from] = data.skill;
          print("[GHOST room] " + event.from + " learning: " + data.skill);
        }
        if (data.type === "lesson_full" && data.lesson && this.mode === "front") {
          const checked = validateLesson(data.lesson);
          if (checked.ok) {
            if (this.pending) { this.pending.cancel(); this.pending = null; }
            this.lessonSkill = data.lesson.skill;
            this.frontUI.beginOutline(this.lessonSkill);
            this.onLessonReady({lesson: data.lesson, origin: "bridge", note: "Shared lesson"});
          }
        }
        if (data.type === "ink_live" && data.points && this.sheet && this.sheet.inkRoot) {
          this.showPeerLive(event.from, data.strokeId, data.points);
        }
        if (data.type === "ink_end") this.endPeerLive(event.from);
        // A cheer stamp when a peer finishes a character (joins and leaves
        // arrive as onPeerJoined/onPeerLeft). A no-op for the eye while the
        // sheet is hidden (front door), by construction.
        if (data.type === "cheer" && this.studyTogether) {
          this.sheetUI.showCheer();
          this.sheetUI.showNote(this.studyTogether.displayName(event.from) + " finished!");
        }
        if (data.type === "path" && data.points && this.sheet && this.sheet.inkRoot) {
          this.endPeerLive(event.from);
          this.showRemotePath(event.from, data.points);
        }
        // Never automatically launch another user's AI request: a remote
        // lesson might consume credits or interrupt local practice.
      });
    }
    this.speech.onGaveUp.add(() => this.onSpeechGaveUp());

    this.frontUI.onStudyTogether.add(() => this.onStudyTogether());
    if (this.studyTogether) {
      this.studyTogether.onJoined.add((code: string) => this.onRoomJoined(code));
      this.studyTogether.onPeerJoined.add((p: RoomPeer) => this.onPeerJoined(p));
      this.studyTogether.onPeerLeft.add((p: RoomPeer) => this.onPeerLeft(p));
      this.studyTogether.onError.add((why: string) => this.onRoomError(why));
    }

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
    this.reviewing = false;
    this.askChars = [];
    this.askCaption = "";
    this.sheetUI.setCaption("");
    this.beginCharacter(this.characters[this.lessonIndex], true);
  }

  /**
   * Shared by the lesson and by Ask GHOST: put one character on a fresh sheet.
   * `review` is a finished character coming back for spaced review: no
   * demonstration and no guide, just the sheet and the start marker — the
   * "can you still do it alone?" check the research puts the learning in.
   */
  private beginCharacter(character: string, unroll: boolean, review: boolean = false): void {
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

    if (review) {
      // Straight to the user's turn on a bare sheet. The earned fade (cleanRun)
      // is left alone; only this sheet is guide-free. A miss still hands the
      // outline back, exactly as in a normal turn.
      this.anchorInFrontOfUser();
      this.sheet.showImmediate();
      this.sheet.hideStamp();
      this.demo.setGuideStrength(0);
      this.demo.showGuideOnly();
      this.sheetUI.setCaption("REVIEW");
      this.beginUserTurn();
      return;
    }

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
    this.hintShown = false;
    // Scores that arrived while on the front door are shown once a sheet is up.
    if (this.raceLabel) this.sheetUI.setScoreboard(this.raceLabel);
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

  private showPeerLive(peer: string, id: number, points: any[]): void {
    if (!Array.isArray(points) || points.length < 2 || points.length > 100) return;
    for (const p of points) {
      if (!p || typeof p.x !== "number" || typeof p.y !== "number" ||
          !isFinite(p.x) || !isFinite(p.y) || Math.abs(p.x) > 30 || Math.abs(p.y) > 30) return;
    }
    if (this.peerLive[peer] && this.peerLiveIds[peer] !== id) this.endPeerLive(peer);
    if (!this.peerLive[peer]) {
      this.peerLive[peer] = new InkRibbon(this.sheet.inkRoot,
        "LivePeer_" + peer, new vec4(0.40, 0.80, 1.0, 0.85), 0.14, 0.12);
      this.peerLiveIds[peer] = id;
    }
    this.peerLive[peer].setRawPoints(points);
  }
  private endPeerLive(peer: string): void {
    if (this.peerLive[peer]) this.peerLive[peer].sceneObject.destroy();
    delete this.peerLive[peer];
    delete this.peerLiveIds[peer];
  }

  /** Render a completed peer stroke in the local sheet's coordinate system. */
  private showRemotePath(peer: string, raw: any[]): void {
    if (!Array.isArray(raw) || raw.length < 2 || raw.length > 100) return;
    const pts: {x: number; y: number}[] = [];
    for (const p of raw) {
      if (!p || typeof p.x !== "number" || typeof p.y !== "number" ||
          !isFinite(p.x) || !isFinite(p.y) || Math.abs(p.x) > 30 || Math.abs(p.y) > 30) return;
      pts.push({x: p.x, y: p.y});
    }
    const ribbon = new InkRibbon(this.sheet.inkRoot,
      "PeerInk_" + peer + "_" + (++this.remoteInkCounter),
      new vec4(0.40, 0.80, 1.0, 1.0), 0.16, 0.12);
    ribbon.setRawPoints(pts);
    this.remoteInk.push(ribbon);
    // Bound mesh count in long sessions; no unbounded AR scene growth.
    if (this.remoteInk.length > 60) {
      const oldest = this.remoteInk.shift();
      if (oldest) oldest.sceneObject.destroy();
    }
  }

  private onStrokeAccepted(index: number): void {
    if (this.studyTogether) {
      this.studyTogether.sendStep(index);
      this.raceScores["me"] = (this.raceScores["me"] || 0) + 1;
      this.studyTogether.sendRacePoint(this.raceScores["me"]);
    }
    if (!this.glyph) return;
    // The stuck-hint was for the stroke just finished; the next starts unaided.
    this.clearHint();
    this.audio.playInkDry();
    // The marker hops to the start of the next stroke. The ghost's brush used
    // to do this, but it is hidden during the user's turn now — parkBrushAt
    // re-enables it as a side effect, so calling it here would bring it back.
    this.showTurnMarkers(index + 1 < this.glyph.strokeCount ? index + 1 : -1);
    this.sheetUI.setStrokeCounter(Math.min(index + 2, this.glyph.strokeCount), this.glyph.strokeCount);

    // A word, then the next instruction. Praise alone would leave the user
    // without a next step; the tip alone would feel like silence after effort.
    // (Peers already have this stroke: GhostStudyTogether streamed it live
    // while it was drawn and sent the final path on release.)

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
    if (this.studyTogether) this.studyTogether.finishLivePath();
    // No harsh error and no red X — a soft sound, and the missed part pulses.
    this.audio.playMiss();
    // Struggling: give the outline straight back, at full strength, and start
    // earning the fade again. Guidance that only ever goes away is a trap.
    this.cleanCharacter = false;
    this.cleanRun = 0;
    this.hintShown = false;
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
    // Tell the room: every peer's sheet gets a cheer stamp.
    if (this.studyTogether) this.studyTogether.sendCheer();
    // Tell the coach this built-in character is done, so it can schedule its
    // spaced reviews. Planned "teach me anything" steps are one-off drawings,
    // not a set to revisit, so they stay out of it.
    if (!this.playingPlanned && this.currentChar.length > 0) {
      this.teacher.watched(this.currentChar);
      this.teacher.recordPass(this.currentChar);
    }
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
    // Spaced, shuffled review before the next new character: bring back a
    // finished one that is due, picked at random among those due. A review is
    // never followed by another review, so new material keeps flowing.
    if (!this.reviewing) {
      const due = this.teacher.takeDueReview(this.currentChar);
      if (due) {
        this.reviewing = true;
        this.beginCharacter(due, false, true);
        return;
      }
    }
    this.reviewing = false;
    this.sheetUI.setCaption("");
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

    this.libraryOpen = false;
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

  /** Native AR course picker; uses existing UIKit pinch targets and saved SQLite courses. */
  private openLibrary(): void {
    if (this.mode !== "front") return;
    if (this.libraryOpen) {
      this.libraryOpen = false;
      this.frontUI.showPicker();
      this.frontUI.setSuggestions(this.pickSuggestions());
      return;
    }
    this.libraryOpen = true;
    this.frontUI.showSavedCourses([]);
    this.frontUI.setWaiting("Opening your notebook...");
    this.courseApi("/courses?learner=" + encodeURIComponent(this.learnerId), "GET", null, (data: any) => {
      if (this.mode !== "front" || !this.libraryOpen) return;
      this.libraryCourses = (data.courses || []).slice(0, 3);
      this.frontUI.showSavedCourses(this.libraryCourses.map((c) =>
        (c.step > 0 ? "Continue  " : "Open  ") + c.skill));
    });
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
    if (this.libraryOpen) {
      const found = this.libraryCourses.find((c) =>
        ((c.step > 0 ? "Continue  " : "Open  ") + c.skill) === skill);
      if (!found) return;
      skill = found.skill;
      this.libraryOpen = false;
    }
    this.audio.playTap();
    this.lessonSkill = skill;
    this.frontUI.leaveRoomScreen();
    if (this.studyTogether) this.studyTogether.setSkill(skill);
    this.frontUI.beginOutline(skill);
    this.frontUI.setWaiting("");
    this.frontUI.beginStage("Planning your steps", 0, 0.55);
    this.audio.playUnroll();

    // The built-in suggestions are hand-written lessons that already work.
    // Asking the AI for them was slow and could come back as something this
    // build cannot teach, which left the screen stuck on the outline. Only a
    // skill the user asked for themselves goes to the AI.
    if (BANK_KEYS.indexOf(skill.trim().toLowerCase()) >= 0) {
      const own = this.lessonSource.bundledFor(skill);
      this.lesson = own;
      this.onLessonReady({ lesson: own, origin: "bank", note: "" });
      return;
    }

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
    if (this.studyTogether && r.note !== "Shared lesson") this.studyTogether.sendLesson(r.lesson);
    this.lessonSteps = traceableSteps(r.lesson);
    this.lessonPos = 0;
    this.savedProgress = {};
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
    if (!this.lesson) return;
    if (this.lessonSteps.length === 0) {
      // Nothing to trace. Send it to the pack that CAN teach it rather than
      // leaving the outline on screen with nowhere to go.
      const steps = (this.lesson && this.lesson.steps) || [];
      for (let i = 0; i < steps.length; i++) {
        const r: any = steps[i].render;
        if (r && r.kind === "chord") {
          const want = String(r.chord || "").toLowerCase();
          let idx = 0;
          for (let c = 0; c < GUITAR_CHORDS.length; c++) {
            if (GUITAR_CHORDS[c].id.toLowerCase() === want) { idx = c; break; }
          }
          this.openGuitar(idx);
          return;
        }
        if (r && r.kind === "hands") {
          this.openAsl(0);
          return;
        }
      }
    }
    if (this.lessonSteps.length === 0 && this.arActivities) {
      const first = this.lesson.steps.find((step) => step.render.kind === "snap3d" || step.render.kind === "objects");
      if (first) {
        const render: any = first.render;
        const shape = render.kind === "snap3d" ? render.placeholder :
          (render.objects && render.objects[0] ? render.objects[0].shape : "box");
        if (this.arActivities.openExplore(shape, first.title)) {
          this.frontRoot.enabled = false;
          return;
        }
      }
      if (this.lesson.quiz && this.arActivities.openQuiz(this.lesson)) {
        this.frontRoot.enabled = false;
        return;
      }
      // Generate a matching activity from the lesson's validated step titles
      // and teaching tips. No additional model call is necessary.
      const pairs = this.lesson.steps
        .filter(step => step.title && step.tip && step.title.trim() !== step.tip.trim())
        .map(step => ({left: step.title.trim().slice(0, 34), right: step.tip.trim().slice(0, 70)}))
        .filter((pair, index, all) => all.findIndex(other => other.left === pair.left || other.right === pair.right) === index)
        .slice(0, 3);
      if (pairs.length >= 2 && this.arActivities.openMatching(pairs)) {
        this.frontRoot.enabled = false;
        return;
      }
    }
    if (this.lessonSteps.length === 0) {
      this.frontUI.setWaiting("That one cannot be taught here yet. Pick another.");
      const back = this.createEvent("DelayedCallbackEvent");
      back.bind(() => { if (this.mode === "front") this.showFrontDoor(); });
      back.reset(2.5);
      return;
    }
    this.frontRoot.enabled = false;
    const courseId = (this.lesson as any).courseId;
    if (!courseId) { this.beginPlannedStep(0); return; }
    let started = false;
    const startOnce = (position: number) => {
      if (started || !this.lesson || (this.lesson as any).courseId !== courseId) return;
      started = true;
      this.beginPlannedStep(position);
    };
    this.courseApi("/progress?learner=" + encodeURIComponent(this.learnerId) +
      "&courseId=" + encodeURIComponent(courseId), "GET", null, (progress: any) => {
        const step = Math.max(0, Math.min(this.lessonSteps.length - 1, Number(progress.step) || 0));
        startOnce(step);
      });
    const timeout = this.createEvent("DelayedCallbackEvent");
    timeout.bind(() => startOnce(0));
    timeout.reset(1.5);
  }

  private beginPlannedStep(pos: number): void {
    if (!this.lesson) return;
    if (pos >= this.lessonSteps.length) {
      this.saveCourseProgress(pos);
      this.showFrontDoor();
      return;
    }
    this.lessonPos = pos;
    this.saveCourseProgress(pos);
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
  // in a room, so with no bridge — or a bridge that dies mid-lesson — none of
  // this does anything and the solo lesson carries on untouched. That is the
  // one rule of this feature.
  //
  // The screen is the front door's: pinch "Study together" and you are either
  // in a room or looking at one you can join with a second pinch. Rooms,
  // presence, live ink, the shared lesson, race points and cheers all go
  // through GhostStudyTogether, which talks to the bridge over HTTP; with
  // Supabase keys set on the bridge, the same room code reaches other desktops.

  /**
   * Study together. One pinch, and you are either in a room or looking at one
   * you can join with a second pinch.
   *
   * The screen changes, your code is the title, and any room already open is
   * listed, so joining never needs a code read out loud or typed.
   */
  private onStudyTogether(): void {
    this.audio.playTap();
    const st = this.studyTogether;
    if (!st || !st.internetModule) {
      this.frontUI.setWaiting("Study together needs the bridge running.");
      return;
    }
    this.frontUI.setRoomScreen("", [], "Looking for rooms...");

    st.listRooms((rooms) => {
      if (this.mode !== "front") return;
      const joinable: string[] = [];
      for (let i = 0; i < rooms.length && joinable.length < 2; i++) {
        const r = rooms[i];
        if (!r || !r.room) continue;
        // Do not offer the room we are already in.
        if (st.isJoined && r.room === st.roomCode) continue;
        const who = (r.members && r.members.length)
          ? r.members.join(", ")
          : "waiting";
        joinable.push("Join " + r.room + "  (" + who + ")");
      }
      this.joinableRooms = joinable;

      if (st.isJoined) {
        this.frontUI.setRoomScreen(st.roomCode, joinable,
          "Your room. Others can pinch it from their front door.");
        return;
      }
      // Nothing open: make one, so the screen is never a dead end.
      this.frontUI.setRoomScreen("", joinable,
        joinable.length ? "Pinch a room to join, or wait for yours."
                        : "Opening a room...");
      st.create(rooms.map((r) => r.room));
    });
  }

  /** Rooms currently offered on the Study Together screen, in row order. */
  private joinableRooms: string[] = [];

  /** A row was pinched on the Study Together screen: join that room. */
  private tryJoinFromRow(label: string): boolean {
    if (!this.frontUI.isRoomScreen || !this.studyTogether) return false;
    // "Join TIGER  (Me)" -> TIGER
    const parts = label.split(" ");
    if (parts.length < 2 || parts[0] !== "Join") return false;
    this.audio.playTap();
    this.frontUI.setRoomScreen("", [], "Joining " + parts[1] + "...");
    this.studyTogether.join(parts[1]);
    return true;
  }

  private onRoomJoined(code: string): void {
    if (this.mode !== "front") return;
    this.audio.playUnroll();
    // The room just joined is no longer something to join.
    this.joinableRooms = this.joinableRooms.filter((row) => row.split(" ")[1] !== code);
    this.frontUI.setRoomScreen(code, this.joinableRooms,
      "In room " + code + ". Pick a skill and you both learn it.");
  }

  private onPeerJoined(p: RoomPeer): void {
    this.audio.playGotIt();
    if (this.mode === "front") {
      if (this.frontUI.isRoomScreen && this.studyTogether) {
        this.frontUI.setRoomScreen(this.studyTogether.roomCode, [],
          p.name + " joined. Pick a skill and you both learn it.");
      }
    } else {
      this.sheetUI.showNote(p.name + " joined");
    }
  }

  private onPeerLeft(p: RoomPeer): void {
    if (this.mode === "front") {
      if (this.frontUI.isRoomScreen && this.studyTogether) {
        this.frontUI.setRoomScreen(this.studyTogether.roomCode, [], p.name + " left.");
      }
    } else {
      this.sheetUI.showNote(p.name + " left");
    }
    this.endPeerLive(p.id);
  }

  private onRoomError(why: string): void {
    // Refused, not broken. Back to the front door with the reason.
    if (this.mode !== "front") return;
    this.frontUI.leaveRoomScreen();
    this.frontUI.setWaiting(why);
  }

  /** Clear every peer's ink, finished and in progress, when the page turns. */
  private clearPeerInk(): void {
    for (const r of this.remoteInk) r.sceneObject.destroy();
    this.remoteInk = [];
    for (const id of Object.keys(this.peerLive)) this.endPeerLive(id);
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
    // The front door too: guitar is often opened FROM it (a planned "play an
    // em chord" lesson, or the Guitar tile), and leaving it on drew its title
    // and step list straight across the fretboard.
    this.frontRoot.enabled = false;
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

    // Height follows the gaze too, not just eye level: someone looking down at
    // their hands gets the sheet there, instead of above the top of the view
    // (which hid the upper bookmark tabs). Clamped so a glance at the floor or
    // ceiling at the moment of opening cannot put it somewhere absurd.
    const pitch = Math.max(-0.6, Math.min(0.25, fwd.normalize().y));
    const t = this.sceneObject.getTransform();
    t.setWorldPosition(
      new vec3(eye.x + dir.x * this.anchorDistanceCm,
               eye.y + pitch * this.anchorDistanceCm,
               eye.z + dir.z * this.anchorDistanceCm)
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
