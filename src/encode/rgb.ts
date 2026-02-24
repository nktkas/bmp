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
import { grayscaleToIndices, packIndexedPixels, rawToBgr, rawToBgra, rawToRgb555 } from "./pixel.ts";
import { convertToIndexed, generateGrayscalePalette, generatePalette } from "./quantize.ts";

/** Result of BI_RGB encoding: pixel data and optional palette. */
export interface EncodedRgbData {
  /** Encoded pixel data ready to be appended after the BMP header. */
  pixelData: Uint8Array;
  /** Color palette used for indexed formats (1/4/8-bit). */
  palette?: Color[];
}

/**
 * Encode raw image data in BI_RGB format.
 *
 * @param raw Source pixel data.
 * @param bitsPerPixel Target bit depth.
 * @param isTopDown If true, rows are stored top-down. Default: `false`.
 * @param palette Custom palette for indexed formats. If omitted, one is auto-generated.
 * @return Encoded pixel data and palette (if indexed).
 */
export function encodeRgb(
  raw: RawImageData,
  bitsPerPixel: 1 | 4 | 8 | 16 | 24 | 32,
  isTopDown: boolean = false,
  palette?: Color[],
): EncodedRgbData {
  // Direct color formats — no palette needed
  if (bitsPerPixel === 16) return { pixelData: rawToRgb555(raw, isTopDown) };
  if (bitsPerPixel === 24) return { pixelData: rawToBgr(raw, isTopDown) };
  if (bitsPerPixel === 32) return { pixelData: rawToBgra(raw, isTopDown) };

  // Indexed formats (1, 4, 8-bit)
  return encodeIndexed(raw, bitsPerPixel, isTopDown, palette);
}

/**
 * Encode indexed (palette-based) pixel data for bit depths 1, 4, 8.
 *
 * @param raw Source pixel data.
 * @param bitsPerPixel Target bit depth.
 * @param isTopDown If true, rows are stored top-down.
 * @param palette Custom palette. If omitted, one is auto-generated.
 * @return Encoded pixel data and palette.
 */
function encodeIndexed(
  raw: RawImageData,
  bitsPerPixel: 1 | 4 | 8,
  isTopDown: boolean,
  palette?: Color[],
): EncodedRgbData {
  const numColors = (1 << bitsPerPixel) as 2 | 16 | 256;

  let finalPalette: Color[];
  let indices: Uint8Array;

  if (palette && palette.length >= numColors) {
    // Use caller-provided palette
    finalPalette = palette.slice(0, numColors);
    indices = convertToIndexed(raw, finalPalette);
  } else {
    // Auto-generate palette
    finalPalette = raw.channels === 1 ? generateGrayscalePalette(numColors) : generatePalette(raw, numColors);
    indices = raw.channels === 1 ? grayscaleToIndices(raw, numColors) : convertToIndexed(raw, finalPalette);
  }

  const pixelData = packIndexedPixels(indices, { width: raw.width, height: raw.height, bitsPerPixel, isTopDown });
  return { pixelData, palette: finalPalette };
}
