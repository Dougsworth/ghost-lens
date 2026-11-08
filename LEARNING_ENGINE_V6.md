# GHOST V6 — Learn by Doing

## Included

- `tools/webcam-bridge/learning_engine.py`: deterministic adapter from existing reviewed lessons into six activity contracts: TRACE, EXPLORE_3D, SEQUENCE, MATCH, PRACTICE, QUIZ. Existing `path`, `objects`, and `snap3d` renders are preserved. Unrecognized types safely fall back to SEQUENCE.
- `GET /learning/activity?courseId=...&learner=...`: loads an existing saved course, compiles activities, and returns the learner's next activity without regenerating the lesson.
- `tools/webcam-bridge/learn.html`: companion experience for selecting a saved course, continuing progress, drawing on an interactive trace canvas, reading hints, and saving completed steps.
- `test_learning_engine.py`: contract and resume tests.

## Try it

Run `./tools/webcam-bridge/run_fast.sh` and visit `http://127.0.0.1:8766/learn.html` after saving at least one reviewed lesson. Select a course and start practicing. Progress is saved to the existing SQLite backend.

## Integration status — important

- TRACE works interactively in the browser companion; it does not automatically score drawing accuracy.
- EXPLORE_3D is a **contract only** in the new browser companion; existing Lens Studio `objects`/`snap3d` renderers remain responsible for spatial visuals. The companion does not load Three.js models.
- MATCH/PRACTICE/QUIZ have typed contracts and instructional fallback, **not** bespoke interactive renderers yet.
- Speech, multiplayer, room QR, Supabase manual backup/restore, and Lens scene wiring are unchanged from V5. No new claim of live Lens Studio testing.
- MediaPipe is already in the webcam tracker. Gemini is already supported by the bridge. Supabase setup remains optional. Three.js, Sketchfab, OpenStax, Khan Academy, ElevenLabs, MathLive and PhET are **not** installed or connected by this update: these require content licensing, API credentials, platform compatibility and product decisions. Do not assume these third-party services are embedded.
- Localhost backend is for preview/development, not internet-facing production deployment.

## Next steps

Implement a genuine Lens Studio AR activity switcher and pinching UI, add evaluated tracing and dedicated quiz/matching renderers, then integrate licensed educational assets and real cloud syncing after configuring provider accounts.
