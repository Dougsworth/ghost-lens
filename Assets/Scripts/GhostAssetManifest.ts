/**
 * GhostAssetManifest — the pack table and lesson order, in one place.
 *
 * Owns:  the data a future agent would otherwise have to rediscover by reading
 *        the whole project: which notebooks sit on the shelf, in what order,
 *        and which ones are open.
 * Must not: hold runtime state or import scene types.
 *
 * Generated asset paths are NOT re-exported from here on purpose: requireAsset
 * only accepts string literals, so each consumer writes its own literal. For
 * reference, the generated assets this build uses are:
 *   ../GeneratedSFX/BrushStroke.wav   brush dragged across washi
 *   ../GeneratedSFX/PaperUnroll.wav   the sheet unrolling
 *   ../GeneratedSFX/TabTap.wav        a bookmark tab pinched
 *   ../GeneratedSFX/VoiceA.wav        the spoken sound of あ
 *   ../Icons/sign_language.png        ASL notebook cover art
 *   ../Materials/GhostAdditive.mat    unlit additive source material
 *   ../Materials/ImageMaterial.mat    for Component.Image cover art
 */

export interface PackEntry {
  /** Stable id emitted by GhostShelfUI.onPackSelected. */
  id: string;
  /** Title printed along the bottom of the cover. */
  title: string;
  /** Cover art: "あ" draws the kana, "hand" uses the sign-language icon, "" is bare. */
  cover: string;
  /** Open packs are pinchable; locked ones wear the "Coming soon" band. */
  open: boolean;
}

/** The shelf, left to right. Five covers at 4.2 cm + 0.9 cm gaps = 24.6 cm. */
export const SHELF_PACKS: PackEntry[] = [
  { id: "japanese", title: "Japanese", cover: "あ", open: true },
  { id: "asl", title: "ASL", cover: "hand", open: true },
  { id: "guitar", title: "Guitar Chords", cover: "", open: false },
  { id: "chinese", title: "Chinese", cover: "", open: false },
  { id: "knots", title: "Knots", cover: "", open: false },
];
