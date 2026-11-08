# GHOST

Learn any skill with your hands. A ghost shows you how, right where your hands are, and you copy it.

GHOST is a Lens for SPECS, Snap's AR glasses, built for the Devpost **Learn AR with SPECS** hackathon with Lens Studio and CLAD.

## What it does

GHOST is one engine with many skill packs. Every pack works the same way: the ghost demonstrates, you copy it with your hands, GHOST checks you, a stamp lands, and you move on.

- **Japanese writing**: a ghost brush writes hiragana stroke by stroke on a washi practice sheet at real size, then you pinch and drag to paint each stroke yourself. Stroke order and direction are checked. All 46 hiragana have spoken sounds, and stroke data covers all hiragana and katakana.
- **Ask GHOST**: pick or say a word and GHOST writes it in kana for you to copy.
- **ASL**: ghost hands sign hello, thank you, please, yes and no at your hand position.
- **Coming soon**: Guitar chords, Chinese, Knots.

## Why glasses

Video lessons make you look away from your hands and flip a mirrored image in your head. GHOST puts the lesson on your hands, at real size, from your own point of view, and leaves both hands free.

## Run it

1. Install **Lens Studio 5.24.1**.
2. Open `GHOST.esproj`.
3. In the Preview panel, click to pinch, drag to paint, WASD to move.

### Optional: paint with your real hand in the preview

The Lens Studio SPECS preview has no camera hand tracking, so GHOST includes a webcam bridge. On real Specs the Lens uses native hand tracking instead.

```
bash tools/webcam-bridge/run_fast.sh
```

Then open http://127.0.0.1:8766 in Chrome and allow the camera. The page should show `lenses 1` once the preview is running. Pinch thumb and index finger to paint. Experimental API must be enabled in Project Settings for the local connection (preview only).

## Study Together (multiplayer)

Learn side by side: see each other's ink live in cyan, share one lesson, and race for points. Each person's Lens talks only to the bridge on their own computer; bridges share rooms through Supabase when you want to play across desktops.

### On one computer (two previews)

1. Start the bridge: `cd tools\webcam-bridge` then `.\.venv\Scripts\python bridge_web.py` (macOS/Linux: `bash tools/webcam-bridge/run_fast.sh`).
2. In Lens Studio, open a second Preview panel (both Interactive, same scene). The `StudyTogether` object under `GHOST` is already set to `enabledRoom = true`, `roomId = demo`. Each preview tags its participant id (`lens-a-x7k2`), so two previews of the same scene are two people.
3. In one preview pick a skill on the front door; the other, still on the front door, opens the same lesson without its own AI call. Draw in one: the other sees cyan ink before you release. Accepted strokes score race points (board on the left of the sheet); finishing a character lands a cheer stamp on your partner's sheet.

### Across two desktops (Supabase)

**Once, by one teammate:**
1. Create a free project at [supabase.com](https://supabase.com) (or reuse the GHOST one).
2. SQL Editor → paste and run all of `tools/webcam-bridge/supabase_schema.sql` (creates `ghost_room_events`).
3. Settings → API: copy the **Project URL** and the **anon public** key. Never use the service-role key; the bridge refuses keys that look like one.

**On each desktop:**
1. Copy `tools/webcam-bridge/credentials.env.example` to `credentials.env` (gitignored) and fill in `SUPABASE_URL=` and `SUPABASE_ANON_KEY=` (same values on both).
2. Start the bridge with those values in the environment:
   - Windows (PowerShell):
     ```
     cd tools\webcam-bridge
     Get-Content credentials.env | ? {$_ -match '^\w+='} | % { $k,$v = $_ -split '=',2; if ($v) { Set-Item env:$k $v } }
     .\.venv\Scripts\python bridge_web.py
     ```
   - macOS/Linux: `set -a; source tools/webcam-bridge/credentials.env; set +a; bash tools/webcam-bridge/run_fast.sh`
3. The bridge prints `[GHOST cloud] Study Together cloud sync on (...)`; `http://127.0.0.1:8766/cloud` shows sent/received/errors.
4. Both Lenses use the **same room code** (`roomId`). Ink drawn on desktop A appears on desktop B within about a second.

**Limits (demo-grade):** anyone with the anon key can read and write room events, so use random room codes and keep secrets out of lesson names; run the cleanup SQL in the schema file now and then. Sync is polled (~0.5–1.5 s), fine for strokes, stamps and scores, not a 30 fps stream. With no Supabase keys, rooms stay local to one computer. Details: `MULTIDESKTOP_V12.md`, `STUDY_TOGETHER_V2.md`.

Bridge tests: `cd tools\webcam-bridge` then run each of `test_cloud_rooms.py`, `test_cloud_sync.py`, `test_course_store.py`, `test_learning_engine.py`, `test_multiple_rooms.py`, `test_room_relay.py` with `.\.venv\Scripts\python` (24 tests).

## Project layout

- `Assets/Scripts`: GHOST engine and packs (TypeScript)
- `Assets/Scripts/KanaStrokes.ts`: stroke data for all kana
- `devpost/design-brief.md`: the design brief from the Devpost Learn skill pack
- `tools/webcam-bridge`: MediaPipe hand tracker and local relay

## Credits

Hiragana and katakana stroke data derived from [KanjiVG](https://kanjivg.tagaini.net) by Ulrich Apel, licensed CC BY-SA 3.0.
Hand tracking in the webcam bridge uses Google MediaPipe.
