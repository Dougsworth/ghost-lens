# GHOST V12 — Study Together across desktops (Supabase)

V11's rooms lived inside one computer's bridge. V12 mirrors every room event
through Supabase, so each desktop runs its **own** local bridge and the
bridges share rooms through the cloud. The Lens does not change at all: it
keeps talking to `127.0.0.1`, and remote learners simply appear in the room —
presence, live ink previews, shared lessons, stamps, cheers and race scores
all ride the same event stream.

```
Desktop A: Lens ⇄ local bridge ⇄
                                  Supabase (ghost_room_events)
Desktop B: Lens ⇄ local bridge ⇄
```

## One-time setup (one teammate)
1. Create a free project at supabase.com (or reuse the existing GHOST one).
2. SQL Editor → paste and run ALL of `tools/webcam-bridge/supabase_schema.sql`
   (it now also creates `ghost_room_events`).
3. Settings → API: copy the **Project URL** and the **anon public** key.
   Never the service-role key — the bridge refuses keys that look like one.

## Each desktop (both teammates)
1. `tools/webcam-bridge/credentials.env` (gitignored): fill in
   `SUPABASE_URL=` and `SUPABASE_ANON_KEY=` (same values on both desktops).
2. Start the bridge with those variables in the environment:
   - Windows (PowerShell):
     ```
     cd tools\webcam-bridge
     Get-Content credentials.env | ? {$_ -match '^\w+='} | % { $k,$v = $_ -split '=',2; if ($v) { Set-Item env:$k $v } }
     .\.venv\Scripts\python bridge_web.py
     ```
   - macOS/Linux: `set -a; source credentials.env; set +a; ./run_fast.sh`
3. Startup prints `[GHOST cloud] Study Together cloud sync on (...)`.
   `http://127.0.0.1:8766/cloud` shows live status: sent/received/errors.
4. Both Lenses join the **same room code** with **different participant IDs**
   (exactly as in STUDY_TOGETHER_V2.md). Strokes drawn on desktop A appear as
   peer ink on desktop B within about a second.

## How it works
- `cloud_rooms.py`: uploads each local room event (origin-tagged), polls for
  rows from other bridges every 0.5 s, and injects them into the local relay
  through the relay's normal validation. Presence heartbeats go up every 10 s,
  so the front door can list learners on other desktops.
- Watermarks start at "now": joining a room never replays old history.
- The 4-person room cap holds across desktops; invalid rows are dropped and
  counted, never fatal. A cloud outage queues events and retries with backoff;
  the Lenses keep working locally the whole time.

## Limits and security (demo-grade, say so on Devpost)
- Anyone holding the anon key can read/write room events. Rooms are shared
  spaces: use random codes, don't put secrets in names/lessons, and run the
  cleanup SQL in the schema file now and then (or schedule it with pg_cron).
- Latency is poll-based (~0.5–1.5 s end to end): perfect for strokes, stamps
  and scores; it is not a 30 fps motion stream.
- `GHOST_BIND=0.0.0.0` still exists for LAN-only play without Supabase, but
  the relay has no auth — prefer the cloud path.

## Tests
`python test_cloud_rooms.py` — 8 tests with a fake Supabase: upload once with
origin, inject without echo, skip own rows and old history, presence
heartbeat, invalid-row drop, cross-desktop room cap, outage requeue/recover,
service-role refusal. All existing suites still pass (24 total).
