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
import { createDot, createWashiSheet } from "./GhostInkRibbon";

// ── Typography ───────────────────────────────────────────────────────────────
// Sizes are the Snap Specs type scale, calibrated at z = -110 cm. GHOST's sheet
// sits at 45 cm, so every call passes PANEL_DISTANCE_CM and the scale converts.
const FONT_SIZE_SCALE = 1.0;
const PANEL_DISTANCE_CM = 45;

type TextRole = "Title1" | "Headline1" | "Body" | "Caption" | "TabThin";

const TYPE_SCALE: Record<TextRole, { size: number; weight: number }> = {
  Title1: { size: 105, weight: 700 },
  Headline1: { size: 54, weight: 700 },
  Body: { size: 39, weight: 500 },
  Caption: { size: 38, weight: 500 },
  // The brief asks for "thin grey type" on the tabs, but a 300 weight at 38 on
  // an ADDITIVE display is barely there: thin strokes emit too little light to
  // read at 45 cm, and the washi tab behind them is deliberately faint, so
  // there is no dark ground to carry them. Medium weight at a slightly larger
  // size keeps the quiet, un-boxy bookmark look while actually being readable.
  // The tab PAPER is unchanged — only the type got heavier.
  TabThin: { size: 42, weight: 500 },
};

function roleSize(role: TextRole, distanceCm: number = PANEL_DISTANCE_CM): number {
  return TYPE_SCALE[role].size * FONT_SIZE_SCALE * (distanceCm / 110);
}

function applyTextRole(t: Text, role: TextRole, distanceCm: number = PANEL_DISTANCE_CM): void {
  t.size = roleSize(role, distanceCm);
  t.weight = TYPE_SCALE[role].weight;
}

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
    applyTextRole(t, "Caption");
    t.textFill.color = this.typeColor;
    t.horizontalAlignment = HorizontalAlignment.Center;
    t.verticalAlignment = VerticalAlignment.Center;
    t.horizontalOverflow = HorizontalOverflow.Overflow;
    t.verticalOverflow = VerticalOverflow.Overflow;
    t.layoutRect = Rect.create(-0.6, 0.6, -0.5, 0.5);

    this.strokeNumbers.push(so);
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
    this.buildDotRoot();
    this.buildStrokeNumberRoot();
    this.buildTabs();
  }

  private buildCounter(): void {
    const so = this.obj(this.sceneObject, "StrokeCounter",
      new vec3(this.counterOffsetCm.x, this.counterOffsetCm.y, 0.03));
    const t = so.createComponent("Component.Text") as Text;
    t.text = "1 / 1";
    t.depthTest = true;
    applyTextRole(t, "Body");
    t.textFill.color = this.typeColor;
    t.horizontalAlignment = HorizontalAlignment.Center;
    t.verticalAlignment = VerticalAlignment.Center;
    t.horizontalOverflow = HorizontalOverflow.Overflow;
    t.verticalOverflow = VerticalOverflow.Overflow;
    t.layoutRect = Rect.create(-2.0, 2.0, -0.6, 0.6);
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

  /** A text object under (or above) the sheet, centred, hidden until set. */
  private buildText(name: string, y: number, role: TextRole, halfWidth: number): Text {
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
    t.layoutRect = Rect.create(-halfWidth, halfWidth, -1.2, 1.2);
    so.enabled = false;
    return t;
  }

  // Everything below the sheet reads top-down: how it sounds, then what to
  // picture, then how far through the set you are. The single transient line
  // sits ABOVE the sheet so a changing instruction never jostles the fixed
  // block of text underneath it.
  private buildRomaji(): void {
    this.romajiText = this.buildText("SheetRomaji", -8.9, "Title1", 7);
  }

  private buildHook(): void {
    this.hookText = this.buildText("SheetHook", -10.3, "Body", 11);
  }

  private buildLine(): void {
    this.lineText = this.buildText("SheetLine", 9.2, "Body", 9);
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
    t.layoutRect = Rect.create(-widthCm / 2, widthCm / 2, -0.6, 0.6);
    so.createComponent(FlexItem.getTypeName());
  }
}
