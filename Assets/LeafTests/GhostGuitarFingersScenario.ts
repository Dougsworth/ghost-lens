/**
 * Guitar: your real fingers place the chord.
 *
 * Opens the Guitar notebook, waits for the ghost to finish, then sends
 * synthetic webcam frames through WebcamHandBridge.handle() with the finger
 * each step asks for (index / middle / ring / little tip) resting on its
 * circle. Every finger must be placed and the chord handed to the strum —
 * no pinch, no direct call on the controller.
 *
 * The live tracker page is muted for the run, as in GhostHandPinchScenario.
 */

import {Scenario} from "Leaf.lspkg/Scenarios/scenario/Scenario"
import {expect} from "Leaf.lspkg/Utils/common/Expect"
import {nextFrame, sleep} from "Leaf.lspkg/Utils/common/Utils"
import {waitUntil} from "./LeafWait"
import {passGlovePicker, FRONT_ROOT, GhostLeafInteractor, requireObject} from "./GhostLeafInteractor"
import {WebcamHandBridge} from "../Scripts/WebcamHandBridge"
import {GhostGuitarController} from "../Scripts/GhostGuitarController"
import WorldCameraFinderProvider from "SpectaclesInteractionKit.lspkg/Providers/CameraProvider/WorldCameraFinderProvider"

const TIP_LANDMARK = [0, 8, 12, 16, 20]

@component
export class GhostGuitarFingersScenario extends Scenario {
  async run(): Promise<void> {
    const interactor = new GhostLeafInteractor()
    await sleep(1500)
    await passGlovePicker()
    const bridge = WebcamHandBridge.instance
    if (!bridge) throw new Error("WebcamHandBridge.instance missing")
    const guitar = findComponent(GhostGuitarController.getTypeName()) as GhostGuitarController
    if (!guitar) throw new Error("no GhostGuitarController in the scene")
    const front = requireObject(FRONT_ROOT)
    await waitUntil(() => front.enabled, 5000, () => "front door never showed")

    // Open Guitar. LEAF's press may never resolve once its page hides, so
    // move on as soon as the guitar has visibly opened.
    let pressed = false
    interactor.pinchNotebook("Guitar").then(() => { pressed = true }, () => { pressed = true })
    await waitUntil(() => !front.enabled || pressed, 8000, () => "pinch Guitar did nothing")
    expect(front.enabled, "the front door is hidden while the guitar is open").toBe(false)

    await waitUntil(() => guitar.currentTarget !== null, 30000, () => "the ghost never handed the chord over")

    let placed: number[] = []
    let allDone = false
    guitar.onFingerPlaced.add((f: number) => placed.push(f))
    guitar.onAllFingersPlaced.add(() => { allDone = true })

    const ws: any = (bridge as any).ws
    const realOnMessage = ws ? ws.onmessage : null
    if (ws) ws.onmessage = () => {}
    try {
      const n = guitar.targetCount
      for (let step = 0; step < n; step++) {
        const t = guitar.currentTarget
        if (!t) break
        const dot = (guitar as any).liveDot()
        const world = guitar.board!.boardRoot.getTransform().getWorldTransform()
          .multiplyPoint(new vec3(dot.xCm, dot.yCm, 0))
        const uv = this.aimFor(bridge, world)
        print(`[guitar-fingers] step ${step}: finger ${t.finger} on string ${guitar.stringNameOf(t)} -> webcam (${uv.x.toFixed(2)}, ${uv.y.toFixed(2)})`)
        const before = placed.length
        // Rest the asked-for fingertip on the circle; other fingers elsewhere.
        for (let i = 0; i < 40 && placed.length === before; i++) {
          this.frame(bridge, t.finger, uv)
          await nextFrame()
        }
        expect(placed.length, `finger ${t.finger} was placed by resting it on circle ${t.finger}`).toBe(before + 1)
        // Lift the hand between fingers so the next one starts fresh.
        ;(bridge as any).handle({hands: []})
        await nextFrame()
      }
      expect(allDone, "every finger placed: the chord is handed to the strum").toBe(true)
    } finally {
      if (ws) ws.onmessage = realOnMessage
      ;(bridge as any).handle({hands: []})
    }
  }

  /** Webcam coordinates that land a fingertip (via uiReach) on `world`. */
  private aimFor(b: WebcamHandBridge, world: vec3): {x: number; y: number} {
    const eye = WorldCameraFinderProvider.getInstance().getComponent().getTransform().getWorldPosition()
    const st = b.surface.getTransform()
    const normal = st.getWorldTransform().multiplyDirection(new vec3(0, 0, 1)).normalize()
    const dir = world.sub(eye)
    const t = normal.dot(st.getWorldPosition().sub(eye)) / normal.dot(dir)
    const local = st.getInvertedWorldTransform().multiplyPoint(eye.add(dir.uniformScale(t)))
    const k = Math.max(1, b.uiReach)
    const u = 0.5 + local.x / b.surfaceWidthCm
    const v = 0.5 - local.y / b.surfaceHeightCm
    return {x: 0.5 + (u - 0.5) / k, y: 0.5 + (v - 0.5) / k}
  }

  /** An open hand with fingertip `finger` at `uv`, the others well away. */
  private frame(b: WebcamHandBridge, finger: number, uv: {x: number; y: number}): void {
    const pts: number[][] = []
    for (let i = 0; i < 21; i++) pts.push([uv.x, Math.min(0.98, uv.y + 0.2), 0])
    for (let f = 1; f <= 4; f++) pts[TIP_LANDMARK[f]] = [uv.x + (f - finger) * 0.12, uv.y + Math.abs(f - finger) * 0.1, 0]
    pts[4] = [uv.x - 0.2, uv.y + 0.15, 0]
    ;(b as any).handle({hands: [{side: "Primary", pinch: false, pinchDist: 0.9, points: pts}]})
  }
}

/** First component of this script type anywhere in the scene. */
function findComponent(typeName: any): any {
  const visit = (o: SceneObject): any => {
    const c = o.getComponent(typeName)
    if (c) return c
    for (let i = 0; i < o.getChildrenCount(); i++) {
      const hit = visit(o.getChild(i))
      if (hit) return hit
    }
    return null
  }
  for (let i = 0; i < global.scene.getRootObjectsCount(); i++) {
    const hit = visit(global.scene.getRootObject(i))
    if (hit) return hit
  }
  return null
}
