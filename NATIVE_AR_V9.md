# GHOST V9 — Native matching and preview freehand grab

## Automatic matching
When a generated lesson has no traceable paths, no supported 3D activity, and no quiz, `GhostMain` derives 2–3 matching pairs from distinct validated lesson step titles and tips. No extra AI generation is needed. The native matching UI reverses the answer column and checks against the corresponding original pair.

## Freehand 3D grabbing
`GhostARActivities` now follows a held webcam pinch that begins within `grabRadiusCm` of the model. It converts the fingertip world coordinate into the model parent's local coordinates, preserves the initial grip offset, clamps movement, and releases on pinch-up or hand loss. This is **webcam Preview hand tracking only**; Spectacles device-native hand tracking needs a SIK tracking adapter. Existing rotate/resize buttons remain.

## Scene setup and testing
Assign `GhostMain.arActivities` and assign the box/sphere/cylinder scene models to `GhostARActivities`. Ensure the webcam bridge maps its surface to the 3D activity area; otherwise the fingertip won't reach the model. Test a generated lesson with 2+ distinct title/tip steps and no quiz or 3D render. Test pinching near the model, dragging, and releasing in Preview. The build has not been compiled or tested in Lens Studio or on Spectacles.
