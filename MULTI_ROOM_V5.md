# GHOST V5 — Multiple Study Rooms

The companion Study Together page now lists active rooms and rooms previously joined in this browser. You can create multiple six-character rooms, switch between them, leave one, and rejoin by code. Each room retains its own participants and event stream (while the bridge is running). Capacity remains four learners **per room**.

Run `./tools/webcam-bridge/run_fast.sh`, then visit `http://127.0.0.1:8766/room.html`.

New endpoints:
- `GET /rooms?person=<participant-id>` returns active rooms and participant counts.
- `POST /room/leave` with `{ "room": "ABC234", "person": "learner-a" }` removes a participant from that room.

The room directory is a local preview feature, not a public directory; it has no authentication. Room activity is held in bridge memory, so rooms with no active participants disappear from the active list. Previously joined codes remain in that browser's local storage. Rooms are not persistent cloud records, and Lens scene room selection still needs manual integration.

Security note: this preview room list exposes local participant names and lessons. Do not expose the bridge directly to the public internet.
