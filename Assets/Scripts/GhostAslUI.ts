/**
 * GhostAslUI — the ASL lesson's furniture: the sign name, a one-line hint, and
 * the bookmark tabs beside the hands.
 *
 * Owns:  every visible string in the ASL pack and its three pinch targets.
 *        "Got it" appears only once the ghost has finished signing, which is
 *        the brief's tier-3 self-check.
 * Must not: hold lesson state. GhostMain pushes text in and listens for pinches.
 *
 * Styled to match the kana pack's bookmark tabs: the same washi colour, thin
 * type, no boxes — one visual language across both packs.
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

type TextRole = "Headline1" | "Body" | "TabThin";
const TYPE_SCALE: Record<TextRole, { size: number; weight: number }> = {
  Headline1: { size: 54, weight: 700 },
  Body: { size: 39, weight: 500 },
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

const TAB_LABELS = ["Replay", "Got it", "Packs"];

@component
export class GhostAslUI extends BaseScriptComponent {
  @ui.label('<span style="color: #60A5FA;">GhostAslUI &ndash; sign name, hint and the Got it tab</span>')
  @ui.separator

  @ui.label('<span style="color: #60A5FA;">Settings</span>')
  @ui.group_start("Settings")
  @input("vec4", "{0.26,0.23,0.17,1}")
  @hint("Tab paper colour — the same washi as the kana pack's bookmarks.")
  @widget(new ColorWidget())
  tabPaperColor: vec4;

  @input("vec4", "{0.46,0.41,0.31,1}")
  @hint("Tab colour when the user aims at it.")
  @widget(new ColorWidget())
  tabHighlightColor: vec4;

  @input("vec4", "{0.80,0.76,0.68,1}")
  @hint("Colour of the sign name, the hint line and the tab labels.")
  @widget(new ColorWidget())
  typeColor: vec4;

  @input
  @hint("How far right of centre the tab stack sits, in cm.")
  @widget(new SliderWidget(4, 14, 0.1))
  tabOffsetXCm: number = 8.4;

  @input
  @hint("Height of the sign name above centre, in cm.")
  @widget(new SliderWidget(0, 14, 0.5))
  labelHeightCm: number = 8.0;
  @ui.group_end

  private nameText: Text | null = null;
  private hintText: Text | null = null;
  private gotItTab: SceneObject | null = null;

  private readonly _onGotIt = new Event<void>();
  private readonly _onReplay = new Event<void>();
  private readonly _onPacks = new Event<void>();

  get onGotIt(): PublicApi<void> {
    return this._onGotIt.publicApi();
  }
  get onReplay(): PublicApi<void> {
    return this._onReplay.publicApi();
  }
  get onPacks(): PublicApi<void> {
    return this._onPacks.publicApi();
  }

  /** Name and movement hint for the sign being demonstrated. */
  setSign(label: string, hint: string): void {
    if (this.nameText) this.nameText.text = label;
    if (this.hintText) this.hintText.text = hint;
  }

  /** The brief: Got it appears only AFTER the ghost has signed. */
  setGotItVisible(on: boolean): void {
    if (this.gotItTab) this.gotItTab.enabled = on;
  }

  onAwake(): void {
    this.sceneObject.createComponent("Component.Canvas");
    this.nameText = this.addLine("SignName", this.labelHeightCm, "Headline1", 16);
    this.hintText = this.addLine("SignHint", this.labelHeightCm - 2.2, "Body", 18);
    this.buildTabs();
    this.setGotItVisible(false);
  }

  private addLine(name: string, y: number, role: TextRole, widthCm: number): Text {
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
    t.layoutRect = Rect.create(-widthCm / 2, widthCm / 2, -0.9, 0.9);
    return t;
  }

  private buildTabs(): void {
    const w = 3.4;
    const h = 3.2;
    const gap = 0.6;
    const stackH = TAB_LABELS.length * h + (TAB_LABELS.length - 1) * gap;
    const host = this.obj(this.sceneObject, "AslTabs", new vec3(this.tabOffsetXCm, 0, 0));
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
          if (label === "Got it") this.gotItTab = cell;
        })
      );
    }
    this.registerItems(column, items);
  }

  private fire(label: string): void {
    if (label === "Replay") this._onReplay.invoke();
    else if (label === "Got it") this._onGotIt.invoke();
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
