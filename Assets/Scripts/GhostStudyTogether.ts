/**
 * GHOST Study Together — the Lens side of rooms.
 *
 * Talks to the bridge on this computer over HTTP (/room, /rooms). With
 * Supabase keys set on the bridge, rooms are mirrored to other desktops, so
 * the same room code reaches a partner elsewhere; without them, rooms are
 * shared by the previews on this computer only. No auth: demo-grade.
 *
 * Rooms: the front door's Study Together screen calls listRooms(), create()
 * and join(code); onJoined / onPeerJoined / onPeerLeft / onError report back.
 * With enabledRoom on in the scene, the Lens also joins roomId at start.
 * Emits remote events; the host decides how to draw them on its sheet.
 */
import Event, { PublicApi } from "SpectaclesInteractionKit.lspkg/Utils/Event";

/** Someone else in the room. `id` is their participant id. */
export type RoomPeer = { id: string; name: string };
/** An open room, as the bridge lists it. */
export type RoomInfo = { room: string; count: number; members: string[] };

/** Room codes are short real words, easy to say out loud in a demo. */
const ROOM_WORDS = [
  "TIGER", "MANGO", "MAPLE", "SUNNY", "RIVER", "CLOUD", "LEMON", "PANDA",
  "OCEAN", "CEDAR", "COMET", "HONEY", "PEARL", "TULIP", "ROBIN", "MOCHI",
];

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

  private readonly _onJoined = new Event<string>();
  private readonly _onPeerJoined = new Event<RoomPeer>();
  private readonly _onPeerLeft = new Event<RoomPeer>();
  private readonly _onError = new Event<string>();
  /** The relay accepted us into the room; carries the room code. */
  get onJoined(): PublicApi<string> { return this._onJoined.publicApi(); }
  get onPeerJoined(): PublicApi<RoomPeer> { return this._onPeerJoined.publicApi(); }
  get onPeerLeft(): PublicApi<RoomPeer> { return this._onPeerLeft.publicApi(); }
  /** A join the user asked for was refused (room full, bridge offline). */
  get onError(): PublicApi<string> { return this._onError.publicApi(); }

  /** Peers seen in the last poll, to report arrivals and departures. */
  private knownPeers: {[key: string]: string} = {};
  /** True after the first roster of a room: the people already there are not "joining". */
  private rosterSeen = false;
  /** The current room was picked by the user, so a refusal is reported, not retried. */
  private explicitJoin = false;

  get isJoined(): boolean { return this.enabledRoom && this.joined; }
  get roomCode(): string { return this.roomId; }

  /** Open rooms (this computer's, plus other desktops' with Supabase on). */
  listRooms(callback: (rooms: RoomInfo[]) => void): void {
    if (!this.internetModule) { callback([]); return; }
    this.request("/rooms?person=" + encodeURIComponent(this.participantId), null, (data: any) => {
      const out: RoomInfo[] = [];
      for (const r of (data && data.rooms) || []) {
        if (!r || !r.room) continue;
        out.push({room: String(r.room), count: r.count || 0,
          members: (r.people || []).map((n: any) => String(n))});
      }
      callback(out);
    }, () => callback([]));
  }

  /** Open a new room under a word code nobody is using, and join it. */
  create(taken: string[] = []): void {
    const free = ROOM_WORDS.filter((w) => taken.indexOf(w) < 0);
    const code = free.length
      ? free[Math.floor(Math.random() * free.length)]
      : ROOM_WORDS[Math.floor(Math.random() * ROOM_WORDS.length)] + (10 + Math.floor(Math.random() * 90));
    this.switchRoom(code);
  }

  /** Join an existing room by its code. */
  join(code: string): void {
    const clean = (code || "").trim();
    if (!clean) return;
    this.switchRoom(clean);
  }

  /** Leave the current room (if any) and start polling `code` right away. */
  private switchRoom(code: string): void {
    if (this.enabledRoom && this.joined && this.roomId !== code && this.internetModule) {
      this.request("/room/leave", {room: this.roomId, person: this.participantId}, () => {});
    }
    this.roomId = code.slice(0, 40);
    this.enabledRoom = true;
    this.explicitJoin = true;
    this.joined = false;
    this.caughtUp = false;
    this.rosterSeen = false;
    this.seq = 0;
    this.participants = {};
    this.knownPeers = {};
    this.scores = {};
    this.outgoing = [];
    this.sending = false;
    this.busy = false;
    this.elapsed = Math.max(0.3, this.pollSeconds);   // heartbeat next frame
    print("[GhostStudyTogether] joining room " + this.roomId + " as " + this.participantId);
  }

  /** Report who arrived and who left since the last poll. */
  private diffPeers(): void {
    const now: {[key: string]: string} = {};
    for (const id of Object.keys(this.participants)) {
      if (id !== this.participantId) now[id] = this.displayName(id);
    }
    if (this.rosterSeen) {
      for (const id of Object.keys(now)) {
        if (!(id in this.knownPeers)) this._onPeerJoined.invoke({id, name: now[id]});
      }
      for (const id of Object.keys(this.knownPeers)) {
        if (!(id in now)) this._onPeerLeft.invoke({id, name: this.knownPeers[id]});
      }
    }
    this.rosterSeen = true;
    this.knownPeers = now;
  }

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
    const room = this.roomId;
    this.request("/room", this.payload(this.joined ? null : {type: "join"}), () => {
      if (room !== this.roomId) { this.busy = false; return; }   // switched meanwhile
      if (!this.joined) {
        this.joined = true;
        this._onJoined.invoke(this.roomId);
      }
      const url = "/room?room=" + encodeURIComponent(this.roomId) +
        "&person=" + encodeURIComponent(this.participantId) + "&since=" + this.seq;
      this.request(url, null, (data: any) => {
        this.busy = false;
        if (room !== this.roomId) return;
        this.participants = data.people || {};
        this.diffPeers();
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
    }, () => {
      this.busy = false;
      // A join the user asked for and the relay refused: say so once and stop,
      // rather than retrying a full room forever. A room set in the scene
      // (enabledRoom) keeps retrying quietly, in case the bridge starts later.
      if (!this.joined && this.explicitJoin && room === this.roomId) {
        this.enabledRoom = false;
        this.explicitJoin = false;
        this._onError.invoke("Could not join " + room + ". It may be full, or the bridge is not running.");
      }
    });
    // Recover from an unavailable bridge rather than deadlocking the polling loop.
    if (!this.watchdog) {
      this.watchdog = this.createEvent("DelayedCallbackEvent");
      this.watchdog.bind(() => { this.busy = false; });
    }
    this.watchdog.reset(4);
  }
}
