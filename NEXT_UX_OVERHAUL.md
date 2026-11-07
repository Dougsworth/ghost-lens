# GHOST UX overhaul (do after Guitar reports)

The engine stays; the interaction is too complex. Apply these research backed rules everywhere (Japanese, ASL, Guitar, Teach me).

Sources: Snap Spectacles Design Best Practices; Frontiers in VR 2025 study on AR hand augmentations as error feedback for gesture tutorials; Unplugged (Quest) reviews.

1. One loop: Watch, Try, Fix.
   - Watch: ghost demonstrates on my own hand position (pose skills) or on the surface (path skills). One short spoken line and one short text line.
   - Try: I copy. Live colour feedback per finger joint (pose) or per stroke segment (path): green = right, amber = close, red = off. Accept a range, not one exact pose.
   - Fix: only the wrong finger or segment pulses and the ghost replays just that part. Guidance fades as I succeed (full ghost, then outline only, then no ghost).
2. Target hand superimposed on my real hand, using SIK on device and the webcam bridge's 21 points in the preview. Colour each joint by error.
3. One learning card only, centred slightly low: skill name, one instruction, progress bar. Text on a soft backdrop for legibility. Max 3 windows, max 7 items anywhere.
4. Controls: replace the side tabs with a palm up hand menu (Replay, Slower, Next, Packs), the standard Specs pattern, plus voice commands. Keep a pinchable fallback for the mouse preview.
5. First run tutorial, 20 seconds: pinch to select, palm up for the menu, good lighting for the webcam bridge.
6. Distances: reading content about 1 m away; things I touch within arm's reach. Nothing in the edges of view.
7. Progression like Unplugged: simplest items first (fewest strokes or fingers), increase gradually; combos and clear, soft sounds for hit and miss.
8. Guitar: target chord hand overlaid on my left hand with per finger colours; strum with the right. Start with 1 and 2 finger chords (Em, Asus2) before C, G, D.

Order: Japanese first, verify in preview, commit and push, then ASL, Guitar, Teach me. Show a capture after each.
Scope freeze: no new features after Sunday night. Deadline is Monday Nov 9, 5pm ET.

## Priority 0: readability and stroke quality (do this first, it's quick)
From my testing of え:
- Text far bigger: romaji under the sheet, stroke counter, tab labels, stroke numbers, tips. Nothing smaller than what reads easily at arm's length. Counter and stroke numbers at least 3x current size.
- Smoother strokes: densify the kana path points (Catmull-Rom, many more samples), and use a round-capped ribbon with smooth width changes. No faceted corners, no blocky or pointed squares at the ends.
- Real brush ends: start of each stroke a soft rounded press (slightly wider), end tapers naturally into a thin tail (harai) or a short flick where the kana has one. No arrow-like pointed tips.
- Clear start and end markers for my turn: a numbered start dot at the beginning of each stroke and a small arrow along the first part showing direction; a faint end dot so I know where to stop.
- The brush tip (white diamond) should look like a brush tip (soft teardrop), smaller, and sit on the stroke rather than beside it.
Verify on あ and え in the preview with a capture, commit and push.

## Priority 1: make it beautiful and dead simple (right after Priority 0)
Style: sumi ink and washi, animated. No neon, no heavy glows, no stacked boxes or pill buttons.

Big words, one at a time, centred just above the sheet, large and bold enough to read instantly:
- "WATCH" while the ghost writes
- "YOUR TURN" when it's my go
- "STROKE 1 OF 3" then the tip, e.g. "LEFT TO RIGHT"
- "NICE" / "CLEAN" / "PERFECT" on success, "TRY AGAIN" on a miss
Each word brushes in (ink wipe left to right, 0.3 s) and fades out. Never more than one instruction line on screen.

Animations:
- Ink: strokes draw with a wet leading edge that dries darker behind it; tiny ink speckle where the brush first touches.
- Success: ink splash ring blooms out from the stroke, the stroke briefly thickens then settles. Soft sound.
- Miss: the wrong stroke shivers and evaporates like ink drying away, the start dot pulses.
- Character done: red hanko stamp slams down with a small screen shake and ink spatter, then the page curls and turns.
- Shelf: notebooks float in with a gentle stagger; pinching one makes it open like a real book.
- Cursor: soft ink drop that leaves a faint trail as it moves; grows when pinching.
- Progress: the 5 dots fill with ink as each character is completed.

Simplicity:
- Remove anything not needed in the moment: hide tabs during WATCH, show only Replay and Next during YOUR TURN.
- First time ever: a 3 step overlay, each a single big word plus a tiny animation: "PINCH" (fingers closing), "DRAG" (ink trail), "LET GO".
Verify in preview with captures, commit and push.
