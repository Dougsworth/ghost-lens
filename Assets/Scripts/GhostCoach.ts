/**
 * GhostCoach — one short line after an attempt.
 *
 * Owns:  asking the planner bridge for a coaching tip, and the bundled lines
 *        it falls back to. Mirrors GhostLessonSource's shape deliberately:
 *        same tiers, same promise that something always answers.
 * Must not: decide WHEN to coach, or show anything. GhostMain calls it after
 *        an attempt and hands the answer to the UI.
 *
 * The brief's rule is that a coach must never block the lesson, so every
 * failure path here ends in a bundled line rather than an error. A dead key,
 * no Internet Module, a slow model, a reply that is prose instead of JSON —
 * all of them end with the learner being told something useful. The only thing
 * that changes is whether the sentence was written for this attempt or picked
 * from a short list.
 *
 * The fallbacks are keyed by the SAME reason codes GhostStrokeCheck emits, so
 * an offline tip is still specific to what went wrong. A coach that always
 * says "try again" is worse than no coach at all.
 *
 * No key or token lives in this project. On device the Remote Service Gateway
 * holds its own credential; in the preview the bridge reads the user's from
 * their shell environment.
 */

import Event, { PublicApi } from "SpectaclesInteractionKit.lspkg/Utils/Event";

/** What the learner just did, as the coach needs to hear it. */
export type Attempt = {
  /** The skill being learnt, e.g. "draw a star". */
  skill: string;
  /** Which step, in words, e.g. "stroke 2 of 3". */
  step: string;
  /** "ok" | "off" | "reversed" | "short" — GhostStrokeCheck's verdict. */
  reason: string;
  /** Anything extra worth saying, e.g. which part of the stroke drifted. */
  detail?: string;
};

/** Said when there is no planner. Keyed by GhostStrokeCheck's reason codes. */
const FALLBACK: { [reason: string]: string } = {
  off: "Start on the dot and follow the grey line.",
  reversed: "Right shape — now draw it the other way.",
  short: "Keep going to the end of the stroke.",
  ok: "That is the one. Same again.",
};
const FALLBACK_DEFAULT = "Take it slowly and follow the line.";

export function bundledTip(reason: string): string {
  const r = (reason || "").trim().toLowerCase();
  return FALLBACK[r] || FALLBACK_DEFAULT;
}

@component
export class GhostCoach extends BaseScriptComponent {
  @ui.label('<span style="color: #60A5FA;">GhostCoach &ndash; one short line after an attempt</span>')
  @ui.separator

  @ui.label('<span style="color: #60A5FA;">References</span>')
  @ui.group_start("References")
  @input
  @hint("Internet Module. Without it the coach still speaks, using its bundled lines.")
  internetModule: InternetModule;
  @ui.group_end

  @ui.separator
  @ui.label('<span style="color: #60A5FA;">Settings</span>')
  @ui.group_start("Settings")
  @input
  @hint("The webcam bridge's coach endpoint, used in the Lens Studio preview. Needs Experimental API enabled for a plain http:// URL.")
  bridgeUrl: string = "http://127.0.0.1:8766/coach";

  @input
  @hint("Ask the bridge for a written tip. Turn off to use only the bundled lines.")
  useBridge: boolean = true;

  @input
  @hint("Seconds to wait for a tip before falling back. Short on purpose: the learner is mid-stroke, and a late tip is worse than a bundled one.")
  @widget(new SliderWidget(1, 15, 0.5))
  timeoutSec: number = 6;
  @ui.group_end

  private readonly _onTip = new Event<string>();

  /** Fires exactly once per ask, with whatever line the learner should hear. */
  get onTip(): PublicApi<string> {
    return this._onTip.publicApi();
  }

  /**
   * Ask for a tip. Always answers, once.
   *
   * The bundled line is computed up front and used as the deadline's answer,
   * so a planner that never replies still produces a specific tip at
   * `timeoutSec` rather than silence.
   */
  ask(attempt: Attempt): void {
    const safe = bundledTip(attempt.reason);
    let done = false;
    const finish = (tip: string) => {
      if (done) return;
      done = true;
      this._onTip.invoke(tip && tip.trim() ? tip.trim() : safe);
    };

    const deadline = this.createEvent("DelayedCallbackEvent");
    deadline.bind(() => finish(safe));
    deadline.reset(this.timeoutSec);

    if (!this.internetModule || !this.useBridge) {
      finish(safe);
      return;
    }

    let req: Request;
    try {
      req = new Request(this.bridgeUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          skill: attempt.skill,
          step: attempt.step,
          reason: attempt.reason,
          detail: attempt.detail || "",
        }),
      });
    } catch (e) {
      finish(safe);
      return;
    }

    this.internetModule
      .fetch(req)
      .then((response: Response) => {
        if (response.status !== 200) {
          finish(safe);
          return;
        }
        response
          .text()
          .then((text: string) => {
            try {
              const body = JSON.parse(text);
              // The bridge's /coach always answers 200 with a tip, even when
              // its own LLM call failed — so a missing field here means the
              // schemas drifted, not that the learner should hear nothing.
              finish(typeof body.tip === "string" ? body.tip : safe);
            } catch (e) {
              finish(safe);
            }
          })
          .catch(() => finish(safe));
      })
      .catch(() => finish(safe));
  }
}
