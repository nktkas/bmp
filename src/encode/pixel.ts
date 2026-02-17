/**
 * @module
 * Pixel format conversion utilities for BMP encoding.
 *
 * BMP stores pixels in BGR/BGRA order (blue first), while our internal
 * format uses RGB/RGBA. These functions handle the conversion and also
 * pack indexed pixel data into 1/4/8-bit formats with row padding.
 */

import type { RawImageData } from "../common.ts";
import { calculateStride } from "../common.ts";

/**
 * Reads one RGB pixel from raw image data, regardless of the source format.
 *
 * @param data - Pixel data buffer.
 * @param offset - Byte offset to the pixel.
 * @param channels - Number of channels (1, 3, or 4).
 * @returns RGB tuple [r, g, b]. Grayscale is expanded; alpha is ignored.
 */
export function readPixelRgb(
  data: Uint8Array,
  offset: number,
  channels: number,
): [number, number, number] {
  if (channels === 1) {
    const g = data[offset];
    return [g, g, g];
  }
  return [data[offset], data[offset + 1], data[offset + 2]];
}

/**
 * Converts raw pixel data to RGB555 format (16-bit, 5 bits per channel).
 *
 * @param raw - Source pixel data.
 * @param topDown - If true, rows are stored top-down.
 * @returns Encoded pixel data with rows padded to 4-byte boundaries.
 */
export function rawToRgb555(raw: RawImageData, topDown: boolean): Uint8Array {
  const { width, height, channels, data } = raw;
  const stride = calculateStride(width, 16);
  const result = new Uint8Array(stride * height);
  const view = new DataView(result.buffer);

  for (let y = 0; y < height; y++) {
    const dstRow = topDown ? y : height - 1 - y;
    let srcOffset = y * width * channels;
    let dstOffset = dstRow * stride;

    if (channels === 1) {
      for (let x = 0; x < width; x++, srcOffset++, dstOffset += 2) {
        const g = data[srcOffset];
        const pixel16 = ((g >> 3) << 10) | ((g >> 3) << 5) | (g >> 3);
        view.setUint16(dstOffset, pixel16, true);
      }
    } else {
      for (let x = 0; x < width; x++, srcOffset += channels, dstOffset += 2) {
        const r = data[srcOffset];
        const g = data[srcOffset + 1];
        const b = data[srcOffset + 2];
        const pixel16 = ((r >> 3) << 10) | ((g >> 3) << 5) | (b >> 3);
        view.setUint16(dstOffset, pixel16, true);
      }
    }
  }

  return result;
}

/**
 * Converts raw pixel data to BGR format (24-bit BMP).
 *
 * @param raw - Source pixel data.
 * @param topDown - If true, rows are stored top-down.
 * @returns Encoded pixel data with rows padded to 4-byte boundaries.
 */
export function rawToBgr(raw: RawImageData, topDown: boolean): Uint8Array {
  const { width, height, channels, data } = raw;
  const stride = calculateStride(width, 24);
  const result = new Uint8Array(stride * height);

  for (let y = 0; y < height; y++) {
    const dstRow = topDown ? y : height - 1 - y;
    let srcOffset = y * width * channels;
    let dstOffset = dstRow * stride;

    if (channels === 1) {
      for (let x = 0; x < width; x++, srcOffset++, dstOffset += 3) {
        const g = data[srcOffset];
        result[dstOffset] = g;
        result[dstOffset + 1] = g;
        result[dstOffset + 2] = g;
      }
    } else {
      for (let x = 0; x < width; x++, srcOffset += channels, dstOffset += 3) {
        result[dstOffset] = data[srcOffset + 2]; // B
        result[dstOffset + 1] = data[srcOffset + 1]; // G
        result[dstOffset + 2] = data[srcOffset]; // R
      }
    }
  }

  return result;
}

/**
 * Converts raw pixel data to BGRA format (32-bit BMP).
 *
 * @param raw - Source pixel data.
 * @param topDown - If true, rows are stored top-down.
 * @returns Encoded pixel data with rows padded to 4-byte boundaries.
 */
export function rawToBgra(raw: RawImageData, topDown: boolean): Uint8Array {
  const { width, height, channels, data } = raw;
  const stride = calculateStride(width, 32);
  const result = new Uint8Array(stride * height);

  for (let y = 0; y < height; y++) {
    const dstRow = topDown ? y : height - 1 - y;
    let srcOffset = y * width * channels;
    let dstOffset = dstRow * stride;

    if (channels === 1) {
      for (let x = 0; x < width; x++, srcOffset++, dstOffset += 4) {
        const g = data[srcOffset];
        result[dstOffset] = g;
        result[dstOffset + 1] = g;
        result[dstOffset + 2] = g;
        result[dstOffset + 3] = 255;
      }
    } else if (channels === 3) {
      for (let x = 0; x < width; x++, srcOffset += 3, dstOffset += 4) {
        result[dstOffset] = data[srcOffset + 2]; // B
        result[dstOffset + 1] = data[srcOffset + 1]; // G
        result[dstOffset + 2] = data[srcOffset]; // R
        result[dstOffset + 3] = 255;
      }
    } else {
      for (let x = 0; x < width; x++, srcOffset += 4, dstOffset += 4) {
        result[dstOffset] = data[srcOffset + 2]; // B
        result[dstOffset + 1] = data[srcOffset + 1]; // G
        result[dstOffset + 2] = data[srcOffset]; // R
        result[dstOffset + 3] = data[srcOffset + 3]; // A
      }
    }
  }

  return result;
}

/**
 * Converts grayscale pixel values to palette indices.
 *
 * @param raw - Source grayscale pixel data (channels must be 1).
 * @param numColors - Target palette size (2, 16, or 256).
 * @returns Array of palette indices.
 * @throws {Error} If the input is not grayscale.
 */
export function grayscaleToIndices(raw: RawImageData, numColors: 2 | 16 | 256): Uint8Array {
  if (raw.channels !== 1) {
    throw new Error("grayscaleToIndices expects grayscale data (channels=1)");
  }

  // For 256 colors, grayscale values are already palette indices
  if (numColors === 256) return raw.data.slice();

  const indices = new Uint8Array(raw.width * raw.height);
  const multiplier = (numColors - 1) / 255;

  for (let i = 0; i < indices.length; i++) {
    indices[i] = Math.round(raw.data[i] * multiplier);
  }

  return indices;
}

/**
 * Packs palette index data into 1-bit, 4-bit, or 8-bit format with row padding.
 *
 * @param indices - Array of palette indices.
 * @param width - Image width in pixels.
 * @param height - Image height in pixels.
 * @param bitsPerPixel - 1, 4, or 8.
 * @param topDown - If true, rows are stored top-down.
 * @returns Packed pixel data with rows padded to 4-byte boundaries.
 */
export function packIndexedPixels(
  indices: Uint8Array,
  width: number,
  height: number,
  bitsPerPixel: 1 | 4 | 8,
  topDown: boolean,
): Uint8Array {
  const stride = calculateStride(width, bitsPerPixel);
  const result = new Uint8Array(stride * height);

  for (let y = 0; y < height; y++) {
    const dstRow = topDown ? y : height - 1 - y;
    const srcRowStart = y * width;
    const dstRowStart = dstRow * stride;

    if (bitsPerPixel === 8) {
      for (let x = 0; x < width; x++) {
        result[dstRowStart + x] = indices[srcRowStart + x];
      }
    } else if (bitsPerPixel === 4) {
      // Pack two pixels per byte (high nibble first)
      const pairs = Math.floor(width / 2);
      for (let p = 0; p < pairs; p++) {
        const srcOffset = srcRowStart + p * 2;
        result[dstRowStart + p] = ((indices[srcOffset] & 0x0F) << 4) | (indices[srcOffset + 1] & 0x0F);
      }
      if (width % 2 === 1) {
        result[dstRowStart + pairs] = (indices[srcRowStart + width - 1] & 0x0F) << 4;
      }
    } else {
      // 1-bit: pack eight pixels per byte (MSB first)
      const fullBytes = Math.floor(width / 8);
      for (let b = 0; b < fullBytes; b++) {
        const srcOffset = srcRowStart + b * 8;
        let byte = 0;
        for (let bit = 0; bit < 8; bit++) {
          if (indices[srcOffset + bit] & 0x01) {
            byte |= 1 << (7 - bit);
          }
        }
        result[dstRowStart + b] = byte;
      }
      // Handle remaining pixels
      const remaining = width % 8;
      if (remaining > 0) {
        const srcOffset = srcRowStart + fullBytes * 8;
        let byte = 0;
        for (let bit = 0; bit < remaining; bit++) {
          if (indices[srcOffset + bit] & 0x01) {
            byte |= 1 << (7 - bit);
          }
        }
        result[dstRowStart + fullBytes] = byte;
      }
    }
  }

  return result;
}
