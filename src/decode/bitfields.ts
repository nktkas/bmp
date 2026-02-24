/**
 * Decodes BMP images with BI_BITFIELDS or BI_ALPHABITFIELDS compression.
 * @module
 */

import { analyzeBitMask, type BmpHeader, calculateStride, getImageLayout, type RawImageData } from "../common.ts";

/**
 * Decode a BI_BITFIELDS / BI_ALPHABITFIELDS BMP image to raw pixel data.
 *
 * @param bmp Complete BMP file contents.
 * @param header Parsed BMP header with bitfield masks.
 * @return Decoded pixel data (RGB or RGBA depending on alpha mask presence).
 */
export function decodeBitfields(bmp: Uint8Array, header: BmpHeader): RawImageData {
  const { dataOffset, bitsPerPixel, width, height } = header;
  const { absWidth, absHeight, isTopDown } = getImageLayout(width, height);

  // Resolve bit masks (use header masks, or fall back to defaults if all zero)
  let { redMask, greenMask, blueMask, alphaMask } = header;
  if (redMask === 0 && greenMask === 0 && blueMask === 0) {
    if (bitsPerPixel === 16) {
      redMask = 0x7C00; // R: bits 14–10
      greenMask = 0x03E0; // G: bits 9–5
      blueMask = 0x001F; // B: bits 4–0
    } else {
      redMask = 0x00FF0000; // R: bits 23–16
      greenMask = 0x0000FF00; // G: bits 15–8
      blueMask = 0x000000FF; // B: bits 7–0
      alphaMask = 0xFF000000; // A: bits 31–24
    }
  }

  // Analyze each mask to find where the channel bits are
  const red = analyzeBitMask(redMask);
  const green = analyzeBitMask(greenMask);
  const blue = analyzeBitMask(blueMask);
  const alpha = analyzeBitMask(alphaMask);

  const stride = calculateStride(absWidth, bitsPerPixel);
  const channels = alpha.bits > 0 ? 4 : 3;

  const output = new Uint8Array(absWidth * absHeight * channels);

  // Build LUTs: for each possible raw value, pre-compute the scaled 0–255 result
  const redLUT = createScalingLut(red.bits);
  const greenLUT = createScalingLut(green.bits);
  const blueLUT = createScalingLut(blue.bits);

  // Specialized loops: hoist bitsPerPixel and alpha checks outside the hot pixel loop
  if (bitsPerPixel === 16) {
    const view = new DataView(bmp.buffer, bmp.byteOffset, bmp.byteLength);
    if (alpha.bits > 0) {
      const alphaLUT = createScalingLut(alpha.bits);
      for (let y = 0; y < absHeight; y++) {
        const srcY = isTopDown ? y : absHeight - 1 - y;
        let srcOffset = dataOffset + srcY * stride;
        let dstOffset = y * absWidth * 4;
        for (let x = 0; x < absWidth; x++, srcOffset += 2) {
          const pixel = view.getUint16(srcOffset, true);
          output[dstOffset++] = redLUT[(pixel & redMask) >>> red.shift]; // R
          output[dstOffset++] = greenLUT[(pixel & greenMask) >>> green.shift]; // G
          output[dstOffset++] = blueLUT[(pixel & blueMask) >>> blue.shift]; // B
          output[dstOffset++] = alphaLUT[(pixel & alphaMask) >>> alpha.shift]; // A
        }
      }
    } else {
      for (let y = 0; y < absHeight; y++) {
        const srcY = isTopDown ? y : absHeight - 1 - y;
        let srcOffset = dataOffset + srcY * stride;
        let dstOffset = y * absWidth * 3;
        for (let x = 0; x < absWidth; x++, srcOffset += 2) {
          const pixel = view.getUint16(srcOffset, true);
          output[dstOffset++] = redLUT[(pixel & redMask) >>> red.shift]; // R
          output[dstOffset++] = greenLUT[(pixel & greenMask) >>> green.shift]; // G
          output[dstOffset++] = blueLUT[(pixel & blueMask) >>> blue.shift]; // B
        }
      }
    }
  } else {
    const view = new DataView(bmp.buffer, bmp.byteOffset, bmp.byteLength);
    if (alpha.bits > 0) {
      const alphaLUT = createScalingLut(alpha.bits);
      for (let y = 0; y < absHeight; y++) {
        const srcY = isTopDown ? y : absHeight - 1 - y;
        let srcOffset = dataOffset + srcY * stride;
        let dstOffset = y * absWidth * 4;
        for (let x = 0; x < absWidth; x++, srcOffset += 4) {
          const pixel = view.getUint32(srcOffset, true);
          output[dstOffset++] = redLUT[(pixel & redMask) >>> red.shift]; // R
          output[dstOffset++] = greenLUT[(pixel & greenMask) >>> green.shift]; // G
          output[dstOffset++] = blueLUT[(pixel & blueMask) >>> blue.shift]; // B
          output[dstOffset++] = alphaLUT[(pixel & alphaMask) >>> alpha.shift]; // A
        }
      }
    } else {
      for (let y = 0; y < absHeight; y++) {
        const srcY = isTopDown ? y : absHeight - 1 - y;
        let srcOffset = dataOffset + srcY * stride;
        let dstOffset = y * absWidth * 3;
        for (let x = 0; x < absWidth; x++, srcOffset += 4) {
          const pixel = view.getUint32(srcOffset, true);
          output[dstOffset++] = redLUT[(pixel & redMask) >>> red.shift]; // R
          output[dstOffset++] = greenLUT[(pixel & greenMask) >>> green.shift]; // G
          output[dstOffset++] = blueLUT[(pixel & blueMask) >>> blue.shift]; // B
        }
      }
    }
  }

  return { width: absWidth, height: absHeight, channels, data: output };
}

/**
 * Create a lookup table that scales raw channel values to 0–255.
 *
 * @param bits Number of bits in the channel.
 * @return Lookup table mapping raw values to 0–255.
 */
function createScalingLut(bits: number): Uint8Array {
  if (bits === 0) return new Uint8Array(1);
  const size = 1 << bits;
  const lut = new Uint8Array(size);
  const max = size - 1;
  for (let i = 0; i < size; i++) {
    lut[i] = Math.min(255, Math.round((i * 255) / max));
  }
  return lut;
}
