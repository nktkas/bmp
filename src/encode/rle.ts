/**
 * RLE (Run-Length Encoding) compression for BMP encoding.
 *
 * RLE8 encodes 256-color (8-bit) indexed images; RLE4 encodes 16-color (4-bit).
 * Both use the same general scheme: runs of identical pixels are stored as
 * (count, value) pairs, while non-repeating sequences use "absolute mode".
 *
 * @see https://learn.microsoft.com/windows/win32/gdi/bitmap-compression
 *
 * @module
 */

import type { Color, RawImageData } from "../common.ts";
import { toIndexed } from "./quantize.ts";

/** Result of RLE encoding: compressed pixel data and the palette used. */
export interface EncodedRleData {
  /** RLE-compressed pixel data ready to be appended after the BMP header. */
  pixelData: Uint8Array;
  /** Color palette used for the indexed encoding. */
  palette: Color[];
}

/** Callbacks for format-specific pixel encoding within the shared RLE loop. */
interface RleEncodeCallbacks {
  /** Bit mask for comparing pixel values. */
  mask: number;
  /**
   * Writes an encoded-mode entry.
   *
   * @param output Destination buffer.
   * @param pos Current write position.
   * @param index Palette index to encode.
   * @param count Number of repetitions.
   *
   * @return New write position.
   */
  writeEncoded(output: Uint8Array, pos: number, index: number, count: number): number;
  /**
   * Writes an absolute-mode block.
   *
   * @param output Destination buffer.
   * @param pos Current write position.
   * @param data Palette indices to write (subarray starting at the block).
   * @param count Number of pixels in the block.
   *
   * @return New write position.
   */
  writeAbsolute(output: Uint8Array, pos: number, data: Uint8Array, count: number): number;
}

/** RLE8: one byte per pixel index, word-aligned absolute blocks. */
const RLE8_CALLBACKS: RleEncodeCallbacks = {
  mask: 0xFF,
  writeEncoded(output, pos, index, count): number {
    output[pos++] = count;
    output[pos++] = index;
    return pos;
  },
  writeAbsolute(output, pos, data, count): number {
    output[pos++] = 0x00; // Escape: absolute mode
    output[pos++] = count;
    for (let i = 0; i < count; i++) {
      output[pos++] = data[i];
    }
    if (count % 2 === 1) output[pos++] = 0x00; // Word-align
    return pos;
  },
};

/** RLE4: nibble-packed values, nibble-packed absolute blocks. */
const RLE4_CALLBACKS: RleEncodeCallbacks = {
  mask: 0x0F,
  writeEncoded(output, pos, index, count): number {
    const val = index & 0x0F;
    output[pos++] = count;
    output[pos++] = (val << 4) | val;
    return pos;
  },
  writeAbsolute(output, pos, data, count): number {
    output[pos++] = 0x00; // Escape: absolute mode
    output[pos++] = count;
    for (let i = 0; i < count; i += 2) {
      const hi = data[i] & 0x0F;
      const lo = (i + 1 < count) ? (data[i + 1] & 0x0F) : 0;
      output[pos++] = (hi << 4) | lo;
    }
    const byteCount = Math.ceil(count / 2);
    if (byteCount % 2 === 1) output[pos++] = 0x00; // Word-align
    return pos;
  },
};

/**
 * Encodes image data with RLE8 compression (8-bit, 256-color).
 *
 * @param raw Source pixel data.
 * @param palette Custom 256-color palette. If omitted, one is auto-generated.
 *
 * @return Compressed pixel data and palette.
 */
export function encodeRle8(raw: RawImageData, palette?: Color[]): EncodedRleData {
  return encodeRle(raw, 256, RLE8_CALLBACKS, palette);
}

/**
 * Encodes image data with RLE4 compression (4-bit, 16-color).
 *
 * @param raw Source pixel data.
 * @param palette Custom 16-color palette. If omitted, one is auto-generated.
 *
 * @return Compressed pixel data and palette.
 */
export function encodeRle4(raw: RawImageData, palette?: Color[]): EncodedRleData {
  return encodeRle(raw, 16, RLE4_CALLBACKS, palette);
}

/**
 * Shared encode pipeline: quantization to the palette, then RLE compression of the indices.
 *
 * @param raw Source pixel data.
 * @param numColors Target palette size.
 * @param callbacks Format-specific encoding callbacks.
 * @param palette Custom palette. Omitting it builds one from the image.
 *
 * @return Compressed pixel data and palette.
 */
function encodeRle(
  raw: RawImageData,
  numColors: 16 | 256,
  callbacks: RleEncodeCallbacks,
  palette?: Color[],
): EncodedRleData {
  const indexed = toIndexed(raw, numColors, palette);
  const pixelData = encodeRlePixels(indexed.indices, raw.width, raw.height, callbacks);
  return { pixelData, palette: indexed.palette };
}

/**
 * Finds the length of a run of identical values, capped at 255.
 *
 * @param indices Palette index array.
 * @param offset Start position in the array.
 * @param remaining Number of pixels left in the row.
 * @param mask Bit mask for comparing values.
 *
 * @return Run length (1–255).
 */
function findRunLength(indices: Uint8Array, offset: number, remaining: number, mask: number): number {
  const value = indices[offset] & mask;
  let length = 1;
  while (length < remaining && (indices[offset + length] & mask) === value && length < 255) {
    length++;
  }
  return length;
}

/**
 * Core RLE pixel encoding loop, processing rows bottom-up and delegating to callbacks.
 *
 * @param indices Palette index array.
 * @param width Image width in pixels.
 * @param height Image height in pixels.
 * @param callbacks Format-specific encoding callbacks.
 *
 * @return RLE-compressed pixel data.
 */
function encodeRlePixels(
  indices: Uint8Array,
  width: number,
  height: number,
  callbacks: RleEncodeCallbacks,
): Uint8Array {
  // Worst case: 2 bytes per pixel (single-pixel runs) + 2 per row (EOL) + 2 (EOF).
  const output = new Uint8Array(width * height * 2 + height * 2 + 2);
  let pos = 0;

  for (let y = height - 1; y >= 0; y--) {
    let x = 0;
    const rowStart = y * width;

    while (x < width) {
      const runLength = findRunLength(indices, rowStart + x, width - x, callbacks.mask);

      if (runLength >= 3) { // Encoded mode
        pos = callbacks.writeEncoded(output, pos, indices[rowStart + x], runLength);
        x += runLength;
      } else {
        // Absolute mode: gather pixels up to the next run of three or more.
        const absoluteStart = x;
        let absoluteCount = 0;

        while (x < width && absoluteCount < 255) {
          if (findRunLength(indices, rowStart + x, width - x, callbacks.mask) >= 3) break;
          x++;
          absoluteCount++;
        }

        if (absoluteCount >= 3) {
          pos = callbacks.writeAbsolute(output, pos, indices.subarray(rowStart + absoluteStart), absoluteCount);
        } else {
          // An absolute block costs 2 bytes of header, which below three pixels is not repaid.
          for (let i = 0; i < absoluteCount; i++) {
            pos = callbacks.writeEncoded(output, pos, indices[rowStart + absoluteStart + i], 1);
          }
        }
      }
    }

    // End-of-line marker between rows only.
    if (y > 0) {
      output[pos++] = 0x00; // Escape
      output[pos++] = 0x00; // End of line
    }
  }

  output[pos++] = 0x00; // Escape
  output[pos++] = 0x01; // End of bitmap

  return output.subarray(0, pos);
}
