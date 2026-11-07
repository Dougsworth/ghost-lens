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
 * The brief's feedback rule is carried literally: no harsh error, no red X.
 * A miss is a gentle fade plus a pulse at the place to begin again.
 *
 * User ink lives in the sheet's inkRoot, which sits IN FRONT of the guide layer
 * the ghost left behind — so the user writes over the outline, not under it.
 */

import Event, { PublicApi } from "SpectaclesInteractionKit.lspkg/Utils/Event";
import { GlyphPath, Pt } from "./GhostKanaPath";
import { InkRibbon, createQuads } from "./GhostInkRibbon";
import { checkStroke, STROKE_PARTS } from "./GhostStrokeCheck";
import { GhostSheet } from "./GhostSheet";
import { GhostPinchInput } from "./GhostPinchInput";

type Fading = { ribbon: InkRibbon; t: number; from: vec4 };

/** A missed stroke: which one, why, and which part of it was furthest off. */
export type MissInfo = { index: number; reason: string; worstPart: number; parts: number };

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
  @hint("Colour of the pulsing marker that shows where to begin again after a miss.")
  @widget(new ColorWidget())
  pulseColor: vec4;

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

  private live: InkRibbon | null = null;
  private livePoints: Pt[] = [];
  private smoothed: Pt | null = null;
  private dried: InkRibbon[] = [];
  private fading: Fading[] = [];
  private pulse: RenderMeshVisual | null = null;
  private pulseOn = false;
  /** The guide piece the last miss was furthest from, lit up until the next try. */
  private worstGlow: InkRibbon | null = null;
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
   * Seconds since the user last did anything during their turn, 0 while a
   * pinch is in progress or the turn is not active. The "hint only" help level
   * shows the guide when this passes a threshold — help when stuck, not before.
   */
  get idleSeconds(): number {
    if (!this.active || this.live || this.pendingStart) return 0;
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
    this.clearWorstGlow();
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
    this.clearWorstGlow();
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
    this.live = null;
    this.setPulse(false);
    this.clearWorstGlow();
  }

  /** Create the ribbon on first real movement, starting at the armed point. */
  private armInk(): void {
    this.live = new InkRibbon(
      this.sheet.inkRoot,
      "UserStroke" + this.strokeIndex,
      this.wetInkColor,
      this.inkWidthCm,
      0.004 * this.strokeIndex
    );
  }

  private extendStroke(p: Pt): void {
    if (!this.active) return;
    if (!this.live && !this.pendingStart) return;

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
    if (!this.live) {
      const s0 = this.pendingStart;
      if (!s0) return;
      const ax = q.x - s0.x;
      const ay = q.y - s0.y;
      if (Math.sqrt(ax * ax + ay * ay) < this.armDistanceCm) return;
      this.armInk();
    }

    const last = this.livePoints[this.livePoints.length - 1];
    const dx = q.x - last.x;
    const dy = q.y - last.y;
    // Drop sub-millimetre jitter so the ribbon's normals stay stable.
    if (dx * dx + dy * dy < 0.0225) return;
    this.livePoints.push({ x: q.x, y: q.y });
    this.live.setRawPoints(this.livePoints);
  }

  private endStroke(p: Pt): void {
    if (!this.active || !this.glyph) return;
    this.lastActivity = getTime();
    // Armed but never moved: no ink, no attempt, no miss.
    if (!this.live) {
      this.discardLive();
      return;
    }
    const last = this.livePoints[this.livePoints.length - 1];
    if (p.x !== last.x || p.y !== last.y) {
      this.livePoints.push(p);
      this.live.setRawPoints(this.livePoints);
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

    if (verdict.ok) {
      // Dries into place and stays.
      this.live.setColor(this.driedInkColor);
      this.dried.push(this.live);
      this.live = null;
      this.livePoints = [];
      this.smoothed = null;
      this.misses = 0;
      this.setPulse(false);
      this.clearWorstGlow();

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

    // Miss: fade the ink away gently and pulse where to begin again.
    this.fading.push({ ribbon: this.live, t: 0, from: this.wetInkColor });
    this.live = null;
    this.livePoints = [];
    this.misses++;
    this.setPulse(true);
    // Light up only the piece that was furthest off — "just this part", not
    // the whole stroke. A reversed or too-short drag has no meaningful worst
    // piece, so the start-point pulse alone carries those.
    if (verdict.reason === "off") this.showWorstGlow(verdict.worstPoints);
    this._onStrokeMissed.invoke({
      index: this.strokeIndex,
      reason: verdict.reason,
      worstPart: verdict.worstPart,
      parts: STROKE_PARTS,
    });

    if (this.misses >= this.missesBeforeDemo) {
      this.misses = 0;
      this.active = false;
      if (this.pinchInput) this.pinchInput.accepting = false;
      this._onNeedsDemo.invoke(this.strokeIndex);
    }
  }

  private discardLive(): void {
    if (this.live) {
      this.live.sceneObject.destroy();
      this.live = null;
    }
    this.livePoints = [];
    this.pendingStart = null;
    this.smoothed = null;
  }

  // ── Per-frame ─────────────────────────────────────────────────────────────

  private onUpdate(): void {
    const dt = getDeltaTime();
    this.elapsed += dt;

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
      const k = 1 - f.t;
      f.ribbon.setColor(new vec4(f.from.x * k, f.from.y * k, f.from.z * k, f.from.w));
    }

    if (this.pulseOn) {
      const k = 0.45 + 0.55 * (0.5 + 0.5 * Math.sin(this.elapsed * 6.0));
      const c = new vec4(this.pulseColor.x * k, this.pulseColor.y * k, this.pulseColor.z * k, this.pulseColor.w);
      if (this.pulse) this.pulse.mainMaterial.mainPass.baseColor = c;
      if (this.worstGlow) this.worstGlow.setColor(c);
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

  private showWorstGlow(points: Pt[]): void {
    this.clearWorstGlow();
    if (!this.sheet || points.length < 2) return;
    this.worstGlow = new InkRibbon(this.sheet.inkRoot, "WorstPart", this.pulseColor, this.inkWidthCm * 1.4, 0.03);
    this.worstGlow.setRawPoints(points);
  }

  private clearWorstGlow(): void {
    if (this.worstGlow) {
      this.worstGlow.sceneObject.destroy();
      this.worstGlow = null;
    }
  }

  private setPulse(on: boolean): void {
    this.pulseOn = on;
    if (!on) {
      if (this.pulse) this.pulse.getSceneObject().enabled = false;
      return;
    }
    if (!this.glyph || !this.sheet) return;
    const start = this.glyph.strokes[this.strokeIndex].start;
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
