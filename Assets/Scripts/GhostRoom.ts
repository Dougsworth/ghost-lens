/**
 * GhostRoom — two people in the same lesson.
 *
 * Owns:  the websocket to the room relay, the handshake, and turning its
 *        protocol into typed events. Nothing else.
 * Must not: draw, decide what an event means, or know what a stroke is. It
 *        carries small JSON both ways and GhostMain decides, the same one-way
 *        flow every other module here uses.
 *
 * ── The one rule ────────────────────────────────────────────────────────────
 * A dropped connection, a refused room, or a peer walking away must NEVER
 * break the solo lesson. Everything here is additive: with the relay absent
 * the Lens behaves exactly as it does today, and `connected` is simply false.
 * That is why the reconnect loop has no failure state and no error dialog —
 * it just keeps trying quietly in the background while you carry on writing.
 *
 * ── Protocol ────────────────────────────────────────────────────────────────
 * Documented in tools/webcam-bridge/room_relay.py and exercised by
 * test_rooms.py (13 checks, 0 failures). Handshake is the literal frame
 * "room", then JSON ops:
 *     {"op":"create","name":...}  -> {"op":"created","room":CODE,"you":id}
 *     {"op":"join","room":CODE,"name":...}
 *                                 -> {"op":"joined","room":...,"you":...,"peers":[...]}
 *     {"op":"event", ...}         -> others get {"op":"event","from":id,"name":...,"data":...}
 *     {"op":"leave"}              -> {"op":"left"}
 * Pushed: peer_joined, peer_left, error.
 *
 * Codes are speakable words (TIGER, MANGO, ...) precisely so the join flow can
 * be "say the code" as well as "pick the code".
 */

import Event, { PublicApi } from "SpectaclesInteractionKit.lspkg/Utils/Event";

export type Peer = { id: number; name: string };

/** What the relay said, already unwrapped. */
export type RoomEvent = { from: number; name: string; data: any };

@component
export class GhostRoom extends BaseScriptComponent {
  @ui.label('<span style="color: #60A5FA;">GhostRoom &ndash; study together, through the relay</span>')
  @ui.separator

  @ui.label('<span style="color: #60A5FA;">References</span>')
  @ui.group_start("References")
  @input
  @hint("Internet Module. Without it Study Together is simply unavailable and the solo lesson is unaffected.")
  internetModule: InternetModule;
  @ui.group_end

  @ui.separator
  @ui.label('<span style="color: #60A5FA;">Settings</span>')
  @ui.group_start("Settings")
  @input
  @hint("The relay. Same socket the hand bridge uses in the preview; point it at a LAN address or an ngrok tunnel to study with someone elsewhere.")
  url: string = "ws://127.0.0.1:8765";

  @input
  @hint("The name peers see beside your ink.")
  displayName: string = "Me";

  @input
  @hint("Seconds before the first reconnect attempt. It backs off from here and never gives up, because a lost relay must not end the lesson.")
  @widget(new SliderWidget(0.5, 10, 0.5))
  retrySec: number = 1.5;
  @ui.group_end

  private ws: WebSocket | null = null;
  private open = false;
  private joined = false;
  private code = "";
  private myId = 0;
  private peers: Peer[] = [];
  private retryAt = -1;
  private backoff = 0;
  private wantOpen = false;
  /** An op sent before the socket opened, replayed on connect. */
  private queued: any = null;

  private readonly _onJoined = new Event<string>();
  private readonly _onPeerJoined = new Event<Peer>();
  private readonly _onPeerLeft = new Event<Peer>();
  private readonly _onEvent = new Event<RoomEvent>();
  private readonly _onError = new Event<string>();

  /** You are in a room. Payload is the code. */
  get onJoined(): PublicApi<string> {
    return this._onJoined.publicApi();
  }
  get onPeerJoined(): PublicApi<Peer> {
    return this._onPeerJoined.publicApi();
  }
  get onPeerLeft(): PublicApi<Peer> {
    return this._onPeerLeft.publicApi();
  }
  /** Anything a peer broadcast — a stroke, a stamp, a cheer. */
  get onEvent(): PublicApi<RoomEvent> {
    return this._onEvent.publicApi();
  }
  /** Refused: no such room, or room full. Shown, never fatal. */
  get onError(): PublicApi<string> {
    return this._onError.publicApi();
  }

  get isJoined(): boolean {
    return this.joined;
  }
  get roomCode(): string {
    return this.code;
  }
  get memberCount(): number {
    return this.peers.length + (this.joined ? 1 : 0);
  }
  get peerList(): Peer[] {
    return this.peers.slice();
  }

  onAwake(): void {
    this.createEvent("UpdateEvent").bind(() => this.onUpdate());
  }

  // ── Public API ────────────────────────────────────────────────────────────

  /** Open a room. The code arrives on onJoined. */
  create(): void {
    this.sendOp({ op: "create", name: this.displayName });
  }

  /** Join someone else's room by its spoken word. */
  join(code: string): void {
    const c = (code || "").trim().toUpperCase();
    if (!c) return;
    this.sendOp({ op: "join", room: c, name: this.displayName });
  }

  /** Broadcast to everyone else in the room. Silently ignored when solo. */
  send(data: any): void {
    if (!this.joined || !this.open || !this.ws) return;
    try {
      this.ws.send(JSON.stringify({ op: "event", data: data }));
    } catch (e) {
      // A send that fails is a dropped frame, not an error worth surfacing:
      // the reconnect loop will notice the socket is gone.
    }
  }

  leave(): void {
    if (this.joined && this.open && this.ws) {
      try {
        this.ws.send(JSON.stringify({ op: "leave" }));
      } catch (e) {}
    }
    this.joined = false;
    this.code = "";
    this.peers = [];
    this.wantOpen = false;
    this.closeSocket();
  }

  // ── Connection ────────────────────────────────────────────────────────────

  /**
   * Queue an op and make sure a socket is coming.
   *
   * Only ONE op is ever queued: create and join are both "get me into a room",
   * and replaying a stale one after a reconnect would put you somewhere you
   * did not ask for.
   */
  private sendOp(op: any): void {
    this.queued = op;
    this.wantOpen = true;
    if (this.open && this.ws) {
      this.flush();
      return;
    }
    this.connect();
  }

  private flush(): void {
    if (!this.queued || !this.ws || !this.open) return;
    try {
      this.ws.send(JSON.stringify(this.queued));
      this.queued = null;
    } catch (e) {}
  }

  private connect(): void {
    if (!this.internetModule || this.ws) return;
    let socket: WebSocket;
    try {
      socket = this.internetModule.createWebSocket(this.url);
    } catch (e) {
      this.scheduleRetry();
      return;
    }
    this.ws = socket;

    socket.onopen = () => {
      this.open = true;
      this.backoff = 0;
      // The handshake is a bare frame, not JSON: the bridge reads the first
      // message to decide whether this connection is a tracker page, a Lens,
      // or a room client, and hands rooms to the relay wholesale.
      try {
        socket.send("room");
      } catch (e) {}
      this.flush();
    };

    socket.onmessage = (e: any) => this.onMessage(e);

    socket.onclose = () => {
      this.open = false;
      this.ws = null;
      // Membership does not survive the socket. Say so, so the UI stops
      // claiming you are in a room you are no longer in.
      if (this.joined) {
        this.joined = false;
        this.peers = [];
      }
      if (this.wantOpen) this.scheduleRetry();
    };

    socket.onerror = () => {
      // onclose follows; nothing useful to add here, and an error dialog for
      // "the relay is not running" would be noise during a solo lesson.
    };
  }

  private onMessage(e: any): void {
    let msg: any;
    try {
      const raw = typeof e.data === "string" ? e.data : (e.data ? String(e.data) : "");
      msg = JSON.parse(raw);
    } catch (err) {
      return;
    }
    const op = msg.op;

    if (op === "created" || op === "joined") {
      this.joined = true;
      this.code = msg.room || "";
      this.myId = msg.you || 0;
      this.peers = [];
      const list = msg.peers || [];
      for (let i = 0; i < list.length; i++) {
        this.peers.push({ id: list[i].id, name: list[i].name });
      }
      this._onJoined.invoke(this.code);
      return;
    }

    if (op === "peer_joined") {
      const p = { id: msg.id, name: msg.name };
      this.peers.push(p);
      this._onPeerJoined.invoke(p);
      return;
    }

    if (op === "peer_left") {
      const p = { id: msg.id, name: msg.name };
      for (let i = this.peers.length - 1; i >= 0; i--) {
        if (this.peers[i].id === p.id) this.peers.splice(i, 1);
      }
      this._onPeerLeft.invoke(p);
      return;
    }

    if (op === "event") {
      this._onEvent.invoke({ from: msg.from, name: msg.name, data: msg.data });
      return;
    }

    if (op === "error") {
      // Refused, not broken: no such room, or room full. The caller shows it
      // and the learner tries another code.
      this.wantOpen = false;
      this._onError.invoke(String(msg.error || "could not join"));
      return;
    }
  }

  private scheduleRetry(): void {
    // Back off, but cap it: this runs during a lesson and a thirty-second gap
    // would feel like it had given up, which it never does.
    this.backoff = this.backoff === 0 ? this.retrySec : Math.min(this.backoff * 1.7, 8);
    this.retryAt = getTime() + this.backoff;
  }

  private closeSocket(): void {
    if (this.ws) {
      try {
        this.ws.close();
      } catch (e) {}
      this.ws = null;
    }
    this.open = false;
  }

  private onUpdate(): void {
    if (!this.wantOpen || this.ws || this.retryAt < 0) return;
    if (getTime() < this.retryAt) return;
    this.retryAt = -1;
    this.connect();
  }
}
