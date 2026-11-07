# GHOST: AI first (current direction, overrides older priorities where they conflict)

Goal: less finicky, AI at the centre. Deadline Monday Nov 9, 5pm ET. Scope freeze Sunday night.

1. "Teach me anything" is the hero.
   - The Lens opens on it: one large notebook front and centre ("Teach me anything"), the existing packs (Japanese, ASL, Guitar) as smaller notebooks beside it.
   - I say a skill (VoiceML) or pick a suggestion. The LLM builds the lesson (plan, then review pass), the outline card shows, the ghost teaches each step.
2. AI coach after every attempt.
   - Send the attempt summary to the LLM: skill, step, my path vs target (or per finger error), which segment or finger was off, attempt count.
   - Show and speak ONE short, specific, friendly tip (max 12 words), e.g. "Start the curve a bit lower, then sweep right."
   - Use the same /lesson bridge (add /coach) in the preview and Remote Service Gateway on Spectacles. Fall back to a fixed tip per error type if no LLM.
3. Forgiving checks everywhere.
   - Pass on rough shape and direction. Never block progress: after 2 misses, offer "Keep going" with a softer stamp.
4. Inputs.
   - Mouse pinch and drag in the preview is the main demo input and must always work perfectly.
   - Webcam bridge is an optional bonus; trust the tracker's single hand pinch flag (ownPinchDecision off).
5. Keep the Watch, Try, Fix loop, big single line words, ink and paper style from NEXT_UX_OVERHAUL.md.

Order: 1, then 2, then 3, then 4. Verify each in the preview with a capture, commit and push after each.
Demo script target: open GHOST, say "teach me to write my name in Japanese", lesson builds, ghost writes, I paint, coach tip, stamp. Then "teach me an Em chord" from the same engine.
