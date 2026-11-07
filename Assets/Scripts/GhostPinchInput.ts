/**
 * GhostPinchInput — one pinch signal, three possible sources.
 *
 * Owns:  turning "the user is pinching and dragging" into a stream of points in
 *        SHEET-LOCAL centimetres, so everything downstream (the painter, the
 *        stroke checker) is input-agnostic.
 * Must not: draw, score, or know what a stroke is.
 *
 * Sources, in the order the brief asks for them:
 *   1. SIK interactors — real hand pinch on SPECS, and the MOUSE in Interactive
 *      Preview. SIK's MouseInteractor fires the same onTriggerStart/End and
 *      exposes a world-space startPoint every frame, so one code path covers
 *      both. This is the free-space "pinch to draw" shape: no giant invisible
 *      collider, no manual TouchEvent mock (which would double-fire in Editor).
 *   2. WebcamHandBridge — real MediaPipe fingertips over a local WebSocket,
 *      preview only. Additive: if it connects, its pinches paint too.
 *
 * Projection: a world point is projected along the ray from the camera through
 * it onto the sheet plane. On device the hand already sits at roughly the
 * sheet's depth, so that ray is near-identity; in the preview the mouse
 * interactor sits at a fixed camera-relative depth and the same maths scales it
 * onto the paper correctly. One formula, both worlds.
 */

import Event, { PublicApi } from "SpectaclesInteractionKit.lspkg/Utils/Event";
import { SIK } from "SpectaclesInteractionKit.lspkg/SIK";
import { Interactor, InteractorInputType } from "SpectaclesInteractionKit.lspkg/Core/Interactor/Interactor";
import WorldCameraFinderProvider from "SpectaclesInteractionKit.lspkg/Providers/CameraProvider/WorldCameraFinderProvider";
import { Pt } from "./GhostKanaPath";
import { WebcamHandBridge } from "./WebcamHandBridge";

@component
export class GhostPinchInput extends BaseScriptComponent {
  @ui.label('<span style="color: #60A5FA;">GhostPinchInput &ndash; pinch and drag, from hand, mouse or webcam bridge</span>')
  @ui.separator

  @ui.label('<span style="color: #60A5FA;">References</span>')
  @ui.group_start("References")
  @input
  @hint("The surface pinches are projected onto. Points are reported in this object's local centimetres.")
  surface!: SceneObject;
  @ui.group_end

  @ui.separator
  @ui.label('<span style="color: #60A5FA;">Settings</span>')
  @ui.group_start("Settings")
  @input
  @hint("Also accept pinches from the webcam bridge (tools/webcam-bridge) when it is connected. Preview only; harmless when the bridge is absent.")
  acceptWebcamBridge: boolean = true;

  @input
  @hint("Ignore points landing further than this from the surface centre, in cm. Stops a stray pinch across the room from painting.")
  @widget(new SliderWidget(5, 60, 1))
  reachCm: number = 24;
  @ui.group_end

  private readonly _onPinchStart = new Event<Pt>();
  private readonly _onPinchMove = new Event<Pt>();
  private readonly _onPinchEnd = new Event<Pt>();

  get onPinchStart(): PublicApi<Pt> {
    return this._onPinchStart.publicApi();
  }
  get onPinchMove(): PublicApi<Pt> {
    return this._onPinchMove.publicApi();
  }
  get onPinchEnd(): PublicApi<Pt> {
    return this._onPinchEnd.publicApi();
  }

  /** While false, pinches are ignored entirely (e.g. during the ghost demo). */
  accepting = false;

  private interactors: Interactor[] = [];
  private bound = false;
  private active: Interactor | null = null;
  private lastPoint: Pt | null = null;
  private bridgeHooked = false;

  onAwake(): void {
    this.createEvent("OnStartEvent").bind(() => this.onStart());
    this.createEvent("UpdateEvent").bind(() => this.onUpdate());
  }

  private onStart(): void {
    if (!this.surface) {
      print("[GhostPinchInput] ERROR: surface not wired.");
    }
    this.bindInteractors();
    this.hookBridge();
  }

  /**
   * SIK spawns its interactors from the SpectaclesInteractionKit prefab, which
   * may not be ready on the first frame — so this retries from onUpdate until
   * it finds them.
   */
  private bindInteractors(): void {
    if (this.bound) return;
    let found: Interactor[] = [];
    try {
      found = SIK.InteractionManager.getInteractorsByType(InteractorInputType.All);
    } catch (e) {
      return;
    }
    if (!found || found.length === 0) return;

    this.interactors = found;
    for (let i = 0; i < found.length; i++) {
      const it = found[i];
      it.onTriggerStart.add(() => this.handleTriggerStart(it));
      it.onTriggerEnd.add(() => this.handleTriggerEnd(it));
    }
    this.bound = true;
  }

  private hookBridge(): void {
    if (this.bridgeHooked || !this.acceptWebcamBridge) return;
    const bridge = WebcamHandBridge.instance;
    if (!bridge) return;
    bridge.onPinchStart.push((p: vec3) => this.emitFromWorld(p, "start"));
    bridge.onPinchMove.push((p: vec3) => this.emitFromWorld(p, "move"));
    bridge.onPinchEnd.push((p: vec3) => this.emitFromWorld(p, "end"));
    this.bridgeHooked = true;
    print("[GhostPinchInput] webcam bridge hooked - bridge pinches will paint.");
  }

  private handleTriggerStart(it: Interactor): void {
    if (!this.accepting || this.active) return;
    const p = this.projectInteractor(it);
    if (!p) return;
    this.active = it;
    this.lastPoint = p;
    this._onPinchStart.invoke(p);
  }

  private handleTriggerEnd(it: Interactor): void {
    if (this.active !== it) return;
    this.active = null;
    const p = this.projectInteractor(it) || this.lastPoint;
    if (p) this._onPinchEnd.invoke(p);
    this.lastPoint = null;
  }

  private onUpdate(): void {
    if (!this.bound) this.bindInteractors();
    if (!this.bridgeHooked) this.hookBridge();

    if (!this.active || !this.accepting) return;
    const p = this.projectInteractor(this.active);
    if (!p) return;
    this.lastPoint = p;
    this._onPinchMove.invoke(p);
  }

  // ── Bridge path ───────────────────────────────────────────────────────────

  private emitFromWorld(world: vec3, phase: string): void {
    if (!this.accepting) return;
    // A real hand from the bridge is already on the sheet plane, so the camera
    // ray projection below collapses to near-identity.
    const p = this.project(world);
    if (!p) return;
    if (phase === "start") {
      this.lastPoint = p;
      this._onPinchStart.invoke(p);
    } else if (phase === "move") {
      this.lastPoint = p;
      this._onPinchMove.invoke(p);
    } else {
      this._onPinchEnd.invoke(p);
      this.lastPoint = null;
    }
  }

  // ── Projection ────────────────────────────────────────────────────────────

  private projectInteractor(it: Interactor): Pt | null {
    const sp = it.startPoint;
    if (!sp) return null;
    return this.project(sp);
  }

  /** World point -> sheet-local cm, via the ray from the camera through it. */
  private project(world: vec3): Pt | null {
    if (!this.surface) return null;
    const st = this.surface.getTransform();
    const planeOrigin = st.getWorldPosition();
    const normal = st.forward;

    const camT = WorldCameraFinderProvider.getInstance().getComponent().getTransform();
    const eye = camT.getWorldPosition();
    const dir = world.sub(eye);

    const denom = dir.dot(normal);
    let hit: vec3;
    if (Math.abs(denom) < 1e-5) {
      hit = world; // looking along the plane: fall back to the raw point
    } else {
      const t = planeOrigin.sub(eye).dot(normal) / denom;
      if (t <= 0) return null; // behind the viewer
      hit = eye.add(dir.uniformScale(t));
    }

    const local = st.getInvertedWorldTransform().multiplyPoint(hit);
    if (Math.abs(local.x) > this.reachCm || Math.abs(local.y) > this.reachCm) return null;
    return { x: local.x, y: local.y };
  }
}
