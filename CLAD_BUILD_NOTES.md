# GHOST build steps for CLAD
Do one step at a time. Test in the preview after each.

1. Ghost finger tracer
   Create a GhostTracer component that takes one character from HIRAGANA and animates a translucent fingertip sphere along each stroke in order, leaving a soft line behind it. Scale the character to 30 cm tall, place it 40 cm in front of the user at chest height, facing them. About 1 second per stroke with a short pause between strokes.

2. Lesson controls
   Add three large pinchable buttons under the character: Replay, Slower (halves the speed), Next. Use SPECS UI Kit. Keep them in the lower centre of view. Add VoiceML so saying the same words works too, and text to speech that says the character's sound when it appears.

3. Your turn
   After the ghost finishes, show the stroke guide faintly. Track the user's index fingertip with SIK and draw their trace. A stroke passes when most of its points are within 3 cm of the guide. Show a quiet check mark and move on.
   Fallback if simulated hands make this unreliable: a single Done pinch.

4. Pack picker
   Before the lesson, show tiles: Japanese writing (active), ASL (active once built), Japanese Sign Language and Guitar (locked, greyed, "Coming soon"). Large tiles, centred.

5. Finish
   After all five characters, show "あいうえお learned" and a button back to the packs.

6. ASL pack
   Ghost hand model performs hello, thank you, please, yes, no as posed keyframes with smooth blending, anchored at the user's hand position. Same controls and flow.
