/**
 * Decodes BMP images with BI_BITFIELDS or BI_ALPHABITFIELDS compression.
 *
 * @module
 */

import {
  analyzeBitMask,
  BGRA8888_MASKS,
  type BmpHeader,
  calculateStride,
  getImageLayout,
  type RawImageData,
  RGB555_MASKS,
} from "../common.ts";

/**
 * Decodes a BI_BITFIELDS / BI_ALPHABITFIELDS BMP image to raw pixel data.
 *
 * @param bmp Complete BMP file contents.
 * @param header Parsed BMP header with bitfield masks.
 *
 * @return Decoded pixel data (RGB or RGBA depending on alpha mask presence).
 */
export function decodeBitfields(bmp: Uint8Array, header: BmpHeader): RawImageData {
  const { dataOffset, bitsPerPixel, width, height } = header;
  const { absWidth, absHeight, isTopDown } = getImageLayout(width, height);

  // With all three masks zero, the standard masks for the depth apply.
  let { redMask, greenMask, blueMask, alphaMask } = header;
  if (redMask === 0 && greenMask === 0 && blueMask === 0) {
    const standard = bitsPerPixel === 16 ? RGB555_MASKS : BGRA8888_MASKS;
    redMask = standard.redMask;
    greenMask = standard.greenMask;
    blueMask = standard.blueMask;
    alphaMask = standard.alphaMask ?? 0;
  }

  const red = analyzeBitMask(redMask);
  const green = analyzeBitMask(greenMask);
  const blue = analyzeBitMask(blueMask);
  const alpha = analyzeBitMask(alphaMask);

  const stride = calculateStride(absWidth, bitsPerPixel);
  const channels = alpha.bits > 0 ? 4 : 3;

  const output = new Uint8Array(absWidth * absHeight * channels);

  const redLut = createDecodeScaleLut(red.bits);
  const greenLut = createDecodeScaleLut(green.bits);
  const blueLut = createDecodeScaleLut(blue.bits);

  const view = new DataView(bmp.buffer, bmp.byteOffset, bmp.byteLength);

  // Four loops: one per combination of 16/32 bpp and alpha present or absent.
  if (bitsPerPixel === 16) {
    if (alpha.bits > 0) {
      const alphaLut = createDecodeScaleLut(alpha.bits);
      for (let y = 0; y < absHeight; y++) {
        const srcY = isTopDown ? y : absHeight - 1 - y;
        let srcOffset = dataOffset + srcY * stride;
        let dstOffset = y * absWidth * 4;
        for (let x = 0; x < absWidth; x++, srcOffset += 2) {
          const pixel = view.getUint16(srcOffset, true);
          output[dstOffset++] = redLut[(pixel & redMask) >>> red.shift];
          output[dstOffset++] = greenLut[(pixel & greenMask) >>> green.shift];
          output[dstOffset++] = blueLut[(pixel & blueMask) >>> blue.shift];
          output[dstOffset++] = alphaLut[(pixel & alphaMask) >>> alpha.shift];
        }
      }
    } else {
      for (let y = 0; y < absHeight; y++) {
        const srcY = isTopDown ? y : absHeight - 1 - y;
        let srcOffset = dataOffset + srcY * stride;
        let dstOffset = y * absWidth * 3;
        for (let x = 0; x < absWidth; x++, srcOffset += 2) {
          const pixel = view.getUint16(srcOffset, true);
          output[dstOffset++] = redLut[(pixel & redMask) >>> red.shift];
          output[dstOffset++] = greenLut[(pixel & greenMask) >>> green.shift];
          output[dstOffset++] = blueLut[(pixel & blueMask) >>> blue.shift];
        }
      }
    }
  } else {
    if (alpha.bits > 0) {
      const alphaLut = createDecodeScaleLut(alpha.bits);
      for (let y = 0; y < absHeight; y++) {
        const srcY = isTopDown ? y : absHeight - 1 - y;
        let srcOffset = dataOffset + srcY * stride;
        let dstOffset = y * absWidth * 4;
        for (let x = 0; x < absWidth; x++, srcOffset += 4) {
          const pixel = view.getUint32(srcOffset, true);
          output[dstOffset++] = redLut[(pixel & redMask) >>> red.shift];
          output[dstOffset++] = greenLut[(pixel & greenMask) >>> green.shift];
          output[dstOffset++] = blueLut[(pixel & blueMask) >>> blue.shift];
          output[dstOffset++] = alphaLut[(pixel & alphaMask) >>> alpha.shift];
        }
      }
    } else {
      for (let y = 0; y < absHeight; y++) {
        const srcY = isTopDown ? y : absHeight - 1 - y;
        let srcOffset = dataOffset + srcY * stride;
        let dstOffset = y * absWidth * 3;
        for (let x = 0; x < absWidth; x++, srcOffset += 4) {
          const pixel = view.getUint32(srcOffset, true);
          output[dstOffset++] = redLut[(pixel & redMask) >>> red.shift];
          output[dstOffset++] = greenLut[(pixel & greenMask) >>> green.shift];
          output[dstOffset++] = blueLut[(pixel & blueMask) >>> blue.shift];
        }
      }
    }
  }

  return { width: absWidth, height: absHeight, channels, data: output };
}

/**
 * Builds a lookup table that scales raw channel values to 0–255.
 *
 * @param bits Number of bits in the channel.
 *
 * @return Lookup table mapping raw values to 0–255.
 */
function createDecodeScaleLut(bits: number): Uint8Array {
  if (bits === 0) return new Uint8Array(1);
  const size = 1 << bits;
  const lut = new Uint8Array(size);
  const max = size - 1;
  for (let i = 0; i < size; i++) {
    lut[i] = Math.round((i * 255) / max);
  }
  return lut;
}
