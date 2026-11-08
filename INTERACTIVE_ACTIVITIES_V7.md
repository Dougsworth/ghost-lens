# GHOST V7 — Interactive Activities

The existing `/learn.html` companion now renders lesson objects as a rotatable geometric 3D diagram, and supports actual multiple-choice quizzes and matching pairs. The 3D preview uses a lightweight built-in canvas projection (no external library, no model download). It supports box, sheet, cylinder, rope, and sphere primitives with labels, orbit, tilt and zoom. A `snap3d` prompt gets a labeled placeholder, **not** a real generated mesh.

Validated lesson-level `quiz` entries are now appended to the compiled activity sequence, so existing generated lessons can actually ask their knowledge-check questions. Wrong choices give feedback; a correct choice unlocks Next. Matching is playable when an activity contains `render.pairs` of `{left,right}` entries; the current Lens lesson schema does not generate that format, so matching content requires a future schema/LLM extension.

## Scope and limits

This is implemented in the **browser learning companion**, not as new native Spectacles 3D/quiz/matching components. Lens Studio must still be configured and tested separately. Existing AR 3D primitives remain unchanged. Generated lessons currently support `objects` and `snap3d` but not `quiz` or `match` as step render kinds; lesson-level quizzes work. This update does not pretend to integrate Sketchfab, Three.js or external model services.

Start `./tools/webcam-bridge/run_fast.sh`, then open `http://127.0.0.1:8766/learn.html`.
