/**
 * Criterion 2 — "On the sheet, the ghost brush writes あ stroke by stroke in
 * sumi ink in the correct order, the stroke counter reads 1/3, 2/3, 3/3, and
 * the sound 'a' plays at the end. Pinching Slower replays it at half speed;
 * pinching Replay replays it."
 *
 * Everything here is read off live state: the stroke index the player emits,
 * the string actually rendered by the StrokeCounter Text at that instant, the
 * settled baseColor of the three ink ribbons, the AudioComponent's own
 * isPlaying(), and wall-clock elapsed time between the first stroke and the
 * finish.
 *
 * Audio caveat: a test cannot hear anything. The strongest honest assertion is
 * that the voice AudioComponent reports isPlaying() immediately after the demo
 * finishes — i.e. the clip was dispatched without error. Whether the right
 * sound comes out of the speaker is untested.
 */

import {Scenario} from "Leaf.lspkg/Scenarios/scenario/Scenario"
import {expect} from "Leaf.lspkg/Utils/common/Expect"
import {sleep, waitUntil} from "Leaf.lspkg/Utils/common/Utils"
import {
  BRUSH,
  GUIDE_INK,
  GhostLeafInteractor,
  LESSON_ROOT,
  SHELF_ROOT,
  STROKE_COUNTER,
  VOICE_SOURCE,
  requireDescendant,
  requireObject,
} from "./GhostLeafInteractor"
import {GhostDemoPlayer} from "../Scripts/GhostDemoPlayer"

const EXPECTED_STROKES = 3
const EXPECTED_COUNTER = ["1 / 3", "2 / 3", "3 / 3"]

@component
export class GhostDemoScenario extends Scenario {
  async run(): Promise<void> {
    const interactor = new GhostLeafInteractor()
    await sleep(1500)

    const shelf = requireObject(SHELF_ROOT)
    const lesson = requireObject(LESSON_ROOT)
    const practiceSheet = requireObject("PracticeSheet")
    const sheetFurniture = requireObject("SheetFurniture")

    const demo = requireObject("DemoPlayer").getComponent(
      GhostDemoPlayer.getTypeName(),
    ) as GhostDemoPlayer

    const counterObject = requireDescendant(sheetFurniture, STROKE_COUNTER)
    const counter = counterObject.getComponent("Component.Text") as Text

    const voiceObject = requireDescendant(requireObject("Audio"), VOICE_SOURCE)
    const voice = voiceObject.getComponent(
      "Component.AudioComponent",
    ) as AudioComponent

    // ── Recorders ───────────────────────────────────────────────────────────
    // GhostMain subscribed to these events in its own onStart, so by the time
    // these callbacks run the counter text and the audio call have already
    // happened — which is exactly the state we want to sample.
    let strokeOrder: number[] = []
    let counterReadings: string[] = []
    let firstStrokeAt = -1
    let finishedAt = -1
    let voiceWasPlaying = false

    const resetRecorders = () => {
      strokeOrder = []
      counterReadings = []
      firstStrokeAt = -1
      finishedAt = -1
      voiceWasPlaying = false
    }

    demo.onStrokeStarted.add((index: number) => {
      if (firstStrokeAt < 0) {
        firstStrokeAt = getTime()
      }
      strokeOrder.push(index)
      counterReadings.push(counter.text)
    })
    demo.onDemoFinished.add(() => {
      finishedAt = getTime()
      voiceWasPlaying = voice.isPlaying()
    })

    const awaitDemo = async (what: string, timeoutMs: number): Promise<void> => {
      await waitUntil(
        () => finishedAt > 0,
        timeoutMs,
        () =>
          `${what} never finished; strokes seen so far: [${strokeOrder.join(", ")}], counter: [${counterReadings.join(" | ")}]`,
      )
    }

    const assertOneWriting = (what: string): void => {
      expect(
        strokeOrder.join(","),
        `${what}: brush writes あ in stroke order 0,1,2 (saw [${strokeOrder.join(", ")}])`,
      ).toBe("0,1,2")
      expect(
        counterReadings.join(" | "),
        `${what}: stroke counter steps 1/3 -> 2/3 -> 3/3 (saw [${counterReadings.join(" | ")}])`,
      ).toBe(EXPECTED_COUNTER.join(" | "))
    }

    // ── 1. Open the Japanese lesson; the demo starts by itself ──────────────
    if (!lesson.enabled) {
      await waitUntil(
        () => shelf.enabled,
        5000,
        () => `waiting for the shelf; Shelf.enabled=${shelf.enabled}`,
      )
      await interactor.pinchShelfCard("Japanese")
    }
    await waitUntil(
      () => lesson.enabled,
      5000,
      () => `Lesson.enabled=${lesson.enabled} after opening the Japanese pack`,
    )

    await awaitDemo("the automatic demonstration", 30000)
    assertOneWriting("automatic demonstration")

    // The counter's total proves あ is a three-stroke character to the engine,
    // not just that three events happened to fire.
    expect(
      counter.text,
      "stroke counter total for あ",
    ).toBe("3 / 3")

    // ── 2. The ink settles into a pale guide outline ────────────────────────
    const guideInk = requireDescendant(practiceSheet, GUIDE_INK)
    expect(
      guideInk.getChildrenCount(),
      "one ink ribbon per stroke of あ in the guide layer",
    ).toBe(EXPECTED_STROKES)

    for (let i = 0; i < EXPECTED_STROKES; i++) {
      const ribbon = requireDescendant(guideInk, "Stroke" + i)
      const visual = ribbon.getComponent(
        "Component.RenderMeshVisual",
      ) as RenderMeshVisual
      const settled = visual.mainMaterial.mainPass.baseColor
      // The demo fades wet ink down to guideColor; a ribbon still sitting at
      // inkColor would mean the fade never completed.
      expect(
        settled.x,
        `Stroke${i} faded from ink (${demo.inkColor.x}) to the guide colour (${demo.guideColor.x}), read ${settled.x}`,
      ).toBeCloseTo(demo.guideColor.x, 2)
    }

    // The brush parks back at the start of stroke 1, ready for the user.
    const brushLayer = requireDescendant(practiceSheet, "Brush")
    const brush = requireDescendant(brushLayer, BRUSH)
    expect(brush.enabled, "ghost brush is parked and visible after the demo").toBe(
      true,
    )

    // ── 3. The character's sound is dispatched at the end ───────────────────
    // Cannot be heard by a test — this asserts only that the clip started.
    expect(
      voiceWasPlaying,
      "the あ voice clip was playing the instant the demo finished",
    ).toBe(true)

    // ── 4. Pinching Replay replays it ───────────────────────────────────────
    resetRecorders()
    await interactor.pinchTab("Replay")
    await awaitDemo("the Replay demonstration", 30000)
    assertOneWriting("Replay")
    const normalMs = (finishedAt - firstStrokeAt) * 1000
    expect(
      normalMs,
      `Replay ran the full demonstration (${normalMs.toFixed(0)} ms from first stroke to finish)`,
    ).toBeGreaterThan(0)

    // ── 5. Pinching Slower replays it at half speed ─────────────────────────
    resetRecorders()
    await interactor.pinchTab("Slower")
    await awaitDemo("the Slower demonstration", 60000)
    assertOneWriting("Slower")
    const slowMs = (finishedAt - firstStrokeAt) * 1000

    // The player halves the speed of the strokes and the pauses but not the
    // final fade, so the honest expectation is "clearly longer, roughly double"
    // rather than exactly 2x.
    expect(
      slowMs > normalMs * 1.5,
      `Slower takes markedly longer: ${slowMs.toFixed(0)} ms vs ${normalMs.toFixed(0)} ms at normal speed (ratio ${(slowMs / normalMs).toFixed(2)})`,
    ).toBe(true)
    expect(
      slowMs < normalMs * 2.6,
      `Slower is about double, not more: ${slowMs.toFixed(0)} ms vs ${normalMs.toFixed(0)} ms (ratio ${(slowMs / normalMs).toFixed(2)})`,
    ).toBe(true)
  }
}
