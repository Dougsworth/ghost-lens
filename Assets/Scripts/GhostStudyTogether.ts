/**
 * GHOST Study Together — preview relay client.
 * Attach to a scene object, wire Internet Module, and assign a distinct
 * participantId per Preview panel. No cloud auth: LOCAL DEMO ONLY.
 * Emits remote events; the host decides how to draw them on its sheet.
 */
import Event, { PublicApi } from "SpectaclesInteractionKit.lspkg/Utils/Event";

@component
export class GhostStudyTogether extends BaseScriptComponent {
  @input internetModule: InternetModule;
  @input bridgeUrl: string = "http://127.0.0.1:8766";
  @input roomId: string = "demo";
  @input participantId: string = "lens-a";
  @input learnerName: string = "Lens learner";
  @input enabledRoom: boolean = false;
  @input pollSeconds: number = 0.7;
  /**
   * Two Preview panels run the SAME scene, so they would share participantId,
   * and the relay hides events from your own id — each would treat the other's
   * ink as its own and never draw it. With this on, each Lens run appends a
   * short random tag (lens-a-x7k2), so two previews are two people. Turn off
   * on device if you want the exact id.
   */
  @input uniquePerPreview: boolean = true;

  private skill = "Exploring GHOST";
  private outgoing: any[] = [];
  private sending = false;
  private lastLiveAt = -100;
  private liveStrokeId = 0;
  private scores: {[key: string]: number} = {};
  private readonly _onScores = new Event<string>();
  get onScores(): PublicApi<string> { return this._onScores.publicApi(); }
  private seq = 0;
  private elapsed = 0;
  private busy = false;
  private joined = false;
  /**
   * False until the first poll after joining. That poll returns the room's
   * whole retained history, and replaying it drew ink, paths and scores from
   * people who had already left as if they were live. On catch-up only the
   * latest shared lesson is kept (a late joiner on the front door should still
   * get the lesson); everything older is skipped.
   */
  private caughtUp = false;
  private watchdog: any = null;
  private participants: {[key: string]: {name: string; lesson: string}} = {};
  private readonly _onEvent = new Event<any>();
  private readonly _onPresence = new Event<string>();
  get onRemoteEvent(): PublicApi<any> { return this._onEvent.publicApi(); }
  get onPresence(): PublicApi<string> { return this._onPresence.publicApi(); }

  onAwake(): void {
    if (this.uniquePerPreview) {
      const tag = Math.floor(Math.random() * 36 ** 4).toString(36);
      this.participantId = (this.participantId || "lens") + "-" + ("0000" + tag).slice(-4);
    }
    print("[GhostStudyTogether] room=" + this.roomId + " as " + this.participantId +
      (this.enabledRoom ? "" : " (room disabled)"));
    this.createEvent("UpdateEvent").bind(() => {
      if (!this.enabledRoom || !this.internetModule || this.busy) return;
      this.elapsed += getDeltaTime();
      if (this.elapsed >= Math.max(0.3, this.pollSeconds)) {
        this.elapsed = 0;
        this.heartbeat();
      }
      this.flush();
    });
  }

  setSkill(skill: string): void {
    this.skill = (skill || "Exploring GHOST").slice(0, 120);
    this.sendEvent("lesson", {skill: this.skill});
  }
  sendLesson(lesson: any): void {
    // A full validated lesson is shared once by its author. Other peers must
    // not independently call the AI planner for the same exercise.
    this.sendEvent("lesson_full", {lesson});
  }
  sendLivePath(points: {x: number; y: number}[]): void {
    const now = getTime();
    if (now - this.lastLiveAt < 0.12 || points.length < 2) return;
    this.lastLiveAt = now;
    const stride = Math.max(1, Math.ceil(points.length / 36));
    const sampled = points.filter((_: any, i: number) => i % stride === 0);
    if (sampled[sampled.length - 1] !== points[points.length - 1]) sampled.push(points[points.length - 1]);
    this.sendEvent("ink_live", {strokeId: this.liveStrokeId, points: sampled});
  }
  finishLivePath(): void {
    this.sendEvent("ink_end", {strokeId: this.liveStrokeId++});
  }
  sendStroke(a: {x: number; y: number}, b: {x: number; y: number}): void {
    this.sendEvent("stroke", {a, b});
  }
  sendPath(points: {x: number; y: number}[]): void {
    if (points.length < 2) return;
    // Cap geometry to avoid flooding the HTTP relay with high-rate hand samples.
    const stride = Math.max(1, Math.ceil(points.length / 80));
    const reduced = points.filter((_: any, i: number) => i % stride === 0);
    if (reduced[reduced.length - 1] !== points[points.length - 1]) reduced.push(points[points.length - 1]);
    this.sendEvent("path", {points: reduced});
  }
  sendStep(index: number): void { this.sendEvent("step", {index}); }
  sendCheer(): void { this.sendEvent("cheer", {}); }
  sendRacePoint(score: number): void {
    this.scores[this.participantId] = score;
    this.emitScores();
    this.sendEvent("race", {score});
  }
  private emitScores(): void {
    // One player per line so the board fits the narrow column left of the
    // sheet. "You" for this Lens; others by their short preview tag.
    const ordered = Object.keys(this.scores).sort((a, b) => this.scores[b] - this.scores[a]);
    this._onScores.invoke("RACE\n" + ordered.map((id, i) =>
      (i + 1) + ". " + this.displayName(id) + "  " + this.scores[id]).join("\n"));
  }
  /** "You", the learner's name, or the short preview tag (lens-a-x7k2 -> x7k2). */
  displayName(id: string): string {
    if (id === this.participantId) return "You";
    const p = this.participants[id];
    if (p && p.name && p.name !== this.learnerName) return p.name.slice(0, 12);
    const dash = id.lastIndexOf("-");
    return dash >= 0 ? id.slice(dash + 1) : id.slice(0, 12);
  }

  private request(path: string, payload: any, callback: (data: any) => void, onError?: () => void): void {
    try {
      const options: any = payload === null ? {method: "GET"} : {
        method: "POST", headers: {"Content-Type": "application/json"}, body: JSON.stringify(payload)
      };
      this.internetModule.fetch(new Request(this.bridgeUrl + path, options))
        .then((response: Response) => {
          if (response.status !== 200) throw new Error("HTTP " + response.status);
          return response.text();
        })
        .then((body: string) => callback(JSON.parse(body)))
        .catch((error: any) => { print("[GhostStudyTogether] " + error); if (onError) onError(); });
    } catch (error) { print("[GhostStudyTogether] " + error); if (onError) onError(); }
  }

  private payload(event: any): any {
    return {room: this.roomId, person: this.participantId,
      name: this.learnerName, lesson: this.skill, event};
  }
  private sendEvent(type: string, extra: any): void {
    if (!this.enabledRoom || !this.internetModule) return;
    const event = {type, ...extra};
    // Serialize outgoing events so a final path cannot overtake live ink.
    if (this.outgoing.length >= 80) this.outgoing.shift();
    this.outgoing.push(event);
    this.flush();
  }
  private flush(): void {
    if (this.sending || !this.outgoing.length) return;
    this.sending = true;
    const event = this.outgoing[0];
    this.request("/room", this.payload(event), (data: any) => {
      this.outgoing.shift();
      this.sending = false;
      this.flush();
    }, () => { this.sending = false; });
  }
  private heartbeat(): void {
    this.busy = true;
    // POST renews presence, GET fetches events. Never use POST response events:
    // it contains all retained events and would replay them on each heartbeat.
    this.request("/room", this.payload(this.joined ? null : {type: "join"}), () => {
      this.joined = true;
      const url = "/room?room=" + encodeURIComponent(this.roomId) +
        "&person=" + encodeURIComponent(this.participantId) + "&since=" + this.seq;
      this.request(url, null, (data: any) => {
        this.busy = false;
        this.participants = data.people || {};
        const names = Object.keys(this.participants).map((id: string) =>
          this.participants[id].name + ": " + this.participants[id].lesson);
        this._onPresence.invoke(names.join(" | "));
        let events = data.events || [];
        if (!this.caughtUp) {
          this.caughtUp = true;
          let lastLesson: any = null;
          for (const e of events) if (e.data && e.data.type === "lesson_full") lastLesson = e;
          events = lastLesson ? [lastLesson] : [];
        }
        for (const event of events) {
          if (event.data && event.data.type === "race" &&
              typeof event.data.score === "number") {
            this.scores[event.from] = event.data.score;
            this.emitScores();
          }
          this._onEvent.invoke(event);
        }
        this.seq = data.seq || this.seq;
      });
    });
    // Recover from an unavailable bridge rather than deadlocking the polling loop.
    if (!this.watchdog) {
      this.watchdog = this.createEvent("DelayedCallbackEvent");
      this.watchdog.bind(() => { this.busy = false; });
    }
    this.watchdog.reset(4);
  }
}
