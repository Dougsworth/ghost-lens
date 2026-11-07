/**
 * GhostAskUI — Ask GHOST's word picker.
 *
 * Owns:  the panel of pickable words and the Back affordance. Built from UIKit
 *        primitives (BackPlate + GridLayout + Button) so each word is a real
 *        pinch target in Interactive Preview and on SPECS.
 * Must not: know how a word is written. It emits the chosen word and GhostMain
 *        drives the path engine. A passive view.
 *
 * The brief's Ask GHOST passes in this fallback form: speech and the Remote
 * Service Gateway may not run in the preview, so picking "friend" from a fixed
 * list does exactly the same thing as saying it.
 */

import { Button } from "SpectaclesUIKit.lspkg/Scripts/Components/Button/Button";
import { BackPlate } from "SpectaclesUIKit.lspkg/Scripts/BackPlate";
import { GridItem } from "SpectaclesUIKit.lspkg/Scripts/Components/Layout2D/Grid/GridItem";
import { GridLayout } from "SpectaclesUIKit.lspkg/Scripts/Components/Layout2D/Grid/GridLayout";
import { RoundedRectangleVisual } from "SpectaclesUIKit.lspkg/Scripts/Visuals/RoundedRectangle/RoundedRectangleVisual";
import Event, { PublicApi } from "SpectaclesInteractionKit.lspkg/Utils/Event";
import { ASK_WORDS } from "./GhostAskWords";

const FONT_SIZE_SCALE = 1.0;
const PANEL_DISTANCE_CM = 45;

type TextRole = "Headline1" | "Body" | "Caption";
const TYPE_SCALE: Record<TextRole, { size: number; weight: number }> = {
  Headline1: { size: 54, weight: 700 },
  Body: { size: 39, weight: 500 },
  Caption: { size: 38, weight: 500 },
};
function roleSize(role: TextRole, d: number = PANEL_DISTANCE_CM): number {
  return TYPE_SCALE[role].size * FONT_SIZE_SCALE * (d / 110);
}
function applyTextRole(t: Text, role: TextRole, d: number = PANEL_DISTANCE_CM): void {
  t.size = roleSize(role, d);
  t.weight = TYPE_SCALE[role].weight;
}

const CONTENT_Z = 0.6;
const LABEL_Z = 0.08;

@component
export class GhostAskUI extends BaseScriptComponent {
  @ui.label('<span style="color: #60A5FA;">GhostAskUI &ndash; pick a word for GHOST to write</span>')
  @ui.separator

  @ui.label('<span style="color: #60A5FA;">Settings</span>')
  @ui.group_start("Settings")
  @input("vec4", "{0.22,0.20,0.15,1}")
  @hint("Word tile colour. Additive display: a faint warm cream, never dark.")
  @widget(new ColorWidget())
  tileColor: vec4;

  @input("vec4", "{0.52,0.47,0.36,1}")
  @hint("Tile colour when the user aims at it.")
  @widget(new ColorWidget())
  tileHighlightColor: vec4;

  @input("vec4", "{0.80,0.76,0.68,1}")
  @hint("Colour of the title and the word labels.")
  @widget(new ColorWidget())
  typeColor: vec4;

  @input
  @hint("Width of the whole picker panel, in cm. Must stay inside the visible frame, about 20.3 cm wide at 45 cm.")
  @widget(new SliderWidget(8, 20, 0.5))
  panelWidthCm: number = 17.0;

  @input
  @hint("Height of each word tile, in cm. Keep it a forgiving pinch target.")
  @widget(new SliderWidget(1.5, 4, 0.1))
  tileHeightCm: number = 2.1;
  @ui.group_end

  private readonly _onWordPicked = new Event<string>();
  private readonly _onBack = new Event<void>();

  /** Fires with the English prompt of the chosen word. */
  get onWordPicked(): PublicApi<string> {
    return this._onWordPicked.publicApi();
  }
  get onBack(): PublicApi<void> {
    return this._onBack.publicApi();
  }

  onAwake(): void {
    this.sceneObject.createComponent("Component.Canvas");
    this.build();
  }

  private build(): void {
    const w = this.panelWidthCm;
    const cols = 2;
    const rows = Math.ceil(ASK_WORDS.length / cols);
    const gap = 0.5;
    const tileW = (w - gap * (cols - 1) - 1.6) / cols;
    const h = rows * this.tileHeightCm + (rows - 1) * gap + 5.0;

    const plate = this.sceneObject.createComponent(BackPlate.getTypeName()) as BackPlate;
    plate.size = new vec2(w, h);

    const content = this.obj(this.sceneObject, "Content", new vec3(0, 0, CONTENT_Z));

    // Title
    const titleSO = this.obj(content, "AskTitle", new vec3(0, h * 0.5 - 1.5, 0));
    const tt = titleSO.createComponent("Component.Text") as Text;
    tt.text = "Ask GHOST";
    tt.depthTest = true;
    applyTextRole(tt, "Body");
    tt.textFill.color = this.typeColor;
    tt.horizontalAlignment = HorizontalAlignment.Center;
    tt.verticalAlignment = VerticalAlignment.Center;
    tt.horizontalOverflow = HorizontalOverflow.Overflow;
    tt.verticalOverflow = VerticalOverflow.Overflow;
    tt.layoutRect = Rect.create(-w / 2, w / 2, -0.8, 0.8);

    // Word grid
    const gridHost = this.obj(content, "WordGrid", new vec3(0, -0.8, 0.02));
    const grid = gridHost.createComponent(GridLayout.getTypeName()) as GridLayout;
    const items: GridItem[] = [];

    for (let i = 0; i < ASK_WORDS.length; i++) {
      const word = ASK_WORDS[i];
      const cell = this.obj(gridHost, "Word_" + word.english);
      const item = cell.createComponent(GridItem.getTypeName()) as GridItem;
      item.overrideWidth = tileW;
      item.overrideHeight = this.tileHeightCm;
      items.push(item);

      const btn = cell.createComponent(Button.getTypeName()) as Button;
      btn.setVariant({ theme: "SnapOS2", shape: "Rectangle", style: "PrimaryNeutral" });
      btn.size = new vec3(tileW, this.tileHeightCm, 1);
      btn.onInitialized.add(() => {
        btn.size = new vec3(tileW, this.tileHeightCm, 1);
        this.applyTileLook(btn);
      });
      btn.onTriggerUp.add(() => this._onWordPicked.invoke(word.english));

      // Kana on the left, English on the right, so the tile teaches as it picks.
      this.label(cell, word.kana + "   " + word.english, tileW - 0.4);
    }

    const gridW = tileW * cols + gap * (cols - 1);
    const gridH = this.tileHeightCm * rows + gap * (rows - 1);
    grid.onInitialized.add(() => {
      grid.width = gridW;
      grid.height = gridH;
      grid.templateColumns = "1fr 1fr";
      grid.autoRows = "auto";
      grid.gap = gap;
      grid.addItems(items);
    });

    // Back
    const backSO = this.obj(content, "AskBack", new vec3(0, -h * 0.5 + 1.4, 0.02));
    const back = backSO.createComponent(Button.getTypeName()) as Button;
    back.setVariant({ theme: "SnapOS2", shape: "Rectangle", style: "PrimaryNeutral" });
    back.size = new vec3(6, 2.0, 1);
    back.onInitialized.add(() => {
      back.size = new vec3(6, 2.0, 1);
      this.applyTileLook(back);
    });
    back.onTriggerUp.add(() => this._onBack.invoke());
    this.label(backSO, "Back", 5.5);
  }

  private label(parent: SceneObject, text: string, widthCm: number): void {
    const so = this.obj(parent, "Label", new vec3(0, 0, LABEL_Z));
    const t = so.createComponent("Component.Text") as Text;
    t.text = text;
    t.depthTest = true;
    applyTextRole(t, "Caption");
    t.textFill.color = this.typeColor;
    t.horizontalAlignment = HorizontalAlignment.Center;
    t.verticalAlignment = VerticalAlignment.Center;
    t.horizontalOverflow = HorizontalOverflow.Overflow;
    t.verticalOverflow = VerticalOverflow.Overflow;
    t.layoutRect = Rect.create(-widthCm / 2, widthCm / 2, -0.6, 0.6);
  }

  private applyTileLook(btn: Button): void {
    const vis = btn.visual as RoundedRectangleVisual;
    if (!vis || vis.baseType === undefined) return;
    vis.baseType = "Color";
    vis.baseDefaultColor = this.tileColor;
    vis.baseHoveredColor = this.tileHighlightColor;
    vis.baseTriggeredColor = this.tileHighlightColor;
    vis.isBorderGradient = false;
    vis.borderDefaultColor = this.fade(this.typeColor, 0.3);
    vis.borderHoveredColor = this.fade(this.typeColor, 0.8);
    vis.borderTriggeredColor = this.fade(this.typeColor, 0.8);
    vis.cornerRadius = 0.25;
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
}
