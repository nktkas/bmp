// deno-lint-ignore-file no-import-prefix

/**
 * Shared test utilities for decode and encode tests.
 * @module
 */
import { join } from "jsr:@std/path@1";

/** Absolute path to the BMP test suite directory. */
export const SUITE_DIR = join(import.meta.dirname!, "_bmpsuite-2.8");

/**
 * Converts grayscale/RGB/RGBA pixel data to RGBA for pixelmatch comparison.
 *
 * @param data Raw pixel data.
 * @param channels Number of color channels: 1 (grayscale), 3 (RGB), or 4 (RGBA).
 * @return RGBA pixel data suitable for pixelmatch.
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
