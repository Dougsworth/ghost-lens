# GHOST demo script

Seven scenes, under three minutes. Click-by-click, with what to say and how to
reset between takes.

**Record in the Lens Studio Preview panel.** No Spectacles hardware is
available, so everything below is the preview — which is also where the mouse
is the most reliable input you have.

---

## Before you start

```bash
# 1. the key (once per shell)
set -a; source tools/webcam-bridge/credentials.env; set +a

# 2. the bridge: hand tracking, lesson planning, coach, speech, rooms
./tools/webcam-bridge/run_fast.sh
```

It opens `http://127.0.0.1:8766` in Chrome. Allow the camera, and allow the
microphone if you want scene 1's voice line.

Check it is really up before recording:

```bash
curl -s http://127.0.0.1:8766/status
# {"lenses":1,"llm":"gemini","model":"gemini-flash-latest","spend":{...},"rooms":0}
```

- `"llm":"gemini"` — planning is live. If it says `"none"`, the key is not in
  this shell and every lesson will quietly come from the bundled bank.
- `"lenses":1` — Lens Studio is connected. If it is 0, hit Reset on the Preview
  panel.

In Lens Studio: **Preview → Device = Spectacles**, and leave Interactive
Preview on so the mouse acts as a pinch.

> **The one thing that will bite you:** the SIK mouse interactor needs the
> press **held for about 1.2–1.5 s**. A quick click only hovers. Every "pinch"
> below means press and hold until the control reacts.

---

## Scene 1 — Open and pick (20 s)

**Do:** Reset the preview. The front door appears: *"What do you want to
learn?"*, the ink mic, two suggestions, "Study together", and the three packs
under "Your notebook".

Pinch **"draw a star"**.

*Or, for the voice version:* pinch the ink mic, say "draw a star" into your
microphone. The page shows `Heard: "draw a star"` and the Lens continues
identically.

**Say:** "GHOST teaches you anything, where your hands are. I'll ask it to
teach me to draw a star."

---

## Scene 2 — The lesson is written, live (15 s)

**Do:** Nothing. Watch the ink brush line advance through *Planning your
steps* → *Checking it* → *Drawing it out*, and the step titles ink on one at a
time as they arrive.

**Say:** "That's Gemini writing the lesson right now — plan, then a second
pass that checks it. The line never claims to be further along than the work
is."

**If it is slow:** at 15 s it says *"Still writing, nearly there"*; at 30 s it
falls back to a bundled lesson and says so. Both are honest states, not
failures — you can leave them in.

---

## Scene 3 — The ghost demonstrates (15 s)

**Do:** The sheet unrolls, **WATCH** brushes in, and the ghost draws the first
stroke. A numbered start dot, a direction arrow and a faint end dot appear.

**Say:** "Watch, then try, then fix. One instruction at a time, never a list."

---

## Scene 4 — Copy it, and get coached (30 s)

**Do:** **YOUR TURN** appears. Press and hold the mouse on the start dot, drag
along the stroke, release.

Watch the ink colour as you go: **green** on the line, **amber** close, **warm
red** off. Deliberately drift wide on one stroke so the red shows and a coach
tip appears.

**Say:** "Live feedback per segment — green, amber, red — and it accepts a
range, not one exact path. The tip after each attempt is written for that
attempt."

**For the hand version:** keep your hand in the webcam's view and pinch. Same
path, same colours.

---

## Scene 5 — Stamp, and the notebook remembers (15 s)

**Do:** Finish the strokes. The splash ring blooms, the red hanko lands, the
page turns.

Pinch **Packs** to return to the front door. Point out that **"draw a star"**
is now at the top of the suggestions.

Pinch it again — it opens **instantly**, with no planning line.

**Say:** "It's in the notebook now. Reopening is instant and free, and it
survives a restart."

---

## Scene 6 — Study together (30 s)

**Do:**
1. **Window → General → Preview** to open a second preview panel.
2. In panel 1, pinch **"Study together"**. A word code appears large in ink —
   e.g. `TIGER`.
3. In panel 2, pinch **"Study together"** and join with that code.
4. Both pick the same skill. Draw a stroke in panel 1 and watch it appear in
   **indigo** on panel 2's sheet with the peer's name.

**Say:** "Two people, one lesson. Their ink arrives in indigo on your paper."

> **Verify this yourself before recording.** The relay is tested (13 checks,
> 0 failures) but the Lens half has never carried a real stroke between two
> panels — see "Known limitations". If it does not work, cut this scene rather
> than implying it does.

**Honesty line if asked:** this runs on our own room relay, not Sync Kit. Sync
Kit needs sign-in and Lens Studio reports `isAuthorized: false` on this
machine. The relay is the backend, and it is a real one.

---

## Scene 7 — It scales (15 s)

**Do:** Back at the front door, pinch **Guitar** under "Your notebook". The
fretboard appears: strings, frets, string names, numbered coloured finger
circles, a chord box beside it.

**Say:** "Same engine. A path pack writes kana, a pose pack teaches a chord —
the lesson is data, not code."

---

## Reset between takes

| What | How |
|---|---|
| Back to the front door | Pinch **Packs** |
| Full reset | **Reset** on the Preview panel |
| Clear the notebook | Lens Studio → Preview → Clear Persistent Storage |
| Leave a room | Pinch **Packs**, or reset the preview |
| Bridge wedged | Ctrl-C and re-run `run_fast.sh` |
| Check spend | `curl -s http://127.0.0.1:8766/status \| python3 -m json.tool` |

A lesson costs about **$0.005** — plan plus review. Roughly 200 takes per
dollar, so do not worry about re-recording.

---

## Known limitations — say these if asked, do not hide them

**Hardware-pending** (no Spectacles available, so genuinely unknown):
- VoiceML on device. The preview uses Chrome speech through the bridge.
- Device hand tracking and the real pinch feel.
- Sync Kit. Blocked by sign-in; the room relay is the backend instead.
- Comfort of repeated pinch-and-drag at 45 cm over a long session.

**Verified working in the preview:** front door, live Gemini planning with the
staged progress line, coach tips, the kana path engine with per-segment colour
feedback, the guitar pack, the notebook persisting, browser speech end to end
through the bridge.

**Built but NOT verified end to end:**
- Two preview panels exchanging strokes (scene 6). Relay tested; the Lens half
  has not carried a real stroke between panels.
- The webcam hand pressing UI controls. It registers with SIK and hooks the
  bridge, but has not been confirmed with a real hand on a real control.
- Both LEAF scenarios after the front-door change. They compile; they have not
  been re-run.

Anything in that last list: **try it before the take, and cut it if it does not
work.** A demo that shows four solid things beats one that claims seven and
stumbles on stage.
