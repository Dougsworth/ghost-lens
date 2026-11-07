/**
 * GhostSheet — the 15 cm washi practice sheet.
 *
 * Owns:  the paper surface, its faint four-square practice grid, the scroll
 *        unroll animation, and the three child roots the demo draws into
 *        (guide ink behind, live ink in front, brush in front of that).
 * Must not: sequence the demo, read stroke data, or touch the UI. It is a
 *        surface, not a player.
 *
 * Additive display: the paper is a faint translucent cream LIGHT value, not a
 * bright panel and never a dark one. See GhostInkRibbon.makeAdditiveMaterial.
 */

import Event, { PublicApi } from "SpectaclesInteractionKit.lspkg/Utils/Event";
import { createQuads, createStamp, createWashiSheet, RectSpec } from "./GhostInkRibbon";

@component
export class GhostSheet extends BaseScriptComponent {
  @ui.label('<span style="color: #60A5FA;">GhostSheet &ndash; the 15 cm washi practice sheet</span>')
  @ui.separator

  @ui.label('<span style="color: #60A5FA;">Settings</span>')
  @ui.group_start("Settings")
  @input
  @hint("Side length of the square practice sheet, in cm. The brief's default is 15 cm at 45 cm from the user.")
  @widget(new SliderWidget(8, 24, 0.5))
  sheetSizeCm: number = 15.0;

  @input("vec4", "{0.26,0.23,0.17,1}")
  @hint("Washi paper colour. The display is additive, so this is emitted light: keep it a FAINT warm cream, never dark and never bright white.")
  @widget(new ColorWidget())
  paperColor: vec4;

  @input("vec4", "{0.40,0.37,0.30,1}")
  @hint("Practice-grid line colour — a touch brighter than the paper so the four squares read without competing with the ink.")
  @widget(new ColorWidget())
  gridColor: vec4;

  @input
  @hint("How far the paper's edge wanders in and out, in cm. Gives the sheet a torn, hand-made edge instead of a panel edge.")
  @widget(new SliderWidget(0, 0.5, 0.01))
  edgeJitterCm: number = 0.12;

  @input
  @hint("Seconds for the sheet to unroll down from its top edge when a notebook opens.")
  @widget(new SliderWidget(0.1, 2.0, 0.05))
  unrollSeconds: number = 0.65;

  @input("vec4", "{1,0.27,0.14,1}")
  @hint("Colour of the hanko stamp that lands on finished work. Additive display: an emitted vermilion, because a dark red would not show on glass at all.")
  @widget(new ColorWidget())
  stampColor: vec4;
  @ui.group_end

  /** Pale guide outline left behind after the demo — drawn behind the live ink. */
  guideRoot!: SceneObject;
  /** The wet ink the ghost brush is laying down right now. */
  inkRoot!: SceneObject;
  /** The brush itself, in front of everything. */
  brushRoot!: SceneObject;

  private root!: SceneObject;
  private unrollT = -1;
  private updateEvent: SceneEvent | null = null;
  private stamp: SceneObject | null = null;
  private stampT = -1;
  private turnT = -1;
  private liftCm = 0;
  private readonly _onUnrollComplete = new Event<void>();
  private readonly _onPageTurnComplete = new Event<void>();

  get onUnrollComplete(): PublicApi<void> {
    return this._onUnrollComplete.publicApi();
  }

  /** Fires once the finished page has rolled away and a fresh one can arrive. */
  get onPageTurnComplete(): PublicApi<void> {
    return this._onPageTurnComplete.publicApi();
  }

  get sizeCm(): number {
    return this.sheetSizeCm;
  }

  onAwake(): void {
    this.build();
    this.updateEvent = this.createEvent("UpdateEvent");
    this.updateEvent.bind(() => this.onUpdate());
    // Start collapsed; GhostMain unrolls it when a notebook is opened.
    this.applyUnroll(0);
    this.root.enabled = false;
  }

  private build(): void {
    this.root = global.scene.createSceneObject("SheetRoot");
    this.root.setParent(this.sceneObject);

    const size = this.sheetSizeCm;
    createWashiSheet(this.root, size, size, this.edgeJitterCm, this.paperColor, 0);

    // Four light squares: one vertical and one horizontal centre line, inside a
    // faint border — the familiar kana practice square.
    const t = size * 0.012;      // centre-cross weight
    const b = size * 0.009;      // border weight
    const half = size * 0.5;
    const inset = size * 0.045;  // border sits just inside the torn edge
    const span = size - inset * 2;
    const rects: RectSpec[] = [
      { x: 0, y: 0, w: t, h: span },
      { x: 0, y: 0, w: span, h: t },
      { x: 0, y: half - inset, w: span, h: b },
      { x: 0, y: -(half - inset), w: span, h: b },
      { x: half - inset, y: 0, w: b, h: span },
      { x: -(half - inset), y: 0, w: b, h: span },
    ];
    createQuads(this.root, "PracticeGrid", rects, this.gridColor, 0.02);

    // Draw order front-to-back is controlled by these Z offsets.
    this.guideRoot = this.child("GuideInk", 0.05);
    this.inkRoot = this.child("LiveInk", 0.08);
    this.brushRoot = this.child("Brush", 0.12);
  }

  private child(name: string, z: number): SceneObject {
    const so = global.scene.createSceneObject(name);
    so.setParent(this.root);
    so.getTransform().setLocalPosition(new vec3(0, 0, z));
    return so;
  }

  /** Unroll the sheet in from the top like a scroll. */
  showUnroll(): void {
    this.root.enabled = true;
    this.unrollT = 0;
    this.applyUnroll(0);
  }

  /** Show the sheet already fully unrolled (used on Replay, where it is on screen). */
  showImmediate(): void {
    this.root.enabled = true;
    this.unrollT = -1;
    this.applyUnroll(1);
  }

  hide(): void {
    this.unrollT = -1;
    this.turnT = -1;
    this.liftCm = 0;
    this.hideStamp();
    this.root.enabled = false;
  }

  /**
   * Land the red stamp in a corner of the finished sheet. It scales in from
   * oversize so it reads as a press, not a fade-in.
   */
  showStamp(): void {
    const size = this.sheetSizeCm * 0.17;
    const corner = this.sheetSizeCm * 0.5 - size * 0.75 - this.sheetSizeCm * 0.045;
    if (!this.stamp) {
      this.stamp = createStamp(this.root, size, this.stampColor, 0.14);
    }
    this.stamp.enabled = true;
    this.stamp.getTransform().setLocalPosition(new vec3(corner, -corner, 0.14));
    this.stampT = 0;
  }

  hideStamp(): void {
    this.stampT = -1;
    if (this.stamp) this.stamp.enabled = false;
  }

  /** Lift the finished sheet slightly, then roll it away upward. */
  playPageTurn(): void {
    this.turnT = 0;
  }

  private onUpdate(): void {
    // Stamp press: overshoot then settle.
    if (this.stampT >= 0 && this.stamp) {
      this.stampT += getDeltaTime() / 0.3;
      const f = Math.min(1, this.stampT);
      const k = f < 1 ? 1.9 - 0.9 * (1 - Math.pow(1 - f, 3)) : 1;
      this.stamp.getTransform().setLocalScale(new vec3(k, k, 1));
      if (f >= 1) this.stampT = -1;
    }

    // Page turn: a short lift, then roll away upward (the unroll, reversed).
    if (this.turnT >= 0) {
      this.turnT += getDeltaTime();
      const LIFT = 0.22;
      const ROLL = 0.45;
      if (this.turnT < LIFT) {
        this.liftCm = 1.2 * (this.turnT / LIFT);
        this.applyUnroll(1);
      } else if (this.turnT < LIFT + ROLL) {
        const f = (this.turnT - LIFT) / ROLL;
        this.applyUnroll(1 - (f * f));
      } else {
        this.turnT = -1;
        this.liftCm = 0;
        this.applyUnroll(0);
        this.root.enabled = false;
        this.hideStamp();
        this._onPageTurnComplete.invoke();
      }
      return;
    }

    if (this.unrollT < 0) return;
    this.unrollT += getDeltaTime() / Math.max(0.05, this.unrollSeconds);
    if (this.unrollT >= 1) {
      this.unrollT = -1;
      this.applyUnroll(1);
      this._onUnrollComplete.invoke();
      return;
    }
    // Ease out — the paper settles rather than snapping.
    const e = 1 - Math.pow(1 - this.unrollT, 3);
    this.applyUnroll(e);
  }

  /** Scale Y about the sheet's TOP edge so it appears to roll downward. */
  private applyUnroll(f: number): void {
    const sy = Math.max(0.0001, f);
    const tr = this.root.getTransform();
    tr.setLocalScale(new vec3(1, sy, 1));
    tr.setLocalPosition(new vec3(0, (this.sheetSizeCm * 0.5) * (1 - sy) + this.liftCm, 0));
  }
}
