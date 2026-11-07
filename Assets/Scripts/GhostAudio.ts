/**
 * GhostAudio — every sound GHOST makes, in one place.
 *
 * Owns:  the AudioComponents, their volumes, and the pool used for the spoken
 *        characters. Clips are generated assets in Assets/GeneratedSFX/.
 * Must not: decide WHEN a sound plays — GhostMain calls these in response to
 *        gameplay events.
 *
 * The spoken character sound is a pre-generated clip per character, which the
 * design brief names as the DEFAULT (text-to-speech may not run in the Lens
 * Studio preview). All 46 basic hiragana are covered; see GhostVoiceBank.
 */

import { KANA_VOICE } from "./GhostVoiceBank";

const CLIP_BRUSH = requireAsset("../GeneratedSFX/BrushStroke.wav") as AudioTrackAsset;
const CLIP_UNROLL = requireAsset("../GeneratedSFX/PaperUnroll.wav") as AudioTrackAsset;
const CLIP_TAP = requireAsset("../GeneratedSFX/TabTap.wav") as AudioTrackAsset;
const CLIP_INK_DRY = requireAsset("../GeneratedSFX/InkDry.wav") as AudioTrackAsset;
const CLIP_MISS = requireAsset("../GeneratedSFX/StrokeMiss.wav") as AudioTrackAsset;
const CLIP_STAMP = requireAsset("../GeneratedSFX/Stamp.wav") as AudioTrackAsset;
const CLIP_PAGE = requireAsset("../GeneratedSFX/PageTurn.wav") as AudioTrackAsset;
const CLIP_GOT_IT = requireAsset("../GeneratedSFX/GotIt.wav") as AudioTrackAsset;

@component
export class GhostAudio extends BaseScriptComponent {
  @ui.label('<span style="color: #60A5FA;">GhostAudio &ndash; brush, paper, stamp and the spoken characters</span>')
  @ui.separator

  @ui.label('<span style="color: #60A5FA;">Settings</span>')
  @ui.group_start("Settings")
  @input
  @hint("Volume of the brush, paper, ink and stamp sounds.")
  @widget(new SliderWidget(0, 1, 0.05))
  sfxVolume: number = 0.65;

  @input
  @hint("Volume of the spoken character sounds.")
  @widget(new SliderWidget(0, 1, 0.05))
  voiceVolume: number = 0.9;
  @ui.group_end

  private brush!: AudioComponent;
  private unroll!: AudioComponent;
  private tap!: AudioComponent;
  private inkDry!: AudioComponent;
  private miss!: AudioComponent;
  private stamp!: AudioComponent;
  private page!: AudioComponent;
  private gotIt!: AudioComponent;
  /** One reusable source whose track is swapped per character. */
  private voice!: AudioComponent;

  onAwake(): void {
    // Cues the user is watching for, or that answer a pinch, take the
    // low-latency path. The spoken character fires at the end of a beat where
    // a few milliseconds do not matter, so it stays on low power.
    this.brush = this.makeSource("SfxBrush", CLIP_BRUSH, this.sfxVolume, true);
    this.unroll = this.makeSource("SfxUnroll", CLIP_UNROLL, this.sfxVolume, true);
    this.tap = this.makeSource("SfxTap", CLIP_TAP, this.sfxVolume, true);
    this.inkDry = this.makeSource("SfxInkDry", CLIP_INK_DRY, this.sfxVolume, true);
    this.miss = this.makeSource("SfxMiss", CLIP_MISS, this.sfxVolume, true);
    this.stamp = this.makeSource("SfxStamp", CLIP_STAMP, this.sfxVolume, true);
    this.page = this.makeSource("SfxPageTurn", CLIP_PAGE, this.sfxVolume, true);
    this.gotIt = this.makeSource("SfxGotIt", CLIP_GOT_IT, this.sfxVolume, true);
    this.voice = this.makeSource("SfxVoice", null, this.voiceVolume, false);
  }

  private makeSource(
    name: string,
    clip: AudioTrackAsset | null,
    volume: number,
    lowLatency: boolean
  ): AudioComponent {
    const so = global.scene.createSceneObject(name);
    so.setParent(this.sceneObject);
    const a = so.createComponent("Component.AudioComponent") as AudioComponent;
    if (clip) a.audioTrack = clip;
    a.volume = volume;
    a.playbackMode = lowLatency ? Audio.PlaybackMode.LowLatency : Audio.PlaybackMode.LowPower;
    return a;
  }

  playBrush(): void {
    if (this.brush) this.brush.play(1);
  }
  playUnroll(): void {
    if (this.unroll) this.unroll.play(1);
  }
  playTap(): void {
    if (this.tap) this.tap.play(1);
  }
  /** A user stroke matched and dried into place. */
  playInkDry(): void {
    if (this.inkDry) this.inkDry.play(1);
  }
  /** A user stroke was well off. Soft and downward — no buzzer, no red X. */
  playMiss(): void {
    if (this.miss) this.miss.play(1);
  }
  playStamp(): void {
    if (this.stamp) this.stamp.play(1);
  }
  playPageTurn(): void {
    if (this.page) this.page.play(1);
  }
  playGotIt(): void {
    if (this.gotIt) this.gotIt.play(1);
  }

  /** Speak a character. Covers all 46 basic hiragana; anything else is skipped. */
  playCharacterSound(character: string): void {
    const clip = KANA_VOICE[character];
    if (!clip || !this.voice) {
      print("[GhostAudio] no voice clip for '" + character + "' - skipping.");
      return;
    }
    this.voice.audioTrack = clip;
    this.voice.volume = this.voiceVolume;
    this.voice.play(1);
  }
}
