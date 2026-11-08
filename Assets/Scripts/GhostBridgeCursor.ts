/**
 * GhostBridgeCursor — a soft fingertip dot for the webcam bridge.
 *
 * Owns:  showing WHERE the bridge thinks your index fingertip is, on the sheet,
 *        at all times — not only while pinching. Without it the bridge is
 *        invisible until ink appears, so a pinch that lands off the paper looks
 *        identical to a pinch that was never detected.
 * Must not: paint, score, or feed input. It is a read-only mirror of the
 *        bridge's own state; GhostPinchInput remains the only input path.
 *
 * The dot brightens while pinching, so "tracked" and "painting" are two clearly
 * different states. On the additive display both are emitted light, so the
 * difference is brightness, never a dark/light swap — a dim dot is the resting
 * state and cannot be rendered as "grey".
 *
 * Stroke data credit: KanjiVG by Ulrich Apel, CC BY-SA 3.0.
 */

import { createDot } from "./GhostInkRibbon";
import { GhostPinchInput } from "./GhostPinchInput";
import { WebcamHandBridge } from "./WebcamHandBridge";
import { GhostHandInteractor } from "./GhostHandInteractor";

/** Press feedback: how long the pop / dip lasts, and how big the pop gets. */
const PRESS_FLASH_SEC = 0.32;
const PRESS_POP = 1.9;
const MISS_FLASH_SEC = 0.22;

@component
export class GhostBridgeCursor extends BaseScriptComponent {
  @ui.label('<span style="color: #60A5FA;">GhostBridgeCursor &ndash; webcam fingertip dot</span>')
  @ui.separator

  @ui.label('<span style="color: #60A5FA;">References</span>')
  @ui.group_start("References")
  @input
  @hint("The practice sheet. The dot is parented here and positioned in its local centimetres.")
  surface!: SceneObject;

  @input
  @hint("Optional. In the bridge's relative mode the brush is NOT under your hand, so while pinching the cursor follows the brush instead. Leave empty to always show the raw fingertip.")
  pinchInput: GhostPinchInput;
  @ui.group_end

  @ui.separator
  @ui.label('<span style="color: #60A5FA;">Appearance</span>')
  @ui.group_start("Appearance")
  @input
  @hint("Dot radius in cm. Big enough to find, small enough not to hide the stroke you are tracing.")
  @widget(new SliderWidget(0.1, 1.5, 0.05))
  radiusCm: number = 0.45;

  @input
  @hint("Resting colour while the fingertip is tracked but not pinching. Additive: this is emitted light.")
  @widget(new ColorWidget())
  idleColor: vec4 = new vec4(0.55, 0.52, 0.45, 1);

  @input
  @hint("Colour while pinching. Brighter than the resting colour, so 'painting' is obvious.")
  @widget(new ColorWidget())
  pinchColor: vec4 = new vec4(1.0, 0.95, 0.86, 1);

  @input
  @hint("Flash colour when a pinch presses a button. Distinct from the pinch colour so 'pressed' cannot be mistaken for 'pinching'.")
  @widget(new ColorWidget())
  pressColor: vec4 = new vec4(0.55, 0.95, 1.0, 1);

  @input
  @hint("How far in front of the sheet the dot floats, in cm. Keeps it above the paper, grid and ink.")
  liftCm: number = 0.16;
  @ui.group_end

  private dot: RenderMeshVisual | null = null;
  private dotObj: SceneObject | null = null;

  onAwake(): void {
    this.createEvent("OnStartEvent").bind(() => this.onStart());
    this.createEvent("UpdateEvent").bind(() => this.onUpdate());
  }

  private onStart(): void {
    if (!this.surface) {
      print("[GhostBridgeCursor] ERROR: surface not wired; no fingertip dot.");
      return;
    }
    this.dot = createDot(this.surface, "BridgeCursor", this.radiusCm, this.idleColor, this.liftCm);
    this.dotObj = this.dot.getSceneObject();
    this.dotObj.enabled = false;
  }

  /**
   * Follow the cursor onto a different surface.
   *
   * The dot is PARENTED to the surface so it inherits its transform, which
   * means a surface change is a re-parent, not just a maths change. Re-parented
   * rather than rebuilt so the mesh and material survive the switch.
   */
  setSurface(obj: SceneObject): void {
    if (!obj || this.surface === obj) return;
    this.surface = obj;
    if (this.dotObj) {
      this.dotObj.setParent(obj);
      // Hide for a frame: the old local position means nothing on the new
      // surface, and showing it there would flash the dot in the wrong place.
      this.dotObj.enabled = false;
    }
  }

  private onUpdate(): void {
    if (!this.dot || !this.dotObj || !this.surface) return;

    const bridge = WebcamHandBridge.instance;
    const tip = bridge && bridge.connected ? bridge.fingertipWorld : null;
    if (!tip) {
      // No bridge, no hand, or the hand left the frame: show nothing rather
      // than freezing the dot where it was last seen, which would read as a
      // tracked finger that has stopped moving.
      if (this.dotObj.enabled) this.dotObj.enabled = false;
      return;
    }

    // While a bridge pinch is active in relative mode the brush is offset from
    // the hand, so showing the raw fingertip would point at empty paper while
    // ink appears elsewhere. Hovering (no pinch) still shows the real position.
    let lx: number;
    let ly: number;
    const emitted = this.pinchInput && this.pinchInput.bridgePinching
      ? this.pinchInput.lastEmitted
      : null;
    if (emitted) {
      lx = emitted.x;
      ly = emitted.y;
    } else {
      // Hovering: show where the hand is AIMING (the bridge's UI point, the
      // same one GhostHandInteractor targets with), so the dot sits on the
      // button that a pinch will press, tabs included.
      const aim = bridge.uiPointWorld || tip;
      const st = this.surface.getTransform();
      const local = st.getInvertedWorldTransform().multiplyPoint(aim);
      lx = local.x;
      ly = local.y;
    }
    this.dotObj.getTransform().setLocalPosition(new vec3(lx, ly, this.liftCm));
    if (!this.dotObj.enabled) this.dotObj.enabled = true;

    // Press feedback. A pinch that lands on a button pops the dot (bigger,
    // cyan) for a third of a second; a pinch on nothing dips it smaller, so
    // "I pinched and nothing happened" is visibly different from "my pinch
    // was not seen at all".
    const now = getTime();
    const sincePress = now - GhostHandInteractor.lastPressAt;
    const sinceMiss = now - GhostHandInteractor.lastMissAt;
    let scale = 1;
    let color = bridge.isPinching ? this.pinchColor : this.idleColor;
    if (sincePress >= 0 && sincePress < PRESS_FLASH_SEC) {
      scale = 1 + (PRESS_POP - 1) * Math.sin(Math.PI * sincePress / PRESS_FLASH_SEC);
      color = this.pressColor;
    } else if (sinceMiss >= 0 && sinceMiss < MISS_FLASH_SEC) {
      scale = 1 - 0.4 * Math.sin(Math.PI * sinceMiss / MISS_FLASH_SEC);
    }
    this.dotObj.getTransform().setLocalScale(new vec3(scale, scale, scale));
    const pass = this.dot.mainMaterial.mainPass;
    pass.baseColor = color;
  }
}
