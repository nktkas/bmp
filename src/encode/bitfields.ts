/**
 * Encodes BMP images with BI_BITFIELDS or BI_ALPHABITFIELDS compression.
 *
 * @module
 */

import { analyzeBitMask, type BitfieldMasks, calculateStride, type RawImageData } from "../common.ts";

/**
 * Encodes image data using custom bitfield masks.
 *
 * @param raw Source pixel data (RGB or RGBA).
 * @param bitsPerPixel Target bit depth, which decides whether a pixel is stored as a half word or a word.
 * @param masks Custom bit masks for each channel. A channel whose mask is `0` is left out of every pixel.
 * @param isTopDown If true, rows are stored top-down.
 *
 * @return Encoded pixel data with rows padded to 4-byte boundaries.
 */
export function encodeBitfields(
  raw: RawImageData,
  bitsPerPixel: 16 | 32,
  masks: BitfieldMasks,
  isTopDown: boolean,
): Uint8Array {
  const { width, height, data, channels } = raw;

  const redInfo = analyzeBitMask(masks.redMask);
  const greenInfo = analyzeBitMask(masks.greenMask);
  const blueInfo = analyzeBitMask(masks.blueMask);
  const alphaInfo = analyzeBitMask(masks.alphaMask ?? 0);

  const stride = calculateStride(width, bitsPerPixel);
  const result = new Uint8Array(stride * height);
  const view = new DataView(result.buffer);

  const redLut = createEncodeScaleLut(redInfo.bits);
  const greenLut = createEncodeScaleLut(greenInfo.bits);
  const blueLut = createEncodeScaleLut(blueInfo.bits);
  const alphaLut = masks.alphaMask ? createEncodeScaleLut(alphaInfo.bits) : null;

  for (let y = 0; y < height; y++) {
    const dstRow = isTopDown ? y : height - 1 - y;

    for (let x = 0; x < width; x++) {
      const srcOffset = (y * width + x) * channels;
      const dstOffset = dstRow * stride + x * (bitsPerPixel / 8);

      const r = data[srcOffset];
      const g = data[srcOffset + 1];
      const b = data[srcOffset + 2];
      const a = channels === 4 ? data[srcOffset + 3] : 255;

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
 * Builds a LUT that scales 8-bit values (0–255) up to a target channel bit depth.
 *
 * The element type widens with the channel depth so that values for channels wider
 * than 8 bits (e.g. 10-bit in RGBA1010102) are stored without truncation.
 *
 * @param bits Target channel bit depth.
 *
 * @return Lookup table mapping 8-bit values to scaled values in [0, 2^bits − 1].
 */
function createEncodeScaleLut(bits: number): Uint8Array | Uint16Array | Uint32Array {
  const lut = bits <= 8 ? new Uint8Array(256) : bits <= 16 ? new Uint16Array(256) : new Uint32Array(256);
  const max = 2 ** bits - 1;
  for (let i = 0; i < 256; i++) {
    lut[i] = Math.round((i * max) / 255);
  }
  return lut;
}
