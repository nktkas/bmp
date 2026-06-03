// deno-lint-ignore-file no-import-prefix

/**
 * Shared helpers for the decode/encode correctness tests.
 * @module
 */

import { assertEquals } from "jsr:@std/assert@1";
import { join } from "jsr:@std/path@1";
import pixelmatch from "npm:pixelmatch@7";
import type { RawImageData } from "../src/mod.ts";

/** Absolute path to the BMP test suite directory. */
export const SUITE_DIR = join(import.meta.dirname!, "_bmpsuite-2.8");

/**
 * Converts grayscale/RGB/RGBA pixel data to RGBA.
 *
 * @param data Raw pixel data.
 * @param channels Number of color channels: 1 (grayscale), 3 (RGB), or 4 (RGBA).
 * @return RGBA pixel data.
 */
export function toRgba(data: Uint8Array, channels: 1 | 3 | 4): Uint8Array {
  if (channels === 4) return data;
  if (channels === 1) {
    const rgba = new Uint8Array(data.length * 4);
    for (let i = 0, j = 0; i < data.length; i++, j += 4) {
      rgba[j] = data[i];
      rgba[j + 1] = data[i];
      rgba[j + 2] = data[i];
      rgba[j + 3] = 255;
    }
    return rgba;
  }
  const rgba = new Uint8Array((data.length / 3) * 4);
  for (let i = 0, j = 0; i < data.length; i += 3, j += 4) {
    rgba[j] = data[i];
    rgba[j + 1] = data[i + 1];
    rgba[j + 2] = data[i + 2];
    rgba[j + 3] = 255;
  }
  return rgba;
}

/**
 * Assert that two images have the same dimensions and (within `threshold`) the same pixels.
 *
 * @param actual Image under test.
 * @param expected Reference image.
 * @param threshold Per-pixel color tolerance for pixelmatch (0–1).
 */
export function assertPixelsMatch(actual: RawImageData, expected: RawImageData, threshold?: number): void {
  assertEquals(actual.width, expected.width, "Width mismatch");
  assertEquals(actual.height, expected.height, "Height mismatch");

  const diff = pixelmatch(
    toRgba(actual.data, actual.channels),
    toRgba(expected.data, expected.channels),
    undefined,
    actual.width,
    actual.height,
    threshold === undefined ? undefined : { threshold },
  );
  assertEquals(diff, 0, "Found different pixels");
}
