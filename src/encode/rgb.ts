/**
 * BI_RGB (uncompressed) encoding for all bit depths.
 *
 * Indexed formats (1/4/8-bit) use a color palette; direct formats
 * (16/24/32-bit) encode pixels directly. For indexed formats, a palette
 * is either provided by the caller or auto-generated via color quantization.
 *
 * @module
 */

import type { Color, RawImageData } from "../common.ts";
import { packIndexedPixels, rawToBgr, rawToBgra, rawToRgb555 } from "./pixel.ts";
import { toIndexed } from "./quantize.ts";

/** Result of BI_RGB encoding: pixel data and optional palette. */
export interface EncodedRgbData {
  /** Encoded pixel data ready to be appended after the BMP header. */
  pixelData: Uint8Array;
  /** Color palette used for indexed formats (1/4/8-bit). */
  palette?: Color[];
}

/**
 * Encodes raw image data in BI_RGB format.
 *
 * @param raw Source pixel data.
 * @param bitsPerPixel Target bit depth.
 * @param isTopDown If true, rows are stored top-down.
 * @param palette Custom palette for the indexed depths. Omitting it builds one from the image.
 *
 * @return Encoded pixel data, and the palette when the depth is an indexed one.
 */
export function encodeRgb(
  raw: RawImageData,
  bitsPerPixel: 1 | 4 | 8 | 16 | 24 | 32,
  isTopDown: boolean,
  palette?: Color[],
): EncodedRgbData {
  if (bitsPerPixel === 16) return { pixelData: rawToRgb555(raw, isTopDown) };
  if (bitsPerPixel === 24) return { pixelData: rawToBgr(raw, isTopDown) };
  if (bitsPerPixel === 32) return { pixelData: rawToBgra(raw, isTopDown) };

  const numColors = bitsPerPixel === 1 ? 2 : bitsPerPixel === 4 ? 16 : 256;
  const indexed = toIndexed(raw, numColors, palette);
  const layout = { width: raw.width, height: raw.height, bitsPerPixel, isTopDown };
  return { pixelData: packIndexedPixels(indexed.indices, layout), palette: indexed.palette };
}
