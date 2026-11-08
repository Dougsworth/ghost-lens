/**
 * GhostGlove — your hand in GHOST: a glowing glove you pick on first launch.
 *
 * Owns:  the choice (saved on the device), and the glove itself, which follows
 *        the webcam hand's aim on every screen, closes its fingers as you
 *        pinch and pops when a pinch presses something.
 * Must not: aim, press or paint. It mirrors WebcamHandBridge (where the hand
 *        aims) and GhostHandInteractor (when a press landed), nothing more.
 *        On device, SIK's own hand visual takes this role.
 *
 * Plain class built by GhostMain; it parents itself to the camera so it is
 * visible whatever screen is up, the same way the bridge's old debug dot did.
 */

import WorldCameraFinderProvider from "SpectaclesInteractionKit.lspkg/Providers/CameraProvider/WorldCameraFinderProvider";
import { GhostHand } from "./GhostHands";
import { HandPose } from "./GhostAslPack";
import { WebcamHandBridge } from "./WebcamHandBridge";
import { GhostHandInteractor } from "./GhostHandInteractor";

/** What each glove does in the game. GhostGame reads the id. */
export type GlovePerk = "midas" | "shield" | "bloom";

export type GloveStyle = { id: string; name: string; color: vec4; perk: GlovePerk; power: string };

/** The gloves on offer. Their names are the front-door rows, word for word. */
export const GLOVES: GloveStyle[] = [
  { id: "gold", name: "Golden Glove", color: new vec4(1.0, 0.62, 0.1, 1),
    perk: "midas", power: "Midas Touch: +25% points on everything" },
  { id: "neon", name: "Neon Glove", color: new vec4(0.1, 0.8, 1.0, 1),
    perk: "shield", power: "Shield: one free miss per character keeps your combo" },
  { id: "sakura", name: "Sakura Glove", color: new vec4(1.0, 0.3, 0.62, 1),
    perk: "bloom", power: "Bloom: your combo multiplier grows twice as fast" },
];

const STORE_KEY = "ghost.glove.v1";
/** Glove size: the ghost hand is ~10 cm tall; the glove is a cursor, ~3 cm. */
const SCALE = 0.3;
/** Index fingertip in the ghost hand's local cm (see GhostGuitarController TIP_LOCAL). */
const INDEX_TIP = new vec3(-1.65, 9.3, 0);
/** Distance in front of the camera the glove floats at, cm (the sheet's distance). */
const PLANE_CM = 45;

const OPEN: HandPose = { curl: [0.2, 0.05, 0.1, 0.14, 0.18], spread: 0.45, offsetCm: [0, 0, 0], rotationDeg: [0, 0, 0], holdSec: 0 };
const PINCH: HandPose = { curl: [0.62, 0.55, 0.3, 0.32, 0.34], spread: 0.2, offsetCm: [0, 0, 0], rotationDeg: [0, 0, 0], holdSec: 0 };

export class GhostGlove {
  private style: GloveStyle | null = null;
  private hand: GhostHand | null = null;
  private pinchK = 0;
  /** While choosing: which glove is being tried on, and the big preview. */
  private tryIdx = -1;
  private preview: GhostHand | null = null;
  private previewT = 0;

  constructor() {
    try {
      const id = global.persistentStorageSystem.store.getString(STORE_KEY);
      this.style = GLOVES.filter((g) => g.id === id)[0] || null;
    } catch (e) {
      this.style = null;
    }
  }

  /** True once the user has picked a glove (first launch shows the picker). */
  get chosen(): boolean {
    return this.style !== null;
  }

  get name(): string {
    return this.style ? this.style.name : "";
  }

  get color(): vec4 {
    return this.style ? this.style.color : GLOVES[0].color;
  }

  get perk(): GlovePerk | null {
    return this.style ? this.style.perk : null;
  }

  /** Pick by row label ("Neon Glove"). Returns false for anything else. */
  chooseByName(label: string): boolean {
    const g = GLOVES.filter((x) => x.name.toLowerCase() === (label || "").trim().toLowerCase())[0];
    if (!g) return false;
    this.style = g;
    try {
      global.persistentStorageSystem.store.putString(STORE_KEY, g.id);
    } catch (e) {
      // Not saved; the choice still holds for this session.
    }
    if (this.hand) this.hand.setColor(g.color);
    return true;
  }

  /** The glove being tried on in the picker (null outside it). */
  get trying(): GloveStyle | null {
    return this.tryingIndex >= 0 ? GLOVES[this.tryingIndex] : null;
  }

  private get tryingIndex(): number {
    return this.tryIdx;
  }

  /**
   * Open the try-on: a big glove waving at `at` (in `parent`'s local cm),
   * starting with the current glove, and the hand cursor wears it too.
   */
  startTryOn(parent: SceneObject, at: vec3): GloveStyle {
    const cur = this.style ? GLOVES.indexOf(this.style) : 0;
    this.tryIdx = Math.max(0, cur);
    if (!this.preview) {
      this.preview = new GhostHand(parent, "GlovePreview", GLOVES[this.tryIdx].color, false);
      this.preview.root.getTransform().setLocalScale(new vec3(0.42, 0.42, 0.42));
    }
    this.previewAt = at;
    this.preview.setColor(GLOVES[this.tryIdx].color);
    this.preview.enabled = true;
    this.previewT = 0;
    return GLOVES[this.tryIdx];
  }

  /** Next glove in the try-on. */
  tryNext(): GloveStyle {
    this.tryIdx = (Math.max(0, this.tryIdx) + 1) % GLOVES.length;
    if (this.preview) this.preview.setColor(GLOVES[this.tryIdx].color);
    this.previewT = 0;
    return GLOVES[this.tryIdx];
  }

  /** Keep the glove being tried on; closes the try-on. */
  keep(): boolean {
    const g = this.tryIdx >= 0 ? GLOVES[this.tryIdx] : null;
    this.endTryOn();
    return g ? this.chooseByName(g.name) : false;
  }

  endTryOn(): void {
    this.tryIdx = -1;
    if (this.preview) this.preview.enabled = false;
  }

  private previewAt = vec3.zero();

  /** The big try-on glove: waves, and opens and closes like it is saying hi. */
  private animatePreview(dt: number): void {
    if (!this.preview || this.tryIdx < 0) return;
    this.previewT += dt;
    const t = this.previewT;
    const pop = t < 0.25 ? 1 + 0.25 * Math.sin(Math.PI * t / 0.25) : 1;
    this.preview.root.getTransform().setLocalScale(new vec3(0.42 * pop, 0.42 * pop, 0.42 * pop));
    const wave = Math.sin(t * 3.2) * 14;
    const grip = 0.5 + 0.5 * Math.sin(t * 1.6);
    this.preview.apply({
      curl: OPEN.curl.map((c, i) => c + (PINCH.curl[i] - c) * grip * 0.6),
      spread: 0.5, offsetCm: [0, 0, 0], rotationDeg: [0, 0, wave], holdSec: 0,
    }, this.previewAt);
  }

  /** Follow the hand. Call once per frame. */
  update(dt: number): void {
    this.animatePreview(dt);
    const bridge = WebcamHandBridge.instance;
    const aim = bridge && bridge.connected ? (bridge.uiPointWorld || bridge.fingertipWorld) : null;
    // While trying gloves on, the cursor wears the one being tried.
    const wearing = this.tryIdx >= 0 ? GLOVES[this.tryIdx] : this.style;
    if (!wearing || !aim) {
      if (this.hand) this.hand.enabled = false;
      if (bridge) bridge.suppressMarker = !!this.style;
      return;
    }
    bridge!.suppressMarker = true;
    const style = wearing;

    const camT = WorldCameraFinderProvider.getInstance().getComponent().getTransform();
    if (!this.hand) {
      const camObj = WorldCameraFinderProvider.getInstance().getComponent().getSceneObject();
      this.hand = new GhostHand(camObj, "Glove", style.color, false);
      this.hand.root.layer = camObj.layer;
      this.hand.root.getTransform().setLocalScale(new vec3(SCALE, SCALE, SCALE));
    }

    // Same line the interactor aims along: camera -> aim point, at PLANE_CM.
    const local = camT.getInvertedWorldTransform().multiplyPoint(aim);
    if (local.z > -0.01) {
      this.hand.enabled = false;
      return;
    }
    const k = PLANE_CM / -local.z;
    const tip = new vec3(local.x * k, local.y * k, -PLANE_CM);

    // Fingers close smoothly toward the pinch, rather than snapping.
    const target = bridge!.isPinching ? 1 : 0;
    this.pinchK += (target - this.pinchK) * Math.min(1, dt * 14);
    const pose: HandPose = {
      curl: OPEN.curl.map((c, i) => c + (PINCH.curl[i] - c) * this.pinchK),
      spread: OPEN.spread + (PINCH.spread - OPEN.spread) * this.pinchK,
      offsetCm: [0, 0, 0], rotationDeg: [0, 0, 0], holdSec: 0,
    };

    // A press pops the glove and flashes it white for a third of a second.
    const since = getTime() - GhostHandInteractor.lastPressAt;
    const pop = since >= 0 && since < 0.32 ? Math.sin(Math.PI * since / 0.32) : 0;
    const s = SCALE * (1 + 0.45 * pop);
    this.hand.root.getTransform().setLocalScale(new vec3(s, s, s));
    const c = style.color;
    this.hand.setColor(new vec4(c.x + (1 - c.x) * pop, c.y + (1 - c.y) * pop, c.z + (1 - c.z) * pop, 1));

    // Put the INDEX TIP on the aim point: the glove points at what you press.
    this.hand.apply(pose, tip.sub(INDEX_TIP.uniformScale(s)));
    this.hand.enabled = true;
  }
}
