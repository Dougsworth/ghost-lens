/**
 * Spectacles Interaction Kit hand input for GHOST spatial activities.
 * Uses tracked index/thumb landmarks and a pinch edge; no webcam or localhost required.
 * SIK HandInputData is bundled by SpectaclesInteractionKit.lspkg in Lens Studio.
 */
import { HandInputData } from "SpectaclesInteractionKit.lspkg/Providers/HandInputData/HandInputData";

export type GhostHandFrame = { point: vec3; pinching: boolean; side: string };

@component
export class GhostNativeHandInput extends BaseScriptComponent {
  static instance: GhostNativeHandInput | null = null;
  @input @hint("Prefer the right hand when both are tracked.") preferRight: boolean = true;
  @input @hint("Pinch distance in centimeters when the SIK pinch state is unavailable.") pinchDistanceCm: number = 2.7;
  @input @hint("Release distance in centimeters (hysteresis).") releaseDistanceCm: number = 3.8;

  private input: any = null;
  private previousPinch: {[side: string]: boolean} = {left:false,right:false};
  private latest: GhostHandFrame | null = null;

  onAwake(): void {
    GhostNativeHandInput.instance = this;
    try { this.input = HandInputData.getInstance(); }
    catch (e) { print("[GHOST] Native SIK hand input unavailable: " + e); }
    this.createEvent("UpdateEvent").bind(() => this.sample());
  }

  private sample(): void {
    this.latest = null;
    if (!this.input) return;
    const sides = this.preferRight ? ["right","left"] : ["left","right"];
    for (let i=0; i<sides.length; i++) {
      const side = sides[i];
      try {
        const hand: any = this.input.getHand(side);
        if (!hand) continue;
        const index: any = hand.indexTip;
        const thumb: any = hand.thumbTip;
        const point: vec3 | null = index && index.position ? index.position : null;
        if (!point) { this.previousPinch[side] = false; continue; }
        // Prefer SIK's tracked pinch signal, with a geometric fallback for SDK variants.
        let pressed: boolean;
        if (typeof hand.isPinching === "function") pressed = !!hand.isPinching();
        else if (typeof hand.isPinching === "boolean") pressed = hand.isPinching;
        else if (thumb && thumb.position) {
          const distance = point.distance(thumb.position);
          pressed = distance < (this.previousPinch[side] ? this.releaseDistanceCm : this.pinchDistanceCm);
        } else pressed = false;
        this.previousPinch[side] = pressed;
        this.latest = {point, pinching:pressed, side};
        return;
      } catch (e) { this.previousPinch[side] = false; }
    }
  }

  getFrame(): GhostHandFrame | null { return this.latest; }
  onDestroy(): void { if (GhostNativeHandInput.instance === this) GhostNativeHandInput.instance = null; }
}
