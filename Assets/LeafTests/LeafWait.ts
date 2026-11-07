/**
 * LeafWait — a local `waitUntil` for the GHOST scenarios.
 *
 * The LEAF build installed here exports sleep / nextFrame / withTimeout from
 * Leaf.lspkg/Utils/common/Utils but NOT waitUntil, which the scenarios were
 * written against. Rather than edit the LEAF package (its own skill says to
 * adapt project code, never the package), this rebuilds the one missing helper
 * out of the primitives LEAF does provide.
 */

import { nextFrame } from "Leaf.lspkg/Utils/common/Utils";

/**
 * Poll `predicate` once per frame until it is true, or fail with `message`.
 *
 * @param predicate checked every frame
 * @param timeoutMs give up after this long
 * @param message   built lazily on failure, so the diagnostic can report the
 *                  state that was actually observed rather than a static string
 */
export async function waitUntil(
  predicate: () => boolean,
  timeoutMs: number,
  message: () => string
): Promise<void> {
  // getTime() is the Lens runtime clock, in SECONDS since lens start, and is
  // what StudioLib.d.ts actually declares. Date.now() type-checks only because
  // tsconfig's lib is es2021 -- it is not part of the Lens runtime surface, and
  // the rest of GHOST (e.g. WebcamHandBridge) uses getTime() throughout.
  const deadline = getTime() + timeoutMs / 1000;
  while (getTime() < deadline) {
    if (predicate()) return;
    await nextFrame();
  }
  if (predicate()) return;
  throw new Error("waitUntil timed out after " + timeoutMs + "ms: " + message());
}
