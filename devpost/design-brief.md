---
status: approved
---

# Design brief: GHOST

## The one spatial moment
I'm standing at my desk with both hands free, glasses on. A 15 cm square of warm washi practice paper hangs about 45 cm in front of me at chest height. A ghost brush touches down and writes あ in black sumi ink, stroke by stroke. The ink fades to a pale grey outline, the brush comes to rest at the start of stroke 1, and it's my turn: I pinch to pick up the brush and drag along the stroke, and my ink darkens and dries into place when it matches.

## Why it belongs on glasses
- Uses: draws in the world; leaves your body free
- Why it's better than the phone or laptop version: on a phone you drag a finger across glass at thumbnail size. Here the paper hangs at real writing distance in my own room at real size, and I move my whole hand and arm through the stroke — the muscle memory is the point, and that only exists if the stroke is life-size in front of me with both hands free.

## Product or overlay
- Type: product — the virtual thing is the experience. Nothing in the real world needs to be recognised for the core lesson.
- What the real version would sense: my own hand (fingertip path and pinch). Nothing about the room.
- Stand-in for the preview: none needed for the core — the preview's mouse acts as one hand doing a pinch, which is exactly the writing input. Stand-ins are only needed at the edges:
  - Voice commands ("next", "slower", "packs", "ask") → every one has a bookmark tab that does the same job.
  - Ask GHOST translation via Remote Service Gateway → a fixed fallback list of 10 words that can be pinched.
  - Spoken character sound (text to speech) → pre-generated audio clip per character (default).
  - ASL hand-pose check → a "Got it" tab the user pinches to self-check (tier 3 below).

## Where things live
- Where the user is looking during the main task: straight at the sheet, a little below eye level, about 45 cm in front at chest height. Arms stay low. The head never has to move during a lesson.
- **Practice sheet**: 15 cm square. Warm washi texture, slightly uneven edges, a faint grid of four light squares like Japanese practice paper. Centred, 45 cm from the user, chest height. One character fills most of it. Unrolls in from the top like a scroll when a notebook opens. Anchored in the world where it appears at the start of the lesson; it does not follow the head (default).
- **Bookmark tabs**: Replay, Slower, Next, Packs — small paper tabs like bookmarks sticking out of the right edge of the page, stacked vertically, about 3 cm clear of the sheet, each at least 3 cm tall, thin grey type. In the Japanese pack a **mic tab** (Ask GHOST) joins the stack; in ASL a **Got it** tab appears when it's needed.
- **Stroke counter**: "1 / 3" in small grey thin type at the top left corner of the sheet.
- **Left side**: deliberately empty, so the view feels calm.
- Everything sits within the centre 25 cm of width. At 45 cm the glasses show roughly 18 cm tall by 31 cm wide, so 15 cm of sheet plus a 3 cm gap plus the tabs fits with room to spare.
- **Notebook shelf** (the pack chooser): five small notebooks lying side by side in the same spot the sheet will occupy, 45 cm away. Covers: Japanese (あ), ASL (a simple hand line drawing), and Guitar Chords, Chinese and Knots wrapped in a paper band labelled "Coming soon", slightly faded. Covers about 4.5 cm wide with 1 cm gaps, so all five stay inside the centre 25 cm without moving the head (default — see Risks).
- Pinching a notebook lifts it, flips it open, and its first page becomes the practice sheet. No separate menu screen.
- ASL signs are demonstrated at hand height, in front of the user, in place of the sheet.

## Hands and input
- **Open a pack**: pinch a notebook cover on the shelf.
- **Write one stroke**: pinch to pick up the brush where it rests at the stroke's start point, hold the pinch and drag along the stroke — wet sumi ink follows the brush — then release to lift the brush off the paper. One pinch-and-drag is one stroke.
- **Stroke check on release**: if the drag roughly follows the outline in the right direction, the ink darkens and dries with a soft brush sound and the brush hops to the start of the next stroke. If it's well off, the ink fades away gently and the start point pulses. No harsh error, no red X.
- **Forgiveness**: only the rough shape and direction need to match, not precision. After three misses on the same stroke, the ghost brush quietly demonstrates that one stroke again.
- **Tabs**: pinch. Replay (replay the demo), Slower (replay at half speed), Next, Packs (close the notebook back onto the shelf), mic (Ask GHOST), Got it (ASL self-check).
- Targets are big and highlight when aimed at. Tabs at least 3 cm tall.
- Voice (if any) and the button that does the same job: "next" → Next tab; "slower" → Slower tab; "packs" → Packs tab; "ask" → mic tab. Voice is a convenience only; nothing is reachable by voice alone.
- **ASL input, chosen automatically in this order**: (1) on real SPECS, native SIK hand tracking checks the handshape against the target pose; (2) in the preview, if the webcam bridge connects, the same pose check runs on the 21 MediaPipe points from the bridge, so real-hand ASL can be filmed; (3) if neither is available, a "Got it" tab appears after the ghost signs and the user pinches it to self-check and move on. The lesson flow is identical in all three cases.

## When things show
- **Notebook shelf**: at Lens start; again whenever Packs is pinched, or when a set is finished (the notebook closes back onto the shelf with a stamp on its cover).
- **Practice sheet and tabs**: after a notebook is pinched open; they unroll in together.
- **Ghost demonstration**: automatically when a new character's sheet appears. About one second per stroke, with a small pause and a quiet brush sound between strokes. A small grey stroke number appears at each starting point. The character's sound is spoken once at the end.
- **Pale grey guide outline**: replaces the ink when the demo finishes, and stays for the user's turn.
- **Start point pulse**: only after a missed stroke, to show where to begin again.
- **Got it tab (ASL)**: only after the ghost has signed, and only in tier 3.
- **Red hanko stamp and page turn**: when every stroke of a character is done; the sheet lifts slightly, the stamp lands in the corner, and the page turns to a fresh sheet for the next character.
- If something needs attention out of view: nothing is ever placed out of view, so no arrow is needed. Sound carries the feedback — brush strokes, the stamp, the spoken sound.

## Done criteria
Each one can be checked in Lens Studio's preview.
1. The Lens opens on the notebook shelf: Japanese and ASL are open, and Guitar Chords, Chinese and Knots are wrapped with "Coming soon". Pinching Japanese flips the notebook open into the 15 cm washi practice sheet, with Replay, Slower, Next and Packs tabs on the right — all of it in view without moving my head.
2. On the sheet, the ghost brush writes あ stroke by stroke in sumi ink in the correct order, the stroke counter reads 1/3, 2/3, 3/3, and the sound "a" plays at the end. Pinching Slower replays it at half speed; pinching Replay replays it.
3. My turn: I pinch and drag roughly along stroke 1 of あ, release, and the ink darkens and the brush hops to the start of stroke 2. A drag far off the guide fades away and the start point pulses instead. Finishing all strokes lands the red stamp and turns the page to い.
4. Ask GHOST: pinching the mic tab and saying "friend" writes ともだち on the sheet stroke by stroke with the meaning in small type. If speech or the AI call doesn't run in the preview, picking "friend" from the fallback list of 10 words does exactly the same thing — this criterion passes in that fallback form.
5. ASL: opening the ASL notebook, the ghost hands sign "hello" at hand height, then a Got it tab appears. Pinching it stamps the sign and moves on to "thank you". Pinching Packs closes the notebook back onto the shelf.

## Out of scope
- Step packs (knots, origami, first aid) — the third engine isn't built; Knots appears as a cover only.
- Guitar Chords and Chinese beyond their "Coming soon" covers.
- Lessons for the full 168-character kana set. The data is all in `KanaStrokes.ts` and the path engine reads any of it, but the Japanese pack's lesson sequence for this build is あ い う え お.
- Remembering progress between sessions.
- Two people sharing a Lens.
- Anything that records, identifies or follows other people. GHOST only ever looks at the user's own hand.

## Risks and open questions
- **Webcam bridge is unproven** (`tools/webcam-bridge/bridge.py` → `Assets/Scripts/WebcamHandBridge.ts`). Two unknowns: whether the preview's `InternetModule` will open a plain `ws://` to 127.0.0.1 at all, and whether the stream is smooth enough to trace with. It is a stretch goal, attempted only after the Japanese path engine works end to end, and nothing in the done criteria depends on it.
- **Five notebook covers in a narrow view.** At 45 cm the view is about 31 cm wide. Five 6 cm covers plus gaps would overflow it, so the brief defaults to 4.5 cm covers with 1 cm gaps (about 26 cm). If the covers read too small to recognise, the shelf can go slightly further back instead — the learner's rule is that the head never has to move.
- **Remote Service Gateway** may be unavailable; the 10-word fallback list carries Ask GHOST.
- **VoiceML** may not run in the preview; every spoken command has a tab, so nothing is lost.
- **Text to speech** may not run in the preview; pre-generated audio clips per character are the fallback (default).
- **ASL pose matching can't be tried in the preview** without the bridge. Tier 3 ("Got it") carries the demo. Pose-check accuracy on real hands is feel unproven.
- **Stroke-match tolerance** will need tuning by hand in the preview: forgiving enough that a rough drag passes, strict enough that a wrong-direction drag fails.
- Comfort of repeated pinch-and-drag writing at 45 cm over a long session is feel unproven.

## Build notes for CLAD
- Build for SPECS so it runs and can be demonstrated in Lens Studio's preview. No SPECS device is available.
- Use Spectacles Interaction Kit (SIK) and UI Kit for all interactions, so they work with the mouse in Interactive Preview and with LEAF.
- Build any stand-in exactly as described above, and keep it obvious in the scene.
- Use real-world scale in centimeters. Keep content inside the user's view during the main task.
- The display is additive: black renders as transparent. Don't rely on black or very dark content to be seen; keep text light and readable from where the user stands.
- Get the basic flow working first, then add detail.
- Write LEAF scenarios for each done criterion, run them in preview, and report which pass. Say which criteria have no test.
- Don't record, identify, or follow people.

Project specifics:
- Stroke data: `Assets/Scripts/KanaStrokes.ts` (168 kana keyed by character; strokes in correct order and direction; coordinates normalised, centre origin, +y up, 1.0 = character height). `Assets/Scripts/HiraganaStrokes.ts` is the earlier five-character file.
- Sumi ink is dark, and the display is additive — black reads as transparent. The ink needs to be a value that actually shows on glass while still reading as brush ink; test this early, it affects every screen.
- Follow `CLAD_BUILD_NOTES.md` one step at a time and verify in the preview after each step.
- Stroke data credit: KanjiVG by Ulrich Apel, CC BY-SA 3.0.

## After the build: judge it
This part is for you, after CLAD finishes.

1. **Does it work?** Ask your agent which LEAF tests passed and which done criteria have no test.
2. **Walk around it.** Open the preview in Interactive Preview. Use WASD to move, Q and E to go down and up, and right-drag (or hold Shift) to look around. Clicking acts as a pinch. Stand where a user would and look at the task.
3. **Ask the three questions.**
   - Does it use what I'm looking at?
   - Does it put something in my space, where it belongs?
   - Does it free my hands or let me keep my eyes up?
   - Would it be just as good on a phone? If so, what would make it need the glasses?
4. **Check comfort.**
   - Everything I need is in view while I do the task. Nothing sits at the edges, behind me, or stuck to my face.
   - Every control is within reach of someone standing there.
   - Text reads easily from where I stand. No dark UI disappearing.
   - Things show when needed and get out of the way.
5. **Label what you know.** Write "logic proven" next to anything the tests and preview show working, and "feel unproven" next to anything only real glasses could tell you (comfort over time, real hand tracking, real recognition).
6. **Fix with design notes, not code.** Tell your agent what to change in design terms, for example: "Move the step card 15 cm lower and next to the pan. Make the Next button twice as big. Re-run the tests." If a fix takes under a minute, like nudging a panel, do it yourself in the scene.
7. **Submit.** Record a video under 3 minutes of your Lens in the preview, public on YouTube. Make your repo public with your Lens Studio project and this `devpost/` folder. Details are on the hackathon site: https://learn-specs.devpost.com/resources
