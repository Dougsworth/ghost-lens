/**
 * GhostGuitarUI — the guitar lesson's furniture: the chord name above the
 * board, how far through the set you are, the one explanation line, and the
 * bookmark tabs beside it.
 *
 * Owns:  every visible string in the guitar pack and its three pinch targets.
 * Must not: hold lesson state. GhostMain pushes text in and listens for
 *        pinches, the same one-way flow the kana and ASL packs use.
 *
 * Styled to match the other two packs: the same washi tab colour, the same thin
 * type, no boxes — one visual language across the whole lens. The surfaces here
 * are UIKit (Button inside a FlexLayout), exactly as GhostAslUI and GhostShelfUI
 * build theirs; only the fretboard itself is code-authored geometry, because it
 * is an instrument drawn in ink, not a panel.
 *
 * ── Why the text sits where it does ─────────────────────────────────────────
 * At 45 cm the view is about 21.5 cm wide by 29.8 cm tall. The board is pitched
 * back and runs up the tall axis, filling roughly the middle three quarters of
 * the height, so the only clear room is a band above it and a band below. The
 * chord name takes the top band (it is the thing you read first), the
 * explanation takes the bottom band, and the tabs take the right margin, which
 * the 9.6 cm-wide board leaves completely free.
 *
 * Unlike the board, this type is NOT pitched back: a chord name foreshortened
 * by 52 degrees is a chord name you have to work to read.
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

type TextRole = "Title1" | "Headline1" | "Body" | "Caption" | "TabThin";
const TYPE_SCALE: Record<TextRole, { size: number; weight: number }> = {
  Title1: { size: 105, weight: 700 },
  Headline1: { size: 54, weight: 700 },
  Body: { size: 39, weight: 500 },
  Caption: { size: 38, weight: 500 },
  TabThin: { size: 38, weight: 300 },
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
  @ui.label('<span style="color: #60A5FA;">GhostGuitarUI &ndash; chord name, the one line, and the tabs</span>')
  @ui.separator

  @ui.label('<span style="color: #60A5FA;">Settings</span>')
  @ui.group_start("Settings")
  @input("vec4", "{0.26,0.23,0.17,1}")
  @hint("Tab paper colour — the same washi as the kana and ASL packs' bookmarks.")
  @widget(new ColorWidget())
  tabPaperColor: vec4;

  @input("vec4", "{0.46,0.41,0.31,1}")
  @hint("Tab colour when the user aims at it.")
  @widget(new ColorWidget())
  tabHighlightColor: vec4;

  @input("vec4", "{0.80,0.76,0.68,1}")
  @hint("Colour of the chord name, the line and the tab labels.")
  @widget(new ColorWidget())
  typeColor: vec4;

  @input
  @hint("Height of the chord name above centre, in cm. The board's far end reaches about 11 cm, so this clears it.")
  @widget(new SliderWidget(8, 14, 0.1))
  nameHeightCm: number = 12.6;

  @input
  @hint("Height of the explanation line, in cm. Negative: it sits below the board's near end.")
  @widget(new SliderWidget(-14.2, -8, 0.1))
  lineHeightCm: number = -13.1;

  @input
  @hint("How far right of centre the tab stack sits, in cm. The board is only 9.6 cm wide, so the right margin is free.")
  @widget(new SliderWidget(4, 9.2, 0.1))
  tabOffsetXCm: number = 7.6;
  @ui.group_end

  private nameText: Text | null = null;
  private progressText: Text | null = null;
  private lineText: Text | null = null;

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

  /** The single calm line: what the hand does, or what to do next. */
  setLine(text: string): void {
    if (this.lineText) this.lineText.text = text;
  }

  onAwake(): void {
    this.sceneObject.createComponent("Component.Canvas");
    this.nameText = this.addLine("ChordName", this.nameHeightCm, "Title1", 11, 1.5);
    this.progressText = this.addLine("ChordProgress", this.nameHeightCm - 1.6, "Caption", 4.4, 0.7);
    this.progressText.horizontalAlignment = HorizontalAlignment.Left;
    this.progressText.getSceneObject().getTransform()
      .setLocalPosition(new vec3(-7.9, this.nameHeightCm - 0.4, 0.03));
    this.lineText = this.addLine("ChordLine", this.lineHeightCm, "Body", 18, 1.9);
    if (this.lineText) this.lineText.horizontalOverflow = HorizontalOverflow.Wrap;
    this.buildTabs();
  }

  private addLine(
    name: string,
    y: number,
    role: TextRole,
    widthCm: number,
    halfHeightCm: number
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
    t.layoutRect = Rect.create(-widthCm / 2, widthCm / 2, -halfHeightCm, halfHeightCm);
    return t;
  }

  private buildTabs(): void {
    const w = 3.4;
    const h = 3.2;
    const gap = 0.6;
    const stackH = TAB_LABELS.length * h + (TAB_LABELS.length - 1) * gap;
    const host = this.obj(this.sceneObject, "GuitarTabs", new vec3(this.tabOffsetXCm, 0, 0));
    const column = this.flexColumn(host, w, stackH, gap);

    const items: FlexItem[] = [];
    for (let i = 0; i < TAB_LABELS.length; i++) {
      const label = TAB_LABELS[i];
      items.push(
        this.flexChild(column, w, h, (cell) => {
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
    this.registerItems(column, items);
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
