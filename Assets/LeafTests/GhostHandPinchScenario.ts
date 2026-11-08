/**
 * Webcam hand pinch selects buttons — the path the preview demo depends on.
 *
 * Drives the REAL chain end to end: synthetic MediaPipe frames go through
 * WebcamHandBridge.handle() (mapping, smoothing, uiReach, pinch hysteresis),
 * then GhostHandInteractor raycasts and reports to SIK, and the UIKit button
 * either fires or it does not. Nothing is called directly on a button.
 *
 * The live tracker page keeps streaming while this runs (including "no hand"
 * frames), which would fight the synthetic hand, so the bridge's socket
 * handler is muted for the duration and restored afterwards.
 *
 * Two checks:
 *   1. REACH — every front-door notebook tile and every bookmark tab must be
 *      aimable from inside the webcam frame (with a margin; real hands cannot
 *      work at the very edge of the image).
 *   2. PRESS — hover, then pinch the way a real hand does: thumb and index
 *      close over several frames and the whole hand drifts slightly while
 *      they do. The button must fire: Japanese opens the lesson, and the
 *      Packs tab returns to the front door.
 */

import {Scenario} from "Leaf.lspkg/Scenarios/scenario/Scenario"
import {expect} from "Leaf.lspkg/Utils/common/Expect"
import {findSceneObjectByName, nextFrame, sleep} from "Leaf.lspkg/Utils/common/Utils"
import {waitUntil} from "./LeafWait"
import {
  FRONT_ROOT,
  GhostLeafInteractor,
  LESSON_ROOT,
  findDescendant,
  requireObject,
  textOfDescendant,
} from "./GhostLeafInteractor"
import {WebcamHandBridge} from "../Scripts/WebcamHandBridge"
import {GhostHandInteractor} from "../Scripts/GhostHandInteractor"
import WorldCameraFinderProvider from "SpectaclesInteractionKit.lspkg/Providers/CameraProvider/WorldCameraFinderProvider"

/** Webcam coordinates must stay inside this band to count as reachable. */
const EDGE = 0.04

type Uv = {x: number; y: number}

@component
export class GhostHandPinchScenario extends Scenario {
  private bridge!: WebcamHandBridge

  async run(): Promise<void> {
    const interactor = new GhostLeafInteractor()
    await sleep(1500)

    const bridge = WebcamHandBridge.instance
    if (!bridge) throw new Error("WebcamHandBridge.instance missing")
    this.bridge = bridge
    const front = requireObject(FRONT_ROOT)
    const lesson = requireObject(LESSON_ROOT)
    await waitUntil(() => front.enabled, 5000, () => "front door never showed")

    // Mute the live tracker for the duration of the test.
    const ws: any = (bridge as any).ws
    const realOnMessage = ws ? ws.onmessage : null
    if (ws) ws.onmessage = () => {}
    GhostHandInteractor.debug = true
    try {
      // ── 1. REACH: front door ──────────────────────────────────────────
      const cards = interactor.notebookCards(true)
      expect(cards.length > 0, "front door has notebook tiles").toBe(true)
      const unreachable: string[] = []
      for (const card of cards) {
        const name = interactor.notebookName(card) || card.getSceneObject().name
        const uv = this.aimFor(card.getSceneObject().getTransform().getWorldPosition())
        print(`[hand-pinch] reach ${name}: webcam (${uv.x.toFixed(2)}, ${uv.y.toFixed(2)})`)
        if (!this.inside(uv)) unreachable.push(`${name} (${uv.x.toFixed(2)}, ${uv.y.toFixed(2)})`)
      }
      expect(unreachable.length, `notebook tiles out of webcam reach: [${unreachable.join(", ")}]`).toBe(0)

      // ── 2. PRESS: Japanese opens the lesson ──────────────────────────
      const jp = cards.find((c) => interactor.notebookName(c) === "Japanese")
      if (!jp) throw new Error("no Japanese notebook tile")
      await this.pinchAt(this.aimFor(jp.getSceneObject().getTransform().getWorldPosition()))
      await waitUntil(
        () => lesson.enabled && !front.enabled,
        4000,
        () => `hand pinch on Japanese did not open it (front=${front.enabled}, lesson=${lesson.enabled})`,
      )

      // ── 1b. REACH + PRESS: the Packs tab, once the user's turn shows it ──
      let packs: any = null
      await waitUntil(
        () => {
          packs = interactor.tabs(true).find((t) => interactor.tabLabel(t) === "Packs") || null
          return packs !== null
        },
        20000,
        () => "Packs tab never appeared",
      )
      for (const tab of interactor.tabs(true)) {
        const label = interactor.tabLabel(tab) || "?"
        const uv = this.aimFor(this.visibleCentre(tab.getSceneObject()))
        print(`[hand-pinch] reach tab ${label}: webcam (${uv.x.toFixed(2)}, ${uv.y.toFixed(2)})`)
        expect(this.inside(uv), `tab "${label}" in webcam reach (${uv.x.toFixed(2)}, ${uv.y.toFixed(2)})`).toBe(true)
      }
      // Where Packs REALLY is: the visible tabs reflow when some are hidden,
      // so sweep the hand down the tab column like a person would and note
      // where the interactor actually hovers it.
      const col = this.aimFor(this.visibleCentre(packs.getSceneObject())).x
      const band: number[] = []
      for (let v = 0.06; v <= 0.95; v += 0.03) {
        for (let i = 0; i < 5; i++) {
          this.frame({x: col, y: v}, 0.05, 0.8)
          await nextFrame()
        }
        if (this.hoveredLabel() === "Packs") band.push(v)
      }
      print(`[hand-pinch] Packs hovered at webcam y in [${band.map((v) => v.toFixed(2)).join(", ")}] (x ${col.toFixed(2)})`)
      expect(band.length > 0, "the hand can hover the Packs tab somewhere in the webcam frame").toBe(true)
      const mid = band[Math.floor(band.length / 2)]
      await this.pinchAt({x: col, y: mid})
      await waitUntil(
        () => front.enabled && !lesson.enabled,
        4000,
        () => `hand pinch on Packs did not return to the front door (front=${front.enabled}, lesson=${lesson.enabled})`,
      )
    } finally {
      if (ws) ws.onmessage = realOnMessage
      GhostHandInteractor.debug = false
      this.sendNoHand()
    }
  }

  /**
   * Where a person would aim: the tab's printed label, which sits in the
   * middle of what they see. A tab button's own origin is not its visual
   * centre, so aiming there landed beside the tab.
   */
  private visibleCentre(item: SceneObject): vec3 {
    const label = findDescendant(item, "ButtonLabel")
    return (label || item).getTransform().getWorldPosition()
  }

  /** Label of whatever the hand interactor is hovering right now. */
  private hoveredLabel(): string | null {
    const host = findSceneObjectByName("GhostHandInteractor")
    if (!host) return null
    const hi: any = host.getComponent(GhostHandInteractor.getTypeName())
    const target = hi ? hi.nextInteractable : null
    if (!target) return null
    return textOfDescendant(target.getSceneObject(), "ButtonLabel")
  }

  private inside(uv: Uv): boolean {
    return uv.x >= EDGE && uv.x <= 1 - EDGE && uv.y >= EDGE && uv.y <= 1 - EDGE
  }

  /**
   * Invert the bridge mapping: which thumb/index MIDPOINT in the webcam frame
   * makes the interactor's eye ray pass through `world`?
   */
  private aimFor(world: vec3): Uv {
    const b = this.bridge
    const eye = WorldCameraFinderProvider.getInstance().getComponent().getTransform().getWorldPosition()
    const st = b.surface.getTransform()
    const wt = st.getWorldTransform()
    const origin = st.getWorldPosition()
    // Surface plane: its local +z axis is the normal.
    const normal = wt.multiplyDirection(new vec3(0, 0, 1)).normalize()
    const dir = world.sub(eye)
    const denom = normal.dot(dir)
    const t = Math.abs(denom) < 1e-6 ? 1 : normal.dot(origin.sub(eye)) / denom
    const onPlane = eye.add(dir.uniformScale(t))
    const local = st.getInvertedWorldTransform().multiplyPoint(onPlane)
    const k = Math.max(1, b.uiReach)
    const u = 0.5 + local.x / b.surfaceWidthCm
    const v = 0.5 - local.y / b.surfaceHeightCm
    return {x: 0.5 + (u - 0.5) / k, y: 0.5 + (v - 0.5) / k}
  }

  /** One synthetic MediaPipe frame: thumb and index around a midpoint. */
  private frame(mid: Uv, spread: number, pinchDist: number): void {
    const thumb = [mid.x - spread, mid.y + spread * 0.7, 0]
    const index = [mid.x + spread, mid.y - spread * 0.7, 0]
    const pts: number[][] = []
    for (let i = 0; i < 21; i++) pts.push([mid.x, mid.y + 0.08, 0])
    pts[4] = thumb
    pts[8] = index
    ;(this.bridge as any).handle({hands: [{side: "Primary", pinch: pinchDist < 0.3, pinchDist, points: pts}]})
  }

  private sendNoHand(): void {
    ;(this.bridge as any).handle({hands: []})
  }

  /**
   * Hover, close the pinch like a hand does (fingers converge over ~8 frames
   * while the hand drifts ~1% of the frame), hold, open.
   */
  private async pinchAt(target: Uv): Promise<void> {
    for (let i = 0; i < 15; i++) {
      this.frame(target, 0.05, 0.8)
      await nextFrame()
    }
    for (let i = 1; i <= 8; i++) {
      const f = i / 8
      const drift = {x: target.x + 0.01 * f, y: target.y + 0.008 * f}
      this.frame(drift, 0.05 * (1 - f) + 0.004, 0.8 - 0.7 * f)
      await nextFrame()
    }
    const held = {x: target.x + 0.01, y: target.y + 0.008}
    for (let i = 0; i < 8; i++) {
      this.frame(held, 0.004, 0.1)
      await nextFrame()
    }
    for (let i = 1; i <= 5; i++) {
      this.frame(held, 0.004 + 0.046 * (i / 5), 0.1 + 0.7 * (i / 5))
      await nextFrame()
    }
    await sleep(300)
  }
}
