@AGENTS.md

# GHOST (project brief)
Hands on learning Lens for SPECS, for the Devpost "Learn AR with SPECS" hackathon (deadline Nov 9 2026, 5pm ET).
Ghost hands or a ghost fingertip demonstrate a skill right where the user's hands are, and the user copies it.

- Build with CLAD through the Lens Studio MCP. Use SIK (SpectaclesInteractionKit, already in scene) for hand tracking and pinch, and SPECS UI Kit for buttons.
- First pack: Japanese writing (あ い う え お). Stroke data: Assets/Scripts/HiraganaStrokes.ts, strokes already in correct order and direction. Coordinates normalised, centre origin, +y up, 1.0 = character height. World units are cm.
- Follow CLAD_BUILD_NOTES.md one step at a time and verify in the preview after each step.
- Second pack: ASL (hello, thank you, please, yes, no). JSL and Guitar appear as locked tiles.
- Voice: use VoiceML so "next", "replay", "slower" work hands free. Use text to speech to say each character's sound.
- Design rules: content sits at the user's hands, minimal UI in centre of view, large forgiving pinch targets, nothing in the periphery, show one thing at a time.
- Planning docs from the Devpost skill pack live in devpost/ and must stay in the repo.
- Stroke data credit: KanjiVG by Ulrich Apel, CC BY-SA 3.0.

## GHOST teaches any skill (core architecture)
GHOST is a skill engine, not a Japanese app. Every skill is a data pack played by the same engine: a ghost demonstrates, the user copies with pinch and drag or hand pose, the Lens checks, stamp, next.
Three pack types, all data driven (a pack is a JSON or TS file, no new code per skill):
- Path packs: ghost brush or fingertip traces strokes; user pinch drags each stroke. Japanese hiragana and katakana (Assets/Scripts/KanaStrokes.ts, 168 characters keyed by character), later Chinese, Korean, Arabic, cursive, drawing basics, signatures.
- Pose packs: ghost hands form a sequence of hand poses; user mirrors. ASL first (hello, thank you, please, yes, no), later JSL, guitar chords, piano fingering.
- Step packs: ghost hands perform steps on a 3D object placed on the table; user repeats with pinch and drag. Later: knots, origami, first aid.
Ask GHOST: the user says any word or phrase, Remote Service Gateway (OpenAI or Gemini) returns it in kana plus a short meaning, and GHOST writes it stroke by stroke from KanaStrokes.ts. If no API access, fall back to a fixed list of 10 useful words.
For the hackathon build: path engine with the Japanese pack and Ask GHOST, ASL as the first pose pack, other packs shown as locked notebooks to prove the engine scales.

## Webcam bridge (preview only, stretch goal)
tools/webcam-bridge streams real webcam hand points (MediaPipe) over ws://127.0.0.1:8765. Assets/Scripts/WebcamHandBridge.ts receives them and fires onPinchStart/Move/End with world positions. Build the core with SIK pinch and drag first. Then wire the brush to also accept bridge events, and first test whether the preview allows a WebSocket to localhost. Verify the InternetModule WebSocket API in WebcamHandBridge.ts against docs. Only add Internet Module / experimental API settings the project needs for this.
Use the fast bridge: tools/webcam-bridge/run_fast.sh (tracking in Chrome on the GPU, relayed on ws://127.0.0.1:8765, same message format). bridge.py is the slower fallback.
