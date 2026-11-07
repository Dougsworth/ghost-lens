/**
 * GhostChordDot — one numbered finger circle on the neck, and its pinch target.
 *
 * Owns:  the circle's geometry (a coloured disc plus its finger number), its
 *        four visual states, and the SIK Interactable that makes it pinchable
 *        in Interactive Preview, over the webcam bridge and on SPECS.
 * Must not: know the chord, the order, or what happens when it is pinched. It
 *        reports a pinch and renders the state it is told to be in.
 *
 * This is 3D scene content, not a UI panel: a finger position on an instrument,
 * drawn as ink on paper. So it is built from GhostInkRibbon's mesh helpers plus
 * a raw collider and Interactable rather than from a UIKit Button — a rounded
 * rectangle plate is the wrong object for a brush dot. LEAF still finds it,
 * because LEAF looks for SIK Interactables however they were made.
 *
 * The hit box is deliberately much larger than the ink: about 2.6 cm across a
 * 2.1 cm dot, inside the narrowest 5.3 cm fret cell. The brief asks for "large
 * forgiving pinch targets", and nothing is gained by making a learner land
 * precisely on a mark they are being taught to find.
 */

import { Interactable } from "SpectaclesInteractionKit.lspkg/Components/Interaction/Interactable/Interactable";
import Event, { PublicApi } from "SpectaclesInteractionKit.lspkg/Utils/Event";
import { createDot } from "./GhostInkRibbon";
import { fingerColor } from "./GhostGuitarPack";

/** How a dot is reading right now. */
export type DotState =
  /** Not drawn at all. */
  | "hidden"
  /** Drawn dim: the ghost has shown it, the user has not reached it yet. */
  | "guide"
  /** The one the user should pinch next. Full ink, breathing. */
  | "live"
  /** Done. Full ink, still. */
  | "placed";

const FONT_SIZE_SCALE = 1.0;
const PANEL_DISTANCE_CM = 45;
/** Matches the "Caption" role the kana pack numbers its strokes with. */
const NUMBER_SIZE = 38 * FONT_SIZE_SCALE * (PANEL_DISTANCE_CM / 110);

export class GhostChordDot {
  readonly sceneObject: SceneObject;
  /** Which finger this is: 1 index, 2 middle, 3 ring, 4 little. */
  readonly finger: number;
  /** Board-local position, in cm. */
  readonly xCm: number;
  readonly yCm: number;

  private ink: RenderMeshVisual;
  private numberText: Text;
  private interactable: Interactable;
  /** This finger's own hue, so neighbouring circles are told apart by colour. */
  private liveColor: vec4;
  private guideColor: vec4;
  private state: DotState = "hidden";
  private pulseT = 0;
  private radiusCm = 0.58;

  private readonly _onPinched = new Event<number>();

  /** Fires with this dot's finger number when the user pinches it. */
  get onPinched(): PublicApi<number> {
    return this._onPinched.publicApi();
  }

  constructor(
    parent: SceneObject,
    finger: number,
    xCm: number,
    yCm: number,
    radiusCm: number,
    guideColor: vec4
  ) {
    this.finger = finger;
    this.xCm = xCm;
    this.yCm = yCm;
    // A circle's colour IS its identity here: four fingers, four hues, so the
    // learner can match circle to finger without reading the number first.
    this.liveColor = fingerColor(finger);
    this.guideColor = guideColor;

    const so = global.scene.createSceneObject("ChordDot" + finger);
    so.setParent(parent);
    so.getTransform().setLocalPosition(new vec3(xCm, yCm, 0.12));
    this.sceneObject = so;

    this.ink = createDot(so, "DotInk", radiusCm, guideColor, 0, 26);
    this.radiusCm = radiusCm;

    // The finger number, sitting on top of the ink.
    const numSO = global.scene.createSceneObject("DotNumber");
    numSO.setParent(so);
    numSO.getTransform().setLocalPosition(new vec3(0, 0, 0.06));
    const t = numSO.createComponent("Component.Text") as Text;
    t.text = String(finger);
    t.depthTest = true;
    t.size = NUMBER_SIZE;
    t.weight = 700;
    // The number is drawn in PAPER, not ink: on an additive display it cannot
    // be punched out of the dot, so it is a dimmer value sitting over a bright
    // one, which is what reads as a numeral on a brush mark.
    t.textFill.color = new vec4(0.10, 0.09, 0.07, 1);
    t.horizontalAlignment = HorizontalAlignment.Center;
    t.verticalAlignment = VerticalAlignment.Center;
    t.horizontalOverflow = HorizontalOverflow.Overflow;
    t.verticalOverflow = VerticalOverflow.Overflow;
    t.layoutRect = Rect.create(-0.7, 0.7, -0.6, 0.6);
    this.numberText = t;

    // Hit box: a flat slab in the board plane, well wider than the ink.
    const collider = so.createComponent("Physics.ColliderComponent") as ColliderComponent;
    const box = Shape.createBoxShape();
    const reach = Math.max(2.4, radiusCm * 2.5);
    box.size = new vec3(reach, reach, 1.2);
    collider.shape = box;
    collider.debugDrawEnabled = false;

    // Created long after OnStart (the turn is already running), so this
    // component's own lifecycle has already run inline and binding here is
    // correct — the "subscribe inside OnStartEvent" rule is about components
    // that exist at scene load.
    this.interactable = so.createComponent(Interactable.getTypeName()) as Interactable;
    this.interactable.onTriggerEnd.add(() => {
      if (this.state === "live") this._onPinched.invoke(this.finger);
    });
    this.interactable.onHoverEnter.add(() => {
      if (this.state === "live") this.ink.mainMaterial.mainPass.baseColor = this.liveColor;
    });

    this.setState("hidden");
  }

  setState(state: DotState): void {
    this.state = state;
    this.sceneObject.enabled = state !== "hidden";
    this.pulseT = 0;

    const pass = this.ink.mainMaterial.mainPass;
    if (state === "guide") {
      // Waiting its turn: the finger's own hue, dimmed, so the shape of the
      // whole chord is visible from the start without competing with the step
      // the user is actually on.
      pass.baseColor = this.fade(this.liveColor, 0.4);
      this.numberText.textFill.color = new vec4(0.05, 0.045, 0.04, 1);
    } else {
      pass.baseColor = this.liveColor;
      this.numberText.textFill.color = new vec4(0.08, 0.07, 0.055, 1);
    }
    if (state !== "live") {
      this.sceneObject.getTransform().setLocalScale(vec3.one());
    }
  }

  get currentState(): DotState {
    return this.state;
  }

  /** Board-local distance from a point to this dot, in cm. */
  distanceTo(xCm: number, yCm: number): number {
    const dx = xCm - this.xCm;
    const dy = yCm - this.yCm;
    return Math.sqrt(dx * dx + dy * dy);
  }

  /**
   * A slow breath on the live dot — the brief's "start point pulse", reused.
   * Scale only: brightening and dimming ink on an additive display reads as a
   * flicker, while a size change reads as something waiting for you.
   */
  update(dt: number): void {
    if (this.state !== "live") return;
    this.pulseT += dt;
    const s = 1 + 0.12 * Math.sin(this.pulseT * 3.4);
    this.sceneObject.getTransform().setLocalScale(new vec3(s, s, 1));
  }

  private fade(c: vec4, f: number): vec4 {
    return new vec4(c.x * f, c.y * f, c.z * f, c.w);
  }

  destroy(): void {
    this.sceneObject.destroy();
  }
}
