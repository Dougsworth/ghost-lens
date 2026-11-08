/**
 * The game layer, shown moment by moment: opens a lesson, then fires the same
 * events GhostMain sends (clean strokes into a combo, a miss, a perfect
 * character, a chord, a race win) with pauses long enough to watch or
 * screenshot each one. Saved progress is wiped before and after, so a test
 * run never leaves points behind.
 */
import {Scenario} from "Leaf.lspkg/Scenarios/scenario/Scenario"
import {expect} from "Leaf.lspkg/Utils/common/Expect"
import {sleep} from "Leaf.lspkg/Utils/common/Utils"
import {waitUntil} from "./LeafWait"
import {passGlovePicker, FRONT_ROOT, LESSON_ROOT, GhostLeafInteractor, requireObject} from "./GhostLeafInteractor"
import {GhostMain} from "../Scripts/GhostMain"

@component
export class GhostGameScenario extends Scenario {
  async run(): Promise<void> {
    const interactor = new GhostLeafInteractor()
    await sleep(1500)
    await passGlovePicker()
    const main = findComponent(GhostMain.getTypeName()) as GhostMain
    if (!main || !main.game) throw new Error("GhostMain.game missing")
    const game = main.game
    game.reset()
    const front = requireObject(FRONT_ROOT)
    const lesson = requireObject(LESSON_ROOT)
    await waitUntil(() => front.enabled, 5000, () => "front door never showed")
    let pressed = false
    interactor.pinchNotebook("Japanese").then(() => { pressed = true }, () => { pressed = true })
    await waitUntil(() => lesson.enabled || pressed, 8000, () => "pinch Japanese did nothing")
    await sleep(1500)
    try {
      print("[game] strokes into a combo")
      for (let i = 0; i < 7; i++) {
        game.strokeClean(new vec3(-2 + i, 1, 0.5))
        await sleep(450)
      }
      print("[game] level after 7 strokes: " + game.level + ", badges " + game.badgesEarned)
      await sleep(2500)
      print("[game] miss breaks the combo")
      game.strokeMissed()
      await sleep(1200)
      print("[game] perfect character")
      game.characterDone(true, new vec3(4.6, -4.6, 0.6))
      await sleep(3000)
      print("[game] chord")
      game.chordPlayed("Em", new vec3(0, 0, 1.2))
      await sleep(3000)
      print("[game] race win")
      game.raceOver(true, "You")
      await sleep(3500)
      print("[game] final: " + game.summary)
      expect(game.level >= 2, "points add up to a level up").toBe(true)
      expect(game.badgesEarned >= 5, "badges were awarded").toBe(true)
    } finally {
      game.reset()
    }
  }
}

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
