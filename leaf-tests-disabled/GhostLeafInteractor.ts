/**
 * GhostLeafInteractor — shared helpers for the GHOST LEAF scenarios.
 *
 * GHOST builds its UI at runtime from UIKit FlexLayouts, so every pinch target
 * lands on a SceneObject literally named "Item": five of them under the shelf's
 * ShelfPanel, four more under the sheet's BookmarkTabs. Index order is not a
 * safe way to tell them apart, so every lookup here identifies a control by the
 * label text actually rendered on its face:
 *   shelf card -> Item/CoverFace/CoverTitle   ("Japanese", "ASL", ...)
 *   bookmark tab -> Item/ButtonLabel          ("Replay", "Slower", ...)
 *
 * Nothing in this file touches the Lens's own scripts; it only reads the scene.
 */

import {DefaultLeafInteractor} from "Leaf.lspkg/Interactors/interactor/DefaultLeafInteractor"
import {getInteractables} from "Leaf.lspkg/Interactors/InteractableUtils"
import {findSceneObjectByName, sleep} from "Leaf.lspkg/Utils/common/Utils"

/** The Interactable type as LEAF itself resolves it (LEAF aliases SIK as
 *  InteractionKit.lspkg, so re-importing SIK here would be a different type). */
export type LeafInteractable = ReturnType<typeof getInteractables>[number]

/** Scene object names, confirmed against the live scene graph. */
export const SHELF_ROOT = "Shelf"
export const LESSON_ROOT = "Lesson"
export const SHELF_PANEL = "ShelfPanel"
export const TAB_STACK = "BookmarkTabs"
export const STROKE_COUNTER = "StrokeCounter"
export const GUIDE_INK = "GuideInk"
export const BRUSH = "GhostBrush"
export const VOICE_SOURCE = "SfxVoice"

/** Look a SceneObject up by name and fail loudly rather than returning null. */
export function requireObject(name: string): SceneObject {
  const found = findSceneObjectByName(name)
  if (found === undefined || isNull(found)) {
    throw new Error(`Scene object "${name}" not found`)
  }
  return found
}

/** Depth-first search for a descendant SceneObject by exact name. */
export function findDescendant(
  root: SceneObject,
  name: string,
): SceneObject | null {
  for (let i = 0; i < root.getChildrenCount(); i++) {
    const child = root.getChild(i)
    if (child.name === name) {
      return child
    }
    const deeper = findDescendant(child, name)
    if (deeper !== null) {
      return deeper
    }
  }
  return null
}

/** Like findDescendant, but fails loudly instead of returning null. */
export function requireDescendant(root: SceneObject, name: string): SceneObject {
  const found = findDescendant(root, name)
  if (found === null) {
    throw new Error(`No descendant named "${name}" under "${root.name}"`)
  }
  return found
}

/** Unwrap a value the scene should have supplied, with a useful failure. */
export function required<T>(value: T | null | undefined, what: string): T {
  if (value === null || value === undefined) {
    throw new Error(`Expected ${what}, found none`)
  }
  return value
}

/** Text rendered by a named descendant, or null when there is no such object. */
export function textOfDescendant(
  root: SceneObject,
  name: string,
): string | null {
  const target = findDescendant(root, name)
  if (target === null) {
    return null
  }
  const text = target.getComponent("Component.Text") as Text
  if (isNull(text)) {
    return null
  }
  return text.text
}

/** Red channel of a named descendant Text's fill colour. GhostShelfUI fades a
 *  locked cover by scaling RGB and leaving alpha alone, so the red channel is
 *  the observable that tells a faded cover from an open one. */
export function textRedOfDescendant(
  root: SceneObject,
  name: string,
): number | null {
  const target = findDescendant(root, name)
  if (target === null) {
    return null
  }
  const text = target.getComponent("Component.Text") as Text
  if (isNull(text)) {
    return null
  }
  return text.textFill.color.x
}

export class GhostLeafInteractor extends DefaultLeafInteractor {
  /** The five notebook covers on the shelf, in scene order. */
  shelfCards(enabledOnly: boolean = false): LeafInteractable[] {
    return getInteractables({
      sceneObjectName: "Item",
      ancestorName: SHELF_PANEL,
      enabledInHierarchy: enabledOnly ? true : undefined,
    })
  }

  /** The four bookmark tabs off the sheet's right edge, in scene order. */
  tabs(enabledOnly: boolean = false): LeafInteractable[] {
    return getInteractables({
      sceneObjectName: "Item",
      ancestorName: TAB_STACK,
      enabledInHierarchy: enabledOnly ? true : undefined,
    })
  }

  /** Title printed on a shelf cover, e.g. "Japanese". */
  cardTitle(card: LeafInteractable): string | null {
    return textOfDescendant(card.getSceneObject(), "CoverTitle")
  }

  /** Label printed on a bookmark tab, e.g. "Replay". */
  tabLabel(tab: LeafInteractable): string | null {
    return textOfDescendant(tab.getSceneObject(), "ButtonLabel")
  }

  cardByTitle(title: string): LeafInteractable | undefined {
    return this.shelfCards().find((card) => this.cardTitle(card) === title)
  }

  tabByLabel(label: string): LeafInteractable | undefined {
    return this.tabs().find((tab) => this.tabLabel(tab) === label)
  }

  /** cardByTitle, failing with the titles actually on the shelf. */
  requireCardByTitle(title: string): LeafInteractable {
    const card = this.cardByTitle(title)
    if (card === undefined) {
      throw new Error(
        `No shelf card titled "${title}". Found: [${this.shelfCards()
          .map((c) => this.cardTitle(c))
          .join(", ")}]`,
      )
    }
    return card
  }

  /** tabByLabel, failing with the labels actually on the sheet. */
  requireTabByLabel(label: string): LeafInteractable {
    const tab = this.tabByLabel(label)
    if (tab === undefined) {
      throw new Error(
        `No bookmark tab labelled "${label}". Found: [${this.tabs()
          .map((t) => this.tabLabel(t))
          .join(", ")}]`,
      )
    }
    return tab
  }

  /** Pinch a notebook cover by the title printed on it. */
  async pinchShelfCard(title: string): Promise<void> {
    await this.trigger(this.requireCardByTitle(title))
    await sleep(200)
  }

  /** Pinch a bookmark tab by its label. */
  async pinchTab(label: string): Promise<void> {
    await this.trigger(this.requireTabByLabel(label))
    await sleep(200)
  }
}
