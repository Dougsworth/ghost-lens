// GHOST webcam hand bridge receiver (preview only dev input).
// Connects to tools/webcam-bridge (ws://127.0.0.1:8765), which streams real
// MediaPipe hand points from the Mac webcam. Maps the index fingertip onto a
// virtual plane in front of the camera and exposes pinch state, so the brush
// can be driven by a real finger in the Lens Studio SPECS preview.
// On device, keep `enabled` off and use SIK hand tracking instead.
// NOTE FOR CLAD: verify the InternetModule WebSocket API against the current
// Spectacles docs and fix anything that does not compile.

export type BridgeHand = {
  side: string;
  pinch: boolean;
  pinchDist: number;
  points: number[][]; // 21 x [x, y, z], x and y in 0..1 of the webcam frame
};

@component
export class WebcamHandBridge extends BaseScriptComponent {
  @input internetModule: InternetModule;
  @input camera: SceneObject;
  @input url: string = "ws://127.0.0.1:8765";
  @input enabledInPreview: boolean = true;
  @input planeDistance: number = 45; // cm in front of the camera (fallback only)
  @input planeWidth: number = 30;    // cm covered by the webcam width (fallback only)
  @input planeHeight: number = 22;   // cm covered by the webcam height (fallback only)
  @input smoothing: number = 0.5;    // 0 = raw, closer to 1 = smoother

  @input
  @hint("The practice sheet. The webcam frame is mapped onto THIS surface, so the middle of the camera view is the middle of the sheet and a hand sweep crosses the paper. Leave empty to fall back to a plane in front of the camera.")
  surface: SceneObject;

  @input
  @hint("Width of the mapped area on the surface, in cm. Match the sheet (15 cm).")
  surfaceWidthCm: number = 15;

  @input
  @hint("Height of the mapped area on the surface, in cm. Match the sheet (15 cm).")
  surfaceHeightCm: number = 15;

  @input
  @hint("Use only the hand nearest the centre of the camera view, so a second person in frame cannot take over the brush.")
  singleHandOnly: boolean = true;

  /**
   * Point the camera mapping at a different surface at runtime.
   *
   * The bridge was built against the Japanese practice sheet, so the surface
   * was fixed at author time. Every other thing GHOST shows -- the notebook
   * shelf, the bookmark tabs, the guitar neck, the ASL area, the Ask and Teach
   * me cards -- is a different size in a different place, and a cursor mapped
   * to the sheet lands nowhere near them. The ACTIVE surface is therefore
   * state, not configuration: whoever changes what is on screen also says what
   * the camera now maps onto.
   *
   * Passing null falls back to the plane in front of the camera, which is
   * better than silently keeping a surface that is no longer visible.
   */
  setSurface(obj: SceneObject | null, widthCm: number, heightCm: number): void {
    this.surface = obj;
    if (widthCm > 0) this.surfaceWidthCm = widthCm;
    if (heightCm > 0) this.surfaceHeightCm = heightCm;
    // Drop the smoothing history: it is in world space, and the old points
    // belong to the old surface, so keeping them drags the first frames of the
    // new one towards wherever the last surface was.
    this.smoothed = null;
    this.fingertipWorld = null;
    this.uiSmoothed = null;
    this.uiPointWorld = null;
  }

  @input
  @hint("Decide the pinch HERE from pinchDist, instead of trusting the tracker page's own pinch flag. The page latches that flag per hand side, and MediaPipe's handedness label is unreliable on a mirrored image, so with two hands in frame the flag can belong to the other hand.")
  ownPinchDecision: boolean = true;

  @input
  @hint("Pinch STARTS below this thumb-to-index distance (as a fraction of hand size, so it is the same near or far).")
  @widget(new SliderWidget(0.1, 0.9, 0.01))
  pinchOnRatio: number = 0.30;

  @input
  @hint("Pinch ENDS above this. The gap between the two stops the pinch flickering on a borderline hold.")
  @widget(new SliderWidget(0.1, 1.2, 0.01))
  pinchOffRatio: number = 0.55;

  @input
  @hint("UI aiming only: how far the hand reaches across buttons, as a multiple of the painting area. 1 = the 15 cm sheet; 1.6 reaches the front door's notebook row and the bookmark tabs. Painting is not affected.")
  @widget(new SliderWidget(1, 3, 0.1))
  uiReach: number = 1.6;

  static instance: WebcamHandBridge;

  connected = false;
  hand: BridgeHand | null = null;
  fingertipWorld: vec3 | null = null;
  /**
   * Where the hand is AIMING at UI: the midpoint of thumb tip and index tip,
   * spread by uiReach around the surface centre. The index tip alone travels
   * toward the thumb as the fingers close, which slid the cursor off a button
   * at the very moment of the pinch; the midpoint barely moves (the same
   * "pinch point" SIK and Quest aim with). Null when no hand is tracked.
   */
  uiPointWorld: vec3 | null = null;
  private uiSmoothed: vec3 | null = null;
  isPinching = false;

  onPinchStart: Array<(pos: vec3) => void> = [];
  onPinchMove: Array<(pos: vec3) => void> = [];
  onPinchEnd: Array<(pos: vec3) => void> = [];

  private ws: WebSocket;
  private smoothed: vec3 | null = null;
  private retryAt = 0;
  private attempts = 0;
  private gaveUp = false;

  /** Retries before the bridge stops and explains itself once. */
  private static readonly MAX_ATTEMPTS = 3;

  onAwake() {
    WebcamHandBridge.instance = this;
    if (!this.enabledInPreview) return;
    this.connect();
    this.createEvent("UpdateEvent").bind(() => this.update());
  }

  private connect() {
    if (this.gaveUp) return;
    this.attempts++;
    try {
      if (!this.internetModule) {
        this.fail("no Internet Module wired on this component");
        return;
      }
      this.ws = this.internetModule.createWebSocket(this.url);
      this.ws.onopen = () => {
        this.connected = true;
        this.attempts = 0;
        print("[GHOST bridge] connected to " + this.url + " - bridge pinches will paint.");
      };
      this.ws.onclose = () => { this.fail("socket closed"); };
      this.ws.onerror = () => { this.fail("socket error"); };
      this.ws.onmessage = async (event: WebSocketMessageEvent) => {
        const text = event.data instanceof Blob ? await event.data.text() : (event.data as string);
        this.handle(JSON.parse(text));
      };
    } catch (e) {
      this.fail(String(e));
    }
  }

  /**
   * Stop after a few tries and say exactly what to do, once, instead of
   * reprinting the same line every two seconds forever.
   *
   * The common one is Lens Studio refusing a plain ws:// URL:
   *   "URL is not secure (Experimental API must be enabled to access insecure URLs)"
   * That is a single checkbox — Project Settings > Experimental API — and there
   * is no Editor API for it, so it has to be ticked by hand. Once it is on,
   * relaunch the preview and the bridge connects on its own.
   */
  private fail(reason: string) {
    this.connected = false;
    if (this.attempts >= WebcamHandBridge.MAX_ATTEMPTS) {
      this.gaveUp = true;
      this.retryAt = 0;
      print("[GHOST bridge] giving up after " + this.attempts + " attempts: " + reason);
      if (reason.indexOf("not secure") >= 0 || reason.indexOf("Experimental") >= 0) {
        print("[GHOST bridge] FIX: tick Project Settings > Experimental API, then relaunch the preview. " +
              "Everything downstream is already wired - GhostPinchInput is listening for bridge pinches.");
      }
      print("[GHOST bridge] the lens works without the bridge: mouse and hand pinch still paint.");
      return;
    }
    print("[GHOST bridge] could not connect (attempt " + this.attempts + "): " + reason);
    this.retryAt = getTime() + 2;
  }

  private update() {
    if (!this.connected && this.retryAt > 0 && getTime() > this.retryAt) {
      this.retryAt = 0;
      this.connect();
    }
  }

  private handle(msg: { hands: BridgeHand[] }) {
    const hands = msg.hands || [];
    this.hand = this.pickHand(hands);
    if (!this.hand) {
      if (this.isPinching && this.smoothed) this.onPinchEnd.forEach(f => f(this.smoothed));
      this.isPinching = false;
      this.fingertipWorld = null;
      this.uiPointWorld = null;
      this.uiSmoothed = null;
      return;
    }
    const tip = this.hand.points[8];
    const raw = this.toWorld(tip[0], tip[1]);
    this.smoothed = this.smoothed ? vec3.lerp(raw, this.smoothed, this.smoothing) : raw;
    this.fingertipWorld = this.smoothed;

    // UI aim: thumb/index midpoint in webcam space, spread around the centre.
    const thumb = this.hand.points[4];
    const mx = thumb ? (thumb[0] + tip[0]) * 0.5 : tip[0];
    const my = thumb ? (thumb[1] + tip[1]) * 0.5 : tip[1];
    const k = Math.max(1, this.uiReach);
    const uiRaw = this.toWorld(0.5 + (mx - 0.5) * k, 0.5 + (my - 0.5) * k);
    this.uiSmoothed = this.uiSmoothed ? vec3.lerp(uiRaw, this.uiSmoothed, this.smoothing) : uiRaw;
    this.uiPointWorld = this.uiSmoothed;

    const p = this.smoothed;
    const pinching = this.decidePinch(this.hand);
    if (pinching && !this.isPinching) { this.isPinching = true; this.onPinchStart.forEach(f => f(p)); }
    else if (pinching && this.isPinching) { this.onPinchMove.forEach(f => f(p)); }
    else if (!pinching && this.isPinching) { this.isPinching = false; this.onPinchEnd.forEach(f => f(p)); }
  }

  /**
   * Choose ONE hand: the one whose index fingertip is nearest the centre of the
   * camera view. Picking by handedness ("Right") meant whoever MediaPipe listed
   * first could steal the brush, so a second person walking into frame could
   * take over mid-stroke. Nearest-to-centre makes the person addressing the
   * camera the one who paints, and it is stable frame to frame because the
   * writer naturally stays centred while a bystander does not.
   */

  /**
   * Is this hand pinching?
   *
   * The tracker page sends its own `pinch` boolean, but it latches that state
   * per hand SIDE, and MediaPipe's handedness is unreliable on a mirrored
   * image. With two hands in frame the boolean on the hand we picked can be the
   * state of the OTHER hand -- which shows up as ink appearing with no pinch,
   * and as a pinch flag that contradicts its own pinchDist.
   *
   * So we decide here, from the distance of the hand we actually chose, with
   * our own hysteresis. pinchDist is already normalised by hand size upstream,
   * so one pair of thresholds works near and far from the camera.
   */
  private decidePinch(h: BridgeHand): boolean {
    if (!this.ownPinchDecision || typeof h.pinchDist !== "number") return !!h.pinch;
    const on = Math.min(this.pinchOnRatio, this.pinchOffRatio);
    const off = Math.max(this.pinchOnRatio, this.pinchOffRatio);
    return this.isPinching ? h.pinchDist < off : h.pinchDist < on;
  }

  private pickHand(hands: BridgeHand[]): BridgeHand | null {
    if (!hands || hands.length === 0) return null;
    if (!this.singleHandOnly) return hands[0];

    let best: BridgeHand | null = null;
    let bestD = Infinity;
    for (let i = 0; i < hands.length; i++) {
      const h = hands[i];
      const tip = h.points && h.points[8];
      if (!tip) continue;
      const dx = tip[0] - 0.5;
      const dy = tip[1] - 0.5;
      const d = dx * dx + dy * dy;
      if (d < bestD) { bestD = d; best = h; }
    }
    return best || hands[0];
  }

  // Webcam (0..1, y down) to a world point.
  //
  // Preferred: map the camera frame straight onto the practice sheet, so the
  // middle of the webcam view is the middle of the paper and a hand sweep
  // crosses the writing area. The returned point lies ON the sheet plane, which
  // also makes GhostPinchInput's camera-ray projection a no-op rather than
  // re-projecting a point that was floating somewhere else in space.
  private toWorld(x: number, y: number): vec3 {
    if (this.surface) {
      const st = this.surface.getTransform();
      const local = new vec3(
        (x - 0.5) * this.surfaceWidthCm,
        (0.5 - y) * this.surfaceHeightCm,
        0
      );
      return st.getWorldTransform().multiplyPoint(local);
    }
    return this.toWorldOnCameraPlane(x, y);
  }

  // Fallback when no surface is wired: a plane floating in front of the camera.
  private toWorldOnCameraPlane(x: number, y: number): vec3 {
    const t = this.camera.getTransform();
    const origin = t.getWorldPosition();
    const fwd = t.forward.uniformScale(-1); // camera looks down -Z
    const right = t.right;
    const up = t.up;
    return origin
      .add(fwd.uniformScale(this.planeDistance))
      .add(right.uniformScale((x - 0.5) * this.planeWidth))
      .add(up.uniformScale((0.5 - y) * this.planeHeight));
  }
}
