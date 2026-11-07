# Study Together (multiplayer), after the front door and AI coach work

Built with Spectacles Sync Kit (Connected Lenses). Testable in Lens Studio by opening extra Preview panels (Window > General > Preview), all on the same Session ID; watch data in Window > Utilities > Connected Lenses Monitor.

## Experience
- Front door gets a quiet line under the title: "3 people learning now" with their skills listed in ink ("Maya: Em chord", "Leo: あいうえお"). Pinch one to join them.
- Joining puts both learners on the same lesson. Each person's sheet sits side by side; you see the other person's ink appear live as they paint, in a second ink colour (indigo), plus their name in small type.
- Modes (pick when joining, default Together):
  - Together (co-op): take turns, one stroke each; the stamp lands when the character is complete. Shared combo.
  - Race: same character, first clean stamp wins the round, best of 5. Simple scoreboard as ink tallies.
- Cheers: pinch the other person's sheet to send a small vermilion stamp that lands on their page. One cheer per stroke, no spam.
- The AI coach stays personal: each learner gets their own tips.
- Leaving or someone dropping out never breaks your lesson; you just continue solo.

## Rules
- Up to 4 people per session. Sync only small state: lesson id, step index, stroke points (downsampled), stamps, cheers, scores.
- Same paper and ink style. No avatars or chat bubbles; presence is shown through ink and names.
- Must work in the preview with 2 Preview panels side by side (this is the demo shot).

Commit and push after each part: presence on the front door, join and live ink, co-op, race, cheers.
