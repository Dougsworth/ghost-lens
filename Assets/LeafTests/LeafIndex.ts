/**
 * LeafIndex — registers the GHOST LEAF scenarios with the scenario manager.
 * Attached to the "LeafIndex" SceneObject at the scene root.
 */

import {scenariosIndex} from "Leaf.lspkg/Scenarios/decorator/ScenarioIndexDecorator"
import {ScenarioMetadata} from "Leaf.lspkg/Scenarios/scenario/ScenarioMetadata"
import {GhostDemoScenario} from "./GhostDemoScenario"
import {GhostShelfToSheetScenario} from "./GhostShelfToSheetScenario"
import {GhostHandPinchScenario} from "./GhostHandPinchScenario"

@component
export class LeafIndex extends BaseScriptComponent {
  @scenariosIndex
  static scenariosIndex: ScenarioMetadata[] = [
    {
      id: "ghost-shelf-to-sheet",
      typename: GhostShelfToSheetScenario.getTypeName(),
    },
    {
      id: "ghost-demo-writes-a",
      typename: GhostDemoScenario.getTypeName(),
    },
    {
      id: "ghost-hand-pinch-selects",
      typename: GhostHandPinchScenario.getTypeName(),
    },
  ]
}
