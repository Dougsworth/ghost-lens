/**
 * GhostTurnController — the user's turn: pinch, drag, check, dry.
 *
 * Owns:  the user's own ink. One wet ribbon follows the live drag; on release
 *        the drag is scored by GhostStrokeCheck. A match dries into place and
 *        the turn moves to the next stroke; a miss fades away and the start
 *        point pulses. After repeated misses on the same stroke it asks for
 *        that one stroke to be demonstrated again.
 * Must not: touch the UI, play audio, or advance the character. It emits and
 *        GhostMain decides — same one-way flow the demo player uses.
 *
 * ── Watch, Try, Fix ─────────────────────────────────────────────────────────
 * TRY: the live ink is coloured AS IT IS DRAWN, in bands — on the line, close,
 * or off — so the correction happens during the stroke rather than after it.
 * A range is accepted: "close" still passes, because the brief's rule is that
 * only the rough shape and direction need to match.
 *
 * FIX: a miss does not say "start again". The band that actually went wrong is
 * the only thing that pulses, and it pulses at the point on the GUIDE where the
 * ink should have been, so the user is shown the fix rather than the failure.
 *
 * Throughout: no harsh error and no red X. "Off" is a warm red-orange that
 * reads as ink, the miss fades gently, and nothing flashes.
 *
 * User ink lives in the sheet's inkRoot, which sits IN FRONT of the guide layer
 * the ghost left behind — so the user writes over the outline, not under it.
 */

import Event, { PublicApi } from "SpectaclesInteractionKit.lspkg/Utils/Event";
import { GlyphPath, Pt } from "./GhostKanaPath";
import { InkRibbon, createQuads, createRing } from "./GhostInkRibbon";
import { checkStroke } from "./GhostStrokeCheck";
import { Band, gradeBands, nearestGuidePoint, worstBand } from "./GhostStrokeFeedback";
import { GhostSheet } from "./GhostSheet";
import { GhostPinchInput } from "./GhostPinchInput";

type Fading = { ribbon: InkRibbon; t: number; from: vec4 };

/** Seconds for the success splash ring to bloom and vanish. */
const SPLASH_SEC = 0.55;

export type MissInfo = { index: number; reason: string };

@component
export class GhostTurnController extends BaseScriptComponent {
  @ui.label('<span style="color: #60A5FA;">GhostTurnController &ndash; the user traces the guide</span>')
  @ui.separator

  @ui.label('<span style="color: #60A5FA;">References</span>')
  @ui.group_start("References")
  @input
  @hint("The practice sheet. User ink is drawn into its inkRoot, in front of the ghost's guide.")
  sheet!: GhostSheet;

  @input
  @hint("Pinch source: SIK hand or mouse, plus the webcam bridge when connected.")
  pinchInput!: GhostPinchInput;
  @ui.group_end

  @ui.separator
  @ui.label('<span style="color: #60A5FA;">Settings</span>')
  @ui.group_start("Settings")
  @input("vec4", "{1,0.97,0.90,1}")
  @hint("The user's wet ink while dragging. Additive display: a bright warm off-white, brighter than the guide underneath it.")
  @widget(new ColorWidget())
  wetInkColor: vec4;

  @input("vec4", "{0.92,0.86,0.74,1}")
  @hint("Colour the user's ink dries to once a stroke is accepted. Stays on the sheet until the page turns.")
  @widget(new ColorWidget())
  driedInkColor: vec4;

  @input("vec4", "{1,0.86,0.55,1}")
  @hint("Colour of the pulsing marker that shows which part of the stroke to fix.")
  @widget(new ColorWidget())
  pulseColor: vec4;

  @input("vec4", "{0.46,1,0.60,1}")
  @hint("Live ink where the stroke is ON the guide. Additive display: an emitted green, bright enough to read against the warm paper.")
  @widget(new ColorWidget())
  onLineColor: vec4;

  @input("vec4", "{1,0.80,0.36,1}")
  @hint("Live ink where the stroke is CLOSE. This still passes — it is a nudge, not a failure.")
  @widget(new ColorWidget())
  closeColor: vec4;

  @input("vec4", "{1,0.46,0.38,1}")
  @hint("Live ink where the stroke is OFF. A warm red-orange rather than a signal red: the brief rules out a harsh error, so this has to read as ink that drifted, not as an alarm.")
  @widget(new ColorWidget())
  offColor: vec4;

  @input
  @hint("Distance from the guide, in cm, within which the ink reads as ON the line.")
  @widget(new SliderWidget(0.2, 3, 0.1))
  onLineCm: number = 0.9;

  @input
  @hint("And within which it reads as CLOSE. Past this it reads as off. Both are display thresholds only — whether the stroke actually passes is still the mean test below.")
  @widget(new SliderWidget(0.5, 5, 0.1))
  closeCm: number = 2.2;

  @input
  @hint("How many coloured bands one stroke is split into. More bands localise a mistake more precisely; fewer read more calmly.")
  @widget(new SliderWidget(2, 10, 1))
  feedbackBands: number = 6;

  @input
  @hint("How far the drag may stray from the guide, averaged over the stroke, in cm. Bigger is more forgiving. Tune this by hand in the preview.")
  @widget(new SliderWidget(0.3, 5, 0.1))
  toleranceCm: number = 2.4;

  @input
  @hint("The drag must be at least this fraction of the guide stroke's length, so a dab at the start point cannot pass.")
  @widget(new SliderWidget(0.1, 1, 0.05))
  minLengthRatio: number = 0.3;

  @input
  @hint("And at most this multiple of it, so scribbling cannot pass.")
  @widget(new SliderWidget(1, 5, 0.1))
  maxLengthRatio: number = 3.0;

  @input
  @hint("How far from the stroke's start point you may begin the drag, in cm, before that offset counts against the shape score. Forgives WHERE you start, not what you draw.")
  @widget(new SliderWidget(0, 6, 0.1))
  startToleranceCm: number = 3.0;

  @input
  @hint("A pinch shorter than this many seconds is ignored completely - not accepted, and NOT counted as a miss. Stops an accidental tap from burning one of the three tries before the ghost re-demonstrates.")
  @widget(new SliderWidget(0, 1, 0.05))
  minDragSec: number = 0.25;

  @input
  @hint("How far your hand must actually travel, in cm, before any ink appears. A pinch alone arms the stroke; it does not paint. Stops ink being laid while you are still getting into position, and makes a stray pinch harmless.")
  @widget(new SliderWidget(0, 3, 0.1))
  armDistanceCm: number = 0.6;

  @input
  @hint("Misses on the same stroke before the ghost quietly demonstrates that one stroke again.")
  @widget(new SliderWidget(1, 6, 1))
  missesBeforeDemo: number = 3;

  @input
  @hint("Thickness of the user's brush stroke, in cm.")
  @widget(new SliderWidget(0.15, 1.5, 0.05))
  inkWidthCm: number = 0.55;

  @input
  @hint("How much the incoming pinch path is smoothed before it becomes ink. 0 = raw (every tremor shows as a lump), higher = smoother but the ink trails the finger slightly.")
  @widget(new SliderWidget(0, 0.9, 0.05))
  inputSmoothing: number = 0.5;
  @ui.group_end

  private glyph: GlyphPath | null = null;
  private strokeBeganAt = 0;
  /** Where the stroke will begin once the hand actually moves. */
  private pendingStart: Pt | null = null;
  private strokeIndex = 0;
  private misses = 0;
  private active = false;

  /** The stroke being drawn, rendered as one ribbon per coloured band. */
  private live: InkRibbon[] = [];
  private livePoints: Pt[] = [];
  private smoothed: Pt | null = null;
  /** The splash ring that blooms when a stroke is accepted. */
  private splash: RenderMeshVisual | null = null;
  private splashT = -1;
  private splashAt: Pt = { x: 0, y: 0 };
  /** Strokes shivering away after a miss, and how far through they are. */
  private shiverT = -1;

  private livePointsEnd: Pt = { x: 0, y: 0 };
  private lastBands: Band[] = [];
  /** True once the hand has travelled far enough that ink is being laid. */
  private drawing = false;
  private dried: InkRibbon[] = [];
  /** Where the fix pulse sits: the point on the GUIDE the worst band missed. */
  private pulseAt: Pt | null = null;
  private fading: Fading[] = [];
  private pulse: RenderMeshVisual | null = null;
  private pulseOn = false;
  private elapsed = 0;
  /** When the user last did anything (turn began, pinched, released). */
  private lastActivity = 0;

  private readonly _onStrokeAccepted = new Event<number>();
  private readonly _onStrokeMissed = new Event<MissInfo>();
  private readonly _onCharacterComplete = new Event<void>();
  private readonly _onNeedsDemo = new Event<number>();

  get onStrokeAccepted(): PublicApi<number> {
    return this._onStrokeAccepted.publicApi();
  }
  get onStrokeMissed(): PublicApi<MissInfo> {
    return this._onStrokeMissed.publicApi();
  }
  get onCharacterComplete(): PublicApi<void> {
    return this._onCharacterComplete.publicApi();
  }
  /** Asks for ONE stroke to be re-demonstrated after repeated misses. */
  get onNeedsDemo(): PublicApi<number> {
    return this._onNeedsDemo.publicApi();
  }

  /** 0-based index of the stroke the user is on. */
  get currentStroke(): number {
    return this.strokeIndex;
  }

  /**
   * Seconds since the user last did anything during their turn; 0 while a
   * pinch is in progress or the turn is not active. Lets the lesson give a
   * hint only when the learner is stuck, never before.
   */
  get idleSeconds(): number {
    if (!this.active || this.pendingStart || this.drawing) return 0;
    return getTime() - this.lastActivity;
  }

  onAwake(): void {
    this.createEvent("OnStartEvent").bind(() => this.onStart());
    this.createEvent("UpdateEvent").bind(() => this.onUpdate());
  }

  private onStart(): void {
    if (!this.sheet || !this.pinchInput) {
      print("[GhostTurnController] ERROR: a required @input is not wired.");
      return;
    }
    this.pinchInput.onPinchStart.add((p: Pt) => this.beginStroke(p));
    this.pinchInput.onPinchMove.add((p: Pt) => this.extendStroke(p));
    this.pinchInput.onPinchEnd.add((p: Pt) => this.endStroke(p));
  }

  // ── Turn lifecycle ────────────────────────────────────────────────────────

  /** Hand the sheet over to the user, starting at stroke 1. */
  begin(glyph: GlyphPath): void {
    this.clearAll();
    this.glyph = glyph;
    this.strokeIndex = 0;
    this.misses = 0;
    this.active = true;
    this.lastActivity = getTime();
    this.setPulse(false);
    if (this.pinchInput) this.pinchInput.accepting = true;
    this.publishStrokeStart();
  }

  /** Take the sheet back (demo replay, page turn, back to the shelf). */
  stop(): void {
    this.active = false;
    if (this.pinchInput) this.pinchInput.accepting = false;
    this.publishStrokeStart();
    this.discardLive();
    this.setPulse(false);
  }

  /** Resume after the ghost re-demonstrated a stroke. */
  resume(): void {
    if (!this.glyph) return;
    this.active = true;
    if (this.pinchInput) this.pinchInput.accepting = true;
    this.publishStrokeStart();
  }

  clearAll(): void {
    this.discardLive();
    for (let i = 0; i < this.dried.length; i++) this.dried[i].sceneObject.destroy();
    this.dried = [];
    for (let i = 0; i < this.fading.length; i++) this.fading[i].ribbon.sceneObject.destroy();
    this.fading = [];
    this.setPulse(false);
  }

  // ── Drawing ───────────────────────────────────────────────────────────────

  /**
   * A pinch ARMS the stroke; it does not draw.
   *
   * Hand tracking reports a pinch the moment the fingers close, which is
   * usually before the user has begun to move -- and with the bridge's relative
   * mode the brush is already sitting on the stroke's start point, so ink would
   * appear there while they were still settling. The ribbon is therefore not
   * created until the hand has travelled `armDistanceCm`. A pinch that never
   * moves leaves no ink at all, and endStroke treats it as nothing happened
   * rather than as a miss.
   */
  private beginStroke(p: Pt): void {
    if (!this.active || !this.glyph) return;
    this.discardLive();
    this.pendingStart = { x: p.x, y: p.y };
    this.livePoints = [p];
    this.smoothed = { x: p.x, y: p.y };
    this.strokeBeganAt = getTime();
    this.lastActivity = this.strokeBeganAt;
    this.drawing = false;
    this.lastBands = [];
    this.hideLive();
    this.setPulse(false);
  }

  /** Colour for a band's level. 0 on the line, 1 close, 2 off. */
  private colorForLevel(level: number): vec4 {
    if (level === 0) return this.onLineColor;
    if (level === 1) return this.closeColor;
    return this.offColor;
  }

  /** One ribbon per band, created on demand and reused as the stroke grows. */
  private ribbonForBand(i: number): InkRibbon {
    while (this.live.length <= i) {
      const r = new InkRibbon(
        this.sheet.inkRoot,
        "UserStroke" + this.strokeIndex + "_b" + this.live.length,
        this.wetInkColor,
        this.inkWidthCm,
        0.004 * this.strokeIndex
      );
      // End-to-end pieces of ONE stroke, so no per-piece taper.
      r.setUniformWidth(true);
      this.live.push(r);
    }
    return this.live[i];
  }

  /**
   * Redraw the live stroke as coloured bands.
   *
   * Every band is rebuilt each time rather than only the last: a band's grade
   * is a mean over its own points, and appending a point to the end of the
   * stroke can change which band the boundary falls in, so a partial update
   * would leave earlier bands showing a grade they no longer have.
   */
  private renderLive(): void {
    if (!this.glyph || this.livePoints.length < 2) return;
    const guide = this.glyph.strokes[this.strokeIndex];
    const bands = gradeBands(
      this.livePoints, guide, this.feedbackBands, this.onLineCm, this.closeCm
    );
    this.lastBands = bands;

    for (let i = 0; i < bands.length; i++) {
      const b = bands[i];
      const slice: Pt[] = [];
      for (let k = b.from; k <= b.to; k++) slice.push(this.livePoints[k]);
      const r = this.ribbonForBand(i);
      r.setColor(this.colorForLevel(b.level));
      r.setRawPoints(slice);
      r.enabled = true;
    }
    // Bands that existed a moment ago but do not now (the stroke got shorter
    // after a discard) are hidden rather than destroyed, so the next stroke
    // reuses them instead of churning scene objects mid-drag.
    for (let i = bands.length; i < this.live.length; i++) {
      this.live[i].enabled = false;
    }
  }

  private extendStroke(p: Pt): void {
    if (!this.active) return;
    if (!this.drawing && !this.pendingStart) return;

    // Low-pass the incoming path before it becomes geometry. Hand tracking and
    // a dragged mouse both arrive with frame-to-frame tremor, and feeding that
    // straight into the ribbon flips the per-point normals back and forth, so
    // the stroke renders as a chain of lumps instead of a brush line. Smoothing
    // here (not in the matcher) keeps scoring honest: the check still runs on
    // the path the user actually drew, within a tolerance far larger than this.
    const a = Math.max(0, Math.min(0.9, this.inputSmoothing));
    if (!this.smoothed) this.smoothed = { x: p.x, y: p.y };
    this.smoothed = {
      x: this.smoothed.x + (p.x - this.smoothed.x) * (1 - a),
      y: this.smoothed.y + (p.y - this.smoothed.y) * (1 - a),
    };
    const q = this.smoothed;

    // Not drawing yet: wait for real travel from the armed point.
    if (!this.drawing) {
      const s0 = this.pendingStart;
      if (!s0) return;
      const ax = q.x - s0.x;
      const ay = q.y - s0.y;
      if (Math.sqrt(ax * ax + ay * ay) < this.armDistanceCm) return;
      this.drawing = true;
    }

    const last = this.livePoints[this.livePoints.length - 1];
    const dx = q.x - last.x;
    const dy = q.y - last.y;
    // Drop sub-millimetre jitter so the ribbon's normals stay stable.
    if (dx * dx + dy * dy < 0.0225) return;
    this.livePoints.push({ x: q.x, y: q.y });
    this.renderLive();
  }

  private endStroke(p: Pt): void {
    if (!this.active || !this.glyph) return;
    this.lastActivity = getTime();
    // Armed but never moved: no ink, no attempt, no miss.
    if (!this.drawing) {
      this.discardLive();
      return;
    }
    const last = this.livePoints[this.livePoints.length - 1];
    if (p.x !== last.x || p.y !== last.y) {
      this.livePoints.push(p);
      this.renderLive();
    }

    // Too brief to be a drag at all: throw the ink away and say nothing. A
    // stray tap is not an attempt, so scoring it as a miss would push the user
    // towards the re-demonstration they did not ask for.
    if (getTime() - this.strokeBeganAt < this.minDragSec) {
      this.discardLive();
      return;
    }

    const target = this.glyph.strokes[this.strokeIndex];
    const verdict = checkStroke(
      this.livePoints,
      target,
      this.toleranceCm,
      this.minLengthRatio,
      this.maxLengthRatio,
      this.startToleranceCm
    );

    const endPt = this.livePoints[this.livePoints.length - 1];
    this.livePointsEnd = { x: endPt.x, y: endPt.y };

    if (verdict.ok) {
      // Dries into place and stays. The feedback colours are dropped on the
      // way down: once a stroke is accepted its grade is history, and leaving
      // a green-and-amber stroke on the page would keep drawing the eye to a
      // judgement the user has already passed.
      for (let i = 0; i < this.live.length; i++) {
        if (!this.live[i].enabledState) continue;
        this.live[i].setColor(this.driedInkColor);
        this.dried.push(this.live[i]);
      }
      this.live = [];
      this.drawing = false;
      this.livePoints = [];
      this.smoothed = null;
      this.misses = 0;
      this.setPulse(false);

      // Ink splash: a ring blooms out from where the stroke finished.
      this.startSplash(this.livePointsEnd);

      const done = this.strokeIndex;
      this._onStrokeAccepted.invoke(done);
      this.strokeIndex++;
      this.publishStrokeStart();
      if (this.strokeIndex >= this.glyph.strokeCount) {
        this.active = false;
        if (this.pinchInput) this.pinchInput.accepting = false;
        this._onCharacterComplete.invoke();
      }
      return;
    }

    // Miss: fade the ink away gently, and point at the part that went wrong.
    const worst = worstBand(this.lastBands);
    this.pulseAt = worst
      ? nearestGuidePoint(this.livePoints[Math.floor((worst.from + worst.to) / 2)], target)
      : null;
    for (let i = 0; i < this.live.length; i++) {
      if (!this.live[i].enabledState) {
        this.live[i].sceneObject.destroy();
        continue;
      }
      this.fading.push({ ribbon: this.live[i], t: 0, from: this.live[i].currentColor });
    }
    this.live = [];
    this.drawing = false;
    this.livePoints = [];
    this.misses++;
    this.setPulse(true);
    this._onStrokeMissed.invoke({ index: this.strokeIndex, reason: verdict.reason });

    if (this.misses >= this.missesBeforeDemo) {
      this.misses = 0;
      this.active = false;
      if (this.pinchInput) this.pinchInput.accepting = false;
      this._onNeedsDemo.invoke(this.strokeIndex);
    }
  }

  /**
   * Bloom a ring out of the point where the stroke finished.
   *
   * A splash rather than a flash: on an additive display a brightness pop is
   * indistinguishable from a glitch, whereas something that grows and thins
   * reads as ink hitting wet paper. It is also the one moment in the loop that
   * is purely a reward, so it is allowed to be the liveliest thing on screen.
   */
  private startSplash(at: Pt): void {
    this.splashAt = { x: at.x, y: at.y };
    this.splashT = 0;
    if (!this.splash && this.sheet) {
      this.splash = createRing(this.sheet.inkRoot, "InkSplash", 1, 0.22, this.onLineColor, 0.05, 30);
    }
    if (this.splash) {
      const so = this.splash.getSceneObject();
      so.enabled = true;
      so.getTransform().setLocalPosition(new vec3(at.x, at.y, 0.05));
    }
  }

  private updateSplash(dt: number): void {
    if (this.splashT < 0 || !this.splash) return;
    this.splashT += dt / SPLASH_SEC;
    const so = this.splash.getSceneObject();
    if (this.splashT >= 1) {
      this.splashT = -1;
      so.enabled = false;
      return;
    }
    // Grows fast then eases, and thins out as it goes — a ripple, not a balloon.
    const f = 1 - Math.pow(1 - this.splashT, 3);
    const scale = 0.4 + f * 3.0;
    so.getTransform().setLocalScale(new vec3(scale, scale, 1));
    const k = 1 - this.splashT;
    this.splash.mainMaterial.mainPass.baseColor = new vec4(
      this.onLineColor.x * k, this.onLineColor.y * k, this.onLineColor.z * k, this.onLineColor.w
    );
  }

  private discardLive(): void {
    for (let i = 0; i < this.live.length; i++) this.live[i].sceneObject.destroy();
    this.live = [];
    this.drawing = false;
    this.lastBands = [];
    this.livePoints = [];
    this.pendingStart = null;
    this.smoothed = null;
  }

  /** Hide the band ribbons without destroying them, ready for the next stroke. */
  private hideLive(): void {
    for (let i = 0; i < this.live.length; i++) this.live[i].enabled = false;
  }

  // ── Per-frame ─────────────────────────────────────────────────────────────

  private onUpdate(): void {
    const dt = getDeltaTime();
    this.elapsed += dt;
    this.updateSplash(dt);

    // Rejected ink fades out. The display is additive, so fading toward black
    // IS fading toward invisible.
    for (let i = this.fading.length - 1; i >= 0; i--) {
      const f = this.fading[i];
      f.t += dt / 0.45;
      if (f.t >= 1) {
        f.ribbon.sceneObject.destroy();
        this.fading.splice(i, 1);
        continue;
      }
      // Shiver, then evaporate. The sideways tremor is what makes rejected ink
      // read as drying away rather than as simply being switched off; it dies
      // out as the ink does, so the last thing seen is a fade, not a twitch.
      const k = 1 - f.t;
      f.ribbon.setColor(new vec4(f.from.x * k, f.from.y * k, f.from.z * k, f.from.w));
      const shake = Math.sin(this.elapsed * 46) * 0.085 * k;
      f.ribbon.sceneObject.getTransform().setLocalPosition(new vec3(shake, 0, 0));
    }

    if (this.pulse && this.pulseOn) {
      const k = 0.45 + 0.55 * (0.5 + 0.5 * Math.sin(this.elapsed * 6.0));
      this.pulse.mainMaterial.mainPass.baseColor = new vec4(
        this.pulseColor.x * k,
        this.pulseColor.y * k,
        this.pulseColor.z * k,
        this.pulseColor.w
      );
    }
  }

  // ── Start-point pulse ─────────────────────────────────────────────────────


  /**
   * Tell the input layer where the current stroke begins, so the bridge's
   * relative mode can anchor there. Null whenever no stroke is waiting, which
   * makes relative mode fall back to absolute rather than anchoring to a stale
   * point from the previous stroke.
   */
  private publishStrokeStart(): void {
    if (!this.pinchInput) return;
    if (!this.active || !this.glyph || this.strokeIndex >= this.glyph.strokeCount) {
      this.pinchInput.strokeStart = null;
      return;
    }
    const st = this.glyph.strokes[this.strokeIndex].start;
    this.pinchInput.strokeStart = { x: st.x, y: st.y };
  }

  private setPulse(on: boolean): void {
    this.pulseOn = on;
    if (!on) {
      this.pulseAt = null;
      if (this.pulse) this.pulse.getSceneObject().enabled = false;
      return;
    }
    if (!this.glyph || !this.sheet) return;
    // The Fix step points at the part that went wrong, falling back to the
    // stroke's start only when there is no band to blame (a stroke too short
    // to grade). "This bit, here" beats "begin again".
    const start = this.pulseAt || this.glyph.strokes[this.strokeIndex].start;
    if (!this.pulse) {
      const w = 0.22;
      const r = 0.75;
      // A small open square ring at the stroke's start point.
      this.pulse = createQuads(
        this.sheet.inkRoot,
        "StartPulse",
        [
          { x: 0, y: r, w: r * 2, h: w },
          { x: 0, y: -r, w: r * 2, h: w },
          { x: -r, y: 0, w: w, h: r * 2 },
          { x: r, y: 0, w: w, h: r * 2 },
        ],
        this.pulseColor,
        0.02
      );
    }
    const so = this.pulse.getSceneObject();
    so.enabled = true;
    so.getTransform().setLocalPosition(new vec3(start.x, start.y, 0.02));
  }
}
