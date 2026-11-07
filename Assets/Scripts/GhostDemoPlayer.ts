/**
 * GhostDemoPlayer — the ghost brush writing a character, stroke by stroke.
 *
 * Owns:  the demonstration sequence. Builds one InkRibbon per stroke in the
 *        sheet's guide layer, advances the brush along each stroke at constant
 *        arc-length speed, pauses between strokes, then fades the finished ink
 *        down to the pale guide outline that stays on the sheet for the user's
 *        turn. Parks the brush at the start of stroke 1 when it is done.
 * Must not: touch the UI, play audio, or decide which character comes next —
 *        it emits events and GhostMain does those. That keeps the data flow
 *        one-way: Main owns state, the player renders it, the UI displays it.
 *
 * The demo ribbons are built in the sheet's GUIDE layer on purpose: they begin
 * as wet ink and settle into the guide. The sheet's separate `inkRoot` sits in
 * front of them and is reserved for the user's own strokes.
 */

import Event, { PublicApi } from "SpectaclesInteractionKit.lspkg/Utils/Event";
import { GlyphPath } from "./GhostKanaPath";
import { createBrush, InkRibbon } from "./GhostInkRibbon";
import { GhostSheet } from "./GhostSheet";

type Phase = "idle" | "stroke" | "pause" | "fade";

@component
export class GhostDemoPlayer extends BaseScriptComponent {
  @ui.label('<span style="color: #60A5FA;">GhostDemoPlayer &ndash; the ghost brush writes a character</span>')
  @ui.separator

  @ui.label('<span style="color: #60A5FA;">References</span>')
  @ui.group_start("References")
  @input
  @hint("The practice sheet this player draws onto. Supplies the guide/ink/brush layers and the sheet size.")
  sheet!: GhostSheet;
  @ui.group_end

  @ui.separator
  @ui.label('<span style="color: #60A5FA;">Settings</span>')
  @ui.group_start("Settings")
  @input
  @hint("Centimetres per 1.0 of normalised character height. 15 makes あ about 10.5 cm tall on a 15 cm sheet.")
  @widget(new SliderWidget(5, 24, 0.5))
  glyphUnitCm: number = 15.0;

  @input
  @hint("Seconds the brush takes to draw one stroke at normal speed.")
  @widget(new SliderWidget(0.3, 3.0, 0.05))
  strokeDurationSec: number = 1.0;

  @input
  @hint("Quiet beat between strokes, in seconds, so each stroke reads as a separate movement.")
  @widget(new SliderWidget(0, 1.5, 0.05))
  interStrokePauseSec: number = 0.3;

  @input
  @hint("Speed factor used by the Slower tab. 0.5 = half speed.")
  @widget(new SliderWidget(0.2, 1.0, 0.05))
  slowerSpeedMultiplier: number = 0.5;

  @input("vec4", "{1,0.95,0.86,1}")
  @hint("Wet ink colour. The display is additive, so ink must be a WARM OFF-WHITE LIGHT — black sumi would simply be invisible on glass.")
  @widget(new ColorWidget())
  inkColor: vec4;

  @input("vec4", "{0.42,0.39,0.33,1}")
  @hint("Colour the ink settles to after the demo — the guide the user traces. 'Pale grey' means a DIMMED warm white, still emitted light.")
  @widget(new ColorWidget())
  guideColor: vec4;

  @input
  @hint("Brush stroke thickness at its fullest, in cm. Ends taper automatically.")
  @widget(new SliderWidget(0.15, 1.5, 0.05))
  inkWidthCm: number = 0.55;

  @input
  @hint("Seconds for the finished ink to fade down into the pale guide outline.")
  @widget(new SliderWidget(0.1, 2.0, 0.05))
  fadeSeconds: number = 0.5;
  @ui.group_end

  private glyph: GlyphPath | null = null;
  private ribbons: InkRibbon[] = [];
  private brush: SceneObject | null = null;
  private phase: Phase = "idle";
  private strokeIndex = 0;
  private phaseT = 0;
  private speed = 1;
  /** Which ribbons the end-of-demo fade applies to. */
  private fadeTargets: number[] = [];
  /** >= 0 when re-demonstrating one stroke after repeated misses. */
  private singleStroke = -1;

  private readonly _onStrokeStarted = new Event<number>();
  private readonly _onDemoFinished = new Event<void>();

  /** Fires with the 0-based stroke index the moment the brush touches down. */
  get onStrokeStarted(): PublicApi<number> {
    return this._onStrokeStarted.publicApi();
  }

  /** Fires once the ink has settled into the guide and the brush is parked. */
  get onDemoFinished(): PublicApi<void> {
    return this._onDemoFinished.publicApi();
  }

  get slowerSpeed(): number {
    return this.slowerSpeedMultiplier;
  }

  onAwake(): void {
    this.createEvent("UpdateEvent").bind(() => this.onUpdate());
  }

  /** Clear any previous character and lay out ribbons for a new one. */
  setGlyph(glyph: GlyphPath | null): void {
    this.stop();
    this.clearRibbons();
    this.glyph = glyph;
    if (!glyph || !this.sheet) return;

    for (let i = 0; i < glyph.strokes.length; i++) {
      const r = new InkRibbon(
        this.sheet.guideRoot,
        "Stroke" + i,
        this.inkColor,
        this.inkWidthCm,
        i * 0.002 // hair of separation so overlapping strokes do not z-fight
      );
      r.setStroke(glyph.strokes[i]);
      r.setProgress(0);
      this.ribbons.push(r);
    }

    this.ensureBrush();
    this.parkBrush();
  }

  /** Run the demonstration. `slow` halves the speed for the Slower tab. */
  play(slow: boolean): void {
    if (!this.glyph || this.ribbons.length === 0) return;
    this.speed = slow ? Math.max(0.05, this.slowerSpeedMultiplier) : 1;

    for (let i = 0; i < this.ribbons.length; i++) {
      this.ribbons[i].setColor(this.inkColor);
      this.ribbons[i].setProgress(0);
    }
    this.ensureBrush();
    if (this.brush) this.brush.enabled = true;

    this.singleStroke = -1;
    this.fadeTargets = [];
    for (let i = 0; i < this.ribbons.length; i++) this.fadeTargets.push(i);
    this.strokeIndex = 0;
    this.beginStroke(0);
  }

  /**
   * Re-demonstrate ONE stroke, leaving the rest of the guide untouched.
   * The brief asks for this after three misses on the same stroke: a quiet
   * reminder of that movement, not a restart of the whole character.
   */
  playSingle(index: number, slow: boolean): void {
    if (!this.glyph || index < 0 || index >= this.ribbons.length) return;
    this.speed = slow ? Math.max(0.05, this.slowerSpeedMultiplier) : 1;

    for (let i = 0; i < this.ribbons.length; i++) {
      this.ribbons[i].setColor(this.guideColor);
      this.ribbons[i].setProgress(1);
    }
    this.ribbons[index].setColor(this.inkColor);
    this.ribbons[index].setProgress(0);

    this.ensureBrush();
    if (this.brush) this.brush.enabled = true;

    this.singleStroke = index;
    this.fadeTargets = [index];
    this.beginStroke(index);
  }

  stop(): void {
    this.phase = "idle";
    this.phaseT = 0;
  }

  /** Jump straight to the settled guide outline, no animation. */
  showGuideOnly(): void {
    this.stop();
    for (let i = 0; i < this.ribbons.length; i++) {
      this.ribbons[i].setColor(this.guideColor);
      this.ribbons[i].setProgress(1);
    }
    this.parkBrush();
  }

  private beginStroke(index: number): void {
    this.strokeIndex = index;
    this.phase = "stroke";
    this.phaseT = 0;
    this.ribbons[index].setProgress(0);
    this.moveBrushTo(index, 0);
    this._onStrokeStarted.invoke(index);
  }

  private onUpdate(): void {
    if (this.phase === "idle" || !this.glyph) return;
    const dt = getDeltaTime();
    this.phaseT += dt;

    if (this.phase === "stroke") {
      const dur = Math.max(0.05, this.strokeDurationSec / this.speed);
      const t = Math.min(1, this.phaseT / dur);
      this.ribbons[this.strokeIndex].setProgress(t);
      this.moveBrushTo(this.strokeIndex, t);
      if (t >= 1) {
        this.phase = "pause";
        this.phaseT = 0;
      }
      return;
    }

    if (this.phase === "pause") {
      if (this.phaseT >= this.interStrokePauseSec / this.speed) {
        const next = this.strokeIndex + 1;
        if (this.singleStroke >= 0) {
          this.phase = "fade";
          this.phaseT = 0;
        } else if (next < this.ribbons.length) {
          this.beginStroke(next);
        } else {
          this.phase = "fade";
          this.phaseT = 0;
        }
      }
      return;
    }

    // fade: wet ink settles into the pale guide the user will trace
    const f = Math.min(1, this.phaseT / Math.max(0.05, this.fadeSeconds));
    const c = new vec4(
      this.inkColor.x + (this.guideColor.x - this.inkColor.x) * f,
      this.inkColor.y + (this.guideColor.y - this.inkColor.y) * f,
      this.inkColor.z + (this.guideColor.z - this.inkColor.z) * f,
      this.inkColor.w + (this.guideColor.w - this.inkColor.w) * f
    );
    for (let k = 0; k < this.fadeTargets.length; k++) {
      this.ribbons[this.fadeTargets[k]].setColor(c);
    }
    if (f >= 1) {
      this.phase = "idle";
      if (this.singleStroke >= 0) {
        this.parkBrushAt(this.singleStroke);
        this.singleStroke = -1;
      } else {
        this.parkBrush();
      }
      this._onDemoFinished.invoke();
    }
  }

  private ensureBrush(): void {
    if (this.brush || !this.sheet) return;
    // Brush size is derived from the ink width rather than exposed separately:
    // a brush that does not match the stroke it lays down reads as wrong.
    this.brush = createBrush(
      this.sheet.brushRoot,
      this.inkWidthCm * 4.0,
      this.inkWidthCm * 1.5,
      this.inkColor,
      0
    );
  }

  private moveBrushTo(strokeIndex: number, t: number): void {
    if (!this.brush || !this.glyph) return;
    const p = this.glyph.strokes[strokeIndex].pointAt(t);
    this.brush.getTransform().setLocalPosition(new vec3(p.x, p.y, 0));
  }

  /** Rest the brush at the start of stroke 1, ready for the user's turn. */
  private parkBrush(): void {
    this.parkBrushAt(0);
  }

  /** Rest the brush at the start of a given stroke. */
  parkBrushAt(index: number): void {
    if (!this.glyph || this.glyph.strokes.length === 0) return;
    const i = Math.max(0, Math.min(this.glyph.strokes.length - 1, index));
    this.ensureBrush();
    if (!this.brush) return;
    this.brush.enabled = true;
    const p = this.glyph.strokes[i].start;
    this.brush.getTransform().setLocalPosition(new vec3(p.x, p.y, 0));
  }

  /** Hide the brush while the user is writing — their hand is the brush now. */
  setBrushVisible(on: boolean): void {
    if (this.brush) this.brush.enabled = on;
  }

  private clearRibbons(): void {
    for (let i = 0; i < this.ribbons.length; i++) {
      this.ribbons[i].sceneObject.destroy();
    }
    this.ribbons = [];
  }
}
