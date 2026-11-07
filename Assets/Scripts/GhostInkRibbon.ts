/**
 * GhostInkRibbon — code-authored MeshBuilder geometry for GHOST.
 *
 * Owns:  every piece of generated geometry in the lens — the ink ribbon that
 *        grows along a stroke, the washi sheet with its uneven edge, the faint
 *        practice grid, and the brush tip. All of it is parametric or animated,
 *        which is why it is authored here in TypeScript rather than imported as
 *        a static GLB: the ribbon's vertex count changes every frame as the
 *        brush advances.
 * Also owns: the additive material helper. The Specs display is ADDITIVE —
 *        black is transparent and never visible — so every surface here is an
 *        unlit, additively-blended, depth-write-off sheet whose colour is a
 *        warm light value. Nothing in this file may be dark.
 * Must not: sequence the demo, read input, or know about the lesson.
 *
 * Winding: every triangle below is CCW viewed from +Z (the camera side, since
 * the camera looks down -Z and the sheet sits at z = -45).
 */

import { Pt, StrokePath } from "./GhostKanaPath";

/** Unlit additive source material, cloned per surface. Created by the scene bootstrap. */
const ADDITIVE_SOURCE = requireAsset("../Materials/GhostAdditive.mat") as Material;

/** The end-edge frame a round cap is built from. */
interface CapInfo {
  nx: number;
  ny: number;
  tx: number;
  ty: number;
  h: number;
  u: number;
}

/** Triangles per semicircular end cap. Eight is already smooth at brush width. */
const CAP_SEGMENTS = 8;

const LAYOUT = [
  { name: "position", components: 3 },
  { name: "normal", components: 3, normalized: true },
  { name: "texture0", components: 2 },
];

/**
 * Clone the shared unlit material and force it additive.
 *
 * The blend/depth flags are set here at runtime as well as on the asset, so the
 * surface is correct even if the author-time property write did not land.
 */
export function makeAdditiveMaterial(color: vec4): Material {
  const m = ADDITIVE_SOURCE.clone() as Material;
  const pass = m.mainPass;
  pass.baseColor = color;
  pass.blendMode = BlendMode.Add;
  pass.twoSided = true;
  pass.depthTest = true;
  pass.depthWrite = false;
  return m;
}

/** Attach a mesh + additive material to a fresh child SceneObject. */
function makeVisual(parent: SceneObject, name: string, z: number, color: vec4): RenderMeshVisual {
  const so = global.scene.createSceneObject(name);
  so.setParent(parent);
  so.getTransform().setLocalPosition(new vec3(0, 0, z));
  const rmv = so.createComponent("Component.RenderMeshVisual") as RenderMeshVisual;
  rmv.mainMaterial = makeAdditiveMaterial(color);
  return rmv;
}

/**
 * Sumi brush thickness along a stroke. `s` is position along the WHOLE stroke
 * (0..1), never along the drawn prefix — so ink already laid down keeps its
 * width as the brush advances.
 *
 * The shape of a real stroke, and the reason this is not a symmetric taper:
 *   - the START is a PRESS, not a point. The brush lands, splays slightly, and
 *     is therefore at its WIDEST in the first few millimetres. An earlier
 *     version ramped up from near zero, which gave every stroke an arrow-like
 *     pointed tip — the opposite of how a brush meets paper.
 *   - the END is a harai: the brush is drawn away and lifts, so the width
 *     thins out over roughly the last third into a tail rather than stopping.
 * The start is additionally capped with a semicircle by the ribbon builder, so
 * the press reads as round rather than as a cut-off rectangle.
 */
function widthFactor(s: number): number {
  // Lands wide, eases to the body width over the first sixth of the stroke.
  const press = 1.18 - 0.18 * Math.min(1, s / 0.16);
  // Holds, then thins away over the last 40% into a tail.
  const tail = s <= 0.6 ? 1 : Math.pow(Math.max(0, 1 - (s - 0.6) / 0.4), 1.5);
  return Math.max(0.08, press * (0.1 + 0.9 * tail));
}

/**
 * Append a semicircular cap to a ribbon's vertex/index arrays.
 *
 * A quad strip ends in a flat edge, which at a brush's width reads as a blunt
 * rectangle — the "blocky ends" problem. This fans a half-disc off that edge so
 * the stroke begins (and, where wanted, ends) round.
 *
 * @param cx,cy   centre of the cap — the end point of the ribbon
 * @param nx,ny   unit normal of the end edge (the direction the two edge
 *                vertices are offset along)
 * @param dirX,dirY unit tangent pointing OUT of the ribbon, so the fan bulges
 *                away from the stroke rather than back over it
 */
function appendCap(
  verts: number[],
  idx: number[],
  cx: number,
  cy: number,
  nx: number,
  ny: number,
  dirX: number,
  dirY: number,
  radius: number,
  u: number,
  segments: number
): void {
  if (radius <= 1e-4) return;
  const base = verts.length / 8;
  // Centre vertex, then the rim swept from +normal round to -normal, bulging
  // along the outward tangent.
  verts.push(cx, cy, 0, 0, 0, 1, u, 0.5);
  for (let i = 0; i <= segments; i++) {
    const a = (i / segments) * Math.PI;
    const ox = nx * Math.cos(a) + dirX * Math.sin(a);
    const oy = ny * Math.cos(a) + dirY * Math.sin(a);
    verts.push(cx + ox * radius, cy + oy * radius, 0, 0, 0, 1, u, i / segments);
  }
  for (let i = 0; i < segments; i++) {
    idx.push(base, base + 1 + i, base + 2 + i);
  }
}

/**
 * Resample a polyline to even spacing by arc length.
 *
 * Pinch input arrives at frame rate, so point spacing follows how fast the hand
 * moved: dense where it slowed, sparse where it swept. Feeding that straight to
 * a spline makes the curve bunch and overshoot, so spacing is evened out first.
 */
function resampleEven(pts: Pt[], spacingCm: number): Pt[] {
  if (pts.length < 2) return pts.slice();
  const cum: number[] = [0];
  let total = 0;
  for (let k = 1; k < pts.length; k++) {
    const dx = pts[k].x - pts[k - 1].x;
    const dy = pts[k].y - pts[k - 1].y;
    total += Math.sqrt(dx * dx + dy * dy);
    cum.push(total);
  }
  if (total <= 1e-6) return [pts[0], pts[pts.length - 1]];

  const count = Math.max(2, Math.ceil(total / Math.max(0.01, spacingCm)) + 1);
  const out: Pt[] = [];
  let seg = 1;
  for (let i = 0; i < count; i++) {
    const target = (i / (count - 1)) * total;
    while (seg < pts.length - 1 && cum[seg] < target) seg++;
    const segLen = cum[seg] - cum[seg - 1];
    const f = segLen > 1e-6 ? (target - cum[seg - 1]) / segLen : 0;
    const a = pts[seg - 1];
    const b = pts[seg];
    out.push({ x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f });
  }
  return out;
}

/**
 * Catmull-Rom through the given points, at `perSegment` samples per span.
 *
 * Catmull-Rom passes exactly THROUGH its control points, which matters here:
 * the ink must sit on the path the user actually drew, not on a smoothed
 * approximation that drifts off it. Endpoints are duplicated so the curve starts
 * and ends exactly at the first and last point rather than cutting the corner.
 */
function catmullRom(pts: Pt[], perSegment: number): Pt[] {
  const n = pts.length;
  if (n < 3) return pts.slice();
  const out: Pt[] = [];
  for (let i = 0; i < n - 1; i++) {
    const p0 = pts[i > 0 ? i - 1 : 0];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[i + 2 < n ? i + 2 : n - 1];
    const steps = i === n - 2 ? perSegment : perSegment;
    for (let j = 0; j < steps; j++) {
      const t = j / steps;
      const t2 = t * t;
      const t3 = t2 * t;
      out.push({
        x: 0.5 * ((2 * p1.x) + (-p0.x + p2.x) * t +
          (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2 +
          (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * t3),
        y: 0.5 * ((2 * p1.y) + (-p0.y + p2.y) * t +
          (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * t2 +
          (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * t3),
      });
    }
  }
  out.push(pts[n - 1]);
  return out;
}

/**
 * A single brush stroke rendered as a tapered ribbon, revealable 0..1.
 *
 * Rebuilt from scratch on each progress change: a kana stroke densifies to a
 * couple of hundred vertices, so a full rebuild is cheaper and far less
 * error-prone than incremental vertex bookkeeping.
 */
export class InkRibbon {
  readonly sceneObject: SceneObject;
  private readonly builder: MeshBuilder;
  private readonly rmv: RenderMeshVisual;
  private readonly material: Material;
  private stroke: StrokePath | null = null;
  private widthCm: number;
  private uniform = false;
  private color: vec4;
  private vertexCount = 0;
  private indexCount = 0;

  constructor(parent: SceneObject, name: string, color: vec4, widthCm: number, z: number) {
    this.widthCm = widthCm;

    this.sceneObject = global.scene.createSceneObject(name);
    this.sceneObject.setParent(parent);
    this.sceneObject.getTransform().setLocalPosition(new vec3(0, 0, z));

    this.builder = new MeshBuilder(LAYOUT);
    this.builder.topology = MeshTopology.Triangles;
    this.builder.indexType = MeshIndexType.UInt16;

    this.color = color;
    this.material = makeAdditiveMaterial(color);
    this.rmv = this.sceneObject.createComponent("Component.RenderMeshVisual") as RenderMeshVisual;
    this.rmv.mesh = this.builder.getMesh();
    this.rmv.mainMaterial = this.material;
    this.builder.updateMesh();
  }

  setStroke(stroke: StrokePath | null): void {
    this.stroke = stroke;
    this.setProgress(0);
  }

  setColor(color: vec4): void {
    this.color = color;
    this.material.mainPass.baseColor = color;
  }

  /** The colour this ribbon is currently drawn in. */
  get currentColor(): vec4 {
    return this.color;
  }

  /** Whether this ribbon is showing. `enabled` is write-only, so this reads it. */
  get enabledState(): boolean {
    return this.sceneObject.enabled;
  }

  setWidth(widthCm: number): void {
    this.widthCm = widthCm;
  }

  /**
   * Draw at constant thickness, with no entry or exit taper.
   *
   * Used when ONE stroke is rendered as several ribbons laid end to end — the
   * per-segment feedback colouring. Each piece would otherwise taper to a point
   * at both its ends, and the stroke would read as a row of beads instead of a
   * single brush line that changes colour.
   */
  setUniformWidth(on: boolean): void {
    this.uniform = on;
  }

  set enabled(on: boolean) {
    this.sceneObject.enabled = on;
  }

  /** Reveal the stroke up to normalised arc length `t`. */
  setProgress(t: number): void {
    this.clear();

    const s = this.stroke;
    if (!s || s.points.length < 2 || s.length <= 1e-6) {
      this.builder.updateMesh();
      return;
    }

    const target = Math.max(0, Math.min(1, t)) * s.length;

    // Points of the drawn prefix, plus each one's position along the WHOLE stroke.
    const pts: Pt[] = [];
    const sv: number[] = [];
    let i = 0;
    while (i < s.points.length && s.cumulative[i] <= target) {
      pts.push(s.points[i]);
      sv.push(s.cumulative[i] / s.length);
      i++;
    }
    // Interpolated tip, so the brush head is exactly where the brush is.
    if (i < s.points.length && i > 0) {
      const segLen = s.cumulative[i] - s.cumulative[i - 1];
      const f = segLen > 1e-6 ? (target - s.cumulative[i - 1]) / segLen : 0;
      if (f > 1e-3) {
        const a = s.points[i - 1];
        const b = s.points[i];
        pts.push({ x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f });
        sv.push(target / s.length);
      }
    }

    if (pts.length < 2) {
      this.builder.updateMesh();
      return;
    }

    const verts: number[] = [];
    const idx: number[] = [];
    const n = pts.length;
    let capStart: CapInfo | null = null;
    let capEnd: CapInfo | null = null;

    for (let k = 0; k < n; k++) {
      let tx: number;
      let ty: number;
      if (k === 0) {
        tx = pts[1].x - pts[0].x;
        ty = pts[1].y - pts[0].y;
      } else if (k === n - 1) {
        tx = pts[n - 1].x - pts[n - 2].x;
        ty = pts[n - 1].y - pts[n - 2].y;
      } else {
        tx = pts[k + 1].x - pts[k - 1].x;
        ty = pts[k + 1].y - pts[k - 1].y;
      }
      const len = Math.sqrt(tx * tx + ty * ty);
      if (len > 1e-6) {
        tx /= len;
        ty /= len;
      } else {
        tx = 1;
        ty = 0;
      }
      // Left normal of the tangent.
      const nx = -ty;
      const ny = tx;
      const h = this.widthCm * 0.5 * widthFactor(sv[k]);
      const u = sv[k];

      // Right edge then left edge: vertex 2k = R, 2k+1 = L.
      verts.push(pts[k].x - nx * h, pts[k].y - ny * h, 0, 0, 0, 1, u, 0);
      verts.push(pts[k].x + nx * h, pts[k].y + ny * h, 0, 0, 0, 1, u, 1);

      if (k === 0) {
        capStart = { nx: nx, ny: ny, tx: tx, ty: ty, h: h, u: u };
      }
      if (k === n - 1) {
        capEnd = { nx: nx, ny: ny, tx: tx, ty: ty, h: h, u: u };
      }
    }

    for (let k = 0; k < n - 1; k++) {
      const b = k * 2;
      // (R_k, R_k+1, L_k+1) and (R_k, L_k+1, L_k) — both CCW from +Z.
      idx.push(b, b + 2, b + 3);
      idx.push(b, b + 3, b + 1);
    }

    // Round the ends. The start cap is the brush's landing press, so it is the
    // one that matters; the end is already a thin harai tail, and its cap is
    // small enough only to stop the tail finishing on a flat cut.
    if (capStart) {
      appendCap(verts, idx, pts[0].x, pts[0].y,
        capStart.nx, capStart.ny, -capStart.tx, -capStart.ty, capStart.h, capStart.u, CAP_SEGMENTS);
    }
    if (capEnd) {
      appendCap(verts, idx, pts[n - 1].x, pts[n - 1].y,
        -capEnd.nx, -capEnd.ny, capEnd.tx, capEnd.ty, capEnd.h, capEnd.u, CAP_SEGMENTS);
    }

    this.builder.appendVerticesInterleaved(verts);
    this.builder.appendIndices(idx);
    // Counted from the arrays, not from n: the end caps add vertices too, and
    // clear() erases exactly what was appended.
    this.vertexCount = verts.length / 8;
    this.indexCount = idx.length;
    this.builder.updateMesh();
  }

  /**
   * Build the ribbon directly from a growing list of points — the user's own
   * wet stroke, which has no StrokePath behind it yet.
   *
   * The width profile here is deliberately different from the demo's: it tapers
   * only over the first centimetre and then holds constant, so ink already laid
   * down does not change thickness as the drag continues. A profile keyed to
   * the fraction-of-total (as the demo uses) would visibly re-thin the whole
   * stroke on every frame.
   */
  setRawPoints(raw: Pt[]): void {
    this.clear();
    if (raw.length < 2) {
      this.builder.updateMesh();
      return;
    }

    // Even the spacing, then run a Catmull-Rom through it, so the ink reads as
    // one brush line rather than a chain of straight hops between input samples.
    // Both steps are cheap at these lengths and the curve passes through the
    // drawn points, so the ink still sits where the hand actually went.
    const even = resampleEven(raw, 0.22);
    const pts = even.length >= 3 ? catmullRom(even, 4) : even;

    const verts: number[] = [];
    const idx: number[] = [];
    const n = pts.length;
    let capStart: CapInfo | null = null;
    let capEnd: CapInfo | null = null;

    const arc: number[] = [0];
    for (let k = 1; k < n; k++) {
      const dx = pts[k].x - pts[k - 1].x;
      const dy = pts[k].y - pts[k - 1].y;
      arc.push(arc[k - 1] + Math.sqrt(dx * dx + dy * dy));
    }
    const totalArc = arc[n - 1];
    // A real brush presses in over the first few millimetres and lifts off over
    // the last few. The exit taper is keyed to distance from the END, so while
    // the stroke is still growing only the moving tip is thinned — ink already
    // laid down keeps its weight instead of re-thinning every frame.
    const ENTRY_CM = 0.9;
    const EXIT_CM = 0.7;

    for (let k = 0; k < n; k++) {
      let tx: number;
      let ty: number;
      if (k === 0) {
        tx = pts[1].x - pts[0].x;
        ty = pts[1].y - pts[0].y;
      } else if (k === n - 1) {
        tx = pts[n - 1].x - pts[n - 2].x;
        ty = pts[n - 1].y - pts[n - 2].y;
      } else {
        tx = pts[k + 1].x - pts[k - 1].x;
        ty = pts[k + 1].y - pts[k - 1].y;
      }
      const len = Math.sqrt(tx * tx + ty * ty);
      if (len > 1e-6) {
        tx /= len;
        ty /= len;
      } else {
        tx = 1;
        ty = 0;
      }
      const nx = -ty;
      const ny = tx;
      let h: number;
      if (this.uniform) {
        h = this.widthCm * 0.5;
      } else {
        const entry = Math.min(1, arc[k] / ENTRY_CM);
        const exit = Math.min(1, (totalArc - arc[k]) / EXIT_CM);
        const taper = Math.pow(entry, 0.6) * Math.pow(exit, 0.75);
        h = this.widthCm * 0.5 * (0.22 + 0.78 * taper);
      }
      const u = totalArc > 1e-6 ? arc[k] / totalArc : 0;

      verts.push(pts[k].x - nx * h, pts[k].y - ny * h, 0, 0, 0, 1, u, 0);
      verts.push(pts[k].x + nx * h, pts[k].y + ny * h, 0, 0, 0, 1, u, 1);

      if (k === 0) capStart = { nx: nx, ny: ny, tx: tx, ty: ty, h: h, u: u };
      if (k === n - 1) capEnd = { nx: nx, ny: ny, tx: tx, ty: ty, h: h, u: u };
    }

    for (let k = 0; k < n - 1; k++) {
      const b = k * 2;
      idx.push(b, b + 2, b + 3);
      idx.push(b, b + 3, b + 1);
    }

    if (capStart) {
      appendCap(verts, idx, pts[0].x, pts[0].y,
        capStart.nx, capStart.ny, -capStart.tx, -capStart.ty, capStart.h, capStart.u, CAP_SEGMENTS);
    }
    if (capEnd) {
      appendCap(verts, idx, pts[n - 1].x, pts[n - 1].y,
        -capEnd.nx, -capEnd.ny, capEnd.tx, capEnd.ty, capEnd.h, capEnd.u, CAP_SEGMENTS);
    }

    this.builder.appendVerticesInterleaved(verts);
    this.builder.appendIndices(idx);
    this.vertexCount = verts.length / 8;
    this.indexCount = idx.length;
    this.builder.updateMesh();
  }

  private clear(): void {
    // Indices first — they reference the vertices.
    if (this.indexCount > 0) {
      this.builder.eraseIndices(0, this.indexCount);
      this.indexCount = 0;
    }
    if (this.vertexCount > 0) {
      this.builder.eraseVertices(0, this.vertexCount);
      this.vertexCount = 0;
    }
  }
}

/**
 * A thin ring, used as the splash that blooms out of a finished stroke.
 *
 * Built as a triangle strip around an annulus rather than as a disc with a
 * hole: on an ADDITIVE display there is no way to punch a hole, because paper
 * drawn over ink only adds light. The hole has to be an absence of geometry.
 */
export function createRing(
  parent: SceneObject,
  name: string,
  radiusCm: number,
  thicknessCm: number,
  color: vec4,
  z: number,
  segments: number = 32
): RenderMeshVisual {
  const rmv = makeVisual(parent, name, z, color);
  const builder = new MeshBuilder(LAYOUT);
  builder.topology = MeshTopology.Triangles;
  builder.indexType = MeshIndexType.UInt16;

  const inner = Math.max(0.01, radiusCm - thicknessCm * 0.5);
  const outer = radiusCm + thicknessCm * 0.5;
  const verts: number[] = [];
  const idx: number[] = [];

  for (let i = 0; i < segments; i++) {
    const a = (i / segments) * Math.PI * 2;
    const c = Math.cos(a);
    const sn = Math.sin(a);
    verts.push(c * inner, sn * inner, 0, 0, 0, 1, i / segments, 0);
    verts.push(c * outer, sn * outer, 0, 0, 0, 1, i / segments, 1);
  }
  for (let i = 0; i < segments; i++) {
    const a0 = i * 2;
    const a1 = ((i + 1) % segments) * 2;
    // Counter-clockwise from +Z, matching every other surface in this file.
    idx.push(a0, a1, a1 + 1);
    idx.push(a0, a1 + 1, a0 + 1);
  }

  builder.appendVerticesInterleaved(verts);
  builder.appendIndices(idx);
  rmv.mesh = builder.getMesh();
  builder.updateMesh();
  return rmv;
}

/** Deterministic jitter so the sheet's uneven edge is stable between runs. */
function lcg(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/**
 * The washi sheet: a filled rectangle whose perimeter is nudged in and out by a
 * fraction of a centimetre, so the edge reads as torn paper rather than a panel.
 * Built as a triangle fan from the centre; the perimeter runs counter-clockwise.
 */
export function createWashiSheet(
  parent: SceneObject,
  widthCm: number,
  heightCm: number,
  jitterCm: number,
  color: vec4,
  z: number
): RenderMeshVisual {
  const rmv = makeVisual(parent, "WashiPaper", z, color);
  const builder = new MeshBuilder(LAYOUT);
  builder.topology = MeshTopology.Triangles;
  builder.indexType = MeshIndexType.UInt16;

  const perEdge = 9;
  const hw = widthCm * 0.5;
  const hh = heightCm * 0.5;
  const rnd = lcg(0x9e3779b9);

  // Perimeter, counter-clockwise from the bottom-right corner.
  const ring: Pt[] = [];
  const pushEdge = (ax: number, ay: number, bx: number, by: number, nx: number, ny: number) => {
    for (let i = 0; i < perEdge; i++) {
      const f = i / perEdge;
      const j = (rnd() - 0.5) * 2 * jitterCm;
      ring.push({ x: ax + (bx - ax) * f + nx * j, y: ay + (by - ay) * f + ny * j });
    }
  };
  pushEdge(hw, -hh, hw, hh, 1, 0);
  pushEdge(hw, hh, -hw, hh, 0, 1);
  pushEdge(-hw, hh, -hw, -hh, -1, 0);
  pushEdge(-hw, -hh, hw, -hh, 0, -1);

  const verts: number[] = [0, 0, 0, 0, 0, 1, 0.5, 0.5];
  for (let i = 0; i < ring.length; i++) {
    verts.push(ring[i].x, ring[i].y, 0, 0, 0, 1, ring[i].x / widthCm + 0.5, ring[i].y / heightCm + 0.5);
  }
  const idx: number[] = [];
  for (let i = 0; i < ring.length; i++) {
    const a = 1 + i;
    const b = 1 + ((i + 1) % ring.length);
    idx.push(0, a, b); // CCW: centre, then CCW perimeter pair.
  }

  builder.appendVerticesInterleaved(verts);
  builder.appendIndices(idx);
  rmv.mesh = builder.getMesh();
  builder.updateMesh();
  return rmv;
}

export interface RectSpec {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** One mesh holding many axis-aligned quads — used for the practice grid. */
export function createQuads(
  parent: SceneObject,
  name: string,
  rects: RectSpec[],
  color: vec4,
  z: number
): RenderMeshVisual {
  const rmv = makeVisual(parent, name, z, color);
  const builder = new MeshBuilder(LAYOUT);
  builder.topology = MeshTopology.Triangles;
  builder.indexType = MeshIndexType.UInt16;

  const verts: number[] = [];
  const idx: number[] = [];
  for (let i = 0; i < rects.length; i++) {
    const r = rects[i];
    const x0 = r.x - r.w * 0.5;
    const x1 = r.x + r.w * 0.5;
    const y0 = r.y - r.h * 0.5;
    const y1 = r.y + r.h * 0.5;
    const b = i * 4;
    verts.push(x0, y0, 0, 0, 0, 1, 0, 0);
    verts.push(x1, y0, 0, 0, 0, 1, 1, 0);
    verts.push(x1, y1, 0, 0, 0, 1, 1, 1);
    verts.push(x0, y1, 0, 0, 0, 1, 0, 1);
    idx.push(b, b + 1, b + 2);
    idx.push(b, b + 2, b + 3);
  }

  builder.appendVerticesInterleaved(verts);
  builder.appendIndices(idx);
  rmv.mesh = builder.getMesh();
  builder.updateMesh();
  return rmv;
}

/**
 * A filled circle, used for the webcam-bridge fingertip cursor.
 *
 * Built as a triangle fan from a centre vertex so it reads as a soft round dot
 * rather than a square. Like everything else here the material is additive, so
 * the colour is emitted light: alpha carries "how bright", not "how opaque".
 */
export function createDot(
  parent: SceneObject,
  name: string,
  radiusCm: number,
  color: vec4,
  z: number,
  segments: number = 24
): RenderMeshVisual {
  const rmv = makeVisual(parent, name, z, color);
  const builder = new MeshBuilder(LAYOUT);
  builder.topology = MeshTopology.Triangles;
  builder.indexType = MeshIndexType.UInt16;

  const verts: number[] = [];
  const idx: number[] = [];
  // Centre vertex first, then one vertex per step around the rim.
  verts.push(0, 0, 0, 0, 0, 1, 0.5, 0.5);
  for (let i = 0; i < segments; i++) {
    const a = (i / segments) * Math.PI * 2;
    const x = Math.cos(a) * radiusCm;
    const y = Math.sin(a) * radiusCm;
    verts.push(x, y, 0, 0, 0, 1, 0.5 + Math.cos(a) * 0.5, 0.5 + Math.sin(a) * 0.5);
  }
  // Counter-clockwise winding, matching every other surface in this file.
  for (let i = 0; i < segments; i++) {
    const a = 1 + i;
    const b = 1 + ((i + 1) % segments);
    idx.push(0, a, b);
  }

  builder.appendVerticesInterleaved(verts);
  builder.appendIndices(idx);
  rmv.mesh = builder.getMesh();
  builder.updateMesh();
  return rmv;
}

/**
 * The red hanko stamp that lands when a character is finished.
 *
 * A carved seal: a square border with three cut bars inside. On the additive
 * display "red" has to be an emitted vermilion — a dark red would simply not
 * appear — so the default colour is a bright warm red that still reads as ink
 * rather than as a warning light.
 */
export function createStamp(parent: SceneObject, sizeCm: number, color: vec4, z: number): SceneObject {
  const h = sizeCm * 0.5;
  const t = sizeCm * 0.12;      // border weight
  const inner = sizeCm * 0.52;  // carved bar length
  const bar = sizeCm * 0.1;
  const rects: RectSpec[] = [
    { x: 0, y: h - t * 0.5, w: sizeCm, h: t },
    { x: 0, y: -(h - t * 0.5), w: sizeCm, h: t },
    { x: -(h - t * 0.5), y: 0, w: t, h: sizeCm },
    { x: h - t * 0.5, y: 0, w: t, h: sizeCm },
    { x: 0, y: sizeCm * 0.17, w: inner, h: bar },
    { x: 0, y: 0, w: inner * 0.8, h: bar },
    { x: 0, y: -sizeCm * 0.17, w: inner, h: bar },
  ];
  const rmv = createQuads(parent, "HankoStamp", rects, color, z);
  return rmv.getSceneObject();
}

/**
 * The ghost brush tip: a soft teardrop whose POINT is the contact point, so the
 * SceneObject's origin is exactly where the ink is being laid down and the
 * brush sits ON the stroke rather than beside it.
 *
 * Built from a swept outline rather than a handful of corners. An earlier
 * six-point version rendered as a hard white diamond — at brush size on an
 * additive display, every facet reads, and a diamond does not look like a
 * brush. The silhouette here flares smoothly from the tip to a belly, then
 * rounds over the top like a loaded bristle bundle.
 */
export function createBrush(parent: SceneObject, lengthCm: number, widthCm: number, color: vec4, z: number): SceneObject {
  const rmv = makeVisual(parent, "GhostBrush", z, color);
  const builder = new MeshBuilder(LAYOUT);
  builder.topology = MeshTopology.Triangles;
  builder.indexType = MeshIndexType.UInt16;

  const R = widthCm * 0.5;
  const L = lengthCm;
  /** Where the brush is widest, as a fraction of its length. */
  const BELLY = 0.58;
  const STEPS = 22;

  const halfWidthAt = (t: number): number => {
    if (t <= BELLY) {
      // Flare out of the tip. The exponent below 1 makes it leave the point
      // quickly, which is what stops the tip reading as a spike.
      return R * Math.pow(t / BELLY, 0.55);
    }
    // Round over the top, as a circular arc, so there is no flat crown.
    const k = Math.min(1, (t - BELLY) / (1 - BELLY));
    return R * Math.sqrt(Math.max(0, 1 - k * k));
  };

  // Up the right side from the tip, then back down the left.
  const outline: Pt[] = [];
  for (let i = 0; i <= STEPS; i++) {
    const t = i / STEPS;
    outline.push({ x: halfWidthAt(t), y: L * t });
  }
  for (let i = STEPS - 1; i >= 1; i--) {
    const t = i / STEPS;
    outline.push({ x: -halfWidthAt(t), y: L * t });
  }

  const verts: number[] = [];
  for (let i = 0; i < outline.length; i++) {
    verts.push(outline[i].x, outline[i].y, 0, 0, 0, 1, 0.5, outline[i].y / L);
  }
  const idx: number[] = [];
  // Fan from the tip; the outline is CCW so every triangle is CCW from +Z.
  for (let i = 1; i < outline.length - 1; i++) {
    idx.push(0, i, i + 1);
  }

  builder.appendVerticesInterleaved(verts);
  builder.appendIndices(idx);
  rmv.mesh = builder.getMesh();
  builder.updateMesh();
  return rmv.getSceneObject();
}
