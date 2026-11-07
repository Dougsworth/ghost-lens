/**
 * GhostChordDot — one numbered ink dot on the fretboard, and its pinch target.
 *
 * Owns:  the dot's geometry (ink circle plus its finger number), its four
 *        visual states, and the SIK Interactable that makes it pinchable in
 *        Interactive Preview, over the webcam bridge and on SPECS.
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
  private inkColor: vec4;
  private guideColor: vec4;
  private state: DotState = "hidden";
  private pulseT = 0;

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
    inkColor: vec4,
    guideColor: vec4
  ) {
    this.finger = finger;
    this.xCm = xCm;
    this.yCm = yCm;
    this.inkColor = inkColor;
    this.guideColor = guideColor;

    const so = global.scene.createSceneObject("ChordDot" + finger);
    so.setParent(parent);
    so.getTransform().setLocalPosition(new vec3(xCm, yCm, 0.12));
    this.sceneObject = so;

    this.ink = createDot(so, "DotInk", radiusCm, guideColor, 0, 26);

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
      if (this.state === "live") this.ink.mainMaterial.mainPass.baseColor = this.inkColor;
    });

    this.setState("hidden");
  }

  setState(state: DotState): void {
    this.state = state;
    this.sceneObject.enabled = state !== "hidden";
    this.pulseT = 0;

    const pass = this.ink.mainMaterial.mainPass;
    if (state === "guide") {
      pass.baseColor = this.guideColor;
      this.numberText.textFill.color = new vec4(0.06, 0.055, 0.045, 1);
    } else {
      pass.baseColor = this.inkColor;
      this.numberText.textFill.color = new vec4(0.10, 0.09, 0.07, 1);
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

  destroy(): void {
    this.sceneObject.destroy();
  }
}
