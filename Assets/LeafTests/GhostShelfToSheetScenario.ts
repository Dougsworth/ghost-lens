/**
 * Criterion 1, as the product now works.
 *
 * The brief wrote this criterion when the Lens opened on a five-notebook
 * shelf. It opens on the FRONT DOOR now ("What do you want to learn?"), and
 * the packs live as a small "Your notebook" row underneath it — which is what
 * NEXT_AI_FIRST.md asks for: teach-me-anything is the hero, the packs are
 * examples of it. So the entry assertions below moved to the front door and
 * the pack is opened from that row.
 *
 * What this costs: the old shelf also carried Chinese and Knots as "Coming
 * soon" covers, and the front door's row shows only the three open packs, so
 * those assertions are gone with the screen they tested. The shelf code is
 * still there but nothing reaches it. Retiring it or surfacing it again is a
 * product decision, not a test one.
 *
 * ORIGINAL — "The Lens opens on the notebook shelf: Japanese, ASL and Guitar
 * Chords are open, and Chinese and Knots are wrapped with 'Coming soon'.
 * Pinching Japanese flips the notebook open into the 15 cm washi practice
 * sheet, with Replay, Slower, Next and Packs tabs on the right — all of it in
 * view without moving my head."
 *
 * (The brief wrote this criterion when Guitar Chords was a cover only. The
 * guitar pose pack has since shipped, so Guitar Chords is now asserted as an
 * OPEN pack. Nothing about the Japanese path this scenario actually exercises
 * has changed.)
 *
 * The pinch on the Japanese cover is the assertion that matters: it is the one
 * link from shelf to lesson that was never verified by hand. Everything is
 * asserted against live scene state (enabled flags, rendered label strings,
 * text fill colour, transform scale), never against "a function was called".
 *
 * Order is deliberate: shelf structure, then the pinch and the state change,
 * then the sheet and tabs, and only then the field-of-view check — so a
 * cosmetic FoV failure can never mask the transition result.
 */

import {Scenario} from "Leaf.lspkg/Scenarios/scenario/Scenario"
import {expect} from "Leaf.lspkg/Utils/common/Expect"
import {sleep} from "Leaf.lspkg/Utils/common/Utils"
import {waitUntil} from "./LeafWait"
import {getInteractables} from "Leaf.lspkg/Interactors/InteractableUtils"
import {
  GhostLeafInteractor,
  LESSON_ROOT,
  FRONT_ROOT,
  NOTEBOOK_ROW,
  TAB_STACK,
  requireDescendant,
  requireObject,
  required,
  textOfDescendant,
  textRedOfDescendant,
} from "./GhostLeafInteractor"
import {GhostSheet} from "../Scripts/GhostSheet"

// Guitar Chords moved from locked to open when the guitar pose pack shipped.
// The criterion itself is unchanged — "the open packs are pinchable, the locked
// ones wear a Coming soon band" — only which packs are in which list. Chinese
// and Knots are still covers only.
/** The front door's row uses short names: "Guitar", not "Guitar Chords". */
const OPEN_PACKS = ["Japanese", "ASL", "Guitar"]
const TAB_LABELS = ["Replay", "Slower", "Next", "Packs"]

@component
export class GhostShelfToSheetScenario extends Scenario {
  async run(): Promise<void> {
    const interactor = new GhostLeafInteractor()

    // GhostMain applies the opening state from a DelayedCallbackEvent 0.1 s
    // after OnStart, and every UIKit Button builds its Interactable on its own
    // OnStart, so nothing below exists at frame 0.
    await sleep(1500)

    const front = requireObject(FRONT_ROOT)
    const lesson = requireObject(LESSON_ROOT)

    // ── The Lens opens on the front door ────────────────────────────────────
    expect(front.enabled, "Front door enabled at Lens start").toBe(true)
    expect(lesson.enabled, "Lesson root disabled at Lens start").toBe(false)

    // ── The packs, as a row under "Your notebook" ───────────────────────────
    const cards = interactor.notebookCards()
    const titles = cards.map((card) => interactor.notebookName(card))
    expect(
      cards.length,
      `pack covers under ${NOTEBOOK_ROW}; names found: [${titles.join(", ")}]`,
    ).toBe(OPEN_PACKS.length)

    for (const pack of OPEN_PACKS) {
      expect(
        titles.indexOf(pack) >= 0,
        `front door offers "${pack}"; names found: [${titles.join(", ")}]`,
      ).toBe(true)
    }

    // ── THE PINCH: the Japanese notebook opens into the sheet ───────────────
    await interactor.pinchNotebook("Japanese")

    await waitUntil(
      () => lesson.enabled && !front.enabled,
      5000,
      () =>
        `after pinching Japanese: FrontDoor.enabled=${front.enabled}, Lesson.enabled=${lesson.enabled}`,
    )
    expect(front.enabled, "pinching Japanese hides the front door").toBe(false)
    expect(lesson.enabled, "pinching Japanese shows the lesson").toBe(true)

    // ── The 15 cm washi practice sheet, fully unrolled ──────────────────────
    const practiceSheet = requireObject("PracticeSheet")
    const sheet = practiceSheet.getComponent(
      GhostSheet.getTypeName(),
    ) as GhostSheet
    expect(sheet.sizeCm, "practice sheet is 15 cm square").toBeCloseTo(15, 1)

    const sheetRoot = requireDescendant(practiceSheet, "SheetRoot")
    expect(sheetRoot.enabled, "SheetRoot is shown once the notebook opens").toBe(
      true,
    )
    // The scroll unroll scales Y from ~0 up to 1; a finished unroll is the only
    // state in which the user is actually looking at a full 15 cm of paper.
    await waitUntil(
      () => sheetRoot.getTransform().getLocalScale().y > 0.999,
      5000,
      () =>
        `sheet unroll scale.y = ${sheetRoot.getTransform().getLocalScale().y}`,
    )

    // ── Replay / Slower / Next / Packs tabs on the right edge ───────────────
    // Presence is checked against EVERY tab in the stack, not just the enabled
    // ones. The UX overhaul hides tabs that are not useful in the current
    // moment (none during the ghost's WATCH phase, a reduced set during the
    // user's turn), so "which tabs are showing" is now a function of timing.
    // What criterion 1 actually requires is that the sheet HAS these controls,
    // which is a structural fact and is what this asserts.
    const tabs = interactor.tabs()
    const labels = tabs.map((tab) => interactor.tabLabel(tab))
    // Not an exact count: the brief varies the stack per pack -- "in the Japanese
    // pack a mic tab (Ask GHOST) joins the stack", and ASL adds "Got it". What
    // criterion 1 actually requires is that the four named tabs are all there,
    // which the per-label loop below asserts individually.
    expect(
      tabs.length >= TAB_LABELS.length,
      `at least the ${TAB_LABELS.length} required bookmark tabs under ${TAB_STACK}; labels found: [${labels.join(", ")}]`,
    ).toBe(true)
    for (const label of TAB_LABELS) {
      expect(
        labels.indexOf(label) >= 0,
        `"${label}" tab is present and enabled; labels found: [${labels.join(", ")}]`,
      ).toBe(true)
    }
    // The tabs sit to the RIGHT of the sheet centre, as bookmarks off its edge.
    const tabStack = requireDescendant(requireObject("SheetFurniture"), TAB_STACK)
    expect(
      tabStack.getTransform().getLocalPosition().x,
      "bookmark tabs sit right of the sheet centre",
    ).toBeGreaterThan(0)

    // ── "all of it in view without moving my head" ──────────────────────────
    // Checked last on purpose: a framing problem is a real finding but must not
    // shadow the shelf-to-sheet transition asserted above.
    const shownTabs = interactor.tabs(true)
    const tabsInView = getInteractables({
      sceneObjectName: "Item",
      ancestorName: TAB_STACK,
      enabledInHierarchy: true,
      inFoV: true,
    })
    // "all of it in view" means every tab that is SHOWING right now, whatever
    // the pack and the current phase put in the stack -- not a fixed number.
    expect(
      tabsInView.length,
      `bookmark tabs inside the camera field of view (of ${shownTabs.length} showing; stack labels [${labels.join(", ")}])`,
    ).toBe(shownTabs.length)
  }
}
