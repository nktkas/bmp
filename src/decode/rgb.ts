/**
 * @module
 * Decodes BI_RGB (uncompressed) BMP images across all bit depths.
 *
 * BI_RGB is the most common BMP compression type (compression = 0).
 * Indexed formats (1/2/4/8-bit) use a color palette; direct formats
 * (16/24/32/64-bit) encode colors directly in the pixel data.
 */

import { type BmpHeader, calculateStride, getImageLayout, isPaletteGrayscale, type RawImageData } from "../common.ts";
import { extractPalette } from "./palette.ts";

/**
 * Decodes a BI_RGB BMP image to raw pixel data.
 *
 * @param bmp - Complete BMP file contents.
 * @param header - Parsed BMP header.
 * @returns Decoded pixel data.
 * @throws {Error} If the bit depth is unsupported.
 */
export function decodeRgb(bmp: Uint8Array, header: BmpHeader): RawImageData {
  switch (header.bitsPerPixel) {
    case 1:
    case 2:
    case 4:
    case 8:
      return decodeIndexed(bmp, header);
    case 16:
      return decode16Bit(bmp, header);
    case 24:
      return decode24Bit(bmp, header);
    case 32:
      return decode32Bit(bmp, header);
    case 64:
      return decode64Bit(bmp, header);
    default:
      throw new Error(`Unsupported BMP bit depth: ${header.bitsPerPixel} bpp`);
  }
}

/** Decodes indexed (palette-based) pixel data for all bit depths: 1, 2, 4, 8. */
function decodeIndexed(bmp: Uint8Array, header: BmpHeader): RawImageData {
  const { dataOffset, bitsPerPixel, width, height } = header;
  const { absWidth, absHeight, isTopDown } = getImageLayout(width, height);
  const stride = calculateStride(absWidth, bitsPerPixel);
  const palette = extractPalette(bmp, header);

  const channels = isPaletteGrayscale(palette) ? 1 : 3;
  const output = new Uint8Array(absWidth * absHeight * channels);

  // Flatten palette into typed arrays for fast indexed access
  const palR = new Uint8Array(palette.length);
  const palG = new Uint8Array(palette.length);
  const palB = new Uint8Array(palette.length);
  for (let i = 0; i < palette.length; i++) {
    palR[i] = palette[i].red;
    palG[i] = palette[i].green;
    palB[i] = palette[i].blue;
  }

  if (bitsPerPixel === 8) {
    // 8-bit: one index per byte, no bit unpacking needed
    for (let y = 0; y < absHeight; y++) {
      const srcY = isTopDown ? y : absHeight - 1 - y;
      const srcRowStart = dataOffset + srcY * stride;
      let dstOffset = y * absWidth * channels;
      if (channels === 1) {
        for (let x = 0; x < absWidth; x++) {
          output[dstOffset++] = palR[bmp[srcRowStart + x]];
        }
      } else {
        for (let x = 0; x < absWidth; x++) {
          const idx = bmp[srcRowStart + x];
          output[dstOffset++] = palR[idx];
          output[dstOffset++] = palG[idx];
          output[dstOffset++] = palB[idx];
        }
      }
    }
  } else {
    // 1/2/4-bit: generic bit unpacking
    const pixelsPerByte = 8 / bitsPerPixel;
    const indexMask = (1 << bitsPerPixel) - 1;

    for (let y = 0; y < absHeight; y++) {
      const srcY = isTopDown ? y : absHeight - 1 - y;
      const srcRowStart = dataOffset + srcY * stride;
      let dstOffset = y * absWidth * channels;
      let byteIndex = 0;

      for (let x = 0; x < absWidth;) {
        const byte = bmp[srcRowStart + byteIndex++];
        const pixelsInThisByte = Math.min(pixelsPerByte, absWidth - x);
        for (let p = 0; p < pixelsInThisByte; p++, x++) {
          const shift = (pixelsPerByte - 1 - p) * bitsPerPixel;
          const idx = (byte >> shift) & indexMask;
          if (channels === 1) {
            output[dstOffset++] = palR[idx];
          } else {
            output[dstOffset++] = palR[idx];
            output[dstOffset++] = palG[idx];
            output[dstOffset++] = palB[idx];
          }
        }
      }
    }
  }

  return { width: absWidth, height: absHeight, channels, data: output };
}

/** Lookup table for converting 5-bit values (0–31) to 8-bit (0–255). */
const RGB555_TO_RGB888 = new Uint8Array(32);
for (let i = 0; i < 32; i++) RGB555_TO_RGB888[i] = Math.round((i * 255) / 31);

/** Decodes 16-bit BI_RGB pixels (RGB555 format, 5 bits per channel). */
function decode16Bit(bmp: Uint8Array, header: BmpHeader): RawImageData {
  const { dataOffset, bitsPerPixel, width, height } = header;
  const { absWidth, absHeight, isTopDown } = getImageLayout(width, height);
  const stride = calculateStride(absWidth, bitsPerPixel);
  const output = new Uint8Array(absWidth * absHeight * 3);

  for (let y = 0; y < absHeight; y++) {
    const srcY = isTopDown ? y : absHeight - 1 - y;
    let srcOffset = dataOffset + srcY * stride;
    let dstOffset = y * absWidth * 3;

    for (let x = 0; x < absWidth; x++, srcOffset += 2) {
      const pixel = bmp[srcOffset] | (bmp[srcOffset + 1] << 8);
      output[dstOffset++] = RGB555_TO_RGB888[(pixel >> 10) & 31]; // R
      output[dstOffset++] = RGB555_TO_RGB888[(pixel >> 5) & 31]; // G
      output[dstOffset++] = RGB555_TO_RGB888[pixel & 31]; // B
    }
  }

  return { width: absWidth, height: absHeight, channels: 3, data: output };
}

/** Decodes 24-bit BI_RGB pixels (BGR → RGB). */
function decode24Bit(bmp: Uint8Array, header: BmpHeader): RawImageData {
  const { dataOffset, bitsPerPixel, width, height } = header;
  const { absWidth, absHeight, isTopDown } = getImageLayout(width, height);
  const stride = calculateStride(absWidth, bitsPerPixel);
  const output = new Uint8Array(absWidth * absHeight * 3);

  for (let y = 0; y < absHeight; y++) {
    const srcY = isTopDown ? y : absHeight - 1 - y;
    let srcOffset = dataOffset + srcY * stride;
    let dstOffset = y * absWidth * 3;

    for (let x = 0; x < absWidth; x++, srcOffset += 3) {
      output[dstOffset++] = bmp[srcOffset + 2]; // R
      output[dstOffset++] = bmp[srcOffset + 1]; // G
      output[dstOffset++] = bmp[srcOffset]; // B
    }
  }

  return { width: absWidth, height: absHeight, channels: 3, data: output };
}

/** Decodes 32-bit BI_RGB pixels (BGRA → RGB or RGBA, auto-detecting alpha). */
function decode32Bit(bmp: Uint8Array, header: BmpHeader): RawImageData {
  const { dataOffset, bitsPerPixel, width, height } = header;
  const { absWidth, absHeight, isTopDown } = getImageLayout(width, height);
  const stride = calculateStride(absWidth, bitsPerPixel);

  // Scan alpha bytes to decide whether to output RGB or RGBA
  let hasAlpha = false;
  for (let y = 0; y < absHeight && !hasAlpha; y++) {
    const srcY = isTopDown ? y : absHeight - 1 - y;
    let srcOffset = dataOffset + srcY * stride + 3;
    for (let x = 0; x < absWidth; x++, srcOffset += 4) {
      if (bmp[srcOffset] !== 0) {
        hasAlpha = true;
        break;
      }
    }
  }

  const channels = hasAlpha ? 4 : 3;
  const output = new Uint8Array(absWidth * absHeight * channels);

  for (let y = 0; y < absHeight; y++) {
    const srcY = isTopDown ? y : absHeight - 1 - y;
    let srcOffset = dataOffset + srcY * stride;
    let dstOffset = y * absWidth * channels;

    for (let x = 0; x < absWidth; x++, srcOffset += 4) {
      output[dstOffset++] = bmp[srcOffset + 2]; // R
      output[dstOffset++] = bmp[srcOffset + 1]; // G
      output[dstOffset++] = bmp[srcOffset]; // B
      if (hasAlpha) output[dstOffset++] = bmp[srcOffset + 3]; // A
    }
  }

  return { width: absWidth, height: absHeight, channels, data: output };
}

/** Decodes 64-bit BI_RGB pixels (s2.13 fixed-point BGRA → sRGB RGBA). */
function decode64Bit(bmp: Uint8Array, header: BmpHeader): RawImageData {
  const { dataOffset, bitsPerPixel, width, height } = header;
  const { absWidth, absHeight, isTopDown } = getImageLayout(width, height);
  const stride = calculateStride(absWidth, bitsPerPixel);
  const output = new Uint8Array(absWidth * absHeight * 4);

  for (let y = 0; y < absHeight; y++) {
    const srcY = isTopDown ? y : absHeight - 1 - y;
    let srcOffset = dataOffset + srcY * stride;
    let dstOffset = y * absWidth * 4;

    for (let x = 0; x < absWidth; x++, srcOffset += 8) {
      // Read 16-bit little-endian values (stored as BGRA)
      const b = bmp[srcOffset] | (bmp[srcOffset + 1] << 8);
      const g = bmp[srcOffset + 2] | (bmp[srcOffset + 3] << 8);
      const r = bmp[srcOffset + 4] | (bmp[srcOffset + 5] << 8);
      const a = bmp[srcOffset + 6] | (bmp[srcOffset + 7] << 8);

      // Sign-extend from 16-bit, then convert from s2.13 to float
      const rf = ((r & 0x8000) ? (r | 0xFFFF0000) : r) / 0x2000;
      const gf = ((g & 0x8000) ? (g | 0xFFFF0000) : g) / 0x2000;
      const bf = ((b & 0x8000) ? (b | 0xFFFF0000) : b) / 0x2000;
      const af = ((a & 0x8000) ? (a | 0xFFFF0000) : a) / 0x2000;

      // Clamp to [0, 1], apply sRGB gamma to RGB (alpha stays linear)
      output[dstOffset++] = Math.round(linearToSrgb(Math.max(0, Math.min(1, rf))) * 255);
      output[dstOffset++] = Math.round(linearToSrgb(Math.max(0, Math.min(1, gf))) * 255);
      output[dstOffset++] = Math.round(linearToSrgb(Math.max(0, Math.min(1, bf))) * 255);
      output[dstOffset++] = Math.round(Math.max(0, Math.min(1, af)) * 255);
    }
  }

  return { width: absWidth, height: absHeight, channels: 4, data: output };
}

/** Converts a linear-light color component to sRGB gamma-corrected value. */
function linearToSrgb(c: number): number {
  return c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - 0.055;
}
