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
// Game layer (GhostGame): synthesized for GHOST, see tools in the commit log.
const CLIP_GAME_TICK = requireAsset("../GeneratedSFX/GameTick.wav") as AudioTrackAsset;
const CLIP_GAME_COMBO = requireAsset("../GeneratedSFX/GameCombo.wav") as AudioTrackAsset;
const CLIP_GAME_LEVEL = requireAsset("../GeneratedSFX/GameLevelUp.wav") as AudioTrackAsset;
const CLIP_GAME_BADGE = requireAsset("../GeneratedSFX/GameBadge.wav") as AudioTrackAsset;
const CLIP_GAME_WIN = requireAsset("../GeneratedSFX/GameWin.wav") as AudioTrackAsset;

/**
 * The guitar pack's chords. One pre-rendered nylon strum each, with the
 * string-to-string stagger already baked in by the generator
 * (tempAssetGen/gen_chords_guitar.js), so the user's own strum gesture does not
 * have to be fast or even for the chord to sound like a chord.
 *
 * requireAsset only accepts string literals, so these are written out rather
 * than built from GUITAR_CHORDS' ids — the one place the chord list is
 * duplicated, and the reason the map below is keyed by exactly those ids.
 */
const CHORD_CLIPS: { [id: string]: AudioTrackAsset } = {
  Em: requireAsset("../GeneratedSFX/Chord_Em.wav") as AudioTrackAsset,
  Am: requireAsset("../GeneratedSFX/Chord_Am.wav") as AudioTrackAsset,
  C: requireAsset("../GeneratedSFX/Chord_C.wav") as AudioTrackAsset,
  G: requireAsset("../GeneratedSFX/Chord_G.wav") as AudioTrackAsset,
  D: requireAsset("../GeneratedSFX/Chord_D.wav") as AudioTrackAsset,
};

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

  @input
  @hint("Volume of the guitar pack's chord strums. Lower than the brush and the voice on purpose: a chord rings for nearly four seconds under a lesson.")
  @widget(new SliderWidget(0, 1, 0.05))
  chordVolume: number = 0.45;
  @ui.group_end

  private brush!: AudioComponent;
  private unroll!: AudioComponent;
  private tap!: AudioComponent;
  private inkDry!: AudioComponent;
  private miss!: AudioComponent;
  private stamp!: AudioComponent;
  private page!: AudioComponent;
  private gotIt!: AudioComponent;
  /**
   * Game sounds are made the first time each one plays, not in onAwake:
   * five more sources at start pushed GhostAudio's onAwake past Lens Studio's
   * script time limit with two previews loading at once ("Javascript
   * execution has timed out"), which can stop later components starting.
   */
  private game: { [k: string]: AudioComponent } = {};

  private playGame(key: string, clip: AudioTrackAsset, volume: number): void {
    let a = this.game[key];
    if (!a) {
      a = this.makeSource("SfxGame_" + key, clip, this.sfxVolume * volume, true);
      this.game[key] = a;
    }
    a.play(1);
  }
  /** One reusable source whose track is swapped per character. */
  private voice!: AudioComponent;
  /** One reusable source whose track is swapped per chord. */
  private chord!: AudioComponent;

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
    // A chord answers the user's own strum, so it takes the low-latency path:
    // a strum you hear late does not feel like the strum you just made.
    this.chord = this.makeSource("SfxChord", null, this.chordVolume, true);
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
  playGameTick(): void {
    this.playGame("tick", CLIP_GAME_TICK, 0.5);
  }
  playGameCombo(): void {
    this.playGame("combo", CLIP_GAME_COMBO, 0.7);
  }
  playGameLevelUp(): void {
    this.playGame("level", CLIP_GAME_LEVEL, 0.8);
  }
  playGameBadge(): void {
    this.playGame("badge", CLIP_GAME_BADGE, 0.7);
  }
  playGameWin(): void {
    this.playGame("win", CLIP_GAME_WIN, 0.85);
  }

  /**
   * Strum a chord. `id` is a GhostGuitarPack chord id ("Em", "Am", "C", ...).
   *
   * Stopping any chord still ringing before starting the next one: two nylon
   * strums overlapping for three seconds reads as a mistake, not as a chord.
   */
  playChord(id: string): void {
    const clip = CHORD_CLIPS[id];
    if (!clip || !this.chord) {
      print("[GhostAudio] no chord clip for '" + id + "' - skipping.");
      return;
    }
    // stop() throws "Audio player is not enabled" on a source that has never
    // played, which is exactly the state of this pooled source on the first
    // chord of a session.
    if (this.chord.isPlaying()) this.chord.stop(false);
    this.chord.audioTrack = clip;
    this.chord.volume = this.chordVolume;
    this.chord.play(1);
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
