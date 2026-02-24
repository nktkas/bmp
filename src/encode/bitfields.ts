/**
 * Encodes BMP images with BI_BITFIELDS or BI_ALPHABITFIELDS compression.
 * @module
 */

import { analyzeBitMask, type BitfieldMasks, calculateStride, type RawImageData } from "../common.ts";

/**
 * Encode image data using custom bitfield masks.
 *
 * @param raw Source pixel data (RGB or RGBA).
 * @param bitsPerPixel 16 or 32.
 * @param masks Custom bit masks for each channel.
 * @param isTopDown If true, rows are stored top-down. Default: `false`.
 * @return Encoded pixel data.
 */
export function encodeBitfields(
  raw: RawImageData,
  bitsPerPixel: 16 | 32,
  masks: BitfieldMasks,
  isTopDown: boolean = false,
): Uint8Array {
  const { width, height } = raw;

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

  const { data, channels } = raw;

  for (let y = 0; y < height; y++) {
    const dstRow = isTopDown ? y : height - 1 - y;

    for (let x = 0; x < width; x++) {
      const srcOffset = (y * width + x) * channels;
      const dstOffset = dstRow * stride + x * (bitsPerPixel / 8);

      const r = data[srcOffset];
      const g = data[srcOffset + 1];
      const b = data[srcOffset + 2];
      const a = channels === 4 ? data[srcOffset + 3] : 255;

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

/**
 * Create a LUT that scales 8-bit values (0–255) to a target bit depth.
 *
 * @param bits Target channel bit depth.
 * @return Lookup table mapping 8-bit values to scaled values.
 */
function createScaleLut(bits: number): Uint8Array {
  const lut = new Uint8Array(256);
  if (bits === 0) return lut;
  const max = (1 << bits) - 1;
  for (let i = 0; i < 256; i++) {
    lut[i] = Math.min(255, Math.round((i * max) / 255));
  }
  return lut;
}
