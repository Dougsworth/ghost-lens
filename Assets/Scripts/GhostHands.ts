/**
 * GhostHands — a pair of ghost hands, built in code and posed from data.
 *
 * Owns:  the hand geometry (palm plus five three-segment fingers) and the maths
 *        that folds it into a HandPose. Built with MeshBuilder because the hand
 *        is articulated: a static GLB cannot curl a finger.
 * Must not: know which sign is playing or when. GhostAslController drives it.
 *
 * Additive display: the hands are warm off-white light, the same ink value the
 * brush writes with, so the ghost reads as one character across both packs.
 *
 * Each finger is a chain of three boxes parented head-to-tail, so curling is
 * just a rotation per joint — the same shape real hand-tracking data has, which
 * is what keeps a future pose CHECK cheap.
 */

import { makeAdditiveMaterial } from "./GhostInkRibbon";
import { HandPose } from "./GhostAslPack";

const LAYOUT = [
  { name: "position", components: 3 },
  { name: "normal", components: 3, normalized: true },
  { name: "texture0", components: 2 },
];

/** A box from (-w/2,-h/2,-d/2) to (+w/2, h, +d/2) — origin at the joint, growing +Y. */
function boxMesh(w: number, h: number, d: number): RenderMesh {
  const b = new MeshBuilder(LAYOUT);
  b.topology = MeshTopology.Triangles;
  b.indexType = MeshIndexType.UInt16;

  const x = w * 0.5;
  const z = d * 0.5;
  const faces = [
    { n: [0, 0, 1], v: [[-x, 0, z], [x, 0, z], [x, h, z], [-x, h, z]] },
    { n: [0, 0, -1], v: [[x, 0, -z], [-x, 0, -z], [-x, h, -z], [x, h, -z]] },
    { n: [1, 0, 0], v: [[x, 0, z], [x, 0, -z], [x, h, -z], [x, h, z]] },
    { n: [-1, 0, 0], v: [[-x, 0, -z], [-x, 0, z], [-x, h, z], [-x, h, -z]] },
    { n: [0, 1, 0], v: [[-x, h, z], [x, h, z], [x, h, -z], [-x, h, -z]] },
    { n: [0, -1, 0], v: [[-x, 0, -z], [x, 0, -z], [x, 0, z], [-x, 0, z]] },
  ];

  const verts: number[] = [];
  const idx: number[] = [];
  for (let f = 0; f < faces.length; f++) {
    const face = faces[f];
    const base = f * 4;
    const uv = [[0, 0], [1, 0], [1, 1], [0, 1]];
    for (let i = 0; i < 4; i++) {
      verts.push(face.v[i][0], face.v[i][1], face.v[i][2], face.n[0], face.n[1], face.n[2], uv[i][0], uv[i][1]);
    }
    // Each face's quad is listed counter-clockwise seen from outside.
    idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }

  b.appendVerticesInterleaved(verts);
  b.appendIndices(idx);
  const mesh = b.getMesh();
  b.updateMesh();
  return mesh;
}

interface Finger {
  root: SceneObject;
  joints: SceneObject[];
  /** Rest yaw that fans this finger away from the palm. */
  baseSpreadDeg: number;
}

const DEG = Math.PI / 180;

export class GhostHand {
  readonly root: SceneObject;
  private fingers: Finger[] = [];
  private material: Material;

  /** @param mirrored true for a left hand. */
  constructor(parent: SceneObject, name: string, color: vec4, mirrored: boolean) {
    this.material = makeAdditiveMaterial(color);
    this.root = global.scene.createSceneObject(name);
    this.root.setParent(parent);

    const side = mirrored ? -1 : 1;

    // Palm. Everything here is deliberately SLIMMER than a real hand's
    // proportions: the material is unlit and additive, so there is no shading to
    // separate one part from another. Form has to come from GAPS between the
    // boxes — at life-like thickness the whole hand merges into one white slab.
    const palm = global.scene.createSceneObject("Palm");
    palm.setParent(this.root);
    const palmVis = palm.createComponent("Component.RenderMeshVisual") as RenderMeshVisual;
    palmVis.mesh = boxMesh(4.4, 4.8, 1.1);
    palmVis.mainMaterial = this.material;

    // Four fingers along the knuckle line, plus a thumb off the side. Finger
    // width (0.68) is about half the 1.3 cm spacing, so a clear gap survives.
    const fingerLens = [[1.8, 1.5, 1.2], [2.1, 1.7, 1.3], [2.0, 1.7, 1.3], [1.7, 1.4, 1.1]];
    const fingerX = [-1.65, -0.55, 0.55, 1.65];
    const spreadBase = [-14, -4, 5, 15];

    // Thumb first, so index 0 is the thumb exactly like the pose data expects.
    this.fingers.push(
      this.buildFinger("Thumb", palm, new vec3(side * -2.3, 1.3, 0.3), [1.7, 1.4, 1.1], 0.82, side * -55)
    );
    for (let i = 0; i < 4; i++) {
      this.fingers.push(
        this.buildFinger(
          "Finger" + i,
          palm,
          new vec3(side * fingerX[i], 4.8, 0),
          fingerLens[i],
          0.68,
          side * spreadBase[i]
        )
      );
    }
  }

  private buildFinger(
    name: string,
    parent: SceneObject,
    at: vec3,
    lengths: number[],
    width: number,
    spreadDeg: number
  ): Finger {
    const root = global.scene.createSceneObject(name);
    root.setParent(parent);
    root.getTransform().setLocalPosition(at);

    const joints: SceneObject[] = [];
    let current = root;
    for (let i = 0; i < lengths.length; i++) {
      const j = global.scene.createSceneObject(name + "_J" + i);
      j.setParent(current);
      if (i > 0) j.getTransform().setLocalPosition(new vec3(0, lengths[i - 1], 0));
      const vis = j.createComponent("Component.RenderMeshVisual") as RenderMeshVisual;
      vis.mesh = boxMesh(width, lengths[i], width);
      vis.mainMaterial = this.material;
      joints.push(j);
      current = j;
    }
    return { root: root, joints: joints, baseSpreadDeg: spreadDeg };
  }

  set enabled(on: boolean) {
    this.root.enabled = on;
  }

  setColor(c: vec4): void {
    this.material.mainPass.baseColor = c;
  }

  /**
   * Fold the hand into a pose. Curl is distributed across the three joints with
   * the knuckle bending least and the tip most, which is how a real finger
   * closes — an even split reads as a robot claw.
   */
  apply(pose: HandPose, anchor: vec3): void {
    const t = this.root.getTransform();
    t.setLocalPosition(
      new vec3(anchor.x + pose.offsetCm[0], anchor.y + pose.offsetCm[1], anchor.z + pose.offsetCm[2])
    );
    t.setLocalRotation(
      quat.fromEulerAngles(pose.rotationDeg[0] * DEG, pose.rotationDeg[1] * DEG, pose.rotationDeg[2] * DEG)
    );

    const share = [0.75, 1.0, 1.15];
    for (let f = 0; f < this.fingers.length; f++) {
      const finger = this.fingers[f];
      const curl = Math.max(0, Math.min(1, pose.curl[f]));
      const yaw = finger.baseSpreadDeg * pose.spread;
      for (let j = 0; j < finger.joints.length; j++) {
        const bend = curl * 72 * share[j];
        const rot = quat.fromEulerAngles(-bend * DEG, j === 0 ? yaw * DEG : 0, 0);
        finger.joints[j].getTransform().setLocalRotation(rot);
      }
    }
  }
}

/** Linear blend between two poses — used to travel between keyframes. */
export function lerpPose(a: HandPose, b: HandPose, f: number): HandPose {
  const curl: number[] = [];
  for (let i = 0; i < 5; i++) curl.push(a.curl[i] + (b.curl[i] - a.curl[i]) * f);
  const off: number[] = [];
  for (let i = 0; i < 3; i++) off.push(a.offsetCm[i] + (b.offsetCm[i] - a.offsetCm[i]) * f);
  const rot: number[] = [];
  for (let i = 0; i < 3; i++) rot.push(a.rotationDeg[i] + (b.rotationDeg[i] - a.rotationDeg[i]) * f);
  return {
    curl: curl,
    spread: a.spread + (b.spread - a.spread) * f,
    offsetCm: off,
    rotationDeg: rot,
    holdSec: b.holdSec,
  };
}
