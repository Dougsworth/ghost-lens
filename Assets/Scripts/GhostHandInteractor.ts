/**
 * GhostHandInteractor — your real hand drives everything, not just the brush.
 *
 * Owns:  turning the webcam bridge's hand into a first-class SIK Interactor,
 *        so a pinch in front of your camera presses whatever it is pointing
 *        at: the front door's suggestions, the mic, the notebook covers, the
 *        bookmark tabs, the guitar pack's finger circles. Anything that is a
 *        UIKit Button or a SIK Interactable, with no per-control wiring.
 * Must not: paint, or know what any particular control does. GhostPinchInput
 *        still owns the brush, and this file does not touch it.
 *
 * ── Why a real Interactor and not a raycast-and-call ────────────────────────
 * The tempting shortcut is to raycast, find the Button, and invoke its action
 * directly. That "works" and is wrong: hover states never fire, so nothing
 * lights up under your hand; UIKit's own press visuals never run; and every
 * control needs to be the exact type you guessed at. SIK already solves all of
 * that — it just needs an Interactor to ask. So this subclasses BaseInteractor
 * exactly as LEAF's own DefaultSikInteractor does, sets the target and the
 * trigger each frame, and lets SIK's InteractionManager dispatch hover, enter,
 * exit, trigger-start and trigger-end for free.
 *
 * The targeting is ours because the bridge gives a POINT, not a ray: we probe
 * from the camera through that point and take the nearest Interactable. SIK's
 * own providers assume a tracked hand or a mouse, neither of which this is.
 *
 * ── Safe by construction ────────────────────────────────────────────────────
 * It is additive. With the bridge absent, `enabled` off, or no hand in frame,
 * this reports no target and no trigger, which is indistinguishable from the
 * component not being there — so the mouse path in Interactive Preview is
 * untouched and cannot be broken by this file.
 */

import BaseInteractor from "SpectaclesInteractionKit.lspkg/Core/Interactor/BaseInteractor";
import {
  InteractorInputType,
  InteractorTriggerType,
  TargetingMode,
} from "SpectaclesInteractionKit.lspkg/Core/Interactor/Interactor";
import { Interactable } from "SpectaclesInteractionKit.lspkg/Components/Interaction/Interactable/Interactable";
import { InteractableHitInfo } from "SpectaclesInteractionKit.lspkg/Providers/TargetProvider/TargetProvider";
import WorldCameraFinderProvider from "SpectaclesInteractionKit.lspkg/Providers/CameraProvider/WorldCameraFinderProvider";
import { WebcamHandBridge } from "./WebcamHandBridge";

const IDLE_STRENGTH = 0;
const HOVER_STRENGTH = 0.2;
const TRIGGER_STRENGTH = 0.8;

@component
export class GhostHandInteractor extends BaseInteractor {
  @ui.label('<span style="color: #60A5FA;">GhostHandInteractor &ndash; your hand presses things, not just paints</span>')
  @ui.separator

  @ui.label('<span style="color: #60A5FA;">Settings</span>')
  @ui.group_start("Settings")
  @input
  @hint("Let the webcam bridge's hand drive the UI. Off leaves the mouse and real SIK hands completely untouched — this component then reports nothing at all.")
  handDrivesUI: boolean = true;

  @input
  @hint("How far the probe reaches from the camera, in cm. Everything GHOST shows sits within about a metre.")
  @widget(new SliderWidget(50, 400, 10))
  reachCm: number = 200;

  @input
  @hint("Ignore a new pinch within this many seconds of the last one ending. Hand tracking flickers at the threshold, and without this one physical pinch can fire a button twice.")
  @widget(new SliderWidget(0, 0.6, 0.05))
  debounceSec: number = 0.25;
  @ui.group_end

  private bridge: WebcamHandBridge | null = null;
  private handPoint: vec3 | null = null;
  private pinching = false;
  private hooked = false;
  private probe: any = null;
  private hitPoint: vec3 | null = null;
  /** When the last trigger ended, so a flicker cannot re-fire immediately. */
  private lastReleaseAt = -1;
  private triggerHeld = false;

  constructor() {
    super();
    // CustomController is what SIK calls an interactor that is neither one of
    // its tracked hands nor the editor mouse. LEAF's test interactor uses the
    // same type, which is the precedent for driving SIK from outside.
    this.inputType = InteractorInputType.CustomController;
  }

  onAwake(): void {
    // A global probe, not a collider overlap: the hand is a point in the air
    // and the thing it means to press is somewhere along the line from the eye
    // through it. That line is the whole interaction.
    this.probe = Physics.createGlobalProbe();
    this.probe.filter.includeStatic = true;
    this.probe.filter.includeDynamic = true;

    this.createEvent("OnStartEvent").bind(() => this.hookBridge());
    this.createEvent("UpdateEvent").bind(() => this.onUpdate());
  }

  /** The bridge appears when the tracker page connects, which may be late. */
  private hookBridge(): void {
    if (this.hooked) return;
    const b = WebcamHandBridge.instance;
    if (!b) return;
    this.bridge = b;
    b.onPinchStart.push((p: vec3) => {
      this.handPoint = p;
      this.pinching = true;
    });
    b.onPinchMove.push((p: vec3) => {
      this.handPoint = p;
    });
    b.onPinchEnd.push((p: vec3) => {
      this.handPoint = p;
      this.pinching = false;
    });
    this.hooked = true;
    print("[GhostHandInteractor] bridge hooked - your hand can press things.");
  }

  private onUpdate(): void {
    if (!this.hooked) this.hookBridge();

    if (!this.handDrivesUI || !this.handPoint) {
      this.clearTarget();
      return;
    }

    // Probe from the eye through the hand point and keep the nearest thing
    // that is, or sits under, an Interactable.
    const camT = WorldCameraFinderProvider.getInstance().getComponent().getTransform();
    const eye = camT.getWorldPosition();
    const dir = this.handPoint.sub(eye);
    if (dir.length < 1e-4) {
      this.clearTarget();
      return;
    }
    const end = eye.add(dir.normalize().uniformScale(this.reachCm));

    this.probe.rayCast(eye, end, (hit: any) => {
      if (!hit || !hit.collider) {
        this.clearTarget();
        return;
      }
      this.hitPoint = hit.position;
      const found = this.findInteractable(hit.collider.getSceneObject());
      this.setTarget(found);
    });
  }

  /** The Interactable on this object, or the nearest one above it. */
  private findInteractable(from: SceneObject): Interactable | null {
    let node: SceneObject | null = from;
    let guard = 0;
    while (node && guard < 32) {
      const i = node.getComponent(Interactable.getTypeName()) as Interactable;
      if (i && !isNull(i)) return i;
      node = node.getParent();
      guard++;
    }
    return null;
  }

  /**
   * Hand the target and the trigger to SIK, which does the rest.
   *
   * Trigger is only ever reported while something is actually targeted: a
   * pinch in empty air is not a press, and reporting one makes every UIKit
   * control flicker as the hand crosses the room.
   */
  private setTarget(interactable: Interactable | null): void {
    this.currentInteractable = interactable;

    // Debounce the RISING edge only.
    //
    // Hand tracking does not report a clean pinch: it flickers around the
    // threshold, so one physical pinch can close, open and close again within
    // a few frames. SIK faithfully turns each of those into a trigger, and a
    // button fires twice. Holding a pinch is unaffected — once a trigger is
    // live it stays live until the hand genuinely opens — and the release is
    // never debounced, because a release that gets swallowed leaves a control
    // stuck down, which is far worse than a double press.
    const now = getTime();
    let want = !!interactable && this.pinching;

    if (want && !this.triggerHeld) {
      if (this.lastReleaseAt >= 0 && now - this.lastReleaseAt < this.debounceSec) {
        want = false;
      }
    }
    if (!want && this.triggerHeld) {
      this.lastReleaseAt = now;
    }
    this.triggerHeld = want;

    this.currentTrigger = want ? InteractorTriggerType.Pinch : InteractorTriggerType.None;
  }

  private clearTarget(): void {
    this.hitPoint = null;
    // Tracking dropped or the hand left the frame. Release rather than leaving
    // a control held down forever; the tracker's own 150 ms grace means this
    // only fires when the hand is really gone.
    if (this.triggerHeld) {
      this.triggerHeld = false;
      this.lastReleaseAt = getTime();
    }
    if (this.currentInteractable !== null) this.currentInteractable = null;
    if (this.currentTrigger !== InteractorTriggerType.None) {
      this.currentTrigger = InteractorTriggerType.None;
    }
  }

  // ── BaseInteractor contract ───────────────────────────────────────────────
  // Mirrors LEAF's DefaultSikInteractor: the parts SIK genuinely reads are
  // real, and the parts only a tracked hand can answer return a safe constant
  // rather than a fabricated pose.

  get startPoint(): vec3 | null {
    return this.handPoint;
  }

  get endPoint(): vec3 | null {
    return this.hitPoint ?? this.handPoint;
  }

  get direction(): vec3 | null {
    if (!this.handPoint) return vec3.forward();
    const camT = WorldCameraFinderProvider.getInstance().getComponent().getTransform();
    const d = this.handPoint.sub(camT.getWorldPosition());
    return d.length > 1e-4 ? d.normalize() : vec3.forward();
  }

  get orientation(): quat | null {
    return quat.quatIdentity();
  }

  get distanceToTarget(): number | null {
    if (!this.handPoint || !this.hitPoint) return null;
    return this.hitPoint.distance(this.handPoint);
  }

  get targetHitPosition(): vec3 | null {
    return this.hitPoint ?? (this.currentInteractable?.getTransform().getWorldPosition() ?? null);
  }

  get targetHitInfo(): InteractableHitInfo | null {
    return null;
  }

  override get planecastPoint(): vec3 | null {
    return this.hitPoint ?? null;
  }

  get activeTargetingMode(): TargetingMode {
    return TargetingMode.Indirect;
  }

  get maxRaycastDistance(): number {
    return this.reachCm;
  }

  get interactionStrength(): number {
    if (this.currentTrigger !== InteractorTriggerType.None) return TRIGGER_STRENGTH;
    if (!isNull(this.currentInteractable)) return HOVER_STRENGTH;
    return IDLE_STRENGTH;
  }

  set drawDebug(debug: boolean) {}
  get drawDebug(): boolean {
    return false;
  }

  isTargeting(): boolean {
    return !isNull(this.currentInteractable);
  }

  isActive(): boolean {
    return this.handDrivesUI && this.handPoint !== null;
  }

  get isHoveringCurrentInteractable(): boolean {
    return this.currentInteractable !== null;
  }

  get hoveredInteractables(): Interactable[] {
    return this.currentInteractable ? [this.currentInteractable] : [];
  }

  /** SIK calls this when an Interactable is destroyed under us. */
  protected clearCurrentHitInfo(): void {
    this.hitPoint = null;
  }

  isHoveringInteractable(interactable: Interactable): boolean {
    return this.currentInteractable === interactable;
  }

  isHoveringInteractableHierarchy(interactable: Interactable): boolean {
    if (!this.currentInteractable) return false;
    let node: SceneObject | null = this.currentInteractable.getSceneObject();
    const target = interactable.getSceneObject();
    let guard = 0;
    while (node && guard < 32) {
      if (node === target) return true;
      node = node.getParent();
      guard++;
    }
    return false;
  }
}
