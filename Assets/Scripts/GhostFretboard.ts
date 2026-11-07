/**
 * GhostFretboard — the 6-string, 5-fret practice neck, in paper and ink.
 *
 * Owns:  the neck geometry, its labels, and the neck's coordinate system.
 *        Everything in the guitar pack that needs to know "where is the A
 *        string at fret 2" asks here, so the circles, the ghost hand and the
 *        strum band can never drift out of agreement with the drawn frets.
 * Must not: sequence the lesson, read input, or decide anything. The controller
 *        drives it; this is geometry and look only.
 *
 * All geometry comes from GhostInkRibbon's helpers (createWashiSheet,
 * createQuads) so the neck is the same paper and the same ink as the
 * kana practice sheet. Additive display: every value here is emitted light,
 * never dark — strings and frets are fine INK LINES on faint cream paper.
 *
 * ── Orientation: the neck as a PLAYER sees it ───────────────────────────────
 * Local +X runs from the nut on the LEFT toward the body on the RIGHT, so the
 * strings run left to right across the view, and the headstock end is where a
 * right-handed player's left hand actually is.
 *
 * Local +Y is string pitch, and string 0 (low E) sits at the BOTTOM. That is
 * what you see looking down at your own guitar, and it is what makes the ghost
 * hand's approach from below read as a hand wrapping the neck.
 *
 * The neck is pitched back only slightly, enough to read as an object lying in
 * your space rather than a flat card. An earlier build laid it almost flat,
 * running away from the viewer like a road, and a beginner could not tell which
 * string was which: that view is correct for a guitar on a table and useless
 * for learning a chord, because every fret past the first was foreshortened
 * into a sliver.
 *
 * ── Fitting the frame ───────────────────────────────────────────────────────
 * The measured SPECS frame at 45 cm is about 21.5 cm wide by 29.8 cm tall —
 * PORTRAIT — and the kana pack measured (not assumed) that content past about
 * ±11 cm vertically falls outside it. A horizontal neck therefore spends the
 * SCARCE axis, so the fretted length here is deliberately well under the
 * brief's 30 cm and the neck is pushed a little further back than the 45 cm
 * anchor. Height is the plentiful axis, which is why the instruction, the
 * chord name, the fret numbers, the legend and the tabs all stack vertically.
 */

import { createQuads, createStamp, createWashiSheet, RectSpec } from "./GhostInkRibbon";
import { STRING_NAMES } from "./GhostGuitarPack";

/**
 * Fret positions as a fraction of the fretted length, following a real
 * guitar's logarithmic scale (1 - 2^(-n/12)) renormalised so fret 5 lands on
 * the far end. Even spacing would read as a ladder; this reads as a fretboard.
 */
const FRET_POS = [0, 0.2237, 0.4349, 0.6344, 0.8225, 1.0];

export const STRING_COUNT = 6;
export const FRET_COUNT = 5;

const FONT_SIZE_SCALE = 1.0;
const PANEL_DISTANCE_CM = 45;
/** Caption role at weight 500: thin dim type does not survive an additive display. */
const LABEL_SIZE = 42 * FONT_SIZE_SCALE * (PANEL_DISTANCE_CM / 110);

/** Colours and sizes the neck is drawn with. Read by the controller. */
export interface FretboardStyle {
  inkColor: vec4;
  paperColor: vec4;
  guideColor: vec4;
  fretLengthCm: number;
  stringGapCm: number;
  dotRadiusCm: number;
}

export interface BoardPoint {
  x: number;
  y: number;
}

@component
export class GhostFretboard extends BaseScriptComponent {
  @ui.label('<span style="color: #60A5FA;">GhostFretboard &ndash; the neck, as a player sees it</span>')
  @ui.separator

  @ui.label('<span style="color: #60A5FA;">Settings</span>')
  @ui.group_start("Settings")
  @input("vec4", "{1.00,0.95,0.86,1}")
  @hint("Ink: the nut and the string lines. The same warm off-white the kana brush writes with.")
  @widget(new ColorWidget())
  inkColor: vec4;

  @input("vec4", "{0.26,0.23,0.17,1}")
  @hint("Paper: the neck itself. Additive display, so this is a faint translucent cream and never dark.")
  @widget(new ColorWidget())
  paperColor: vec4;

  @input("vec4", "{0.62,0.58,0.50,1}")
  @hint("Dimmed ink: fret hairlines, string names and fret numbers. Bright enough to read on glass, quiet enough to stay behind the finger circles.")
  @widget(new ColorWidget())
  guideColor: vec4;

  @input
  @hint("Nut to fifth fret, in cm. This runs ACROSS the view, which is the scarce 21.5 cm axis, so it is much shorter than a real neck and the board sits further back to compensate.")
  @widget(new SliderWidget(5, 16, 0.1))
  fretLengthCm: number = 7.8;

  @input
  @hint("Distance between neighbouring strings, in cm. Height is the plentiful axis, so this is generous: it is what gives the finger circles room to read as separate.")
  @widget(new SliderWidget(0.8, 2.2, 0.05))
  stringGapCm: number = 1.45;

  @input
  @hint("How far the neck is pitched back from facing you, in degrees. Small on purpose: enough to sit in your space, not so much that the far frets foreshorten into slivers.")
  @widget(new SliderWidget(0, 45, 1))
  tiltDeg: number = 14;

  @input
  @hint("Where the neck's centre sits relative to this object, in cm. Negative z pushes it further away, which is what buys the width for a horizontal neck.")
  centreCm: vec3;

  @input
  @hint("Radius of a finger circle, in cm. The pinch target around it is wider still.")
  @widget(new SliderWidget(0.3, 1.2, 0.05))
  dotRadiusCm: number = 0.58;

  @input("vec4", "{0.92,0.26,0.17,1}")
  @hint("The hanko stamp that lands when a chord is played. Additive display: an emitted vermilion, because a dark red would simply not appear.")
  @widget(new ColorWidget())
  stampColor: vec4;
  @ui.group_end

  private root: SceneObject | null = null;
  private strings: RenderMeshVisual | null = null;
  private marksRoot: SceneObject | null = null;
  private markObjects: SceneObject[] = [];
  private stamp: SceneObject | null = null;
  private strumArrow: SceneObject | null = null;

  onAwake(): void {
    // String names and fret numbers are world-space Text on this object, so it
    // needs its own Canvas — the same thing GhostSheetUI and GhostAslUI do.
    this.sceneObject.createComponent("Component.Canvas");
    this.build();
  }

  /** The pitched-back root. Circles, the ghost hand and the strum zone go here. */
  get boardRoot(): SceneObject {
    if (!this.root) this.build();
    return this.root as SceneObject;
  }

  get style(): FretboardStyle {
    return {
      inkColor: this.inkColor,
      paperColor: this.paperColor,
      guideColor: this.guideColor,
      fretLengthCm: this.fretLengthCm,
      stringGapCm: this.stringGapCm,
      dotRadiusCm: this.dotRadiusCm,
    };
  }

  // ── The neck's coordinate system ──────────────────────────────────────────

  /** Neck-local y of a string. 0 = low E at the BOTTOM, 5 = high e at the top. */
  stringY(stringIndex: number): number {
    const span = this.stringGapCm * (STRING_COUNT - 1);
    return -span * 0.5 + stringIndex * this.stringGapCm;
  }

  /** Neck-local x of a fret line. 0 = the nut on the LEFT, 5 = the far end. */
  fretX(fret: number): number {
    const f = Math.max(0, Math.min(FRET_COUNT, fret));
    return -this.fretLengthCm * 0.5 + this.fretLengthCm * FRET_POS[f];
  }

  /** Neck-local x where a finger presses: the middle of the cell behind a fret. */
  cellX(fret: number): number {
    const f = Math.max(1, Math.min(FRET_COUNT, fret));
    return -this.fretLengthCm * 0.5 +
      this.fretLengthCm * (FRET_POS[f - 1] + FRET_POS[f]) * 0.5;
  }

  /** Where a fingertip goes for one string and fret. */
  fingerPoint(stringIndex: number, fret: number): BoardPoint {
    return { x: this.cellX(fret), y: this.stringY(stringIndex) };
  }

  get stringSpanCm(): number {
    return this.stringGapCm * (STRING_COUNT - 1);
  }

  /** Neck-local x of the × / ○ column, just left of the nut. */
  get markX(): number {
    return this.fretX(0) - 0.72;
  }

  /** Neck-local x of the strum band, right of the frets on the body side. */
  get strumX(): number {
    return this.fretX(FRET_COUNT) + 1.15;
  }

  get strumWidthCm(): number {
    return 1.8;
  }

  get strumHeightCm(): number {
    return this.stringSpanCm + 1.2;
  }

  get dotRadius(): number {
    return this.dotRadiusCm;
  }

  // ── Build ─────────────────────────────────────────────────────────────────

  private build(): void {
    if (this.root) return;

    const root = global.scene.createSceneObject("BoardRoot");
    root.setParent(this.sceneObject);
    root.getTransform().setLocalPosition(this.centreCm);
    // Pitch back about X only. Yaw or roll would tip the string lines off the
    // horizontal, and a sloping string is a string a learner cannot name.
    root.getTransform().setLocalRotation(
      quat.fromEulerAngles(-this.tiltDeg * Math.PI / 180, 0, 0)
    );
    this.root = root;

    const L = this.fretLengthCm;
    const span = this.stringSpanCm;
    const left = this.fretX(0);
    const right = this.strumX + this.strumWidthCm * 0.5;

    // Paper, with the same torn washi edge as the practice sheet. It reaches
    // left past the nut to carry the × / ○ column and right past fret 5 to
    // carry the strum band.
    const paperW = (right - left) + 2.3;
    const paperCx = (left + right) * 0.5 - 0.35;
    const paper = createWashiSheet(root, paperW, span + 1.6, 0.09, this.paperColor, 0);
    paper.getSceneObject().getTransform().setLocalPosition(new vec3(paperCx, 0, 0));

    // Fret hairlines: the neck's structure, dimmer than the strings.
    const fretRects: RectSpec[] = [];
    for (let n = 1; n <= FRET_COUNT; n++) {
      fretRects.push({ x: this.fretX(n), y: 0, w: 0.07, h: span + 0.8 });
    }
    createQuads(root, "Frets", fretRects, this.guideColor, 0.04);

    // The nut: ink, heavier than a fret, because it is the end of the neck.
    createQuads(root, "Nut",
      [{ x: this.fretX(0), y: 0, w: 0.26, h: span + 1.0 }], this.inkColor, 0.05);

    // Strings: fine ink lines running the whole neck. Low strings are visibly
    // thicker, which tells you which end is which at a glance.
    const stringRects: RectSpec[] = [];
    for (let s = 0; s < STRING_COUNT; s++) {
      const h = 0.115 - s * 0.008;
      stringRects.push({ x: (left + right) * 0.5, y: this.stringY(s), w: right - left, h: h });
    }
    this.strings = createQuads(root, "Strings", stringRects, this.fade(this.inkColor, 0.72), 0.06);

    // The strum band: a faint panel past the frets, so the place to brush
    // across reads as part of the instrument and not an invisible hotspot.
    createQuads(root, "StrumBand",
      [{ x: this.strumX, y: 0, w: this.strumWidthCm, h: this.strumHeightCm }],
      this.fade(this.paperColor, 0.85), 0.03);

    this.buildStringNames();
    this.buildFretNumbers();
    this.buildStrumArrow();

    this.marksRoot = global.scene.createSceneObject("StringMarks");
    this.marksRoot.setParent(root);
    this.marksRoot.getTransform().setLocalPosition(new vec3(0, 0, 0.08));

    // The red hanko that lands when a chord is finished, the same seal the kana
    // sheet gets. It sits past the strum band, clear of every string and circle.
    this.stamp = createStamp(root, 1.7, this.stampColor, 0.18);
    // On the strum band itself: the one patch of the neck that carries no
    // string name, fret number or finger circle, and thematically where a
    // maker's mark goes on a real instrument.
    this.stamp.getTransform().setLocalPosition(new vec3(this.strumX, 0, 0.18));
    this.stamp.enabled = false;
  }

  /**
   * String names down the left edge, low E at the bottom. A learner cannot act
   * on "the fifth string" if nothing on the neck says which one that is.
   */
  private buildStringNames(): void {
    if (!this.root) return;
    for (let s = 0; s < STRING_COUNT; s++) {
      this.addLabel(this.root, "StringName" + s, STRING_NAMES[s],
        this.markX - 0.95, this.stringY(s), this.guideColor);
    }
  }

  /** Fret numbers under the neck, so "fret 2" points at something. */
  private buildFretNumbers(): void {
    if (!this.root) return;
    const y = -this.stringSpanCm * 0.5 - 1.05;
    for (let n = 1; n <= FRET_COUNT; n++) {
      this.addLabel(this.root, "FretNumber" + n, String(n), this.cellX(n), y, this.guideColor);
    }
  }

  /**
   * A soft arrow across the strings, shown only when the strum is the step.
   * It points the way a beginner should brush: from the low E upward across
   * all six, which on this neck is bottom to top.
   */
  private buildStrumArrow(): void {
    if (!this.root) return;
    const so = global.scene.createSceneObject("StrumArrow");
    so.setParent(this.root);
    so.getTransform().setLocalPosition(new vec3(this.strumX, 0, 0.14));

    const half = this.stringSpanCm * 0.5;
    const rects: RectSpec[] = [
      { x: 0, y: 0, w: 0.14, h: this.stringSpanCm + 0.5 },
      { x: -0.26, y: half + 0.02, w: 0.42, h: 0.14 },
      { x: 0.26, y: half + 0.02, w: 0.42, h: 0.14 },
    ];
    const vis = createQuads(so, "ArrowBody", rects, this.fade(this.inkColor, 0.9), 0);
    // Splay the two head bars into a chevron pointing up the strings.
    const head = vis.getSceneObject();
    head.getTransform().setLocalPosition(new vec3(0, 0, 0));
    so.enabled = false;
    this.strumArrow = so;
  }

  setStrumArrowVisible(on: boolean): void {
    if (this.strumArrow) this.strumArrow.enabled = on;
  }

  private addLabel(
    parent: SceneObject,
    name: string,
    text: string,
    x: number,
    y: number,
    color: vec4
  ): void {
    const so = global.scene.createSceneObject(name);
    so.setParent(parent);
    so.getTransform().setLocalPosition(new vec3(x, y, 0.1));
    const t = so.createComponent("Component.Text") as Text;
    t.text = text;
    t.depthTest = true;
    t.size = LABEL_SIZE;
    t.weight = 500;
    t.textFill.color = color;
    t.horizontalAlignment = HorizontalAlignment.Center;
    t.verticalAlignment = VerticalAlignment.Center;
    t.horizontalOverflow = HorizontalOverflow.Overflow;
    t.verticalOverflow = VerticalOverflow.Overflow;
    t.layoutRect = Rect.create(-0.6, 0.6, -0.5, 0.5);
  }

  // ── × and ○ at the nut ────────────────────────────────────────────────────

  /**
   * The muted / open column left of the nut: × over a string that is not
   * strummed, ○ over one that rings open. Fretted strings get neither — their
   * mark is the numbered circle out on the neck.
   */
  setStringMarks(frets: number[]): void {
    this.clearStringMarks();
    if (!this.marksRoot) return;

    for (let s = 0; s < STRING_COUNT && s < frets.length; s++) {
      const fret = frets[s];
      if (fret > 0) continue;
      const y = this.stringY(s);

      if (fret === 0) {
        this.addMark("OpenMark" + s, "\u25CB", y);
      } else {
        this.addMark("MuteMark" + s, "\u00D7", y);
      }
    }
  }

  /**
   * One × or ○ left of the nut, drawn as a TEXT glyph rather than as meshes.
   *
   * An earlier version built the ○ from a bright ring with a paper-coloured
   * disc inside it, reasoning that the inner disc would read as a hole. On an
   * ADDITIVE display it does the opposite: paper colour over ink ADDS light, so
   * the ring filled in and both marks rendered as solid white blobs. Glyphs
   * have the hole built into the shape, which is the only way to get a hole on
   * a display that cannot subtract.
   */
  private addMark(name: string, glyph: string, y: number): void {
    if (!this.marksRoot) return;
    const so = global.scene.createSceneObject(name);
    so.setParent(this.marksRoot);
    so.getTransform().setLocalPosition(new vec3(this.markX, y, 0));
    const t = so.createComponent("Component.Text") as Text;
    t.text = glyph;
    t.depthTest = true;
    t.size = LABEL_SIZE;
    t.weight = 500;
    t.textFill.color = this.inkColor;
    t.horizontalAlignment = HorizontalAlignment.Center;
    t.verticalAlignment = VerticalAlignment.Center;
    t.horizontalOverflow = HorizontalOverflow.Overflow;
    t.verticalOverflow = VerticalOverflow.Overflow;
    t.layoutRect = Rect.create(-0.5, 0.5, -0.45, 0.45);
    this.markObjects.push(so);
  }

  clearStringMarks(): void {
    for (let i = 0; i < this.markObjects.length; i++) this.markObjects[i].destroy();
    this.markObjects = [];
  }

  /** Brighten the strings for a moment as the chord sounds. */
  setStringsLit(on: boolean): void {
    if (!this.strings) return;
    this.strings.mainMaterial.mainPass.baseColor = this.fade(this.inkColor, on ? 1.0 : 0.72);
  }

  showStamp(): void {
    if (this.stamp) this.stamp.enabled = true;
  }

  hideStamp(): void {
    if (this.stamp) this.stamp.enabled = false;
  }

  private fade(c: vec4, f: number): vec4 {
    return new vec4(c.x * f, c.y * f, c.z * f, c.w);
  }
}
