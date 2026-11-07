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

## Project layout

- `Assets/Scripts`: GHOST engine and packs (TypeScript)
- `Assets/Scripts/KanaStrokes.ts`: stroke data for all kana
- `devpost/design-brief.md`: the design brief from the Devpost Learn skill pack
- `tools/webcam-bridge`: MediaPipe hand tracker and local relay

## Credits

Hiragana and katakana stroke data derived from [KanjiVG](https://kanjivg.tagaini.net) by Ulrich Apel, licensed CC BY-SA 3.0.
Hand tracking in the webcam bridge uses Google MediaPipe.
