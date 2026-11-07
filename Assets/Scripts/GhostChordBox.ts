/**
 * GhostChordBox — the chord diagram exactly as a guitar book draws it.
 *
 * Owns:  the small vertical grid beside the neck: six string lines running
 *        down, five fret lines across, a heavy nut at the top, × and ○ above
 *        it, and a coloured numbered dot per fretted finger.
 * Must not: sequence anything, read input, or know about the lesson.
 *
 * Why it exists at all: the 3D neck shows WHERE your hand goes, which is what
 * a beginner cannot get from a book. The box shows the chord in the notation
 * they have already seen on every chord sheet and every song site. Having both
 * side by side is the whole bridge — the thing they recognise, next to the
 * thing they have to do.
 *
 * Orientation is the book's, not the neck's: in a chord box the nut is at the
 * TOP, frets run downward, and the strings read LOW E ON THE LEFT. That is the
 * opposite of the neck beside it (where low E is at the bottom), and it is
 * deliberate — changing the box to match the neck would make it stop being the
 * notation the learner already knows, which is the only reason it is here.
 *
 * Additive display: every value is emitted light. The grid is dim ink, the nut
 * and the dots are bright, and nothing is dark.
 */

import { Chord } from "./GhostGuitarPack";
import { fingerColor, STRING_NAMES } from "./GhostGuitarPack";
import { createDot, createQuads, RectSpec } from "./GhostInkRibbon";

const BOX_FRETS = 5;
const BOX_STRINGS = 6;

const FONT_SIZE_SCALE = 1.0;
const PANEL_DISTANCE_CM = 45;
/** Caption role, matching the rest of GHOST's small type. */
const SMALL_SIZE = 40 * FONT_SIZE_SCALE * (PANEL_DISTANCE_CM / 110);

export class GhostChordBox {
  readonly root: SceneObject;
  private gridRoot: SceneObject;
  private markRoot: SceneObject;
  private marks: SceneObject[] = [];

  private widthCm: number;
  private heightCm: number;
  private inkColor: vec4;
  private guideColor: vec4;

  constructor(
    parent: SceneObject,
    widthCm: number,
    heightCm: number,
    inkColor: vec4,
    guideColor: vec4
  ) {
    this.widthCm = widthCm;
    this.heightCm = heightCm;
    this.inkColor = inkColor;
    this.guideColor = guideColor;

    this.root = global.scene.createSceneObject("ChordBox");
    this.root.setParent(parent);

    this.gridRoot = global.scene.createSceneObject("BoxGrid");
    this.gridRoot.setParent(this.root);
    this.markRoot = global.scene.createSceneObject("BoxMarks");
    this.markRoot.setParent(this.root);
    this.markRoot.getTransform().setLocalPosition(new vec3(0, 0, 0.05));

    this.buildGrid();
  }

  set enabled(on: boolean) {
    this.root.enabled = on;
  }

  /** Box-local x of a string. 0 = low E, drawn on the LEFT as books do. */
  private stringX(s: number): number {
    const step = this.widthCm / (BOX_STRINGS - 1);
    return -this.widthCm * 0.5 + s * step;
  }

  /** Box-local y of a fret line. 0 = the nut at the top. */
  private fretY(f: number): number {
    const step = this.heightCm / BOX_FRETS;
    return this.heightCm * 0.5 - f * step;
  }

  /** Box-local y of a cell centre, where a dot sits. Fret 1..5. */
  private cellY(f: number): number {
    const step = this.heightCm / BOX_FRETS;
    return this.heightCm * 0.5 - (f - 0.5) * step;
  }

  private buildGrid(): void {
    const rects: RectSpec[] = [];
    // Six string lines running down from the nut.
    for (let s = 0; s < BOX_STRINGS; s++) {
      rects.push({ x: this.stringX(s), y: 0, w: 0.055, h: this.heightCm });
    }
    // Five fret lines across (fret 0 is the nut, drawn separately and heavier).
    for (let f = 1; f <= BOX_FRETS; f++) {
      rects.push({ x: 0, y: this.fretY(f), w: this.widthCm, h: 0.055 });
    }
    createQuads(this.gridRoot, "BoxGridLines", rects, this.guideColor, 0);

    // The nut: heavy, because in this notation it is what tells you the
    // diagram starts at the top of the neck rather than somewhere up it.
    createQuads(this.gridRoot, "BoxNut",
      [{ x: 0, y: this.fretY(0), w: this.widthCm + 0.12, h: 0.2 }],
      this.inkColor, 0.01);
  }

  /** Draw a chord: × / ○ above the nut, and a coloured numbered dot per finger. */
  setChord(chord: Chord): void {
    this.clear();

    for (let s = 0; s < BOX_STRINGS; s++) {
      const fret = chord.frets[s];
      const x = this.stringX(s);

      if (fret < 0) {
        this.addLabel("×", x, this.fretY(0) + 0.72, this.inkColor);
      } else if (fret === 0) {
        this.addLabel("○", x, this.fretY(0) + 0.72, this.inkColor);
      } else {
        const finger = chord.fingers[s];
        const color = fingerColor(finger);
        const dot = createDot(this.markRoot, "BoxDot" + s, this.heightCm / BOX_FRETS * 0.33, color, 0, 20);
        dot.getSceneObject().getTransform().setLocalPosition(new vec3(x, this.cellY(fret), 0));
        this.marks.push(dot.getSceneObject());
        if (finger > 0) {
          // The number sits ON the dot in paper-dark, the same way the neck's
          // circles are numbered, so the two readings agree finger for finger.
          this.addLabel(String(finger), x, this.cellY(fret), new vec4(0.07, 0.065, 0.05, 1), 0.02);
        }
      }
    }
  }

  /** String names along the bottom, so the box and the neck can be matched up. */
  buildStringNames(): void {
    for (let s = 0; s < BOX_STRINGS; s++) {
      this.addStatic(STRING_NAMES[s], this.stringX(s), -this.heightCm * 0.5 - 0.62);
    }
  }

  private addLabel(text: string, x: number, y: number, color: vec4, zLift: number = 0): void {
    const so = global.scene.createSceneObject("BoxLabel");
    so.setParent(this.markRoot);
    so.getTransform().setLocalPosition(new vec3(x, y, 0.02 + zLift));
    const t = so.createComponent("Component.Text") as Text;
    t.text = text;
    t.depthTest = true;
    t.size = SMALL_SIZE;
    t.weight = 500;
    t.textFill.color = color;
    t.horizontalAlignment = HorizontalAlignment.Center;
    t.verticalAlignment = VerticalAlignment.Center;
    t.horizontalOverflow = HorizontalOverflow.Overflow;
    t.verticalOverflow = VerticalOverflow.Overflow;
    t.layoutRect = Rect.create(-0.5, 0.5, -0.45, 0.45);
    this.marks.push(so);
  }

  /** Like addLabel, but parented to the grid so it survives setChord. */
  private addStatic(text: string, x: number, y: number): void {
    const so = global.scene.createSceneObject("BoxStringName");
    so.setParent(this.gridRoot);
    so.getTransform().setLocalPosition(new vec3(x, y, 0.02));
    const t = so.createComponent("Component.Text") as Text;
    t.text = text;
    t.depthTest = true;
    t.size = SMALL_SIZE;
    t.weight = 500;
    t.textFill.color = this.guideColor;
    t.horizontalAlignment = HorizontalAlignment.Center;
    t.verticalAlignment = VerticalAlignment.Center;
    t.horizontalOverflow = HorizontalOverflow.Overflow;
    t.verticalOverflow = VerticalOverflow.Overflow;
    t.layoutRect = Rect.create(-0.5, 0.5, -0.45, 0.45);
  }

  clear(): void {
    for (let i = 0; i < this.marks.length; i++) this.marks[i].destroy();
    this.marks = [];
  }
}
