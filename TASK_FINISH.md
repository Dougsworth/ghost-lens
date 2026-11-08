# TASK_FINISH: complete, integrate, test, polish. Implement, don't plan.

Deadline Monday Nov 9 5pm ET. Priority: reliability > interaction quality >
visual polish > new features. Commit and push to main after every working
milestone. Run tests before committing; fix regressions before moving on.
Never claim something works that you did not verify in the preview; never
present simulated multiplayer as functional; mark anything that only real
Specs hardware can verify (VoiceML, device hand tracking, Sync Kit) as
hardware-pending in the final report.

## Already done - do not redo
Front door with live Gemini planning + staged progress line; coach tips
(/coach); kana, ASL and guitar packs; GhostHandInteractor (webcam hand drives
SIK); browser speech; UX rules in DESIGN_FRONT_DOOR.md + NEXT_UX_OVERHAUL.md.
NEW AND UNCOMMITTED, built and tested by the other session: the Study
Together room relay - tools/webcam-bridge/room_relay.py, test_rooms.py (13
passing checks: create/join/presence/identity/isolation/4-cap/unknown-room/
leave/reconnect), bridge_web.py changes (role "room", GET /rooms, GHOST_LAN
bind), README sections. FIRST ACTION: run `python3 tools/webcam-bridge/
test_rooms.py` (VM python has websockets; .venv also works on this Mac),
then commit and push these files.

## 1. Study Together in the Lens (NEXT_STUDY_TOGETHER.md)
- GhostRoom.ts: websocket client to the bridge (same socket the hand bridge
  uses, ws://127.0.0.1:8765; URL configurable for LAN/ngrok). Handshake: send
  the literal frame "room", then JSON ops exactly as room_relay.py documents
  (create/join/event/leave; pushed peer_joined/peer_left/error). Retry with
  backoff forever; a drop or a peer leaving must never break the solo lesson.
- Front door entry "Study together": Create room -> code shown LARGE in ink on
  the paper; Join room -> say or pick the code. Codes are speakable words.
- Shared lesson: creator broadcasts lesson id/steps; each member's completed
  strokes go out as downsampled point events and render on the peer's sheet in
  indigo with their name; stamps and cheers (pinch a peer's sheet, one per
  stroke) are events too.
- Together mode: alternate strokes, shared stamp and combo. Race mode: same
  character, first accepted stamp wins the round, best of 5, ink-tally
  scoreboard, clear end screen.
- Verify with TWO Preview panels (Window > General > Preview) genuinely
  exchanging state through the relay. This is also the demo shot. Sync Kit is
  optional; if sign-in blocks it, the relay IS the backend - say so honestly.

## 2. Lesson bank
Verify GhostLessonBank actually saves generated lessons, shows them under
"Your notebook", reopens without regenerating, and survives Lens restart
(persistent storage). Fix if not.

## 3. Gesture reliability pass
Hover highlight + press feedback on every interactable under both mouse and
bridge hand; no accidental double-activations (debounce trigger-end ->
trigger-start within 250ms); grab offset kept when dragging; release always
detected even when tracking drops (tracker already holds 150ms grace). Test
rapid pinches and interrupted tracking.

## 4. Polish
DESIGN_FRONT_DOOR.md rules. Fix the known flaws: UIKit corner brackets still
faintly visible; front door text-heavy. Readable at arm's length everywhere;
nothing past +-11cm from centre at 45cm; one primary action per screen.

## 5. Tests
Re-run both LEAF scenarios; add one for the front door -> generated lesson ->
stamp path and one for a two-preview room exchange if LEAF can host it
(if not, scripted verification via the relay + logs, clearly labelled).

## 6. Demo prep
Write DEMO.md: exact click-by-click script for the 7 scenes (open + pick,
ghost demo, copy with hand, 3D/quiz, save + reopen, create room + join from
second preview, race round) with reset steps between takes, bridge launch
commands, and what to say over each scene.

## 7. Final report
Features done, files changed, commits pushed, tests run with results,
remaining limitations, hardware-pending items, exact demo launch steps.
