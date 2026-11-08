# GHOST Study Together: Lens-to-Lens ink patch

## Included
- Local completed practice strokes are sent as bounded `path` events to the room relay.
- Incoming peer `path` events are rendered as blue ink ribbons on the local sheet.
- Peer learning topics are logged and room presence is maintained.
- Room relay validates incoming path coordinates and caps payload sizes.
- Poll watchdog is reused rather than allocating a new delayed event on every heartbeat.

## Setup (required)
1. Back up your project. Copy the four changed scripts into the matching locations in `~/Projects/GHOST`.
2. In Lens Studio, attach `GhostStudyTogether.ts` as a Script Component to an enabled scene object.
3. Assign the same Internet Module used by `GhostSpeech`, set `enabledRoom=true`, `roomId=demo`, `participantId=lens-a`, and assign this component to `GhostMain.studyTogether`.
4. For a second running instance, use `participantId=lens-b` and the same room. Do not run two clients with the same participant ID.
5. Restart the bridge with `./tools/webcam-bridge/run_fast.sh` and reload both previews.
6. Have both clients open a practice sheet. Complete a stroke in one and look for a blue peer stroke on the other. Watch Lens Studio Logger for `[GHOST room]` entries.

## Current limits
- Peer ink is shown on the recipient's *currently open* practice sheet, so both should use the same exercise and coordinate layout.
- This sends completed strokes, not live in-progress motion; a true 30fps multiplayer ink stream requires a different transport.
- The `lesson` event shares topic/presence, **not the full generated lesson**. Joining the same topic does not guarantee identical AI lesson content. Race scores are event-level, not yet an AR scoreboard.
- The relay is local and unauthenticated. Do not expose it publicly.
- Python relay tests passed, but Lens Studio compilation, scene wiring, real webcam interaction, and two-preview behavior require testing on your Mac.
