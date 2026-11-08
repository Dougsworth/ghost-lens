# GHOST V8 — native Spectacles activities

Added `Assets/Scripts/GhostARActivities.ts` and optional `GhostMain.arActivities` integration.

## Scene setup required
1. In Lens Studio, create a child SceneObject under the same notebook/world anchor as the front door, named `AR Activities`.
2. Attach `GhostARActivities` to it. Keep its root enabled at scene initialization so `onAwake` can build its UIKit buttons; the component hides the root afterward.
3. Assign `GhostMain.arActivities` to the new component.
4. Under the activity anchor, create three model SceneObjects, each with a `RenderMeshVisual`, appropriate box/sphere/cylinder mesh and a readable material. Position them at the centre of the activity panel and assign them to `boxModel`, `sphereModel`, `cylinderModel`. The component switches visibility and rotates/scales these objects. Model meshes are **not included** in this patch.
5. Check UIKit buttons and pinch interaction in Spectacles Preview. Adjust placement/scale and model position for the camera. 

## What works in code
- Native UIKit pinch-button quiz using lesson `quiz` questions (when no traceable lesson steps exist).
- Native term-to-definition matching API (`openMatching`) for 2–3 pairs; needs a lesson data adapter / generator support to invoke it.
- Native 3D model selector (`openExplore`) with rotate and scale buttons; works with scene-assigned model meshes. For object/snap3d lessons with no traceable paths, GhostMain attempts this automatically.
- No browser companion required for the activity UI.

## Known limits
- The project was **not compiled in Lens Studio or tested on Spectacles**; scene wiring and SDK compatibility need verification.
- Matching is not automatically generated or launched from current lesson JSON.
- 3D is pinch-button rotation/scale of preconfigured models, **not** freehand grab, arbitrary generated 3D, or model downloads.
- After completion, returning to the front door may require scene-specific state wiring; this is a first integration, not a validated production flow.
- The original webcam pinch selection issue remains unverified on device.
