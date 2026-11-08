# GHOST V10 — native Spectacles hand tracking

## Scene setup (required)
1. Open the project in Lens Studio with Spectacles Interaction Kit installed.
2. Add an empty SceneObject named `GHOST Native Hand Input`.
3. Attach `Assets/Scripts/GhostNativeHandInput.ts` to it. Keep the object enabled.
4. Keep `GhostARActivities` attached to its existing scene object, set `freehandGrab=true`, `preferNativeHand=true`, and assign the 3D model SceneObjects.
5. In Spectacles Preview or on device, open a 3D exploration activity, move an index finger close to the model, pinch, move, and release.
6. In webcam-only preview, the existing WebcamHandBridge is used when native tracking is unavailable.

## Notes
- This adds native SIK index-tip position and pinch input **for the 3D grab interaction**. Quiz/matching selection still uses the existing Spectacles UIKit Button/SIK interaction setup.
- Both the native fingertip and model positions must be in the same Lens Studio world coordinates; grabRadiusCm defaults to 12 cm.
- The implementation does not automatically add the scene component: Lens Studio scene wiring is required.
- Not compiled in Lens Studio or tested on hardware here. If the installed SIK version has a different HandInputData import or pinch API, adapt the import/API to that package version.
- Do not treat this as verified hardware functionality until the pinch and release are tested on Spectacles.
