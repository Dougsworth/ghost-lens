# GHOST Study Together V2 — installation and limitations

This is a **source patch**, not a verified Lens Studio build. Back up the original files first. Copy the six included files to the corresponding paths in your project, preserving the existing `.meta` files.

## Features
- Live stroke previews: samples are sent at most ~8 times per second via the HTTP room relay; the peer's temporary cyan ribbon updates until the stroke completes. A completed accepted stroke becomes permanent; a rejected stroke clears the preview. This is near-live, not 30 fps.
- Shared lesson: the author sends the actual reviewed lesson JSON. A peer **on the front door** validates and opens the same content without making another AI request. It will not interrupt someone already practicing. Lessons are only retained in the relay's short event history; late joiners may need a new lesson broadcast.
- Race scoreboard: accepted tracing strokes award one point; the room sends scores and the sheet's hook text displays a ranked list. This is a compact first-pass scoreboard, not a separate polished scoreboard widget. Scores reset on app restart.

## Setup
1. Copy patch files over `~/Projects/GHOST/` (do not overwrite your entire project or `.meta` files).
2. In Lens Studio, attach `GhostStudyTogether` to an enabled SceneObject. Set `enabledRoom=true`, the same `roomId` for both, **different** `participantId`s, and connect the Internet Module. Wire it into `GhostMain.studyTogether`.
3. Start `./tools/webcam-bridge/run_fast.sh` from the project root. Open two previews with the same lesson and room.
4. In preview A choose a skill; while preview B is still on the front door, B should receive the same reviewed lesson. Draw in A: B should see cyan ink appearing before release. Complete an accepted stroke and confirm the scoreboard updates.
5. Watch Logger for `[GHOST room]` messages and any network errors.

## Verification
- Python relay: 9 tests passed.
- Lens Studio: **not run here**. Scene wiring, live AR rendering, performance and hand gestures need real preview verification on your Mac.
- Local relay has no authentication and must not be exposed publicly. Each participant must use a unique ID. No native Spectacles Sync Kit integration yet.
- Some errors, such as an unreachable bridge, still require retry and may cause a queued live update to arrive late.
