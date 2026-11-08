/**
 * GhostSheetUI — the paper furniture that belongs to the practice sheet:
 * the stroke counter at its top-left corner, and the Replay / Slower / Next /
 * Packs bookmark tabs sticking out of its right edge.
 *
 * Owns:  every visible string in the lesson state, and the four pinch targets.
 *        Built entirely from UIKit primitives (Button + FlexLayout) so the tabs
 *        work with the mouse in Interactive Preview and with real hands on SPECS.
 * Must not: hold lesson state or decide anything. It renders what GhostMain
 *        pushes in through the setters, and reports pinches back through the
 *        public events. A passive view.
 *
 * Additive display: the tab faces and all type are warm off-white LIGHT values.
 * The brief calls the type "thin grey"; on glass that has to be a dimmed warm
 * white, because true grey-on-black renders as nothing at all.
 */

import { Button } from "SpectaclesUIKit.lspkg/Scripts/Components/Button/Button";
import { FlexItem } from "SpectaclesUIKit.lspkg/Scripts/Components/Layout2D/Flex/FlexItem";
import { FlexLayout } from "SpectaclesUIKit.lspkg/Scripts/Components/Layout2D/Flex/FlexLayout";
import {
  FlexAlign,
  FlexDirection,
  FlexJustify,
} from "SpectaclesUIKit.lspkg/Scripts/Components/Layout2D/Flex/FlexTypes";
import { RoundedRectangleVisual } from "SpectaclesUIKit.lspkg/Scripts/Visuals/RoundedRectangle/RoundedRectangleVisual";
import Event, { PublicApi } from "SpectaclesInteractionKit.lspkg/Utils/Event";
import { Pt } from "./GhostKanaPath";
import { createDot, createQuads, createStamp, createWashiSheet } from "./GhostInkRibbon";

// ── Typography ───────────────────────────────────────────────────────────────
// Sizes are the Snap Specs type scale, calibrated at z = -110 cm. GHOST's sheet
// sits at 45 cm, so every call passes PANEL_DISTANCE_CM and the scale converts.
const FONT_SIZE_SCALE = 1.0;
const PANEL_DISTANCE_CM = 45;

/** Study Together peer colour: the same cyan as peer ink. */
const PEER_CYAN = new vec4(0.40, 0.80, 1.0, 1.0);
/** Seconds a peer's cheer stamp stays (slam, rest, fade). */
const CHEER_TOTAL = 3.2;
/** Seconds a room note stays (fade in, hold, fade out); long enough to read mid-task. */
const NOTE_TOTAL = 5.0;

export type TextRole =
  | "Title1" | "Headline1" | "Body" | "Caption" | "TabThin"
  | "Counter" | "StrokeNum" | "Banner";

// Sizes below were raised substantially after testing え on glass: the whole
// scale was calibrated for a panel at 110 cm and then scaled DOWN for a sheet
// at 45 cm, which is backwards — closer content subtends more angle per cm, so
// the cm sizes should not have shrunk nearly as much as they did. Everything a
// learner has to read mid-stroke (the counter, the stroke numbers, the tip and
// the romaji) is now sized to be legible without looking straight at it.
const TYPE_SCALE: Record<TextRole, { size: number; weight: number }> = {
  Title1: { size: 170, weight: 700 },
  Headline1: { size: 54, weight: 700 },
  Body: { size: 72, weight: 500 },
  Caption: { size: 38, weight: 500 },
  /** "1 / 3" at the sheet's corner — glanced at, never studied, so it has to
   *  be readable out of the corner of an eye. Over 3x its old size. */
  /** The one big word above the sheet: WATCH, YOUR TURN, NICE. Bold and large
   *  enough to be read without looking straight at it. */
  Banner: { size: 118, weight: 700 },
  Counter: { size: 124, weight: 700 },
  /** The small numeral at each stroke's start point. Also over 3x. */
  StrokeNum: { size: 124, weight: 700 },
  // The brief asks for "thin grey type" on the tabs, but a 300 weight at 38 on
  // an ADDITIVE display is barely there: thin strokes emit too little light to
  // read at 45 cm, and the washi tab behind them is deliberately faint, so
  // there is no dark ground to carry them. Medium weight at a slightly larger
  // size keeps the quiet, un-boxy bookmark look while actually being readable.
  // The tab PAPER is unchanged — only the type got heavier.
  TabThin: { size: 78, weight: 500 },
};

function roleSize(role: TextRole, distanceCm: number = PANEL_DISTANCE_CM): number {
  return TYPE_SCALE[role].size * FONT_SIZE_SCALE * (distanceCm / 110);
}

export function applyTextRole(t: Text, role: TextRole, distanceCm: number = PANEL_DISTANCE_CM): void {
  t.size = roleSize(role, distanceCm);
  t.weight = TYPE_SCALE[role].weight;
}

/** Seconds for the big word to brush in, and to fade out again. */
const BANNER_WIPE_SEC = 0.3;
const BANNER_FADE_SEC = 0.4;

const LAYOUT_Z_LIFT = 0.02;
const BUTTON_LABEL_Z = 0.08;

/** Tab label text is paired 1:1 with the action it performs — changing one
 *  without the other would lie to the user, so these are not @inputs.
 *  "Ask" is the brief's mic tab: in the Japanese pack it joins the stack. */
const TAB_LABELS = ["Replay", "Slower", "Ask", "Next", "Packs"];

@component
export class GhostSheetUI extends BaseScriptComponent {
  @ui.label('<span style="color: #60A5FA;">GhostSheetUI &ndash; stroke counter and the bookmark tabs</span>')
  @ui.separator

  @ui.label('<span style="color: #60A5FA;">Settings</span>')
  @ui.group_start("Settings")
  @input("vec4", "{1,0.86,0.55,1}")
  @hint("Colour of the turn markers: the numbered start dot, the direction arrow and the faint end dot. Warm amber so they read as guidance rather than as ink.")
  @widget(new ColorWidget())
  markerColor: vec4;

  @input("vec4", "{0.26,0.23,0.17,1}")
  @hint("Bookmark tab paper colour. Matches GhostSheet's paperColor by default so the tabs read as the same sheet of washi, not as separate panels.")
  @widget(new ColorWidget())
  tabPaperColor: vec4;

  @input("vec4", "{0.46,0.41,0.31,1}")
  @hint("Tab colour when the user aims at it — the same paper, lit up. Still washi, never a highlight box.")
  @widget(new ColorWidget())
  tabHighlightColor: vec4;

  @input("vec4", "{0.96,0.93,0.86,1}")
  @hint("Colour of the tab labels and the stroke counter. Near-white emitted light: on the additive display the faint washi tab gives the type no dark ground to sit on, so the letters have to carry their own brightness to read at 45 cm.")
  @widget(new ColorWidget())
  typeColor: vec4;

  @input("vec4", "{1.0,0.95,0.86,1}")
  @hint("A progress dot for a character already finished.")
  @widget(new ColorWidget())
  progressDoneColor: vec4;

  @input("vec4", "{0.72,0.68,0.60,1}")
  @hint("The dot for the character being practised now.")
  @widget(new ColorWidget())
  progressCurrentColor: vec4;

  @input("vec4", "{0.30,0.28,0.24,1}")
  @hint("A dot for a character not reached yet. Dim, never dark: on the additive display an 'empty' dot can only be dim.")
  @widget(new ColorWidget())
  progressDimColor: vec4;

  @input
  @hint("Radius of each progress dot, in cm.")
  @widget(new SliderWidget(0.08, 0.6, 0.02))
  progressDotRadiusCm: number = 0.2;

  @input
  @hint("Width of each bookmark tab, in cm.")
  @widget(new SliderWidget(2, 8, 0.1))
  tabWidthCm: number = 3.0;

  @input
  @hint("Height of each bookmark tab, in cm. The brief asks for at least 3 cm so they stay forgiving pinch targets.")
  @widget(new SliderWidget(2, 6, 0.1))
  tabHeightCm: number = 3.2;

  @input
  @hint("Vertical gap between stacked tabs, in cm.")
  @widget(new SliderWidget(0, 2, 0.1))
  tabGapCm: number = 0.6;

  @input
  @hint("How far right of the sheet centre the tab stack sits, in cm. 8.4 tucks each tab behind the sheet edge so it sticks out like a real bookmark, and keeps the stack inside the visible frame.")
  @widget(new SliderWidget(6, 16, 0.1))
  tabOffsetXCm: number = 8.4;

  @input("vec2", "{-6.0,6.3}")
  @hint("Stroke-counter position relative to the sheet centre, in cm. Default is the sheet's top-left corner.")
  counterOffsetCm: vec2;
  @ui.group_end

  private counterText: Text | null = null;
  private captionText: Text | null = null;
  private romajiText: Text | null = null;
  private hookText: Text | null = null;
  private lineText: Text | null = null;
  private dots: RenderMeshVisual[] = [];
  private dotRoot: SceneObject | null = null;
  private strokeNumberRoot: SceneObject | null = null;
  private strokeNumbers: SceneObject[] = [];
  private turnMarkers: SceneObject[] = [];

  // ── The one big word ──────────────────────────────────────────────────────
  private bannerText: Text | null = null;
  /** Study Together race scores, left of the sheet. Null until first used. */
  private scoreText: Text | null = null;
  /** Seconds into the score-change pop, or -1 when idle. */
  private scorePopT = -1;
  /** A peer's cheer: a small cyan stamp that slams onto this sheet. */
  private cheerStamp: RenderMeshVisual | null = null;
  private cheerT = -1;
  /** A one-line room note ("Mia joined"), faded in and out. */
  private noteText: Text | null = null;
  private noteT = -1;
  private bannerFull = "";
  private bannerT = 0;
  private bannerHoldSec = 1.6;
  /** "wipe" while the ink brushes in, "hold", "fade", "off". */
  private bannerPhase = "off";
  /** Tab cells by label, so a phase can show only the ones it needs. */
  private tabCells: { [label: string]: SceneObject } = {};
  private tabButtons: Button[] = [];
  private tabPapers: RenderMeshVisual[] = [];

  private readonly _onReplay = new Event<void>();
  private readonly _onSlower = new Event<void>();
  private readonly _onNext = new Event<void>();
  private readonly _onPacks = new Event<void>();
  private readonly _onAsk = new Event<void>();

  get onReplay(): PublicApi<void> {
    return this._onReplay.publicApi();
  }
  get onSlower(): PublicApi<void> {
    return this._onSlower.publicApi();
  }
  get onNext(): PublicApi<void> {
    return this._onNext.publicApi();
  }
  get onPacks(): PublicApi<void> {
    return this._onPacks.publicApi();
  }
  /** The brief's mic tab — opens Ask GHOST. */
  get onAsk(): PublicApi<void> {
    return this._onAsk.publicApi();
  }

  // ── Public API: GhostMain pushes lesson state in through these ─────────────

  /** Update the "1 / 3" counter at the sheet's top-left corner. */
  setStrokeCounter(current: number, total: number): void {
    if (!this.counterText) return;
    this.counterText.text = current + " / " + total;
  }

  /**
   * Small line of type under the sheet. Ask GHOST uses it to show the word
   * being written and its meaning; the lesson leaves it empty.
   */
  setCaption(text: string): void {
    if (!this.captionText) return;
    this.captionText.text = text;
    this.captionText.getSceneObject().enabled = text.length > 0;
  }

  /** Large, under the sheet: how the character sounds. */
  setRomaji(text: string): void {
    if (!this.romajiText) return;
    this.romajiText.text = text;
    this.romajiText.getSceneObject().enabled = text.length > 0;
  }

  /** Tiny, under the romaji: something to picture. */
  setHook(text: string): void {
    if (!this.hookText) return;
    this.hookText.text = text;
    this.hookText.getSceneObject().enabled = text.length > 0;
  }

  /**
   * The single transient line above the sheet — the intro, the next stroke's
   * tip, or a word of praise. Deliberately ONE slot: the brief asks for one
   * thing at a time, so a new line always replaces the last rather than
   * stacking up another label to read.
   */
  setLine(text: string): void {
    if (!this.lineText) return;
    this.lineText.text = text;
    this.lineText.getSceneObject().enabled = text.length > 0;
  }

  /**
   * The row of progress dots, one per character in the set. `done` dots are
   * filled bright, the current one is mid, the rest are faint — brightness
   * only, because on the additive display an "empty" dot cannot be drawn as
   * dark, only as dim.
   */
  setProgress(total: number, done: number, current: number): void {
    this.ensureDots(total);
    for (let i = 0; i < this.dots.length; i++) {
      const on = i < total;
      this.dots[i].getSceneObject().enabled = on;
      if (!on) continue;
      let c = this.progressDimColor;
      if (i < done) c = this.progressDoneColor;
      else if (i === current) c = this.progressCurrentColor;
      this.dots[i].mainMaterial.mainPass.baseColor = c;
    }
    if (this.dotRoot) this.dotRoot.enabled = total > 0;
  }

  private ensureDots(total: number): void {
    if (!this.dotRoot) return;
    while (this.dots.length < total) {
      const i = this.dots.length;
      const d = createDot(this.dotRoot, "ProgressDot" + i, this.progressDotRadiusCm,
        this.progressDimColor, 0);
      this.dots.push(d);
    }
    // Re-space for the current count so the row stays centred under the sheet.
    const gap = this.progressDotRadiusCm * 4.2;
    const x0 = -((total - 1) * gap) / 2;
    for (let i = 0; i < this.dots.length; i++) {
      this.dots[i].getSceneObject().getTransform()
        .setLocalPosition(new vec3(x0 + i * gap, 0, 0));
    }
  }

  /**
   * Place a small grey stroke number at a stroke's starting point.
   * These are positioned from stroke DATA (each stroke's own start point), not
   * stacked in a column — a flex layout would be the wrong tool here.
   */
  showStrokeNumber(n: number, xCm: number, yCm: number): void {
    if (!this.strokeNumberRoot) return;
    const so = global.scene.createSceneObject("StrokeNumber" + n);
    so.setParent(this.strokeNumberRoot);
    so.getTransform().setLocalPosition(new vec3(xCm, yCm, 0));

    const t = so.createComponent("Component.Text") as Text;
    t.text = String(n);
    t.depthTest = true;
    applyTextRole(t, "StrokeNum");
    t.textFill.color = this.typeColor;
    t.horizontalAlignment = HorizontalAlignment.Center;
    t.verticalAlignment = VerticalAlignment.Center;
    t.horizontalOverflow = HorizontalOverflow.Overflow;
    t.verticalOverflow = VerticalOverflow.Overflow;
    t.layoutRect = Rect.create(-1.3, 1.3, -1.1, 1.1);

    this.strokeNumbers.push(so);
  }

  /**
   * Where this stroke starts, which way it goes, and where it ends.
   *
   * Shown during the USER's turn, not the ghost's. Watching a demonstration
   * tells you the shape; it does not tell you where to put the brush down
   * thirty seconds later, and "1 / 3" does not either. So the stroke about to
   * be drawn gets a numbered dot at its start, a short arrow along its first
   * centimetre for direction, and a faint dot where it ends.
   *
   * Only ever ONE stroke's markers are up at a time — the one being drawn.
   * Marking every stroke at once would be a diagram, and the brief's rule is
   * one thing at a time.
   */
  showTurnMarkers(n: number, start: Pt, heading: Pt, end: Pt): void {
    this.clearTurnMarkers();
    if (!this.strokeNumberRoot) return;

    // The faint end dot first, so the brighter start marker wins any overlap.
    const endDot = createDot(
      this.strokeNumberRoot, "StrokeEndDot", 0.42, this.fade(this.markerColor, 0.42), 0.01, 18
    );
    endDot.getSceneObject().getTransform().setLocalPosition(new vec3(end.x, end.y, 0.01));
    this.turnMarkers.push(endDot.getSceneObject());

    // Direction arrow: a short bar from the start point along the heading,
    // with a chevron at its far end. Built along +x and then rotated, so the
    // geometry is written once regardless of which way the stroke runs.
    const dx = heading.x - start.x;
    const dy = heading.y - start.y;
    const len = Math.sqrt(dx * dx + dy * dy);
    if (len > 1e-3) {
      const angle = Math.atan2(dy, dx);
      const shaft = Math.min(2.4, Math.max(1.1, len));
      const t = 0.17;
      const arrow = createQuads(this.strokeNumberRoot, "StrokeArrow", [
        { x: shaft * 0.5, y: 0, w: shaft, h: t },
        { x: shaft - 0.3, y: 0.22, w: 0.62, h: t },
        { x: shaft - 0.3, y: -0.22, w: 0.62, h: t },
      ], this.markerColor, 0.02);
      const so = arrow.getSceneObject();
      so.getTransform().setLocalPosition(new vec3(start.x, start.y, 0.02));
      so.getTransform().setLocalRotation(quat.fromEulerAngles(0, 0, angle));
      this.turnMarkers.push(so);
    }

    // The numbered start dot, brightest of the three.
    const startDot = createDot(
      this.strokeNumberRoot, "StrokeStartDot", 0.95, this.markerColor, 0.03, 22
    );
    startDot.getSceneObject().getTransform().setLocalPosition(new vec3(start.x, start.y, 0.03));
    this.turnMarkers.push(startDot.getSceneObject());

    const numSO = this.obj(this.strokeNumberRoot, "StrokeStartNumber",
      new vec3(start.x, start.y, 0.05));
    const t2 = numSO.createComponent("Component.Text") as Text;
    t2.text = String(n);
    t2.depthTest = true;
    applyTextRole(t2, "StrokeNum");
    // Dark numeral on the bright dot: on an additive display the dot cannot be
    // punched through, so the number is a dimmer value sitting over a brighter one.
    t2.textFill.color = new vec4(0.08, 0.07, 0.055, 1);
    t2.horizontalAlignment = HorizontalAlignment.Center;
    t2.verticalAlignment = VerticalAlignment.Center;
    t2.horizontalOverflow = HorizontalOverflow.Overflow;
    t2.verticalOverflow = VerticalOverflow.Overflow;
    t2.layoutRect = Rect.create(-1.3, 1.3, -1.1, 1.1);
    this.turnMarkers.push(numSO);
  }

  clearTurnMarkers(): void {
    for (let i = 0; i < this.turnMarkers.length; i++) this.turnMarkers[i].destroy();
    this.turnMarkers = [];
  }

  clearStrokeNumbers(): void {
    for (let i = 0; i < this.strokeNumbers.length; i++) {
      this.strokeNumbers[i].destroy();
    }
    this.strokeNumbers = [];
  }

  // ── Build ─────────────────────────────────────────────────────────────────

  onAwake(): void {
    this.sceneObject.createComponent("Component.Canvas");
    this.buildCounter();
    this.buildCaption();
    this.buildRomaji();
    this.buildHook();
    this.buildLine();
    this.buildScoreboard();
    this.buildDotRoot();
    this.buildStrokeNumberRoot();
    this.buildTabs();
    this.createEvent("UpdateEvent").bind(() => {
      const dt = getDeltaTime();
      this.updateBanner(dt);
      this.updateScorePop(dt);
      this.updateCheer(dt);
      this.updateNote(dt);
    });
  }

  private buildCounter(): void {
    const so = this.obj(this.sceneObject, "StrokeCounter",
      new vec3(this.counterOffsetCm.x, this.counterOffsetCm.y, 0.03));
    const t = so.createComponent("Component.Text") as Text;
    t.text = "1 / 1";
    t.depthTest = true;
    applyTextRole(t, "Counter");
    t.textFill.color = this.typeColor;
    t.horizontalAlignment = HorizontalAlignment.Center;
    t.verticalAlignment = VerticalAlignment.Center;
    t.horizontalOverflow = HorizontalOverflow.Overflow;
    t.verticalOverflow = VerticalOverflow.Overflow;
    t.layoutRect = Rect.create(-3.6, 3.6, -1.3, 1.3);
    this.counterText = t;
  }

  private buildCaption(): void {
    const so = this.obj(this.sceneObject, "SheetCaption", new vec3(0, -8.6, 0.03));
    const t = so.createComponent("Component.Text") as Text;
    t.text = "";
    t.depthTest = true;
    applyTextRole(t, "Body");
    t.textFill.color = this.typeColor;
    t.horizontalAlignment = HorizontalAlignment.Center;
    t.verticalAlignment = VerticalAlignment.Center;
    t.horizontalOverflow = HorizontalOverflow.Overflow;
    t.verticalOverflow = VerticalOverflow.Overflow;
    t.layoutRect = Rect.create(-8, 8, -0.8, 0.8);
    this.captionText = t;
    so.enabled = false;
  }

  /**
   * Say ONE thing, big, above the sheet.
   *
   * The word brushes in left to right over `wipeSec` — revealed a character at
   * a time, which at this size and speed reads as an ink wipe — holds, then
   * fades out. Calling it again replaces whatever was there, so there is never
   * a second line to read.
   *
   * @param holdSec seconds to hold at full strength. 0 holds until replaced.
   */
  say(text: string, holdSec: number = 1.6): void {
    if (!this.bannerText) return;
    this.bannerFull = text || "";
    this.bannerHoldSec = holdSec;
    this.bannerT = 0;
    this.bannerPhase = this.bannerFull.length > 0 ? "wipe" : "off";
    this.bannerText.text = "";
    this.bannerText.textFill.color = this.typeColor;
    this.bannerText.getSceneObject().enabled = this.bannerFull.length > 0;
  }

  /** Clear the banner immediately. */
  clearSay(): void {
    this.say("", 0);
  }

  private updateBanner(dt: number): void {
    if (!this.bannerText || this.bannerPhase === "off") return;
    this.bannerT += dt;

    if (this.bannerPhase === "wipe") {
      const f = Math.min(1, this.bannerT / BANNER_WIPE_SEC);
      const n = Math.max(1, Math.ceil(this.bannerFull.length * f));
      this.bannerText.text = this.bannerFull.substr(0, n);
      if (f >= 1) {
        this.bannerPhase = this.bannerHoldSec > 0 ? "hold" : "still";
        this.bannerT = 0;
      }
      return;
    }

    if (this.bannerPhase === "hold") {
      if (this.bannerT >= this.bannerHoldSec) {
        this.bannerPhase = "fade";
        this.bannerT = 0;
      }
      return;
    }

    if (this.bannerPhase === "fade") {
      const f = Math.min(1, this.bannerT / BANNER_FADE_SEC);
      // Additive display: fading toward black IS fading toward invisible.
      const k = 1 - f;
      this.bannerText.textFill.color = this.fade(this.typeColor, k);
      if (f >= 1) {
        this.bannerPhase = "off";
        this.bannerText.getSceneObject().enabled = false;
      }
    }
  }

  /**
   * Show only the tabs this moment needs.
   *
   * Pass the labels to keep; everything else is hidden. The brief's rule is to
   * remove what is not needed right now — during the ghost's demonstration
   * there is nothing to do, and during the user's turn only Replay and Next
   * are worth the space.
   */
  setTabsVisible(labels: string[]): void {
    for (let i = 0; i < TAB_LABELS.length; i++) {
      const label = TAB_LABELS[i];
      const cell = this.tabCells[label];
      if (!cell) continue;
      let on = false;
      for (let k = 0; k < labels.length; k++) {
        if (labels[k] === label) { on = true; break; }
      }
      cell.enabled = on;
    }
  }

  /** Every tab back on. */
  showAllTabs(): void {
    this.setTabsVisible(TAB_LABELS);
  }

  /** A text object under (or above) the sheet, centred, hidden until set. */
  private buildText(
    name: string, y: number, role: TextRole, halfWidth: number, halfHeight: number = 1.6
  ): Text {
    const so = this.obj(this.sceneObject, name, new vec3(0, y, 0.03));
    const t = so.createComponent("Component.Text") as Text;
    t.text = "";
    t.depthTest = true;
    applyTextRole(t, role);
    t.textFill.color = this.typeColor;
    t.horizontalAlignment = HorizontalAlignment.Center;
    t.verticalAlignment = VerticalAlignment.Center;
    t.horizontalOverflow = HorizontalOverflow.Overflow;
    t.verticalOverflow = VerticalOverflow.Overflow;
    t.layoutRect = Rect.create(-halfWidth, halfWidth, -halfHeight, halfHeight);
    so.enabled = false;
    return t;
  }

  // Everything below the sheet reads top-down: how it sounds, then what to
  // picture, then how far through the set you are. The single transient line
  // sits ABOVE the sheet so a changing instruction never jostles the fixed
  // block of text underneath it.
  private buildRomaji(): void {
    // Moved up from -8.9: at the new Title1 size the glyph is a centimetre
    // taller, and content past about -11 cm is outside the SPECS frame.
    this.romajiText = this.buildText("SheetRomaji", -8.4, "Title1", 8, 1.7);
  }

  /**
   * The memory hook is no longer drawn.
   *
   * It was the seventh thing on a sheet the brief wants down to a handful, it
   * duplicated the romaji's job loosely, and after the type got bigger it
   * spilled past the measured -11 cm floor of the SPECS frame. setHook is kept
   * as a no-op so the lesson data and GhostMain do not have to change to put
   * it back.
   */
  private buildHook(): void {
    this.hookText = null;
  }

  /**
   * The Study Together race board: a short ranked list LEFT of the sheet.
   * The brief keeps the left side empty during solo practice, and so does
   * this: the board only appears once a room has scores. It sits at x -12 cm,
   * inside the ~31 cm frame width at 45 cm, clear of the paper (half-width
   * 7.5) and of the tabs on the right. Replaces the old plan of writing scores
   * into the memory hook, which is retired and draws nothing.
   */
  private buildScoreboard(): void {
    // Level with the lower half of the sheet: +4.5 cm clipped at the top-left
    // corner of the frame in preview, because the sheet itself sits high.
    // Measured in preview: the frame ends ~13.5 cm left of centre and the
    // paper starts at -7.5, so the column is -12.9..-7.7 (x -10.3, +/-2.6).
    const t = this.buildText("RaceBoard", -2.5, "Body", 2.6, 4);
    t.getSceneObject().getTransform().setLocalPosition(new vec3(-10.3, -2.5, 0.03));
    this.scoreText = t;
  }

  /**
   * A peer finished a character: their cheer lands on THIS sheet as a small
   * cyan stamp in the bottom-left corner (the learner's own red hanko owns
   * the bottom-right). It slams in from oversize with a slight overshoot,
   * rests, then fades. Peer colour matches their ink, so it reads as theirs.
   */
  showCheer(): void {
    if (!this.cheerStamp) {
      const so = createStamp(this.sceneObject, 2.6, PEER_CYAN, 0.16);
      so.getTransform().setLocalPosition(new vec3(-5.4, -5.4, 0.16));
      this.cheerStamp = so.getComponent("Component.RenderMeshVisual") as RenderMeshVisual;
    }
    this.cheerStamp.getSceneObject().enabled = true;
    this.cheerT = 0;
    this.applyCheer(0);
  }

  private updateCheer(dt: number): void {
    if (this.cheerT < 0) return;
    this.cheerT += dt;
    if (this.cheerT >= CHEER_TOTAL) {
      this.cheerT = -1;
      if (this.cheerStamp) this.cheerStamp.getSceneObject().enabled = false;
      return;
    }
    this.applyCheer(this.cheerT);
  }

  /** Slam: 1.9x -> 0.92x in 0.18 s, settle to 1.0 by 0.3 s; fade out at the end. */
  private applyCheer(t: number): void {
    if (!this.cheerStamp) return;
    let k: number;
    if (t < 0.18) {
      const f = t / 0.18;
      k = 1.9 + (0.92 - 1.9) * (1 - (1 - f) * (1 - f));
    } else if (t < 0.3) {
      k = 0.92 + 0.08 * ((t - 0.18) / 0.12);
    } else {
      k = 1;
    }
    this.cheerStamp.getSceneObject().getTransform().setLocalScale(new vec3(k, k, 1));
    // Additive display: brightness IS opacity. Snap in, fade out.
    const a = Math.min(1, t / 0.08) * (t > CHEER_TOTAL - 0.6 ? (CHEER_TOTAL - t) / 0.6 : 1);
    this.cheerStamp.mainMaterial.mainPass.baseColor =
      new vec4(PEER_CYAN.x * a, PEER_CYAN.y * a, PEER_CYAN.z * a, PEER_CYAN.w);
  }

  /**
   * One short room note, left of the sheet above the race board: soft fade in
   * (0.4 s), hold, fade out. A new note replaces the old one, so notes never
   * stack — the brief's one-thing-at-a-time rule.
   */
  showNote(text: string): void {
    if (!this.noteText) {
      this.noteText = this.buildText("RoomNote", 2.5, "Body", 2.6, 1.6);
      // Wrap inside the 5.2 cm column: "Desktop B finished!" on one line ran
      // off the left edge of the frame in preview.
      this.noteText.horizontalOverflow = HorizontalOverflow.Wrap;
      this.noteText.getSceneObject().getTransform().setLocalPosition(new vec3(-10.3, 2.5, 0.03));
    }
    this.noteText.text = text;
    this.noteText.getSceneObject().enabled = text.length > 0;
    this.noteT = text.length > 0 ? 0 : -1;
    this.applyNote(0);
  }

  private updateNote(dt: number): void {
    if (this.noteT < 0 || !this.noteText) return;
    this.noteT += dt;
    if (this.noteT >= NOTE_TOTAL) {
      this.noteT = -1;
      this.noteText.getSceneObject().enabled = false;
      return;
    }
    this.applyNote(this.noteT);
  }

  private applyNote(t: number): void {
    if (!this.noteText) return;
    const fadeIn = Math.min(1, t / 0.4);
    const ease = fadeIn * fadeIn * (3 - 2 * fadeIn);
    const fadeOut = t > NOTE_TOTAL - 0.5 ? Math.max(0, (NOTE_TOTAL - t) / 0.5) : 1;
    const a = ease * fadeOut;
    const c = this.typeColor;
    this.noteText.textFill.color = new vec4(c.x * a, c.y * a, c.z * a, c.w * a);
  }

  /** Show the race board; a change in the ranking gives it a small pop. */
  setScoreboard(text: string): void {
    if (!this.scoreText) return;
    const changed = this.scoreText.text !== text;
    this.scoreText.text = text;
    this.scoreText.getSceneObject().enabled = text.length > 0;
    if (changed && text.length > 0) this.scorePopT = 0;
  }

  /** Pop: scale up 22% and settle back over a quarter second, ease-out. */
  private updateScorePop(dt: number): void {
    if (this.scorePopT < 0 || !this.scoreText) return;
    this.scorePopT += dt;
    const d = 0.25;
    const f = Math.min(1, this.scorePopT / d);
    const k = 1 + 0.22 * Math.sin(Math.PI * f) * (1 - f * 0.5);
    this.scoreText.getSceneObject().getTransform().setLocalScale(new vec3(k, k, 1));
    if (f >= 1) {
      this.scoreText.getSceneObject().getTransform().setLocalScale(vec3.one());
      this.scorePopT = -1;
    }
  }

  /**
   * The one big word, centred just above the sheet.
   *
   * This REPLACES the old small tip line. The brief's rule is one instruction
   * on screen at a time, read instantly — a sentence in body type above a sheet
   * you are concentrating on is not read at all, so the channel became a single
   * large word or short phrase that brushes in and gets out of the way.
   */
  private buildLine(): void {
    this.lineText = this.buildText("SheetBanner", 9.3, "Banner", 16, 1.2);
    this.bannerText = this.lineText;
  }

  private buildDotRoot(): void {
    // Above the sheet, not below: the romaji/hook block already fills the space
    // under the paper, and content much below -11 cm falls outside the SPECS
    // frame at 45 cm (measured, not assumed).
    const so = this.obj(this.sceneObject, "ProgressDots", new vec3(0, 11.0, 0.03));
    so.enabled = false;
    this.dotRoot = so;
  }

  private buildStrokeNumberRoot(): void {
    this.strokeNumberRoot = this.obj(this.sceneObject, "StrokeNumbers", new vec3(0, 0, 0.03));
  }

  private buildTabs(): void {
    const w = this.tabWidthCm;
    const h = this.tabHeightCm;
    const gap = this.tabGapCm;
    const stackH = TAB_LABELS.length * h + (TAB_LABELS.length - 1) * gap;

    const host = this.obj(this.sceneObject, "BookmarkTabs", new vec3(this.tabOffsetXCm, 0, 0));
    const column = this.flexColumn(host, w, stackH, gap);

    const items: FlexItem[] = [];
    for (let i = 0; i < TAB_LABELS.length; i++) {
      const label = TAB_LABELS[i];
      items.push(this.flexChild(column, w, h, (cell) => {
        this.tabCells[label] = cell;
        const btn = cell.createComponent(Button.getTypeName()) as Button;
        btn.setVariant({ theme: "SnapOS2", shape: "Rectangle", style: "PrimaryNeutral" });
        btn.size = new vec3(w, h, 1);
        btn.onInitialized.add(() => {
          btn.size = new vec3(w, h, 1);
          this.applyPaperLook(btn);
        });
        btn.onTriggerUp.add(() => this.fire(label));
        this.tabButtons.push(btn);

        // The tab's APPEARANCE is a torn washi quad built from the same mesh the
        // practice sheet uses, not the UIKit plate — a rounded rectangle always
        // reads as a control, however it is tinted. The UIKit Button is still
        // the affordance (collider, Interactable, hover/trigger events); its own
        // face is simply turned off with opacity 0. This is NOT a hand-rolled
        // button: no raw collider, no raw Interactable, no hand-made hit test.
        btn.opacity = 0;
        const paper = createWashiSheet(cell, w, h, 0.03, this.tabPaperColor, -0.01);
        this.tabPapers.push(paper);
        btn.onHoverEnter.add(() => {
          paper.mainMaterial.mainPass.baseColor = this.tabHighlightColor;
        });
        btn.onHoverExit.add(() => {
          paper.mainMaterial.mainPass.baseColor = this.tabPaperColor;
        });

        this.addButtonLabel(cell, label, w - 0.5);
      }));
    }
    this.registerItems(column, items);
  }

  private fire(label: string): void {
    if (label === "Replay") this._onReplay.invoke();
    else if (label === "Slower") this._onSlower.invoke();
    else if (label === "Next") this._onNext.invoke();
    else if (label === "Packs") this._onPacks.invoke();
    else if (label === "Ask") this._onAsk.invoke();
  }

  /**
   * Repaint a UIKit Button so it reads as a torn paper bookmark rather than a
   * control. Three things do the work: the face is the SAME washi colour as the
   * sheet, the border box is turned off entirely, and the corners are nearly
   * square so the tab looks like cut paper. Aiming at one warms the paper
   * instead of drawing a highlight box around it.
   */
  private applyPaperLook(btn: Button): void {
    const vis = btn.visual as RoundedRectangleVisual;
    if (!vis || vis.baseType === undefined) return;
    vis.baseType = "Color";
    vis.baseDefaultColor = this.tabPaperColor;
    vis.baseHoveredColor = this.tabHighlightColor;
    vis.baseTriggeredColor = this.tabHighlightColor;
    vis.defaultHasBorder = false;
    vis.hoveredHasBorder = false;
    vis.triggeredHasBorder = false;
    vis.cornerRadius = 0.12;
  }

  private fade(c: vec4, f: number): vec4 {
    return new vec4(c.x * f, c.y * f, c.z * f, c.w);
  }

  // ── Layout composition helpers ────────────────────────────────────────────

  private obj(parent: SceneObject, name: string, position?: vec3): SceneObject {
    const so = global.scene.createSceneObject(name);
    so.setParent(parent);
    if (position) so.getTransform().setLocalPosition(position);
    return so;
  }

  private flexColumn(parent: SceneObject, width: number, height: number, gap: number): SceneObject {
    const container = this.obj(parent, "Flex", new vec3(0, 0, LAYOUT_Z_LIFT));
    const flex = container.createComponent(FlexLayout.getTypeName()) as FlexLayout;
    const item = container.createComponent(FlexItem.getTypeName()) as FlexItem;
    item.overrideWidth = width;
    item.overrideHeight = height;
    flex.onInitialized.add(() => {
      flex.width = width;
      flex.height = height;
      flex.direction = FlexDirection.Column;
      flex.rowGap = gap;
      flex.justifyContent = FlexJustify.Center;
      flex.alignItems = FlexAlign.Center;
    });
    return container;
  }

  private flexChild(parent: SceneObject, w: number, h: number, builder: (child: SceneObject) => void): FlexItem {
    const child = this.obj(parent, "Item", new vec3(0, 0, LAYOUT_Z_LIFT));
    const item = child.createComponent(FlexItem.getTypeName()) as FlexItem;
    item.overrideWidth = w;
    item.overrideHeight = h;
    item.flexGrow = 0;
    item.flexShrink = 0;
    builder(child);
    return item;
  }

  /**
   * FlexLayout refuses addItems() before it has initialised — it binds its own
   * initialize() to OnStartEvent, and throws "Cannot add items while
   * autoDiscoverItemsOnStart is enabled and the layout is not initialized" if
   * called from onAwake. Register the children inside onInitialized instead, so
   * they land exactly once and in author order.
   */
  private registerItems(container: SceneObject, items: FlexItem[]): void {
    const flex = container.getComponent(FlexLayout.getTypeName()) as FlexLayout | null;
    if (!flex) return;
    flex.onInitialized.add(() => flex.addItems(items));
  }

  /** Label drawn ON a button face — lifted forward so the face cannot clip it. */
  private addButtonLabel(parent: SceneObject, text: string, widthCm: number): void {
    const so = this.obj(parent, "ButtonLabel", new vec3(0, 0, BUTTON_LABEL_Z));
    const t = so.createComponent("Component.Text") as Text;
    t.text = text;
    t.depthTest = true;
    applyTextRole(t, "TabThin");
    t.textFill.color = this.typeColor;
    t.horizontalAlignment = HorizontalAlignment.Center;
    t.verticalAlignment = VerticalAlignment.Center;
    t.horizontalOverflow = HorizontalOverflow.Overflow;
    t.verticalOverflow = VerticalOverflow.Overflow;
    t.layoutRect = Rect.create(-widthCm / 2, widthCm / 2, -1.1, 1.1);
    so.createComponent(FlexItem.getTypeName());
  }
}
