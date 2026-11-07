/**
 * GhostGuitarController — the guitar lesson: the ghost places the chord, then
 * it is your turn.
 *
 * Owns:  the demonstration (a ghost hand laying one fingertip at a time, each
 *        landing as a numbered ink dot, then a brush across the strings), the
 *        user's turn (pinch each dot in order, then strum), and the placement
 *        check behind both.
 * Must not: touch the UI or decide what comes next — GhostMain does that, the
 *        same one-way flow the kana and ASL packs use.
 *
 * ── The placement check is tiered, like the ASL pack's ────────────────────────
 * The brief's ASL ladder is (1) native SIK hand tracking, (2) the webcam
 * bridge, (3) a pinch the user can do with a mouse. Guitar uses the same
 * ladder, and the shipping build is tier 3: pinching a dot IS placing that
 * finger, because in the preview and over the bridge there is no reliable
 * fingertip depth to test against a 2 mm mark.
 *
 * Tiers 1 and 2 are not a rewrite. Every path funnels through
 * `satisfyTarget(finger)`, and `checkFingertip(worldPosition)` is the whole
 * device-side entry point: hand it a real fingertip each frame and it does the
 * radius test against the live dot and calls the same `satisfyTarget`. The
 * lesson flow is identical in all three cases; only the thing that satisfies a
 * step changes.
 *
 * Chord shapes credit: chords-db (github.com/tombatossals/chords-db), MIT.
 */

import Event, { PublicApi } from "SpectaclesInteractionKit.lspkg/Utils/Event";
import { Interactable } from "SpectaclesInteractionKit.lspkg/Components/Interaction/Interactable/Interactable";
import { InteractorEvent } from "SpectaclesInteractionKit.lspkg/Core/Interactor/InteractorEvent";
import { Interactor } from "SpectaclesInteractionKit.lspkg/Core/Interactor/Interactor";
import WorldCameraFinderProvider from "SpectaclesInteractionKit.lspkg/Providers/CameraProvider/WorldCameraFinderProvider";
import { Chord, FingerTarget, fingerTargets } from "./GhostGuitarPack";
import { GhostFretboard, STRING_COUNT } from "./GhostFretboard";
import { GhostChordDot } from "./GhostChordDot";
import { GhostHand } from "./GhostHands";
import { HandPose } from "./GhostAslPack";
import { createDot } from "./GhostInkRibbon";

/**
 * Fingertip position in GhostHand's own local centimetres, fully extended, for
 * fingers 1..4. Derived from the hand GhostHands builds: a finger's root sits
 * at (fingerX, 4.8) on the palm and its three segments add up to its length.
 * Index 0 is unused so the array can be read with the finger number directly.
 *
 * Source of truth is GhostHands.ts — if the hand's proportions change, these
 * four pairs change with them, and the ghost's fingertips stop landing on the
 * dots. That is the one coupling in this file, and it is why it is written down
 * here rather than guessed at.
 */
const TIP_LOCAL: number[][] = [
  [0, 0],
  [-1.65, 9.3],  // 1 index
  [-0.55, 9.9],  // 2 middle
  [0.55, 9.8],   // 3 ring
  [1.65, 9.0],   // 4 little
];

/** Curl for a finger that is reaching for the board, and one that is tucked. */
const CURL_EXTENDED = 0.08;
const CURL_TUCKED = 0.78;
const CURL_THUMB = 0.55;

type Phase = "idle" | "reach" | "settle" | "preStrum" | "ghostStrum" | "turn" | "done";

@component
export class GhostGuitarController extends BaseScriptComponent {
  @ui.label('<span style="color: #60A5FA;">GhostGuitarController &ndash; the ghost places the chord, then you do</span>')
  @ui.separator

  @ui.label('<span style="color: #60A5FA;">References</span>')
  @ui.group_start("References")
  @input
  @hint("The fretboard. Every position in this script is asked of it, so the dots and the ghost hand can never disagree with the drawn frets.")
  fretboard!: GhostFretboard;
  @ui.group_end

  @ui.separator
  @ui.label('<span style="color: #60A5FA;">Settings</span>')
  @ui.group_start("Settings")
  @input("vec4", "{0.95,0.91,0.83,1}")
  @hint("Ghost hand colour. The same warm off-white light as the ASL hands and the brush, so the ghost reads as one character across all three packs.")
  @widget(new ColorWidget())
  handColor: vec4;

  @input
  @hint("Size of the ghost hand, where 1 is roughly life-size. A life-size hand beside a 30 cm board does not fit the 21.5 cm view, so this is under 1 by necessity.")
  @widget(new SliderWidget(0.25, 1.2, 0.05))
  handScale: number = 0.45;

  @input
  @hint("How the ghost hand is turned on the board, in degrees. Negative reaches in from the lower left, like your own fretting hand seen from above.")
  @widget(new SliderWidget(-90, 0, 1))
  handRollDeg: number = -60;

  @input
  @hint("Seconds the hand takes to travel to each fingertip.")
  @widget(new SliderWidget(0.2, 1.5, 0.05))
  placeSec: number = 0.55;

  @input
  @hint("Seconds the hand rests on each dot before moving to the next finger.")
  @widget(new SliderWidget(0.05, 1, 0.05))
  settleSec: number = 0.28;

  @input
  @hint("Seconds the ghost's brush takes to cross the strings.")
  @widget(new SliderWidget(0.15, 1.2, 0.05))
  strumSec: number = 0.4;

  @input
  @hint("How many strings a drag must cross before the chord sounds early. A release anywhere on the strum band always plays it, so this only decides when a real sweep gets rewarded mid-gesture.")
  @widget(new SliderWidget(2, 6, 1))
  strumStringsNeeded: number = 4;

  @input
  @hint("How close a real fingertip must come to a dot to count as placed, in cm. Only used on device and over the webcam bridge; a pinch needs no radius.")
  @widget(new SliderWidget(1, 6, 0.1))
  fingertipReachCm: number = 2.6;
  @ui.group_end

  private hand: GhostHand | null = null;
  private dots: GhostChordDot[] = [];
  private targets: FingerTarget[] = [];
  private chord: Chord | null = null;

  private phase: Phase = "idle";
  private stepIndex = 0;
  private phaseT = 0;
  private wristFrom: vec3 = vec3.zero();
  private wristTo: vec3 = vec3.zero();

  private strumZone: SceneObject | null = null;
  private strumInteractable: Interactable | null = null;
  private ghostPick: SceneObject | null = null;
  private strumming = false;
  private strumFired = false;
  private strumInteractor: Interactor | null = null;
  private strumSeen: boolean[] = [];
  private strumCrossed = 0;

  private readonly _onDemoFinished = new Event<string>();
  private readonly _onFingerPlaced = new Event<number>();
  private readonly _onAllFingersPlaced = new Event<void>();
  private readonly _onChordPlayed = new Event<string>();

  /** The ghost has finished showing the chord. */
  get onDemoFinished(): PublicApi<string> {
    return this._onDemoFinished.publicApi();
  }
  /** One fingertip of the user's own chord has landed. Payload: finger number. */
  get onFingerPlaced(): PublicApi<number> {
    return this._onFingerPlaced.publicApi();
  }
  /** Every dot is placed; only the strum is left. */
  get onAllFingersPlaced(): PublicApi<void> {
    return this._onAllFingersPlaced.publicApi();
  }
  /** The user strummed and the chord sounded. Payload: chord id. */
  get onChordPlayed(): PublicApi<string> {
    return this._onChordPlayed.publicApi();
  }

  /**
   * True while the ghost is showing the chord, false once the board is the
   * user's. GhostMain reads this to decide whether a landed fingertip deserves
   * a word: narrating the ghost's own hand would be two things at once.
   */
  get isDemonstrating(): boolean {
    return this.phase === "reach" || this.phase === "settle" ||
      this.phase === "preStrum" || this.phase === "ghostStrum";
  }

  /** The board this controller is driving, for the lesson's stamp. */
  get board(): GhostFretboard | null {
    return this.fretboard ? this.fretboard : null;
  }

  onAwake(): void {
    this.createEvent("OnStartEvent").bind(() => this.onStart());
    this.createEvent("UpdateEvent").bind(() => this.onUpdate());
  }

  private onStart(): void {
    if (!this.fretboard) {
      print("[GhostGuitarController] ERROR: fretboard is not wired. Check the scene bootstrap's input-wiring pass.");
      return;
    }
    const board = this.fretboard.boardRoot;

    this.hand = new GhostHand(board, "GhostFretHand", this.handColor, false);
    this.hand.root.getTransform().setLocalScale(
      new vec3(this.handScale, this.handScale, this.handScale)
    );
    this.hand.enabled = false;

    // The ghost's thumb brushing the strings during the demonstration.
    const pick = createDot(board, "GhostPick", 0.5, this.handColor, 0.3, 18);
    this.ghostPick = pick.getSceneObject();
    this.ghostPick.enabled = false;

    this.buildStrumZone(board);
  }

  /**
   * The strum target: a flat hit box over the band past the frets. No visual of
   * its own — GhostFretboard already draws the band, so the thing you can touch
   * and the thing you can see are the same object to the user.
   */
  private buildStrumZone(board: SceneObject): void {
    const so = global.scene.createSceneObject("StrumZone");
    so.setParent(board);
    so.getTransform().setLocalPosition(new vec3(0, this.fretboard.strumY, 0.2));

    const collider = so.createComponent("Physics.ColliderComponent") as ColliderComponent;
    const box = Shape.createBoxShape();
    box.size = new vec3(this.fretboard.strumWidthCm, this.fretboard.strumHeightCm + 1.0, 1.4);
    collider.shape = box;
    collider.debugDrawEnabled = false;

    const it = so.createComponent(Interactable.getTypeName()) as Interactable;
    this.strumInteractable = it;
    this.strumZone = so;
    so.enabled = false;

    // Bound inside OnStartEvent, where the controller already is.
    it.onTriggerStart.add((e: InteractorEvent) => this.onStrumStart(e));
    it.onTriggerEnd.add(() => this.onStrumEnd());
    // A drag that leaves the band still counts: the user swept past the strings,
    // which is exactly the gesture. Nothing harsh, per the brief.
    it.onTriggerEndOutside.add(() => this.onStrumEnd());
  }

  // ── Public API ────────────────────────────────────────────────────────────

  /** Show a chord: place each fingertip in turn, then brush the strings. */
  playDemo(chord: Chord): void {
    if (!this.hand || !this.fretboard) return;
    this.chord = chord;
    this.targets = fingerTargets(chord);

    this.fretboard.setStringMarks(chord.frets);
    this.clearDots();
    this.buildDots();
    this.setStrumEnabled(false);

    this.hand.enabled = true;
    this.stepIndex = 0;
    this.phaseT = 0;

    if (this.targets.length === 0) {
      // An all-open chord has nothing to place. Go straight to the brush.
      this.phase = "preStrum";
      return;
    }
    // Start the hand off the board, above and short of the first dot, so the
    // first move reads as coming in to play rather than appearing in place.
    const first = this.wristFor(this.targets[0]);
    this.wristFrom = new vec3(first.x - 4, first.y - 4, 4.5);
    this.wristTo = first;
    this.applyHand(this.wristFrom, -1);
    this.phase = "reach";
  }

  /** Hand the chord to the user: pinch each dot in order, then strum. */
  beginTurn(chord: Chord): void {
    if (!this.fretboard) return;
    this.chord = chord;
    this.targets = fingerTargets(chord);

    this.fretboard.setStringMarks(chord.frets);
    this.clearDots();
    this.buildDots();

    if (this.hand) this.hand.enabled = false;
    if (this.ghostPick) this.ghostPick.enabled = false;

    this.stepIndex = 0;
    this.phase = "turn";
    this.refreshDotStates();

    if (this.targets.length === 0) {
      // Em-style all-open chords still exist in the data model; strum straight away.
      this.setStrumEnabled(true);
      this._onAllFingersPlaced.invoke();
    } else {
      this.setStrumEnabled(false);
    }
  }

  stop(): void {
    this.phase = "idle";
    this.strumming = false;
    this.strumInteractor = null;
    this.setStrumEnabled(false);
    if (this.hand) this.hand.enabled = false;
    if (this.ghostPick) this.ghostPick.enabled = false;
  }

  /** Wipe the board back to bare paper. */
  clear(): void {
    this.stop();
    this.clearDots();
    if (this.fretboard) this.fretboard.clearStringMarks();
  }

  setVisible(on: boolean): void {
    if (this.hand) this.hand.enabled = on && this.phase !== "turn";
    if (!on) this.setStrumEnabled(false);
  }

  /**
   * Tier 1 and 2 of the placement ladder: hand this a real fingertip's WORLD
   * position every frame — from SIK's `hand.indexTip` on device, or from the
   * webcam bridge in the preview — and the live dot is satisfied when the
   * fingertip comes within `fingertipReachCm` of it.
   *
   * Nothing else needs to change to switch tiers: this calls the same
   * `satisfyTarget` a pinch does, so the lesson flow is untouched. Returns true
   * when the fingertip landed a dot on this call.
   */
  checkFingertip(worldPosition: vec3): boolean {
    if (this.phase !== "turn" || !this.fretboard) return false;
    const live = this.liveDot();
    if (!live) return false;

    const local = this.fretboard.boardRoot
      .getTransform()
      .getInvertedWorldTransform()
      .multiplyPoint(worldPosition);
    if (live.distanceTo(local.x, local.y) > this.fingertipReachCm) return false;

    this.satisfyTarget(live.finger);
    return true;
  }

  // ── The user's turn ───────────────────────────────────────────────────────

  /**
   * One fingertip is placed, however it was placed. The single funnel every
   * tier of the ladder goes through.
   */
  private satisfyTarget(finger: number): void {
    if (this.phase !== "turn") return;
    const live = this.liveDot();
    if (!live || live.finger !== finger) return;

    this.stepIndex++;
    this.refreshDotStates();
    this._onFingerPlaced.invoke(finger);

    if (this.stepIndex >= this.targets.length) {
      this.setStrumEnabled(true);
      this._onAllFingersPlaced.invoke();
    }
  }

  private liveDot(): GhostChordDot | null {
    if (this.stepIndex < 0 || this.stepIndex >= this.dots.length) return null;
    return this.dots[this.stepIndex];
  }

  /** Placed behind, live at the cursor, dim guides ahead. */
  private refreshDotStates(): void {
    for (let i = 0; i < this.dots.length; i++) {
      if (i < this.stepIndex) this.dots[i].setState("placed");
      else if (i === this.stepIndex) this.dots[i].setState("live");
      else this.dots[i].setState("guide");
    }
  }

  // ── The strum ─────────────────────────────────────────────────────────────

  private setStrumEnabled(on: boolean): void {
    if (this.strumZone) this.strumZone.enabled = on;
    if (!on) {
      this.strumming = false;
      this.strumInteractor = null;
    }
  }

  private onStrumStart(e: InteractorEvent): void {
    if (this.phase !== "turn") return;
    this.strumming = true;
    this.strumFired = false;
    this.strumInteractor = e.interactor;
    this.strumSeen = [];
    for (let s = 0; s < STRING_COUNT; s++) this.strumSeen.push(false);
    this.strumCrossed = 0;
  }

  /**
   * The guaranteed path. A release on the strum band plays the chord even if the
   * sweep tracking never saw a thing — in Interactive Preview a press is held in
   * place, and refusing to sound the chord because the mouse did not travel
   * would be a test of the input device, not of the chord.
   */
  private onStrumEnd(): void {
    if (!this.strumming) return;
    this.strumming = false;
    this.strumInteractor = null;
    this.fireChord();
  }

  private fireChord(): void {
    if (this.strumFired || !this.chord) return;
    this.strumFired = true;
    this.phase = "done";
    if (this.fretboard) this.fretboard.setStringsLit(true);
    this.setStrumEnabled(false);
    for (let i = 0; i < this.dots.length; i++) this.dots[i].setState("placed");
    this._onChordPlayed.invoke(this.chord.id);
  }

  /**
   * Follow a held drag across the strings, lighting each as it is crossed, and
   * sound the chord early once enough of them have gone by. Cosmetic and
   * optional: `onStrumEnd` is what guarantees the chord plays.
   */
  private trackStrum(): void {
    if (!this.strumming || !this.strumInteractor || !this.fretboard) return;
    const local = this.projectToBoard(this.strumInteractor.startPoint);
    if (!local) return;

    for (let s = 0; s < STRING_COUNT; s++) {
      if (this.strumSeen[s]) continue;
      if (Math.abs(local.x - this.fretboard.stringX(s)) < 0.75) {
        this.strumSeen[s] = true;
        this.strumCrossed++;
      }
    }
    if (this.strumCrossed >= this.strumStringsNeeded) this.fireChord();
  }

  /**
   * A world point onto the board plane, in board-local cm, along the ray from
   * the camera through it. On device the hand already sits at roughly the
   * board's depth so the ray is near-identity; in the preview the mouse
   * interactor sits at a fixed camera-relative depth and the same maths scales
   * it onto the board. One formula, both worlds — the projection
   * GhostPinchInput uses for the practice sheet.
   */
  private projectToBoard(world: vec3 | null): { x: number; y: number } | null {
    if (!world || !this.fretboard) return null;
    const bt = this.fretboard.boardRoot.getTransform();
    const planeOrigin = bt.getWorldPosition();
    const normal = bt.forward;

    const camT = WorldCameraFinderProvider.getInstance().getComponent().getTransform();
    const eye = camT.getWorldPosition();
    const dir = world.sub(eye);
    const denom = dir.dot(normal);

    let hit: vec3;
    if (Math.abs(denom) < 1e-5) {
      hit = world;
    } else {
      const t = planeOrigin.sub(eye).dot(normal) / denom;
      if (t <= 0) return null;
      hit = eye.add(dir.uniformScale(t));
    }
    const local = bt.getInvertedWorldTransform().multiplyPoint(hit);
    return { x: local.x, y: local.y };
  }

  // ── Dots ──────────────────────────────────────────────────────────────────

  private buildDots(): void {
    if (!this.fretboard) return;
    const board = this.fretboard.boardRoot;
    const style = this.fretboard.style;
    for (let i = 0; i < this.targets.length; i++) {
      const t = this.targets[i];
      const p = this.fretboard.fingerPoint(t.stringIndex, t.fret);
      const dot = new GhostChordDot(
        board, t.finger, p.x, p.y, style.dotRadiusCm, style.inkColor, style.guideColor
      );
      dot.onPinched.add((finger: number) => this.satisfyTarget(finger));
      this.dots.push(dot);
    }
  }

  private clearDots(): void {
    for (let i = 0; i < this.dots.length; i++) this.dots[i].destroy();
    this.dots = [];
  }

  // ── The ghost hand ────────────────────────────────────────────────────────

  /**
   * Where the wrist has to be for one finger's tip to land exactly on its dot.
   *
   * There is no inverse kinematics here and none is wanted: the hand is rigid,
   * so it MOVES to put the active finger on the mark. Fingers already placed
   * stay extended but drift a little off their own dots as the hand travels —
   * which reads as a hand feeling out a chord, and costs nothing, because the
   * ink dot is the thing the user is looking at and ink does not move.
   */
  private wristFor(target: FingerTarget): vec3 {
    const p = this.fretboard.fingerPoint(target.stringIndex, target.fret);
    const tip = TIP_LOCAL[Math.max(1, Math.min(4, target.finger))];
    const th = this.handRollDeg * Math.PI / 180;
    const c = Math.cos(th);
    const s = Math.sin(th);
    const rx = tip[0] * c - tip[1] * s;
    const ry = tip[0] * s + tip[1] * c;
    return new vec3(p.x - rx * this.handScale, p.y - ry * this.handScale, 0.35);
  }

  /**
   * Pose the hand at a wrist position, with every finger up to and including
   * `placedThrough` extended and the rest tucked.
   */
  private applyHand(wrist: vec3, placedThrough: number): void {
    if (!this.hand) return;
    const curl: number[] = [CURL_THUMB, CURL_TUCKED, CURL_TUCKED, CURL_TUCKED, CURL_TUCKED];
    for (let i = 0; i <= placedThrough && i < this.targets.length; i++) {
      const f = this.targets[i].finger;
      if (f >= 1 && f <= 4) curl[f] = CURL_EXTENDED;
    }
    const pose: HandPose = {
      curl: curl,
      spread: 0.45,
      offsetCm: [wrist.x, wrist.y, wrist.z],
      rotationDeg: [0, 0, this.handRollDeg],
      holdSec: 0,
    };
    this.hand.apply(pose, vec3.zero());
  }

  // ── Demonstration ─────────────────────────────────────────────────────────

  private onUpdate(): void {
    const dt = getDeltaTime();
    for (let i = 0; i < this.dots.length; i++) this.dots[i].update(dt);

    if (this.phase === "turn") {
      this.trackStrum();
      return;
    }
    if (this.phase === "idle" || this.phase === "done") return;

    this.phaseT += dt;

    if (this.phase === "reach") {
      const dur = Math.max(0.05, this.placeSec);
      const raw = Math.min(1, this.phaseT / dur);
      // Ease in and out, so the hand arrives rather than stopping dead.
      const f = raw * raw * (3 - 2 * raw);
      // Lift the hand over the board and set it down in the last third of the
      // move: a finger that slides along the paper does not read as placed.
      const lift = 2.6 * Math.max(0, 1 - raw / 0.66) * (raw < 0.66 ? 1 : 0);
      const at = new vec3(
        this.wristFrom.x + (this.wristTo.x - this.wristFrom.x) * f,
        this.wristFrom.y + (this.wristTo.y - this.wristFrom.y) * f,
        this.wristFrom.z + (this.wristTo.z - this.wristFrom.z) * f + lift
      );
      this.applyHand(at, this.stepIndex);

      if (raw >= 1) {
        // The fingertip has arrived: ink the dot.
        if (this.stepIndex < this.dots.length) this.dots[this.stepIndex].setState("placed");
        this._onFingerPlaced.invoke(this.targets[this.stepIndex].finger);
        this.phase = "settle";
        this.phaseT = 0;
      }
      return;
    }

    if (this.phase === "settle") {
      if (this.phaseT < this.settleSec) return;
      this.stepIndex++;
      this.phaseT = 0;
      if (this.stepIndex >= this.targets.length) {
        this.phase = "preStrum";
        return;
      }
      this.wristFrom = new vec3(this.wristTo.x, this.wristTo.y, this.wristTo.z);
      this.wristTo = this.wristFor(this.targets[this.stepIndex]);
      this.phase = "reach";
      return;
    }

    if (this.phase === "preStrum") {
      // A beat with the whole chord held, before it sounds.
      if (this.phaseT < this.settleSec * 1.6) return;
      this.phaseT = 0;
      this.phase = "ghostStrum";
      if (this.ghostPick && this.fretboard) {
        this.ghostPick.enabled = true;
        this.ghostPick.getTransform().setLocalPosition(
          new vec3(this.fretboard.stringX(0) - 1.2, this.fretboard.strumY, 0.3)
        );
      }
      if (this.fretboard) this.fretboard.setStringsLit(true);
      // The chord itself is sounded by GhostMain, which owns audio timing.
      this._onDemoFinished.invoke(this.chord ? this.chord.id : "");
      return;
    }

    if (this.phase === "ghostStrum") {
      const dur = Math.max(0.05, this.strumSec);
      const f = Math.min(1, this.phaseT / dur);
      if (this.ghostPick && this.fretboard) {
        const x0 = this.fretboard.stringX(0) - 1.2;
        const x1 = this.fretboard.stringX(STRING_COUNT - 1) + 1.2;
        this.ghostPick.getTransform().setLocalPosition(
          new vec3(x0 + (x1 - x0) * f, this.fretboard.strumY, 0.3)
        );
      }
      if (f >= 1) {
        if (this.ghostPick) this.ghostPick.enabled = false;
        if (this.fretboard) this.fretboard.setStringsLit(false);
        this.phase = "done";
      }
      return;
    }
  }
}
