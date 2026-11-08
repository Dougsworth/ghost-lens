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

/** Frames SIK needs to see trigger-end on a button before the target goes. */
const RELEASE_HOLD_FRAMES = 2;

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
  @hint("Log what the hand is pointing at and every targeting/trigger change. Turn on if pinching selects nothing.")
  debugHand: boolean = false;

  @input
  @hint("Ignore a new pinch within this many seconds of the last one ending. Hand tracking flickers at the threshold, and without this one physical pinch can fire a button twice.")
  @widget(new SliderWidget(0, 0.6, 0.05))
  debounceSec: number = 0.25;
  @ui.group_end

  private bridge: WebcamHandBridge | null = null;
  private handPoint: vec3 | null = null;
  private pinching = false;
  private handVisible = false;
  private raycastBusy = false;
  private hooked = false;
  private candidate: Interactable | null = null;
  private candidateFrames = 0;
  private lockedTarget: Interactable | null = null;
  private previousPinch = false;
  private raycastGeneration = 0;
  @input @hint("Consecutive frames on a button before hover is accepted. Reduces shaky targeting.") hoverConfirmFrames: number = 2;
  /**
   * What the hand is targeting/triggering NOW, staged here and applied in
   * updateState(). SIK's InteractionManager calls updateState() each frame,
   * which first copies current -> previous and then expects the interactor to
   * compute the new current; it fires TriggerStart/TriggerEnd by comparing
   * the two. Writing currentTrigger from our own UpdateEvent meant SIK's copy
   * always saw the new value already, previous === current every frame, and
   * no button ever received a press or a click.
   */
  private nextInteractable: Interactable | null = null;
  private nextTrigger: InteractorTriggerType = InteractorTriggerType.None;

  /** The last button that passed hover confirmation, and when. */
  private lastHovered: Interactable | null = null;
  private lastHoveredAt = -100;
  @input @hint("A pinch that registers this many seconds after the hand left a button still presses it. Closing the fingers moves the hand slightly, and the pinch is only recognised partway through that motion.") pinchGraceSec: number = 0.35;
  private probe: any = null;
  /** When the last press ended, so a flicker cannot re-fire immediately. */
  private lastReleaseAt = -100;
  /**
   * Frames the pressed button is kept targeted, trigger already dropped, after
   * the hand vanished mid-pinch. Dropping target and trigger on the same frame
   * reads to SIK as "the thing being pressed disappeared" (a cancel, not a
   * click); this way it sees a clean trigger-end on the button first.
   */
  private releaseHoldFrames = 0;
  /** Set true (e.g. from a LEAF test) to log every targeting/trigger change. */
  static debug = false;
  private lastDebug = "";
  private debugState(where: string): void {
    if (!GhostHandInteractor.debug) return;
    const n = (i: Interactable | null) => (i ? i.getSceneObject().name + "/" + (i.getSceneObject().getParent() ? i.getSceneObject().getParent().name : "") : "-");
    const line = `${where} hit=${n(this.candidate)}x${this.candidateFrames} cur=${n(this.nextInteractable)} ` +
      `pinch=${this.pinching} prev=${this.previousPinch} lock=${n(this.lockedTarget)} trig=${this.nextTrigger}`;
    if (line !== this.lastDebug) { this.lastDebug = line; print("[hand-dbg] " + line); }
  }
  private hitPoint: vec3 | null = null;

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

    if (this.debugHand) GhostHandInteractor.debug = true;
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

    // The bridge emits pinch callbacks only on transitions or while pinched.
    // Read its live fingertip EVERY frame so hovering works before a pinch.
    const live = this.bridge;
    this.handVisible = !!(live && live.hand && live.fingertipWorld);
    // Aim with the stable pinch point (thumb/index midpoint, wider reach);
    // fall back to the fingertip on bridges that do not provide it.
    this.handPoint = this.handVisible ? (live!.uiPointWorld || live!.fingertipWorld) : null;
    this.pinching = this.handVisible && !!live!.isPinching;

    if (!this.handDrivesUI || !this.handPoint) {
      this.resetInteraction();
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

    // Once a pinch begins, keep its original button targeted until release.
    // Without this, finger jitter causes a press to start on one button and
    // end on another (or nowhere), so UIKit never emits the click.
    if (this.lockedTarget) {
      this.setTarget(this.lockedTarget);
      if (!this.pinching) {
        // Keep the release on the same button for this frame.
        this.lockedTarget = null;
        this.lastReleaseAt = getTime();
      }
      this.previousPinch = this.pinching;
      this.debugState("locked");
      return;
    }
    if (this.raycastBusy) return;
    this.raycastBusy = true;
    const generation = ++this.raycastGeneration;
    try {
      this.probe.rayCast(eye, end, (hit: any) => {
        this.raycastBusy = false;
        if (generation !== this.raycastGeneration || !this.handDrivesUI || !this.handVisible) return;
        const found = hit && hit.collider ? this.findInteractable(hit.collider.getSceneObject()) : null;
        if (found !== this.candidate) {
          this.candidate = found;
          this.candidateFrames = 1;
        } else this.candidateFrames++;
        if (this.candidateFrames >= Math.max(1, this.hoverConfirmFrames)) {
          this.hitPoint = hit && hit.position ? hit.position : null;
          this.setTarget(found);
          if (found) {
            this.lastHovered = found;
            this.lastHoveredAt = getTime();
          }
        }
        // Never initiate a press when the pinch started in empty space -- but
        // "empty space" means nowhere near a button, not a hand that drifted a
        // few millimetres off one while the fingers closed. On the rising
        // pinch edge, take the hovered button, or the one hovered within the
        // grace window.
        const flicker = getTime() - this.lastReleaseAt < this.debounceSec;
        if (this.pinching && !this.previousPinch && flicker) {
          // The fingers re-closed right after a press ended: tracking noise
          // at the threshold, not a second press. Show hover only.
          this.nextTrigger = InteractorTriggerType.None;
        } else if (this.pinching && !this.previousPinch) {
          const recent = this.lastHovered && getTime() - this.lastHoveredAt <= this.pinchGraceSec
            ? this.lastHovered : null;
          const target = this.nextInteractable || recent;
          if (target) {
            // SIK starts a press on a None -> Pinch edge while targeting, so
            // the lock reports the trigger against this button from now on.
            this.lockedTarget = target;
            this.setTarget(target);
          }
        }
        this.previousPinch = this.pinching;
        this.debugState("ray");
      });
    } catch (e) {
      this.raycastBusy = false;
      this.clearTarget();
      print("[GHOST] Hand UI raycast failed: " + e);
    }
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
    this.nextInteractable = interactable;
    this.nextTrigger = (interactable && this.pinching &&
      (this.lockedTarget === interactable || !this.previousPinch))
      ? InteractorTriggerType.Pinch
      : InteractorTriggerType.None;
  }

  private resetInteraction(): void {
    // Hand lost while pressing: drop the trigger now, the button a couple of
    // frames later, so SIK completes the press instead of cancelling it.
    if (this.lockedTarget && this.nextTrigger !== InteractorTriggerType.None) {
      this.nextInteractable = this.lockedTarget;
      this.nextTrigger = InteractorTriggerType.None;
      this.lockedTarget = null;
      this.lastReleaseAt = getTime();
      this.releaseHoldFrames = RELEASE_HOLD_FRAMES;
      return;
    }
    if (this.releaseHoldFrames > 0) {
      this.releaseHoldFrames--;
      return;
    }
    this.raycastGeneration++;
    this.lastHovered = null;
    this.lockedTarget = null;
    this.candidate = null;
    this.candidateFrames = 0;
    this.previousPinch = false;
    this.clearTarget();
  }

  private clearTarget(): void {
    this.hitPoint = null;
    this.nextInteractable = null;
    if (this.nextTrigger !== InteractorTriggerType.None) {
      this.nextTrigger = InteractorTriggerType.None;
    }
  }

  /**
   * SIK's per-frame hook: let the base class copy current -> previous, THEN
   * publish the staged state, so a pinch shows up as None -> Pinch (press) and
   * a release as Pinch -> None (click), exactly once each.
   */
  override updateState(): void {
    super.updateState();
    this.currentInteractable = this.nextInteractable;
    this.currentTrigger = this.nextTrigger;
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
