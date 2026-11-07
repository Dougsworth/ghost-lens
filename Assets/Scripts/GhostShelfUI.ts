/**
 * GhostShelfUI — the notebook shelf the lens opens on.
 *
 * Owns:  five notebook covers lying side by side where the practice sheet will
 *        later appear. Japanese (cover shows あ), ASL (a hand line drawing) and
 *        Guitar Chords (cover shows Em) read as open and available; Chinese and
 *        Knots are wrapped in a "Coming soon" paper band and dimmed.
 *        Built from UIKit Buttons inside a FlexLayout row, so a cover is a real
 *        pinch target in Interactive Preview and on SPECS.
 * Must not: know what opening a pack does. It emits the pack id and GhostMain
 *        decides. A passive view.
 *
 * Width budget: five 4.2 cm covers with 0.9 cm gaps is 24.6 cm, inside the
 * centre 25 cm of view at 45 cm, so the head never has to move.
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
import { SHELF_PACKS } from "./GhostAssetManifest";

const ASL_COVER_ICON = requireAsset("../Icons/sign_language.png") as Texture;
const IMAGE_MATERIAL = requireAsset("../Materials/ImageMaterial.mat") as Material;

const FONT_SIZE_SCALE = 1.0;
const PANEL_DISTANCE_CM = 45;

type TextRole = "Title1" | "Headline1" | "Body" | "Caption";

const TYPE_SCALE: Record<TextRole, { size: number; weight: number }> = {
  Title1: { size: 105, weight: 700 },
  Headline1: { size: 54, weight: 700 },
  Body: { size: 39, weight: 500 },
  Caption: { size: 38, weight: 500 },
};

function roleSize(role: TextRole, distanceCm: number = PANEL_DISTANCE_CM): number {
  return TYPE_SCALE[role].size * FONT_SIZE_SCALE * (distanceCm / 110);
}

function applyTextRole(t: Text, role: TextRole, distanceCm: number = PANEL_DISTANCE_CM): void {
  t.size = roleSize(role, distanceCm);
  t.weight = TYPE_SCALE[role].weight;
}

const LAYOUT_Z_LIFT = 0.02;
const COVER_CONTENT_Z = 0.08;

@component
export class GhostShelfUI extends BaseScriptComponent {
  @ui.label('<span style="color: #60A5FA;">GhostShelfUI &ndash; the five-notebook pack shelf</span>')
  @ui.separator

  @ui.label('<span style="color: #60A5FA;">Settings</span>')
  @ui.group_start("Settings")
  @input("vec4", "{0.24,0.21,0.16,1}")
  @hint("Notebook cover colour for an available pack. Additive display: a faint warm cream, never dark.")
  @widget(new ColorWidget())
  coverColor: vec4;

  @input("vec4", "{0.54,0.49,0.38,1}")
  @hint("Cover colour when the user aims at an available notebook.")
  @widget(new ColorWidget())
  coverHighlightColor: vec4;

  @input("vec4", "{0.80,0.76,0.68,1}")
  @hint("Colour of cover art and titles. The brief's thin grey type as dimmed warm white, legible from 45 cm.")
  @widget(new ColorWidget())
  typeColor: vec4;

  @input
  @hint("How much the three locked notebooks are faded, 0 = invisible, 1 = same as an open pack.")
  @widget(new SliderWidget(0.1, 1, 0.05))
  lockedFade: number = 0.45;

  @input
  @hint("Width of each notebook cover, in cm. Five covers plus gaps must stay inside the visible frame, measured at about 20.3 cm wide at 45 cm.")
  @widget(new SliderWidget(2.5, 6, 0.1))
  coverWidthCm: number = 3.2;

  @input
  @hint("Height of each notebook cover, in cm.")
  @widget(new SliderWidget(3, 10, 0.1))
  coverHeightCm: number = 6.0;

  @input
  @hint("Gap between notebooks on the shelf, in cm.")
  @widget(new SliderWidget(0.2, 3, 0.1))
  coverGapCm: number = 0.65;
  @ui.group_end

  private buttons: Button[] = [];
  private readonly _onPackSelected = new Event<string>();

  /** Fires with the pack id ("japanese", "asl", ...) when a notebook is pinched. */
  get onPackSelected(): PublicApi<string> {
    return this._onPackSelected.publicApi();
  }

  onAwake(): void {
    this.sceneObject.createComponent("Component.Canvas");
    this.buildShelf();
  }

  private buildShelf(): void {
    const w = this.coverWidthCm;
    const h = this.coverHeightCm;
    const gap = this.coverGapCm;
    const total = SHELF_PACKS.length * w + (SHELF_PACKS.length - 1) * gap;

    const row = this.flexRow(this.sceneObject, total, h, gap);

    const items: FlexItem[] = [];
    for (let i = 0; i < SHELF_PACKS.length; i++) {
      const pack = SHELF_PACKS[i];
      items.push(this.flexChild(row, w, h, (cell) => {
        const btn = cell.createComponent(Button.getTypeName()) as Button;
        btn.setVariant({ theme: "SnapOS2", shape: "Rectangle", style: "PrimaryNeutral" });
        btn.size = new vec3(w, h, 1);
        btn.onInitialized.add(() => {
          btn.size = new vec3(w, h, 1);
          this.applyCoverLook(btn, pack.open);
        });
        if (pack.open) {
          btn.onTriggerUp.add(() => this._onPackSelected.invoke(pack.id));
        }
        this.buttons.push(btn);
        this.buildCoverFace(cell, pack.id, pack.title, pack.cover, pack.open, w, h);
      }));
    }
    this.registerItems(row, items);
  }

  /** Cover art on top, pack title below, plus a "Coming soon" band when locked. */
  private buildCoverFace(
    cell: SceneObject,
    id: string,
    title: string,
    cover: string,
    open: boolean,
    w: number,
    h: number
  ): void {
    const face = this.obj(cell, "CoverFace", new vec3(0, 0, COVER_CONTENT_Z));
    const dim = open ? 1 : this.lockedFade;

    // Cover art: ASL shows a hand line drawing; every other pack draws its own
    // glyph in large type — あ for the kana pack, Em for the guitar pack. Driven
    // by the manifest's `cover` string rather than a per-pack branch, so adding
    // a pack is a data change here too.
    if (cover === "hand") {
      const artSO = this.obj(face, "CoverIcon", new vec3(0, h * 0.12, 0));
      const img = artSO.createComponent("Component.Image") as Image;
      const mat = IMAGE_MATERIAL.clone() as Material;
      mat.mainPass.baseTex = ASL_COVER_ICON;
      mat.mainPass.baseColor = this.fade(this.typeColor, dim);
      mat.mainPass.depthTest = true;
      mat.mainPass.depthWrite = false;
      img.clearMaterials();
      img.addMaterial(mat);
      artSO.getTransform().setLocalScale(new vec3(2.2, 2.2, 1));
    } else if (cover !== "") {
      const artSO = this.obj(face, "CoverGlyph", new vec3(0, h * 0.12, 0));
      const t = artSO.createComponent("Component.Text") as Text;
      t.text = cover;
      t.depthTest = true;
      applyTextRole(t, "Title1");
      t.textFill.color = this.fade(this.typeColor, dim);
      t.horizontalAlignment = HorizontalAlignment.Center;
      t.verticalAlignment = VerticalAlignment.Center;
      t.horizontalOverflow = HorizontalOverflow.Overflow;
      t.verticalOverflow = VerticalOverflow.Overflow;
      t.layoutRect = Rect.create(-w / 2, w / 2, -1.4, 1.4);
    }

    // Pack title along the bottom of the cover.
    const titleSO = this.obj(face, "CoverTitle", new vec3(0, -h * 0.32, 0));
    const tt = titleSO.createComponent("Component.Text") as Text;
    tt.text = title;
    tt.depthTest = true;
    applyTextRole(tt, "Caption");
    tt.textFill.color = this.fade(this.typeColor, dim);
    tt.horizontalAlignment = HorizontalAlignment.Center;
    tt.verticalAlignment = VerticalAlignment.Center;
    tt.horizontalOverflow = HorizontalOverflow.Wrap;
    tt.verticalOverflow = VerticalOverflow.Overflow;
    tt.layoutRect = Rect.create(-(w - 0.4) / 2, (w - 0.4) / 2, -0.9, 0.9);

    if (!open) {
      // The paper band wrapped around a not-yet-available notebook.
      const bandSO = this.obj(face, "ComingSoonBand", new vec3(0, 0, 0.01));
      const bt = bandSO.createComponent("Component.Text") as Text;
      bt.text = "Coming soon";
      bt.depthTest = true;
      applyTextRole(bt, "Caption");
      bt.textFill.color = this.fade(this.typeColor, this.lockedFade * 1.3);
      bt.horizontalAlignment = HorizontalAlignment.Center;
      bt.verticalAlignment = VerticalAlignment.Center;
      bt.horizontalOverflow = HorizontalOverflow.Wrap;
      bt.verticalOverflow = VerticalOverflow.Overflow;
      bt.layoutRect = Rect.create(-(w - 0.3) / 2, (w - 0.3) / 2, -1.2, 1.2);
    }
  }

  private applyCoverLook(btn: Button, open: boolean): void {
    const vis = btn.visual as RoundedRectangleVisual;
    if (!vis || vis.baseType === undefined) return;
    const dim = open ? 1 : this.lockedFade;
    vis.baseType = "Color";
    vis.baseDefaultColor = this.fade(this.coverColor, dim);
    vis.baseHoveredColor = open ? this.coverHighlightColor : this.fade(this.coverColor, dim);
    vis.baseTriggeredColor = open ? this.coverHighlightColor : this.fade(this.coverColor, dim);
    vis.isBorderGradient = false;
    vis.borderDefaultColor = this.fade(this.typeColor, 0.3 * dim);
    vis.borderHoveredColor = this.fade(this.typeColor, (open ? 0.85 : 0.3) * dim);
    vis.borderTriggeredColor = this.fade(this.typeColor, (open ? 0.85 : 0.3) * dim);
    vis.cornerRadius = 0.3;
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
}
