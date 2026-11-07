/**
 * GhostFretboard — the 6-string, 5-fret practice board, in paper and ink.
 *
 * Owns:  the board geometry and the board's coordinate system. Everything in
 *        the guitar pack that needs to know "where is string 3, fret 2" asks
 *        here, so the dots, the ghost hand and the strum zone can never drift
 *        out of agreement with the drawn frets.
 * Must not: sequence the lesson, read input, or decide anything. The controller
 *        drives it; this is geometry and look only.
 *
 * All geometry comes from GhostInkRibbon's helpers (createWashiSheet,
 * createQuads, createDot) so the board is the same paper and the same ink as
 * the kana practice sheet. Additive display: every value here is emitted light,
 * never dark — strings and frets are fine INK LINES on cream paper, not dark
 * lines on a white board.
 *
 * ── Orientation, and why ────────────────────────────────────────────────────
 * The board is built flat in its own XY plane (like every other surface in this
 * project) and then the whole thing is pitched back about X, so it lies away
 * from the user like a neck resting on a table and angled up to be read.
 *
 * Local +Y runs from the strum end (near the user, bottom of the view) UP to
 * the nut (far from the user, top of the view). That is the standard chord-
 * diagram orientation — nut at the top, frets descending, × and ○ above the
 * nut — and it is also physically right: you strum past the frets, on the body
 * side, which is the end nearest you. It puts the one target the user has to
 * drag across (the strum) closest to them and largest on screen.
 *
 * Local +X runs low E (left) to high E (right), again as a chord diagram reads.
 *
 * ── Why the 30 cm board fits a 21.5 cm frame ────────────────────────────────
 * At 45 cm the SPECS 27 view is about 21.5 cm wide by 29.8 cm tall — PORTRAIT,
 * so width is the scarce axis and a 30 cm board laid across it simply cannot
 * fit. It is not laid across it. The 30 cm runs UP the 29.8 cm axis and AWAY
 * from the user in depth, and the pitch-back foreshortens 36 cm of paper into
 * about 22 cm of apparent height. The only thing spending screen width is the
 * 7.5 cm string span (9.6 cm of paper) — well under half the 21.5 cm available.
 */

import { createDot, createQuads, createStamp, createWashiSheet, RectSpec } from "./GhostInkRibbon";

/**
 * Fret positions as a fraction of the board's length from the nut, following a
 * real guitar's logarithmic scale (1 - 2^(-n/12)) renormalised so fret 5 lands
 * exactly on the far end. Even spacing would read as a ladder; this reads as a
 * fretboard, and the narrowest cell is still over 5 cm — a forgiving target.
 */
const FRET_POS = [0, 0.2237, 0.4349, 0.6344, 0.8225, 1.0];

export const STRING_COUNT = 6;
export const FRET_COUNT = 5;

/** Colours and sizes the board is drawn with. Set from the controller's inputs. */
export interface FretboardStyle {
  /** Warm off-white: the ink value the kana brush writes with. */
  inkColor: vec4;
  /** Faint translucent cream: paper and structure. */
  paperColor: vec4;
  /** Dimmed ink: a guide the user is not acting on yet. */
  guideColor: vec4;
  lengthCm: number;
  stringSpanCm: number;
  dotRadiusCm: number;
}

/** A point on the board, in board-local centimetres. */
export interface BoardPoint {
  x: number;
  y: number;
}

@component
export class GhostFretboard extends BaseScriptComponent {
  @ui.label('<span style="color: #60A5FA;">GhostFretboard &ndash; 6 strings, 5 frets, paper and ink</span>')
  @ui.separator

  @ui.label('<span style="color: #60A5FA;">Settings</span>')
  @ui.group_start("Settings")
  @input("vec4", "{1.00,0.95,0.86,1}")
  @hint("Ink: the nut, the string lines and the finger dots. The same warm off-white the kana brush writes with.")
  @widget(new ColorWidget())
  inkColor: vec4;

  @input("vec4", "{0.26,0.23,0.17,1}")
  @hint("Paper: the board itself. Additive display, so this is a faint translucent cream and never dark.")
  @widget(new ColorWidget())
  paperColor: vec4;

  @input("vec4", "{0.42,0.39,0.33,1}")
  @hint("Dimmed ink: the fret hairlines and a dot the user has not reached yet.")
  @widget(new ColorWidget())
  guideColor: vec4;

  @input
  @hint("Nut to fifth fret, in cm. The brief asks for about 30; this runs up the view and away from the user, not across it.")
  @widget(new SliderWidget(18, 40, 0.5))
  lengthCm: number = 30;

  @input
  @hint("Low E to high E across the board, in cm. This is the only thing spending the scarce 21.5 cm of view width.")
  @widget(new SliderWidget(4, 12, 0.1))
  stringSpanCm: number = 7.5;

  @input
  @hint("How far the board is pitched back from upright, in degrees. 0 faces the user flat on; 90 lies flat on a table. Higher values foreshorten the board into less apparent height, which is what buys the room for a 30 cm neck.")
  @widget(new SliderWidget(20, 75, 1))
  tiltDeg: number = 62;

  @input
  @hint("Where the board's centre sits relative to this object, in cm. Chest height means below the eye line, so y is small and positive only because the pitch-back lifts the far end.")
  centreCm: vec3;

  @input
  @hint("Radius of a finger dot, in cm. The pinch target around it is wider still.")
  @widget(new SliderWidget(0.5, 2, 0.05))
  dotRadiusCm: number = 1.05;

  @input("vec4", "{0.92,0.26,0.17,1}")
  @hint("The hanko stamp that lands when a chord is played. Additive display: this has to be an emitted vermilion, because a dark red would simply not appear.")
  @widget(new ColorWidget())
  stampColor: vec4;
  @ui.group_end

  /** The pitched-back child every board-local thing parents to. */
  private root: SceneObject | null = null;
  private strings: RenderMeshVisual | null = null;
  private marksRoot: SceneObject | null = null;
  private markObjects: SceneObject[] = [];
  private stamp: SceneObject | null = null;

  onAwake(): void {
    // Text components live on this board, so it needs its own Canvas — the same
    // thing GhostSheetUI and GhostAslUI do for their world-space type.
    this.sceneObject.createComponent("Component.Canvas");
    this.build();
  }

  /** The pitched-back root. Dots, the ghost hand and the strum zone go here. */
  get boardRoot(): SceneObject {
    if (!this.root) this.build();
    return this.root as SceneObject;
  }

  get style(): FretboardStyle {
    return {
      inkColor: this.inkColor,
      paperColor: this.paperColor,
      guideColor: this.guideColor,
      lengthCm: this.lengthCm,
      stringSpanCm: this.stringSpanCm,
      dotRadiusCm: this.dotRadiusCm,
    };
  }

  // ── The board's coordinate system ─────────────────────────────────────────

  /** Board-local x of a string. 0 = low E (left), 5 = high E (right). */
  stringX(stringIndex: number): number {
    const step = this.stringSpanCm / (STRING_COUNT - 1);
    return -this.stringSpanCm * 0.5 + stringIndex * step;
  }

  /** Board-local y of a fret line. 0 = the nut, 5 = the far end. */
  fretY(fret: number): number {
    const f = Math.max(0, Math.min(FRET_COUNT, fret));
    return this.lengthCm * 0.5 - this.lengthCm * FRET_POS[f];
  }

  /**
   * Board-local y where a finger sits for a given fret: the middle of the cell
   * BEHIND that fret, which is where a finger actually presses.
   */
  cellY(fret: number): number {
    const f = Math.max(1, Math.min(FRET_COUNT, fret));
    return this.lengthCm * 0.5 - this.lengthCm * (FRET_POS[f - 1] + FRET_POS[f]) * 0.5;
  }

  /** Where a fingertip goes for one string and fret. */
  fingerPoint(stringIndex: number, fret: number): BoardPoint {
    return { x: this.stringX(stringIndex), y: this.cellY(fret) };
  }

  /** Board-local y of the × / ○ row, just beyond the nut. */
  get markY(): number {
    return this.lengthCm * 0.5 + 1.4;
  }

  /** Board-local y of the strum band, past the frets on the body side. */
  get strumY(): number {
    return -this.lengthCm * 0.5 - 1.6;
  }

  get strumHeightCm(): number {
    return 3.0;
  }

  get strumWidthCm(): number {
    return this.stringSpanCm + 1.6;
  }

  /** Radius a dot reads as "reached", for the device-side fingertip check. */
  get dotRadius(): number {
    return this.dotRadiusCm;
  }

  // ── Build ─────────────────────────────────────────────────────────────────

  private build(): void {
    if (this.root) return;

    const root = global.scene.createSceneObject("BoardRoot");
    root.setParent(this.sceneObject);
    root.getTransform().setLocalPosition(this.centreCm);
    // Pitch back about X only. Yaw or roll here would skew the string lines off
    // the horizontal and make the board read as dropped rather than laid down.
    root.getTransform().setLocalRotation(
      quat.fromEulerAngles(-this.tiltDeg * Math.PI / 180, 0, 0)
    );
    this.root = root;

    const L = this.lengthCm;
    const span = this.stringSpanCm;

    // Paper, with the same torn washi edge as the practice sheet. Tall enough
    // to carry the × / ○ row above the nut and the strum band below fret 5.
    createWashiSheet(root, span + 2.1, L + 6.4, 0.11, this.paperColor, 0);

    // Fret hairlines, faintest layer: the board's structure, not its content.
    const fretRects: RectSpec[] = [];
    for (let n = 1; n <= FRET_COUNT; n++) {
      fretRects.push({ x: 0, y: this.fretY(n), w: span + 0.9, h: 0.075 });
    }
    createQuads(root, "Frets", fretRects, this.guideColor, 0.04);

    // The nut: ink, and heavier than a fret, because it is the end of the board.
    createQuads(root, "Nut", [{ x: 0, y: this.fretY(0), w: span + 1.1, h: 0.3 }],
      this.inkColor, 0.05);

    // Strings: fine ink lines running the whole board, a touch under full ink so
    // the finger dots still read as the brightest thing on the paper.
    const stringRects: RectSpec[] = [];
    for (let s = 0; s < STRING_COUNT; s++) {
      // Low strings are visibly thicker than high ones on a real instrument,
      // and the taper tells the user which end is which at a glance.
      const w = 0.125 - s * 0.009;
      stringRects.push({ x: this.stringX(s), y: (this.fretY(0) + this.strumY) * 0.5,
        w: w, h: this.fretY(0) - this.strumY });
    }
    this.strings = createQuads(root, "Strings", stringRects, this.fade(this.inkColor, 0.66), 0.06);

    // The strum band: a faint cream panel past the frets, so the place to brush
    // across reads as part of the instrument rather than an invisible hotspot.
    createQuads(root, "StrumBand",
      [{ x: 0, y: this.strumY, w: this.strumWidthCm, h: this.strumHeightCm }],
      this.fade(this.paperColor, 0.8), 0.03);

    this.marksRoot = global.scene.createSceneObject("StringMarks");
    this.marksRoot.setParent(root);
    this.marksRoot.getTransform().setLocalPosition(new vec3(0, 0, 0.08));

    // The red hanko that lands when a chord is finished, the same seal the kana
    // sheet gets. It sits over the right end of the strum band — the body of
    // the instrument, which is where a maker's mark goes, and the one patch of
    // paper no dot and no target ever uses.
    this.stamp = createStamp(root, 2.2, this.stampColor, 0.18);
    this.stamp.getTransform().setLocalPosition(new vec3(3.1, this.strumY, 0.18));
    this.stamp.enabled = false;
  }

  /** Land the stamp: this chord is done. */
  showStamp(): void {
    if (this.stamp) this.stamp.enabled = true;
  }

  hideStamp(): void {
    if (this.stamp) this.stamp.enabled = false;
  }

  // ── × and ○ at the nut end ────────────────────────────────────────────────

  /**
   * Draw the muted / open row for a chord: a small × over a string that is not
   * strummed, a small ○ over one that rings open. Fretted strings get neither —
   * their mark is the numbered dot further down the board.
   */
  setStringMarks(frets: number[]): void {
    this.clearStringMarks();
    if (!this.marksRoot) return;

    for (let s = 0; s < STRING_COUNT && s < frets.length; s++) {
      const fret = frets[s];
      if (fret > 0) continue; // fretted: the dot says it

      const x = this.stringX(s);
      if (fret === 0) {
        // Open: a ring. Two concentric dots, the inner one in paper, which on an
        // additive display subtracts nothing but reads as a hole in the ink.
        const ring = createDot(this.marksRoot, "OpenMark" + s, 0.46, this.inkColor, 0, 20);
        ring.getSceneObject().getTransform().setLocalPosition(new vec3(x, this.markY, 0));
        this.markObjects.push(ring.getSceneObject());
        const hole = createDot(this.marksRoot, "OpenHole" + s, 0.3, this.paperColor, 0.01, 20);
        hole.getSceneObject().getTransform().setLocalPosition(new vec3(x, this.markY, 0.01));
        this.markObjects.push(hole.getSceneObject());
      } else {
        // Muted: a small ink ×, two crossed bars.
        const arm = 0.78;
        const t = 0.1;
        const cross = createQuads(this.marksRoot, "MuteMark" + s, [
          { x: 0, y: 0, w: arm, h: t },
          { x: 0, y: 0, w: t, h: arm },
        ], this.fade(this.inkColor, 0.8), 0);
        const so = cross.getSceneObject();
        so.getTransform().setLocalPosition(new vec3(x, this.markY, 0));
        // Rotate the plus into an ×. 45 degrees, in radians at runtime.
        so.getTransform().setLocalRotation(quat.fromEulerAngles(0, 0, Math.PI / 4));
        this.markObjects.push(so);
      }
    }
  }

  clearStringMarks(): void {
    for (let i = 0; i < this.markObjects.length; i++) {
      this.markObjects[i].destroy();
    }
    this.markObjects = [];
  }

  /** Brighten the strings for a moment as the chord sounds. */
  setStringsLit(on: boolean): void {
    if (!this.strings) return;
    this.strings.mainMaterial.mainPass.baseColor =
      this.fade(this.inkColor, on ? 1.0 : 0.66);
  }

  private fade(c: vec4, f: number): vec4 {
    return new vec4(c.x * f, c.y * f, c.z * f, c.w);
  }
}
