import type { RawImageData } from "../_common.ts";
import { calculateStride } from "./_helpers.ts";

/** Bitfield masks for custom color encoding */
export interface BitfieldMasks {
  redMask: number;
  greenMask: number;
  blueMask: number;
  alphaMask?: number;
}

/**
 * Analyzes a bit mask to determine shift and scale values.
 * @param mask - Bit mask (e.g., 0x00FF0000 for red in 32-bit BGRA)
 * @returns Shift amount and bit depth
 */
function analyzeMask(mask: number): { shift: number; bits: number } {
  if (mask === 0) {
    return { shift: 0, bits: 0 };
  }

  // Count trailing zeros (shift)
  let shift = 0;
  let temp = mask;
  while ((temp & 1) === 0) {
    shift++;
    temp >>>= 1;
  }

  // Count consecutive ones (bits)
  let bits = 0;
  while ((temp & 1) === 1) {
    bits++;
    temp >>>= 1;
  }

  return { shift, bits };
}

/**
 * Scales an 8-bit color value to the target bit depth.
 * @param value - 8-bit color value (0-255)
 * @param bits - Target bit depth
 * @returns Scaled value
 */
function scaleColorValue(value: number, bits: number): number {
  if (bits === 0) return 0;
  if (bits === 8) return value;

  // Scale from 8-bit to target bit depth
  const maxValue = (1 << bits) - 1;
  return Math.round((value * maxValue) / 255);
}

/**
 * Encodes image data using custom bitfield masks (16-bit or 32-bit).
 * @param raw - Raw image data (RGB or RGBA)
 * @param width - Image width
 * @param height - Image height
 * @param bitsPerPixel - Bits per pixel (16 or 32)
 * @param masks - Bitfield masks
 * @param topDown - If true, rows are stored top-down (default: false)
 * @returns Encoded pixel data
 */
export function encodeBiBitfields(
  raw: RawImageData,
  width: number,
  height: number,
  bitsPerPixel: 16 | 32,
  masks: BitfieldMasks,
  topDown: boolean = false,
): Uint8Array {
  if (raw.channels !== 3 && raw.channels !== 4) {
    throw new Error("BI_BITFIELDS/BI_ALPHABITFIELDS encoding requires RGB or RGBA data");
  }

  if (bitsPerPixel !== 16 && bitsPerPixel !== 32) {
    throw new Error("BI_BITFIELDS/BI_ALPHABITFIELDS only supports 16-bit and 32-bit formats");
  }

  // Analyze masks
  const redInfo = analyzeMask(masks.redMask);
  const greenInfo = analyzeMask(masks.greenMask);
  const blueInfo = analyzeMask(masks.blueMask);
  const alphaInfo = analyzeMask(masks.alphaMask ?? 0);

  const stride = calculateStride(width, bitsPerPixel);
  const result = new Uint8Array(stride * height);
  const view = new DataView(result.buffer);

  for (let y = 0; y < height; y++) {
    const srcRow = y;
    const dstRow = topDown ? y : (height - 1 - y);

    for (let x = 0; x < width; x++) {
      const srcOffset = (srcRow * width + x) * raw.channels;
      const dstOffset = dstRow * stride + x * (bitsPerPixel / 8);

      // Extract RGB(A) values
      const r = raw.data[srcOffset];
      const g = raw.data[srcOffset + 1];
      const b = raw.data[srcOffset + 2];
      const a = raw.channels === 4 ? raw.data[srcOffset + 3] : 255;

      // Scale values to target bit depth
      const rScaled = scaleColorValue(r, redInfo.bits);
      const gScaled = scaleColorValue(g, greenInfo.bits);
      const bScaled = scaleColorValue(b, blueInfo.bits);
      const aScaled = scaleColorValue(a, alphaInfo.bits);

      // Apply masks and combine
      let pixel = 0;
      pixel |= (rScaled << redInfo.shift) & masks.redMask;
      pixel |= (gScaled << greenInfo.shift) & masks.greenMask;
      pixel |= (bScaled << blueInfo.shift) & masks.blueMask;
      if (masks.alphaMask) {
        pixel |= (aScaled << alphaInfo.shift) & masks.alphaMask;
      }

      // Write pixel
      if (bitsPerPixel === 16) {
        view.setUint16(dstOffset, pixel, true);
      } else {
        view.setUint32(dstOffset, pixel, true);
      }
    }
  }

  return result;
}
