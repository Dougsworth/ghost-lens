# GHOST V11 — pinch selection reliability

## Changes
- Webcam UI pointer reads the fingertip continuously (hover works before pinching).
- Hover needs two consecutive raycast hits before selection to reduce accidental targeting.
- A button is locked for the duration of a pinch; moving slightly off it will not cancel its release/click.
- A pinch started in empty space cannot activate a button later when the hand moves over it.
- Hand loss clears targeting, and late raycast callbacks cannot restore stale targets.
- Native Spectacles UIKit buttons should continue using SIK's native hand interactors; the custom `GhostHandInteractor` is for webcam preview only.

## Scene checklist
1. Ensure `GhostHandInteractor` exists **only once**, and enable `handDrivesUI` for webcam Preview. Disable it on device to avoid two interactors pressing one button.
2. Ensure the scene has the usual Spectacles Interaction Kit hand interactors enabled for native device pinches.
3. Set `WebcamHandBridge` active `surface` to the currently displayed UI plane. Misaligned mapping is the most common reason a visible pinch does not hit a button.
4. Each clickable control needs an SIK Interactable/appropriate UIKit Button and an interaction collider.
5. Test hover highlight, pinch down, release, drag slightly while pinched, and moving the hand out of view.

## Verification
This is a source patch and has **not** been compiled in Lens Studio or tested on Spectacles hardware. Actual button selection depends on scene wiring and SIK package compatibility.
