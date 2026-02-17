/**
 * @module
 * RLE (Run-Length Encoding) compression for BMP encoding.
 *
 * RLE8 encodes 256-color (8-bit) indexed images; RLE4 encodes 16-color (4-bit).
 * Both use the same general scheme: runs of identical pixels are stored as
 * (count, value) pairs, while non-repeating sequences use "absolute mode".
 */

import type { Color, RawImageData } from "../common.ts";
import { convertToIndexed, generateGrayscalePalette, generatePalette } from "./quantize.ts";

/** Result of RLE encoding: compressed pixel data and the palette used. */
export interface EncodedRleData {
  /** RLE-compressed pixel data ready to be appended after the BMP header. */
  pixelData: Uint8Array;
  /** Color palette used for the indexed encoding. */
  palette: Color[];
}

/**
 * Encodes image data with RLE8 compression (8-bit, 256-color).
 *
 * @param raw - Source pixel data.
 * @param palette - Custom 256-color palette. If omitted, one is auto-generated.
 * @returns Compressed pixel data and palette.
 */
export function encodeRle8(raw: RawImageData, palette?: Color[]): EncodedRleData {
  return encodeRle(raw, 256, rle8Callbacks, palette);
}

/**
 * Encodes image data with RLE4 compression (4-bit, 16-color).
 *
 * @param raw - Source pixel data.
 * @param palette - Custom 16-color palette. If omitted, one is auto-generated.
 * @returns Compressed pixel data and palette.
 */
export function encodeRle4(raw: RawImageData, palette?: Color[]): EncodedRleData {
  return encodeRle(raw, 16, rle4Callbacks, palette);
}

/** Callbacks for format-specific pixel encoding within the shared RLE loop. */
interface RleEncodeCallbacks {
  /** Bit mask for comparing pixel values. */
  mask: number;
  /** Writes an encoded-mode entry (repeated pixel value). */
  writeEncoded(output: number[], index: number, count: number): void;
  /** Writes an absolute-mode block (uncompressed pixel values). */
  writeAbsolute(
    output: number[],
    indices: Uint8Array,
    rowStart: number,
    start: number,
    count: number,
  ): void;
}

/** RLE8: one byte per pixel index, word-aligned absolute blocks. */
const rle8Callbacks: RleEncodeCallbacks = {
  mask: 0xFF,
  writeEncoded(output, index, count) {
    output.push(count, index);
  },
  writeAbsolute(output, indices, rowStart, start, count) {
    output.push(0x00, count);
    for (let i = 0; i < count; i++) {
      output.push(indices[rowStart + start + i]);
    }
    if (count % 2 === 1) output.push(0x00); // Word-align
  },
};

/** RLE4: nibble-packed values, nibble-packed absolute blocks. */
const rle4Callbacks: RleEncodeCallbacks = {
  mask: 0x0F,
  writeEncoded(output, index, count) {
    // The value byte duplicates the nibble in both halves
    const val = index & 0x0F;
    output.push(count, (val << 4) | val);
  },
  writeAbsolute(output, indices, rowStart, start, count) {
    // Pack 2 nibbles per byte
    output.push(0x00, count);
    for (let i = 0; i < count; i += 2) {
      const hi = indices[rowStart + start + i] & 0x0F;
      const lo = (i + 1 < count) ? (indices[rowStart + start + i + 1] & 0x0F) : 0;
      output.push((hi << 4) | lo);
    }
    const byteCount = Math.ceil(count / 2);
    if (byteCount % 2 === 1) output.push(0x00); // Word-align
  },
};

/** Shared encode pipeline: palette resolution → quantization → RLE compression. */
function encodeRle(
  raw: RawImageData,
  numColors: number,
  callbacks: RleEncodeCallbacks,
  palette?: Color[],
): EncodedRleData {
  const finalPalette = preparePalette(raw, palette, numColors);
  const indices = convertToIndexed(raw, finalPalette);
  const pixelData = encodeRlePixels(indices, raw.width, raw.height, callbacks);
  return { pixelData, palette: finalPalette };
}

/** Resolves the palette: use provided one if large enough, otherwise auto-generate. */
function preparePalette(
  raw: RawImageData,
  palette: Color[] | undefined,
  numColors: number,
): Color[] {
  if (palette && palette.length >= numColors) {
    return palette.slice(0, numColors);
  }
  return raw.channels === 1 ? generateGrayscalePalette(numColors) : generatePalette(raw, numColors);
}

/** Finds the length of a run of identical values, capped at 255 and limited to row boundary. */
function findRunLength(
  indices: Uint8Array,
  rowStart: number,
  x: number,
  width: number,
  mask: number,
): number {
  const value = indices[rowStart + x] & mask;
  let length = 1;
  while (x + length < width && (indices[rowStart + x + length] & mask) === value && length < 255) {
    length++;
  }
  return length;
}

/** Core RLE pixel encoding loop, processing rows bottom-up and delegating to callbacks. */
function encodeRlePixels(
  indices: Uint8Array,
  width: number,
  height: number,
  callbacks: RleEncodeCallbacks,
): Uint8Array {
  const output: number[] = [];

  for (let y = height - 1; y >= 0; y--) {
    let x = 0;
    const rowStart = y * width;

    while (x < width) {
      const runLength = findRunLength(indices, rowStart, x, width, callbacks.mask);

      if (runLength >= 3) {
        // Encoded mode: repeat one value
        callbacks.writeEncoded(output, indices[rowStart + x], runLength);
        x += runLength;
      } else {
        // Collect non-repeating pixels for absolute mode
        const absoluteStart = x;
        let absoluteCount = 0;

        while (x < width && absoluteCount < 255) {
          if (findRunLength(indices, rowStart, x, width, callbacks.mask) >= 3) break;
          x++;
          absoluteCount++;
        }

        if (absoluteCount >= 3) {
          callbacks.writeAbsolute(output, indices, rowStart, absoluteStart, absoluteCount);
        } else {
          // Too short for absolute mode — write as single-pixel encoded runs
          for (let i = 0; i < absoluteCount; i++) {
            callbacks.writeEncoded(output, indices[rowStart + absoluteStart + i], 1);
          }
        }
      }
    }

    output.push(0x00, 0x00); // End of line
  }

  output.push(0x00, 0x01); // End of bitmap
  return new Uint8Array(output);
}
