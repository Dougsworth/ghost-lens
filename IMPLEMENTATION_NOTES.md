# GHOST sync + multiplayer implementation notes

## Included
- `GhostSpeech.ts`: continuous transcript polling so browser-initiated speech is received without pressing the Lens mic, and a pending-request guard.
- `bridge_web.py` and `room_relay.py`: localhost-only `/room` POST and GET relay with four-person presence, expiring membership, ordered events, incremental polling, and size limits.
- `room.html`: two-browser-tab demonstration of shared presence, learning topic, live ink, cheers, stamps, and race point events.
- `test_room_relay.py`: basic relay unit tests.

## Not yet complete
- This is **not** a full Sync Kit Lens multiplayer integration. `room.html` proves the fallback relay transport in browser tabs; the Lens scene still needs its own room client and renderers for remote ink and scoreboards.
- Browser microphone start from a Lens-triggered poll may be blocked by Chrome's user-activation policy. The page microphone button is the reliable fallback.
- No real Lens Studio, webcam, or two-preview test was possible in this environment.
- Do not expose the unauthenticated local relay on the public internet.

## Run
`cd ~/Projects/GHOST && ./tools/webcam-bridge/run_fast.sh`

Open `http://127.0.0.1:8766/room.html` in two browser tabs. Join room `demo` with different names. Ink from one tab should appear on the other. For voice, open `http://127.0.0.1:8766/tracker.html` and click the mic.

## Test
`cd tools/webcam-bridge && python3 -m unittest -v test_room_relay.py`
