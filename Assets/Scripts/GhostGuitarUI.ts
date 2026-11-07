/**
 * GhostGuitarUI — the guitar lesson's furniture: the one instruction, the
 * chord name, how far through the set you are, the × / ○ legend, and the tabs.
 *
 * Owns:  every visible string in the guitar pack and its three pinch targets.
 * Must not: hold lesson state, or compose the instruction's words. GhostMain
 *        pushes finished text in and listens for pinches.
 *
 * ── One instruction at a time ───────────────────────────────────────────────
 * The top line carries exactly one step — "Now finger 3 on the D string, fret
 * 2" — and is replaced, never appended to. The brief's rule is "show one thing
 * at a time", and a beginner reading a list of four finger placements has to
 * work out which one they are on before they can do anything. There is
 * deliberately no second line and no step list anywhere in this module.
 *
 * ── Legibility on an additive display ───────────────────────────────────────
 * Thin dim type does not survive on glass. The kana pack learned this: its tab
 * labels were unreadable at weight 300 / size 38 and were fixed at weight 500 /
 * size 42 with a near-white emitted colour. Every role here starts from that
 * finding, which is why nothing in this file is lighter than weight 500 and the
 * default type colour is 0.96 rather than the 0.80 the other packs still use.
 *
 * ── Why the layout stacks ───────────────────────────────────────────────────
 * The measured SPECS frame at 45 cm is about 21.5 cm wide by 29.8 cm tall, and
 * the kana pack measured content past about ±11 cm vertically falling outside
 * it. The neck is horizontal, so it spends the scarce width; everything else
 * therefore stacks into the plentiful height — instruction, name, neck, fret
 * numbers, legend, tabs — rather than competing for the sides.
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

const FONT_SIZE_SCALE = 1.0;
const PANEL_DISTANCE_CM = 45;

type TextRole = "ChordName" | "Step" | "Body" | "Small" | "Tab";
/**
 * Every weight is 500 or above. See the header: the kana pack proved weight 300
 * type is not readable on this display, and nothing here repeats that.
 */
const TYPE_SCALE: Record<TextRole, { size: number; weight: number }> = {
  ChordName: { size: 88, weight: 700 },
  Step: { size: 50, weight: 500 },
  Body: { size: 44, weight: 500 },
  Small: { size: 42, weight: 500 },
  Tab: { size: 44, weight: 500 },
};
function roleSize(role: TextRole, d: number = PANEL_DISTANCE_CM): number {
  return TYPE_SCALE[role].size * FONT_SIZE_SCALE * (d / 110);
}
function applyTextRole(t: Text, role: TextRole, d: number = PANEL_DISTANCE_CM): void {
  t.size = roleSize(role, d);
  t.weight = TYPE_SCALE[role].weight;
}

const LAYOUT_Z_LIFT = 0.02;
const LABEL_Z = 0.08;

const TAB_LABELS = ["Replay", "Next", "Packs"];

@component
export class GhostGuitarUI extends BaseScriptComponent {
  @ui.label('<span style="color: #60A5FA;">GhostGuitarUI &ndash; one instruction, the chord name, and the tabs</span>')
  @ui.separator

  @ui.label('<span style="color: #60A5FA;">Settings</span>')
  @ui.group_start("Settings")
  @input("vec4", "{0.30,0.27,0.20,1}")
  @hint("Tab paper colour — the washi the other packs' bookmarks use, lifted slightly so a tab reads as a surface on glass.")
  @widget(new ColorWidget())
  tabPaperColor: vec4;

  @input("vec4", "{0.52,0.47,0.36,1}")
  @hint("Tab colour when the user aims at it.")
  @widget(new ColorWidget())
  tabHighlightColor: vec4;

  @input("vec4", "{0.96,0.93,0.86,1}")
  @hint("Colour of the instruction, the chord name and the tab labels. Near-white on purpose: the kana pack found dimmer type unreadable on an additive display.")
  @widget(new ColorWidget())
  typeColor: vec4;

  @input("vec4", "{0.62,0.58,0.50,1}")
  @hint("Colour of the quieter type — the counter and the legend — which should read without competing with the instruction.")
  @widget(new ColorWidget())
  dimTypeColor: vec4;

  @input
  @hint("Height of the single instruction line above centre, in cm. Content past about 11 cm falls outside the SPECS frame at 45 cm (measured by the kana pack, not assumed).")
  @widget(new SliderWidget(6, 10.2, 0.1))
  stepHeightCm: number = 9.3;

  @input
  @hint("Height of the chord name, in cm. It sits between the instruction and the top of the neck.")
  @widget(new SliderWidget(4, 9, 0.1))
  nameHeightCm: number = 6.2;

  @input
  @hint("Height of the o / x legend, in cm. Negative: below the neck and its fret numbers.")
  @widget(new SliderWidget(-9, -4, 0.1))
  legendHeightCm: number = -6.6;

  @input
  @hint("Height of the tab row, in cm. The tabs run across the bottom rather than down the right, because a horizontal neck already spends the width.")
  @widget(new SliderWidget(-10.6, -7, 0.1))
  tabHeightCm: number = -9.4;
  @ui.group_end

  private stepText: Text | null = null;
  private nameText: Text | null = null;
  private progressText: Text | null = null;
  private legendText: Text | null = null;

  private readonly _onReplay = new Event<void>();
  private readonly _onNext = new Event<void>();
  private readonly _onPacks = new Event<void>();

  get onReplay(): PublicApi<void> {
    return this._onReplay.publicApi();
  }
  get onNext(): PublicApi<void> {
    return this._onNext.publicApi();
  }
  get onPacks(): PublicApi<void> {
    return this._onPacks.publicApi();
  }

  /**
   * The ONE instruction currently in front of the user. Replaces whatever was
   * there; there is no second line to append to on purpose.
   */
  setStep(text: string): void {
    if (this.stepText) this.stepText.text = text;
  }

  /** The chord being learnt, e.g. "Em". */
  setChordName(name: string): void {
    if (this.nameText) this.nameText.text = name;
  }

  /** How far through the set, e.g. 2 of 5. */
  setProgress(index: number, total: number): void {
    if (this.progressText) {
      this.progressText.text = total > 0 ? String(index + 1) + " / " + String(total) : "";
    }
  }

  /** The × / ○ key. Constant while a chord is up; blanked between packs. */
  setLegend(text: string): void {
    if (this.legendText) this.legendText.text = text;
  }

  onAwake(): void {
    this.sceneObject.createComponent("Component.Canvas");

    this.stepText = this.addLine("ChordStep", 0, this.stepHeightCm, "Step", 19, 1.4, this.typeColor);
    this.stepText.horizontalOverflow = HorizontalOverflow.Wrap;

    this.nameText = this.addLine("ChordName", 0, this.nameHeightCm, "ChordName", 12, 1.3, this.typeColor);

    this.progressText = this.addLine(
      "ChordProgress", -7.5, this.nameHeightCm, "Small", 4.4, 0.8, this.dimTypeColor);
    this.progressText.horizontalAlignment = HorizontalAlignment.Left;

    this.legendText = this.addLine(
      "ChordLegend", 0, this.legendHeightCm, "Small", 19, 0.9, this.dimTypeColor);

    this.buildTabs();
  }

  private addLine(
    name: string,
    x: number,
    y: number,
    role: TextRole,
    widthCm: number,
    halfHeightCm: number,
    color: vec4
  ): Text {
    const so = this.obj(this.sceneObject, name, new vec3(x, y, 0.03));
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
   * The tabs run ACROSS the bottom. The other packs stack theirs down the right
   * edge, but a horizontal neck plus a chord box already uses that side, and
   * the frame is portrait — the room left over is at the bottom.
   */
  private buildTabs(): void {
    const w = 4.6;
    const h = 2.8;
    const gap = 0.7;
    const rowW = TAB_LABELS.length * w + (TAB_LABELS.length - 1) * gap;
    const host = this.obj(this.sceneObject, "GuitarTabs", new vec3(0, this.tabHeightCm, 0));
    const row = this.flexRow(host, rowW, h, gap);

    const items: FlexItem[] = [];
    for (let i = 0; i < TAB_LABELS.length; i++) {
      const label = TAB_LABELS[i];
      items.push(
        this.flexChild(row, w, h, (cell) => {
          const btn = cell.createComponent(Button.getTypeName()) as Button;
          btn.setVariant({ theme: "SnapOS2", shape: "Rectangle", style: "PrimaryNeutral" });
          btn.size = new vec3(w, h, 1);
          btn.onInitialized.add(() => {
            btn.size = new vec3(w, h, 1);
            this.applyPaperLook(btn);
          });
          btn.onTriggerUp.add(() => this.fire(label));
          this.addButtonLabel(cell, label, w - 0.5);
        })
      );
    }
    this.registerItems(row, items);
  }

  private fire(label: string): void {
    if (label === "Replay") this._onReplay.invoke();
    else if (label === "Next") this._onNext.invoke();
    else if (label === "Packs") this._onPacks.invoke();
  }

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

  // ── Layout composition helpers ────────────────────────────────────────────

  private obj(parent: SceneObject, name: string, position?: vec3): SceneObject {
    const so = global.scene.createSceneObject(name);
    so.setParent(parent);
    if (position) so.getTransform().setLocalPosition(position);
    return so;
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

  private addButtonLabel(parent: SceneObject, text: string, widthCm: number): void {
    const so = this.obj(parent, "ButtonLabel", new vec3(0, 0, LABEL_Z));
    const t = so.createComponent("Component.Text") as Text;
    t.text = text;
    t.depthTest = true;
    applyTextRole(t, "Tab");
    t.textFill.color = this.typeColor;
    t.horizontalAlignment = HorizontalAlignment.Center;
    t.verticalAlignment = VerticalAlignment.Center;
    t.horizontalOverflow = HorizontalOverflow.Overflow;
    t.verticalOverflow = VerticalOverflow.Overflow;
    t.layoutRect = Rect.create(-widthCm / 2, widthCm / 2, -0.7, 0.7);
    so.createComponent(FlexItem.getTypeName());
  }
}
