/**
 * @module
 * Encodes BMP images with BI_BITFIELDS or BI_ALPHABITFIELDS compression.
 */

import type { BitfieldMasks, RawImageData } from "../common.ts";
import { analyzeBitMask, calculateStride } from "../common.ts";

/**
 * Encodes image data using custom bitfield masks.
 *
 * @param raw - Source pixel data (RGB or RGBA).
 * @param width - Image width in pixels.
 * @param height - Image height in pixels.
 * @param bitsPerPixel - 16 or 32.
 * @param masks - Custom bit masks for each channel.
 * @param topDown - If true, rows are stored top-down.
 * @returns Encoded pixel data.
 */
export function encodeBitfields(
  raw: RawImageData,
  width: number,
  height: number,
  bitsPerPixel: 16 | 32,
  masks: BitfieldMasks,
  topDown: boolean = false,
): Uint8Array {
  const redInfo = analyzeBitMask(masks.redMask);
  const greenInfo = analyzeBitMask(masks.greenMask);
  const blueInfo = analyzeBitMask(masks.blueMask);
  const alphaInfo = analyzeBitMask(masks.alphaMask ?? 0);

  const stride = calculateStride(width, bitsPerPixel);
  const result = new Uint8Array(stride * height);
  const view = new DataView(result.buffer);

  for (let y = 0; y < height; y++) {
    const dstRow = topDown ? y : height - 1 - y;

    for (let x = 0; x < width; x++) {
      const srcOffset = (y * width + x) * raw.channels;
      const dstOffset = dstRow * stride + x * (bitsPerPixel / 8);

      const r = raw.data[srcOffset];
      const g = raw.data[srcOffset + 1];
      const b = raw.data[srcOffset + 2];
      const a = raw.channels === 4 ? raw.data[srcOffset + 3] : 255;

      // Scale each channel from 8-bit to target depth, shift into position
      let pixel = 0;
      pixel |= (scaleColor(r, redInfo.bits) << redInfo.shift) & masks.redMask;
      pixel |= (scaleColor(g, greenInfo.bits) << greenInfo.shift) & masks.greenMask;
      pixel |= (scaleColor(b, blueInfo.bits) << blueInfo.shift) & masks.blueMask;
      if (masks.alphaMask) {
        pixel |= (scaleColor(a, alphaInfo.bits) << alphaInfo.shift) & masks.alphaMask;
      }

      if (bitsPerPixel === 16) {
        view.setUint16(dstOffset, pixel, true);
      } else {
        view.setUint32(dstOffset, pixel, true);
      }
    }
  }

  return result;
}

/** Scales an 8-bit color value (0–255) to a target bit depth. */
function scaleColor(value: number, bits: number): number {
  if (bits === 0) return 0;
  if (bits === 8) return value;
  const max = (1 << bits) - 1;
  return Math.round((value * max) / 255);
}
