/**
 * GhostFrontDoorUI — the first thing you see: "What do you want to learn?"
 *
 * Owns:  the front sheet and its four pinch targets — the ink mic circle,
 *        three suggestion lines, and the small "Your notebook" row that opens
 *        the built-in packs. Also the outline the ghost sketches while a lesson
 *        is being planned.
 * Must not: fetch a lesson, play one, or decide what happens next. It emits
 *        what the user asked for and GhostMain decides — the same one-way flow
 *        every other UI module here uses.
 *
 * ── Why the big circle is not a button ──────────────────────────────────────
 * The design spec rules out pill chips, icon tiles and nested cards. So the
 * primary action is a brushed ink DISC with a mic glyph on it, built from the
 * same mesh helpers the practice sheet uses. A UIKit Button still provides the
 * affordance — collider, Interactable, hover and trigger events, and therefore
 * mouse-pinch in Interactive Preview — but its own rounded-rectangle face is
 * turned off with opacity 0, exactly as GhostSheetUI does for its washi tabs.
 * This is NOT a hand-rolled control: there is no raw collider and no hand-made
 * hit test anywhere in this file.
 *
 * ── No spinner ──────────────────────────────────────────────────────────────
 * While the planner works, the sheet does not spin or fake a progress bar. The
 * skill name is brushed on, then each step title appears in ink as it arrives.
 * If it runs long there is one honest line, and it says so plainly.
 *
 * Additive display: every value here is emitted light. Paper is a faint warm
 * cream, ink is a warm off-white, and the single accent — vermilion — is
 * reserved for the stamp, so it does not appear on this screen at all.
 */

import { Button } from "SpectaclesUIKit.lspkg/Scripts/Components/Button/Button";
import { FlexItem } from "SpectaclesUIKit.lspkg/Scripts/Components/Layout2D/Flex/FlexItem";
import { FlexLayout } from "SpectaclesUIKit.lspkg/Scripts/Components/Layout2D/Flex/FlexLayout";
import {
  FlexAlign,
  FlexDirection,
  FlexJustify,
} from "SpectaclesUIKit.lspkg/Scripts/Components/Layout2D/Flex/FlexTypes";
import Event, { PublicApi } from "SpectaclesInteractionKit.lspkg/Utils/Event";
import { createDot, createQuads, createWashiSheet } from "./GhostInkRibbon";

const FONT_SIZE_SCALE = 1.0;
const PANEL_DISTANCE_CM = 45;

/** Three sizes only, as the spec asks: Title, Body, Meta. */
type TextRole = "Title" | "Body" | "Meta" | "Glyph";
const TYPE_SCALE: Record<TextRole, { size: number; weight: number }> = {
  Title: { size: 112, weight: 700 },
  Body: { size: 74, weight: 500 },
  Meta: { size: 54, weight: 500 },
  Glyph: { size: 96, weight: 700 },
};
function applyTextRole(t: Text, role: TextRole): void {
  t.size = TYPE_SCALE[role].size * FONT_SIZE_SCALE * (PANEL_DISTANCE_CM / 110);
  t.weight = TYPE_SCALE[role].weight;
}

const LAYOUT_Z_LIFT = 0.02;

/** What the notebook row offers, in pack-id order. */
const NOTEBOOKS: { id: string; label: string }[] = [
  { id: "japanese", label: "Japanese" },
  { id: "asl", label: "ASL" },
  { id: "guitar", label: "Guitar" },
];

@component
export class GhostFrontDoorUI extends BaseScriptComponent {
  @ui.label('<span style="color: #60A5FA;">GhostFrontDoorUI &ndash; what do you want to learn?</span>')
  @ui.separator

  @ui.label('<span style="color: #60A5FA;">Settings</span>')
  @ui.group_start("Settings")
  @input("vec4", "{0.26,0.23,0.17,1}")
  @hint("Paper. Additive display, so this is a faint warm cream and never dark.")
  @widget(new ColorWidget())
  paperColor: vec4;

  @input("vec4", "{0.96,0.93,0.86,1}")
  @hint("Ink: the title, the mic glyph and the suggestion lines. Near-white, because dim type does not survive on glass.")
  @widget(new ColorWidget())
  inkColor: vec4;

  @input("vec4", "{0.62,0.58,0.50,1}")
  @hint("Quieter ink: the notebook row and the honest waiting line.")
  @widget(new ColorWidget())
  dimInkColor: vec4;

  @input("vec4", "{0.46,0.41,0.31,1}")
  @hint("The wash that appears under a suggestion when you aim at it. No glow, no border — the paper simply darkens like wet ink.")
  @widget(new ColorWidget())
  hoverColor: vec4;

  @input
  @hint("Width of the front sheet, in cm.")
  @widget(new SliderWidget(12, 26, 0.5))
  sheetWidthCm: number = 19;

  @input
  @hint("Height of the front sheet, in cm. The kana pack measured content past about 11 cm from centre falling outside the SPECS frame at 45 cm, so a sheet much taller than 21 puts its own bottom row out of view.")
  @widget(new SliderWidget(14, 24, 0.5))
  sheetHeightCm: number = 21;
  @ui.group_end

  private root: SceneObject | null = null;
  private titleText: Text | null = null;
  private waitText: Text | null = null;
  private suggestionTexts: Text[] = [];
  private suggestions: string[] = [];
  private outlineTexts: Text[] = [];
  private outlineRoot: SceneObject | null = null;
  private pickRoot: SceneObject | null = null;

  private readonly _onSkillPicked = new Event<string>();
  private readonly _onMicPressed = new Event<void>();
  private readonly _onNotebookPicked = new Event<string>();

  /** A suggestion was pinched, or a skill was chosen from the mic list. */
  get onSkillPicked(): PublicApi<string> {
    return this._onSkillPicked.publicApi();
  }
  /** The ink mic circle was pinched. */
  get onMicPressed(): PublicApi<void> {
    return this._onMicPressed.publicApi();
  }
  /** One of the built-in packs under "Your notebook". */
  get onNotebookPicked(): PublicApi<string> {
    return this._onNotebookPicked.publicApi();
  }

  onAwake(): void {
    this.sceneObject.createComponent("Component.Canvas");
    this.build();
  }

  // ── Public API ────────────────────────────────────────────────────────────

  /** The three handwritten lines under the mic. */
  setSuggestions(list: string[]): void {
    this.suggestions = list.slice(0, this.suggestionTexts.length);
    for (let i = 0; i < this.suggestionTexts.length; i++) {
      const has = i < this.suggestions.length;
      this.suggestionTexts[i].text = has ? this.suggestions[i] : "";
      this.suggestionTexts[i].getSceneObject().getParent().enabled = has;
    }
  }

  /** Show the picker again, hiding any lesson outline. */
  showPicker(): void {
    if (this.pickRoot) this.pickRoot.enabled = true;
    if (this.outlineRoot) this.outlineRoot.enabled = false;
    if (this.titleText) this.titleText.text = "What do you want to learn?";
    this.setWaiting("");
    this.clearOutline();
  }

  /**
   * Switch to the outline the ghost sketches while the lesson is planned.
   * The picker goes away: there is nothing to choose any more.
   */
  beginOutline(skill: string): void {
    if (this.pickRoot) this.pickRoot.enabled = false;
    if (this.outlineRoot) this.outlineRoot.enabled = true;
    this.clearOutline();
    if (this.titleText) this.titleText.text = skill;
  }

  /** One more step title, inked on as it arrives. */
  addOutlineLine(text: string): void {
    for (let i = 0; i < this.outlineTexts.length; i++) {
      if (this.outlineTexts[i].text === "") {
        this.outlineTexts[i].text = text;
        this.outlineTexts[i].getSceneObject().enabled = true;
        return;
      }
    }
  }

  clearOutline(): void {
    for (let i = 0; i < this.outlineTexts.length; i++) {
      this.outlineTexts[i].text = "";
      this.outlineTexts[i].getSceneObject().enabled = false;
    }
  }

  /**
   * The one honest line. Empty hides it.
   *
   * The spec forbids a spinner and forbids faking progress, so this says what
   * is actually happening and nothing more.
   */
  setWaiting(text: string): void {
    if (!this.waitText) return;
    this.waitText.text = text || "";
    this.waitText.getSceneObject().enabled = !!text;
  }

  setVisible(on: boolean): void {
    if (this.root) this.root.enabled = on;
  }

  // ── Build ─────────────────────────────────────────────────────────────────

  private build(): void {
    const root = this.obj(this.sceneObject, "FrontDoor");
    this.root = root;

    createWashiSheet(root, this.sheetWidthCm, this.sheetHeightCm, 0.14, this.paperColor, 0);

    const halfH = this.sheetHeightCm * 0.5;
    this.titleText = this.addText(root, "FrontTitle", 0, halfH - 2.6, "Title",
      this.sheetWidthCm - 2.0, 1.6, this.inkColor);
    this.titleText.text = "What do you want to learn?";
    this.titleText.horizontalOverflow = HorizontalOverflow.Wrap;

    // Everything the picker owns lives under one root, so the outline can take
    // the sheet over without hiding things one at a time.
    this.pickRoot = this.obj(root, "Picker");
    // Laid out against the frame, not against the paper: the sheet is allowed
    // to run to its own edges, but nothing readable may sit past about 11 cm
    // from centre or it is simply not on screen.
    this.buildMic(this.pickRoot, halfH - 7.4);
    this.buildSuggestions(this.pickRoot, -1.9);
    this.buildNotebookRow(this.pickRoot, -9.0);

    this.outlineRoot = this.obj(root, "Outline");
    this.outlineRoot.enabled = false;
    for (let i = 0; i < 6; i++) {
      const t = this.addText(this.outlineRoot, "OutlineLine" + i,
        0, halfH - 6.2 - i * 2.1, "Body", this.sheetWidthCm - 3.0, 0.9, this.inkColor);
      t.getSceneObject().enabled = false;
      this.outlineTexts.push(t);
    }

    this.waitText = this.addText(root, "FrontWaiting", 0, -halfH + 6.0, "Meta",
      this.sheetWidthCm - 3.0, 0.8, this.dimInkColor);
    this.waitText.getSceneObject().enabled = false;
  }

  /** The one primary action: a brushed ink disc with a mic glyph on it. */
  private buildMic(parent: SceneObject, y: number): void {
    const r = 2.5;
    const host = this.obj(parent, "MicCircle", new vec3(0, y, 0.02));

    const btn = host.createComponent(Button.getTypeName()) as Button;
    btn.setVariant({ theme: "SnapOS2", shape: "Rectangle", style: "PrimaryNeutral" });
    btn.size = new vec3(r * 2, r * 2, 1);
    btn.onInitialized.add(() => {
      btn.size = new vec3(r * 2, r * 2, 1);
      // The UIKit plate is the affordance only; the ink disc below is the face.
      btn.opacity = 0;
      this.stripPlate(btn);
    });
    btn.onTriggerUp.add(() => this._onMicPressed.invoke());

    // The disc is a WASH, not full ink, and the glyph on top is the bright
    // part. The obvious way round — bright disc, glyph "cut out" in paper —
    // does not work on an additive display: paper laid over ink ADDS light, so
    // the cut-out fills in and the whole thing renders as a white blob. The
    // only way to draw a hole here is to not emit light there.
    const discColor = this.fade(this.inkColor, 0.30);
    const discHover = this.fade(this.inkColor, 0.46);
    const disc = createDot(host, "MicInk", r, discColor, 0.01, 40);
    btn.onHoverEnter.add(() => {
      disc.mainMaterial.mainPass.baseColor = discHover;
    });
    btn.onHoverExit.add(() => {
      disc.mainMaterial.mainPass.baseColor = discColor;
    });

    const g = this.obj(host, "MicGlyph", new vec3(0, 0, 0.03));
    // Capsule body, stem, base bar — a mic in three strokes.
    createQuads(g, "MicBody", [
      { x: 0, y: 0.45, w: 0.80, h: 1.45 },
      { x: 0, y: -0.58, w: 0.17, h: 0.70 },
      { x: 0, y: -0.98, w: 1.05, h: 0.17 },
    ], this.inkColor, 0);
    // The pickup's shoulders, as two short bars either side.
    createQuads(g, "MicArc", [
      { x: -0.60, y: -0.12, w: 0.17, h: 0.72 },
      { x: 0.60, y: -0.12, w: 0.17, h: 0.72 },
    ], this.inkColor, 0.001);

    this.addText(parent, "MicHint", 0, y - r - 0.9, "Meta",
      this.sheetWidthCm - 4, 0.7, this.dimInkColor).text = "Pinch to say a skill";
  }

  /** Three handwritten lines. Pinch one to start. */
  private buildSuggestions(parent: SceneObject, topY: number): void {
    const w = this.sheetWidthCm - 3.4;
    const h = 1.8;
    const gap = 0.4;
    const host = this.obj(parent, "Suggestions", new vec3(0, topY - h, 0));
    const column = this.flexColumn(host, w, 3 * h + 2 * gap, gap);

    const items: FlexItem[] = [];
    for (let i = 0; i < 3; i++) {
      const index = i;
      items.push(this.flexChild(column, w, h, (cell) => {
        const btn = cell.createComponent(Button.getTypeName()) as Button;
        btn.setVariant({ theme: "SnapOS2", shape: "Rectangle", style: "PrimaryNeutral" });
        btn.size = new vec3(w, h, 1);
        btn.onInitialized.add(() => {
          btn.size = new vec3(w, h, 1);
          // opacity alone leaves the plate's corner marks showing; the border
          // flags have to come off too or they read as a chip outline, which
          // the design spec rules out.
          btn.opacity = 0;
          this.stripPlate(btn);
        });
        btn.onTriggerUp.add(() => {
          const s = this.suggestions[index];
          if (s) this._onSkillPicked.invoke(s);
        });

        // A wash of paper behind the line, brightening on hover. No chip, no
        // border, no shadow — the spec rules all three out.
        const wash = createQuads(cell, "SuggestionWash",
          [{ x: 0, y: 0, w: w, h: h }], this.fade(this.paperColor, 0.75), -0.01);
        btn.onHoverEnter.add(() => {
          wash.mainMaterial.mainPass.baseColor = this.hoverColor;
        });
        btn.onHoverExit.add(() => {
          wash.mainMaterial.mainPass.baseColor = this.fade(this.paperColor, 0.75);
        });

        const t = this.addText(cell, "SuggestionText", 0, 0, "Body", w - 1.0, 0.8, this.inkColor);
        t.text = "";
        cell.createComponent(FlexItem.getTypeName());
        this.suggestionTexts.push(t);
      }));
    }
    this.registerItems(column, items);
  }

  /** "Your notebook": progress, not pressure. No streaks, no timers. */
  private buildNotebookRow(parent: SceneObject, y: number): void {
    this.addText(parent, "NotebookLabel", 0, y + 1.9, "Meta",
      this.sheetWidthCm - 4, 0.7, this.dimInkColor).text = "Your notebook";

    const w = 4.6;
    const h = 2.2;
    const gap = 0.6;
    const rowW = NOTEBOOKS.length * w + (NOTEBOOKS.length - 1) * gap;
    const host = this.obj(parent, "Notebooks", new vec3(0, y, 0));
    const row = this.flexRow(host, rowW, h, gap);

    const items: FlexItem[] = [];
    for (let i = 0; i < NOTEBOOKS.length; i++) {
      const pack = NOTEBOOKS[i];
      items.push(this.flexChild(row, w, h, (cell) => {
        const btn = cell.createComponent(Button.getTypeName()) as Button;
        btn.setVariant({ theme: "SnapOS2", shape: "Rectangle", style: "PrimaryNeutral" });
        btn.size = new vec3(w, h, 1);
        btn.onInitialized.add(() => {
          btn.size = new vec3(w, h, 1);
          // opacity alone leaves the plate's corner marks showing; the border
          // flags have to come off too or they read as a chip outline, which
          // the design spec rules out.
          btn.opacity = 0;
          this.stripPlate(btn);
        });
        btn.onTriggerUp.add(() => this._onNotebookPicked.invoke(pack.id));

        const cover = createWashiSheet(cell, w, h, 0.04, this.fade(this.paperColor, 0.9), -0.01);
        btn.onHoverEnter.add(() => {
          cover.mainMaterial.mainPass.baseColor = this.hoverColor;
        });
        btn.onHoverExit.add(() => {
          cover.mainMaterial.mainPass.baseColor = this.fade(this.paperColor, 0.9);
        });

        this.addText(cell, "NotebookName", 0, 0, "Meta", w - 0.5, 0.7, this.dimInkColor)
          .text = pack.label;
        cell.createComponent(FlexItem.getTypeName());
      }));
    }
    this.registerItems(row, items);
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  private addText(
    parent: SceneObject, name: string, x: number, y: number,
    role: TextRole, widthCm: number, halfHeightCm: number, color: vec4
  ): Text {
    const so = this.obj(parent, name, new vec3(x, y, 0.04));
    const t = so.createComponent("Component.Text") as Text;
    t.text = "";
    t.depthTest = true;
    applyTextRole(t, role);
    t.textFill.color = color;
    t.horizontalAlignment = HorizontalAlignment.Center;
    t.verticalAlignment = VerticalAlignment.Center;
    t.horizontalOverflow = HorizontalOverflow.Overflow;
    t.verticalOverflow = VerticalOverflow.Overflow;
    t.layoutRect = Rect.create(-widthCm / 2, widthCm / 2, -halfHeightCm, halfHeightCm);
    return t;
  }

  /**
   * Turn off a UIKit plate's own face and border, leaving only its collider.
   *
   * Every write is guarded. UIKit exposes some of these as GETTER-ONLY
   * properties, and a `!== undefined` check does NOT tell you that: a
   * read-only property is perfectly defined, and assigning to it throws. One
   * such assignment (borderSize) threw inside Button.initialize, which took
   * rendering down with "Rendering failed 5 times in a row" and a black
   * preview. A cosmetic tweak must never be able to do that, hence the try.
   */
  private stripPlate(btn: Button): void {
    const vis: any = btn.visual;
    if (!vis) return;
    const clear = new vec4(0, 0, 0, 0);
    const set = (key: string, value: any) => {
      try {
        if (vis[key] !== undefined) vis[key] = value;
      } catch (e) {
        // Read-only on this UIKit version. The plate keeps that one trait;
        // the lesson keeps working, which matters more.
      }
    };

    set("defaultHasBorder", false);
    set("hoveredHasBorder", false);
    set("triggeredHasBorder", false);
    // The flags alone still leave the Rectangle variant's corner marks drawn,
    // so the border COLOURS are cleared as well. Those brackets read as a chip
    // outline, which the design spec rules out.
    set("isBorderGradient", false);
    set("borderDefaultColor", clear);
    set("borderHoveredColor", clear);
    set("borderTriggeredColor", clear);
    set("baseType", "Color");
    set("baseDefaultColor", clear);
    set("baseHoveredColor", clear);
    set("baseTriggeredColor", clear);
  }

  private fade(c: vec4, f: number): vec4 {
    return new vec4(c.x * f, c.y * f, c.z * f, c.w);
  }

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

  private flexRow(parent: SceneObject, width: number, height: number, gap: number): SceneObject {
    const container = this.obj(parent, "Flex", new vec3(0, 0, LAYOUT_Z_LIFT));
    const flex = container.createComponent(FlexLayout.getTypeName()) as FlexLayout;
    const item = container.createComponent(FlexItem.getTypeName()) as FlexItem;
    item.overrideWidth = width;
    item.overrideHeight = height;
    flex.onInitialized.add(() => {
      flex.width = width;
      flex.height = height;
      flex.direction = FlexDirection.Row;
      flex.columnGap = gap;
      flex.justifyContent = FlexJustify.Center;
      flex.alignItems = FlexAlign.Center;
    });
    return container;
  }

  private flexChild(parent: SceneObject, w: number, h: number, builder: (c: SceneObject) => void): FlexItem {
    const child = this.obj(parent, "Item", new vec3(0, 0, LAYOUT_Z_LIFT));
    const item = child.createComponent(FlexItem.getTypeName()) as FlexItem;
    item.overrideWidth = w;
    item.overrideHeight = h;
    item.flexGrow = 0;
    item.flexShrink = 0;
    builder(child);
    return item;
  }

  /** FlexLayout refuses addItems before it initialises on OnStartEvent. */
  private registerItems(container: SceneObject, items: FlexItem[]): void {
    const flex = container.getComponent(FlexLayout.getTypeName()) as FlexLayout | null;
    if (!flex) return;
    flex.onInitialized.add(() => flex.addItems(items));
  }
}
