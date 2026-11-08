# GHOST Study Together — preview integration

## Included
- Local HTTP room relay (`/room`) with up to four participants, presence, lesson topics, incremental stroke/step/cheer/race events, and 30-second presence expiry.
- Browser `room.html` with shared drawing, learner cards, cheers and race-point events.
- `GhostStudyTogether.ts`: Lens Studio component for room presence, sending lesson/step/ink/cheer/race events and receiving remote events.
- `GhostMain.ts` optional integration publishes the selected skill and accepted Japanese stroke index, and logs other learners' events.

## Wire in Lens Studio (required)
1. Import the updated files and let Lens Studio compile.
2. Add a Script Component using `GhostStudyTogether.ts` to a scene object that stays enabled.
3. Assign the **same Internet Module** used by `GhostSpeech`.
4. Set `enabledRoom=true`, `roomId=demo`, `participantId=lens-a`, `learnerName=Alice`.
5. Assign that component to the new optional `studyTogether` input on `GhostMain`.
6. In a second Preview panel use a **different participantId** (for example `lens-b`) and the same room ID. If both panels share the same scene input values, they will masquerade as one learner. Separate scene copies or runtime per-panel ID injection are needed.
7. Start `./tools/webcam-bridge/run_fast.sh` and check the Lens Studio Logger for `[GHOST room]` lines.
8. Open `http://127.0.0.1:8766/room.html` in a browser tab to see presence and shared browser ink.

## Important limitations
- This is a **local development relay**, not an internet-hosted service. `127.0.0.1` works only when the Lens preview and bridge run on the same Mac. Remote Spectacles need a reachable HTTPS server and authentication.
- Lens clients **receive remote stroke events**, but those points are not yet rendered into a second AR sheet. Browser-to-browser live ink works; full Lens-to-Lens shared ink and synchronized lesson state are NOT complete.
- The room is unauthenticated; don't expose the server publicly.
- Chrome microphone permissions and hand-detection quality require real hardware testing.
- This package was tested with Python unit tests and syntax checks; Lens Studio runtime behavior was not verified here.
