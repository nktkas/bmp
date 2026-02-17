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

  // Pre-compute LUTs: for each 8-bit input value, the scaled output
  const redLut = createScaleLut(redInfo.bits);
  const greenLut = createScaleLut(greenInfo.bits);
  const blueLut = createScaleLut(blueInfo.bits);
  const alphaLut = masks.alphaMask ? createScaleLut(alphaInfo.bits) : null;

  for (let y = 0; y < height; y++) {
    const dstRow = topDown ? y : height - 1 - y;

    for (let x = 0; x < width; x++) {
      const srcOffset = (y * width + x) * raw.channels;
      const dstOffset = dstRow * stride + x * (bitsPerPixel / 8);

      const r = raw.data[srcOffset];
      const g = raw.data[srcOffset + 1];
      const b = raw.data[srcOffset + 2];
      const a = raw.channels === 4 ? raw.data[srcOffset + 3] : 255;

      // LUT lookup + shift into position
      let pixel = 0;
      pixel |= (redLut[r] << redInfo.shift) & masks.redMask;
      pixel |= (greenLut[g] << greenInfo.shift) & masks.greenMask;
      pixel |= (blueLut[b] << blueInfo.shift) & masks.blueMask;
      if (alphaLut) {
        pixel |= (alphaLut[a] << alphaInfo.shift) & masks.alphaMask!;
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

/** Creates a LUT that scales 8-bit values (0–255) to a target bit depth. */
function createScaleLut(bits: number): Uint8Array {
  const lut = new Uint8Array(256);
  if (bits === 0) return lut;
  const max = (1 << bits) - 1;
  for (let i = 0; i < 256; i++) {
    lut[i] = Math.min(255, Math.round((i * max) / 255));
  }
  return lut;
}
