/**
 * GhostAslController — the ASL lesson: ghost hands sign, then it's your turn.
 *
 * Owns:  playing a sign's pose sequence on the ghost hands and reporting when
 *        the demonstration finishes. The signs are demonstrated at hand height
 *        in front of the user, in place of the practice sheet.
 * Must not: touch the UI or decide what comes next — GhostMain does that, the
 *        same one-way flow the kana pack uses.
 *
 * Pose checking is the brief's tier 1 and 2 (native SIK hand tracking, or the
 * webcam bridge). Neither can be proven without real hands, so this build ships
 * the brief's tier 3: the ghost signs, a Got it tab appears, and the user
 * self-checks. The lesson flow is identical in all three cases — only the thing
 * that satisfies the step changes — which is why onSignFinished is a plain
 * event rather than a hardcoded jump to the next sign.
 */

import Event, { PublicApi } from "SpectaclesInteractionKit.lspkg/Utils/Event";
import { AslSign, HandPose } from "./GhostAslPack";
import { GhostHand, lerpPose } from "./GhostHands";

@component
export class GhostAslController extends BaseScriptComponent {
  @ui.label('<span style="color: #60A5FA;">GhostAslController &ndash; ghost hands sign at hand height</span>')
  @ui.separator

  @ui.label('<span style="color: #60A5FA;">Settings</span>')
  @ui.group_start("Settings")
  @input("vec4", "{0.95,0.91,0.83,1}")
  @hint("Ghost hand colour. Additive display: a warm off-white light, matching the brush ink so the ghost reads as one character across both packs.")
  @widget(new ColorWidget())
  handColor: vec4;

  @input
  @hint("Where the hands sign, relative to this object, in cm. The brief puts ASL at hand height in front of the user, in place of the sheet.")
  anchorCm: vec3;

  @input
  @hint("Overall size of the ghost hands, where 1 is roughly life-size.")
  @widget(new SliderWidget(0.4, 2.0, 0.05))
  handScale: number = 0.85;

  @input
  @hint("Seconds to pause on the final pose before the sign is called finished.")
  @widget(new SliderWidget(0.1, 2, 0.1))
  endHoldSec: number = 0.6;
  @ui.group_end

  private hand: GhostHand | null = null;
  private sign: AslSign | null = null;
  private poseIndex = 0;
  private phaseT = 0;
  private playing = false;
  private holding = false;

  private readonly _onSignFinished = new Event<string>();
  private readonly _onPoseReached = new Event<number>();

  /** Fires with the sign id once the demonstration has finished. */
  get onSignFinished(): PublicApi<string> {
    return this._onSignFinished.publicApi();
  }
  get onPoseReached(): PublicApi<number> {
    return this._onPoseReached.publicApi();
  }

  onAwake(): void {
    this.createEvent("OnStartEvent").bind(() => this.onStart());
    this.createEvent("UpdateEvent").bind(() => this.onUpdate());
  }

  private onStart(): void {
    this.hand = new GhostHand(this.sceneObject, "GhostRightHand", this.handColor, false);
    this.hand.root.getTransform().setLocalScale(
      new vec3(this.handScale, this.handScale, this.handScale)
    );
    this.hand.enabled = false;
  }

  /** Demonstrate a sign from its first pose. */
  play(sign: AslSign): void {
    if (!this.hand || sign.poses.length === 0) return;
    this.sign = sign;
    this.poseIndex = 0;
    this.phaseT = 0;
    this.playing = true;
    this.holding = false;
    this.hand.enabled = true;
    this.hand.apply(sign.poses[0], this.anchorCm);
    this._onPoseReached.invoke(0);
  }

  stop(): void {
    this.playing = false;
    this.holding = false;
    this.sign = null;
  }

  setVisible(on: boolean): void {
    if (this.hand) this.hand.enabled = on;
  }

  private onUpdate(): void {
    if (!this.playing || !this.sign || !this.hand) return;
    const dt = getDeltaTime();
    this.phaseT += dt;

    if (this.holding) {
      if (this.phaseT >= this.endHoldSec) {
        this.playing = false;
        this.holding = false;
        this._onSignFinished.invoke(this.sign.id);
      }
      return;
    }

    const next = this.poseIndex + 1;
    if (next >= this.sign.poses.length) {
      this.holding = true;
      this.phaseT = 0;
      return;
    }

    const from: HandPose = this.sign.poses[this.poseIndex];
    const to: HandPose = this.sign.poses[next];
    const dur = Math.max(0.05, to.holdSec);
    const raw = Math.min(1, this.phaseT / dur);
    // Ease in and out so the movement reads as a gesture, not a slide.
    const f = raw * raw * (3 - 2 * raw);
    this.hand.apply(lerpPose(from, to, f), this.anchorCm);

    if (raw >= 1) {
      this.poseIndex = next;
      this.phaseT = 0;
      this._onPoseReached.invoke(next);
    }
  }
}
