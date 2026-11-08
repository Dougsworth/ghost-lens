# GHOST Course Library V2

The local Python bridge **is a backend**: it serves HTTP, persists validated reviewed lessons and per-learner progress in SQLite, and relays events. No hosted backend is required for a single-Mac Lens Studio demo. For multi-device internet access and accounts, move this to a hosted authenticated service; localhost data is not shared across machines.

## Start

```bash
cd ~/Projects/GHOST
./tools/webcam-bridge/run_fast.sh
```

- Tracker: http://127.0.0.1:8766/
- Library: http://127.0.0.1:8766/library.html
- Choose a saved course in the browser to send its skill to the Lens front door via the existing speech mailbox. **Lens must be on its front door**, and its speech bridge must be polling.
- The bridge checks SQLite on `/lesson/plan`, returning reviewed cached courses without AI calls. Courses generated but not successfully reviewed are not cached.
- In Lens Studio, set `GhostMain.learnerId` to match the learner ID on the library page (`learner-a` by default). Separate previews should use different IDs.
- When a cached course begins, Lens queries `/progress` before selecting the first step, with a 1.5-second fallback if offline. Step changes save progress to the bridge.

## Limits

- The browser library is a **companion UI**, not a native spatial Lens course picker. The Lens front door opens the course via the existing `/heard` path.
- Saved progress applies to traceable planned steps. Other lesson modalities do not yet persist step state.
- The bridge binds to 127.0.0.1, with no accounts or authentication. Do not expose it publicly.
- `courses.sqlite3` is local to the bridge and excluded from the project ZIP. Back it up separately if you need to preserve actual generated courses.
- Tests cover Python course persistence and relay, not Lens Studio runtime or real AI calls.
