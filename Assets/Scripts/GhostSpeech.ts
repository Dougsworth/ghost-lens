/**
 * GhostSpeech — say a skill out loud, in the Lens Studio preview.
 *
 * Owns:  asking the tracker page to open its microphone, and collecting what
 *        it heard. Nothing else.
 * Must not: decide what a transcript means. It emits the words and GhostMain
 *        treats them exactly as it treats a pinched suggestion, so the flow
 *        after speech is identical to the flow after a tap.
 *
 * ── Why the browser does the listening ──────────────────────────────────────
 * VoiceML is the right answer on real Spectacles and may not run in the Lens
 * Studio preview at all — the brief flags that as a risk. But the webcam
 * bridge already has a Chrome tab open with a live getUserMedia stream, and
 * Chrome has speech recognition built in. So in the preview the page listens
 * and hands the words over, which makes "say a skill" demonstrable today
 * rather than on device only.
 *
 * ── Why polling ─────────────────────────────────────────────────────────────
 * The bridge's websocket carries hand frames at 30 fps into a parser that
 * expects nothing else, and speech is not worth risking that path. So this is
 * two plain HTTP calls: POST /listen to arm the page, then GET /heard until a
 * transcript appears. Both sides of the mailbox are one-shot, so a transcript
 * cannot be delivered twice and a stale request cannot open the microphone
 * later.
 *
 * Tier 1 (VoiceML on device) is a seam, not a stub: when it is wired, it
 * should call the same `_onHeard` and nothing downstream changes.
 */

import Event, { PublicApi } from "SpectaclesInteractionKit.lspkg/Utils/Event";

@component
export class GhostSpeech extends BaseScriptComponent {
  @ui.label('<span style="color: #60A5FA;">GhostSpeech &ndash; say a skill, the page listens</span>')
  @ui.separator

  @ui.label('<span style="color: #60A5FA;">References</span>')
  @ui.group_start("References")
  @input
  @hint("Internet Module. Without it the mic falls back to the typed suggestion list, which is a working state, not an error.")
  internetModule: InternetModule;
  @ui.group_end

  @ui.separator
  @ui.label('<span style="color: #60A5FA;">Settings</span>')
  @ui.group_start("Settings")
  @input
  @hint("The webcam bridge, used in the preview. Needs Experimental API enabled for a plain http:// URL, the same setting the hand bridge needs.")
  bridgeUrl: string = "http://127.0.0.1:8766";

  @input
  @hint("Let the tracker page listen when the mic is pinched. Off falls straight back to the typed suggestions.")
  useBridge: boolean = true;

  @input
  @hint("How often to check whether anything was heard, in seconds.")
  @widget(new SliderWidget(0.2, 2, 0.1))
  pollSec: number = 0.4;

  @input
  @hint("Give up listening after this many seconds and go back to the suggestions. Speech recognition itself usually stops sooner.")
  @widget(new SliderWidget(3, 30, 1))
  timeoutSec: number = 12;
  @ui.group_end

  private listening = false;
  private elapsed = 0;
  private sincePoll = 0;

  private readonly _onHeard = new Event<string>();
  private readonly _onGaveUp = new Event<void>();

  /** Fires once with what the user said. */
  get onHeard(): PublicApi<string> {
    return this._onHeard.publicApi();
  }
  /** Fires if nothing was heard before the timeout, or speech is unavailable. */
  get onGaveUp(): PublicApi<void> {
    return this._onGaveUp.publicApi();
  }

  get isListening(): boolean {
    return this.listening;
  }

  onAwake(): void {
    this.createEvent("UpdateEvent").bind(() => this.onUpdate());
  }

  /**
   * Ask the page to listen. Returns false when speech is not available at all,
   * so the caller can fall back without waiting for a timeout.
   */
  startListening(): boolean {
    if (!this.internetModule || !this.useBridge) return false;
    if (this.listening) return true;

    this.listening = true;
    this.elapsed = 0;
    this.sincePoll = 0;

    let req: Request;
    try {
      req = new Request(this.bridgeUrl + "/listen", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      });
    } catch (e) {
      this.listening = false;
      return false;
    }

    this.internetModule.fetch(req).catch(() => {
      // The page is not there. Stop waiting immediately rather than making
      // the user watch "Listening..." for twelve seconds.
      this.listening = false;
      this._onGaveUp.invoke();
    });
    return true;
  }

  stopListening(): void {
    this.listening = false;
  }

  private onUpdate(): void {
    if (!this.listening) return;
    const dt = getDeltaTime();
    this.elapsed += dt;
    this.sincePoll += dt;

    if (this.elapsed >= this.timeoutSec) {
      this.listening = false;
      this._onGaveUp.invoke();
      return;
    }
    if (this.sincePoll < this.pollSec) return;
    this.sincePoll = 0;
    this.poll();
  }

  private poll(): void {
    if (!this.internetModule) return;
    let req: Request;
    try {
      req = new Request(this.bridgeUrl + "/heard", { method: "GET" });
    } catch (e) {
      return;
    }

    this.internetModule
      .fetch(req)
      .then((response: Response) => {
        if (response.status !== 200) return;
        response
          .text()
          .then((text: string) => {
            if (!this.listening) return;
            let body: any;
            try {
              body = JSON.parse(text);
            } catch (e) {
              return;
            }
            const heard = (body.text || "").trim();
            if (heard.length > 0) {
              this.listening = false;
              this._onHeard.invoke(heard);
              return;
            }
            // The page reports it has stopped and heard nothing. Give up now
            // rather than polling an idle microphone to the timeout.
            if (body.listening === false && this.elapsed > 1.0) {
              this.listening = false;
              this._onGaveUp.invoke();
            }
          })
          .catch(() => {});
      })
      .catch(() => {});
  }
}
