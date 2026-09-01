/**
 * Pixel format conversion utilities for BMP encoding.
 *
 * BMP stores pixels in BGR/BGRA order (blue first), while our internal
 * format uses RGB/RGBA. These functions handle the conversion and also
 * pack indexed pixel data into 1/4/8-bit formats with row padding.
 *
 * @module
 */

import { calculateStride, type RawImageData } from "../common.ts";

/** Layout options for packing indexed pixels. */
interface PackIndexedOptions {
  /** Image width in pixels. */
  width: number;
  /** Image height in pixels. */
  height: number;
  /** Bits per pixel: 1, 4, or 8. */
  bitsPerPixel: 1 | 4 | 8;
  /** If true, rows are stored top-down. */
  isTopDown: boolean;
}

/**
 * Convert raw pixel data to RGB555 format (16-bit, 5 bits per channel).
 *
 * @param raw Source pixel data.
 * @param isTopDown If true, rows are stored top-down.
 * @return Encoded pixel data with rows padded to 4-byte boundaries.
 */
export function rawToRgb555(raw: RawImageData, isTopDown: boolean): Uint8Array {
  const { width, height, channels, data } = raw;
  const stride = calculateStride(width, 16);
  const result = new Uint8Array(stride * height);
  const view = new DataView(result.buffer);

  for (let y = 0; y < height; y++) {
    const dstRow = isTopDown ? y : height - 1 - y;
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
 * Convert raw pixel data to BGR format (24-bit BMP).
 *
 * @param raw Source pixel data.
 * @param isTopDown If true, rows are stored top-down.
 * @return Encoded pixel data with rows padded to 4-byte boundaries.
 */
export function rawToBgr(raw: RawImageData, isTopDown: boolean): Uint8Array {
  const { width, height, channels, data } = raw;
  const stride = calculateStride(width, 24);
  const result = new Uint8Array(stride * height);

  for (let y = 0; y < height; y++) {
    const dstRow = isTopDown ? y : height - 1 - y;
    let srcOffset = y * width * channels;
    let dstOffset = dstRow * stride;

    if (channels === 1) {
      for (let x = 0; x < width; x++, srcOffset++, dstOffset += 3) {
        const g = data[srcOffset];
        result[dstOffset] = g; // B
        result[dstOffset + 1] = g; // G
        result[dstOffset + 2] = g; // R
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
 * Convert raw pixel data to BGRA format (32-bit BMP).
 *
 * @param raw Source pixel data.
 * @param isTopDown If true, rows are stored top-down.
 * @return Encoded pixel data with rows padded to 4-byte boundaries.
 */
export function rawToBgra(raw: RawImageData, isTopDown: boolean): Uint8Array {
  const { width, height, channels, data } = raw;
  const stride = calculateStride(width, 32);
  const result = new Uint8Array(stride * height);

  // A whole pixel is one 32-bit store, packed A R G B so a little-endian write lands as B G R A.
  // A Uint32Array would follow the host byte order instead, and BMP is little-endian whatever the host is.
  const view = new DataView(result.buffer);

  for (let y = 0; y < height; y++) {
    const dstRow = isTopDown ? y : height - 1 - y;
    let srcOffset = y * width * channels;
    let dstOffset = dstRow * stride;

    if (channels === 1) {
      for (let x = 0; x < width; x++, srcOffset++, dstOffset += 4) {
        const g = data[srcOffset];
        view.setUint32(dstOffset, ((255 << 24) | (g << 16) | (g << 8) | g) >>> 0, true);
      }
    } else if (channels === 3) {
      for (let x = 0; x < width; x++, srcOffset += 3, dstOffset += 4) {
        const pixel = (255 << 24) | (data[srcOffset] << 16) | (data[srcOffset + 1] << 8) |
          data[srcOffset + 2];
        view.setUint32(dstOffset, pixel >>> 0, true);
      }
    } else {
      for (let x = 0; x < width; x++, srcOffset += 4, dstOffset += 4) {
        const pixel = (data[srcOffset + 3] << 24) | (data[srcOffset] << 16) |
          (data[srcOffset + 1] << 8) | data[srcOffset + 2];
        view.setUint32(dstOffset, pixel >>> 0, true);
      }
    }
  }

  return result;
}

/**
 * Convert grayscale pixel values to palette indices.
 *
 * @param raw Source grayscale pixel data (channels must be 1).
 * @param numColors Target palette size (2, 16, or 256).
 * @return Array of palette indices. At 256 colors a grayscale value already is its own index,
 *         so this is `raw.data` itself and the caller must only read it.
 *
 * @throws {Error} If the input is not grayscale.
 */
export function grayscaleToIndices(raw: RawImageData, numColors: 2 | 16 | 256): Uint8Array {
  if (raw.channels !== 1) {
    throw new Error("Expected grayscale data (channels=1)");
  }

  // For 256 colors, grayscale values are already palette indices
  if (numColors === 256) return raw.data;

  // Rounding through a table: `Math.round` compiles to a data-dependent branch,
  // and pixel data is unpredictable by nature, so calling it per pixel mispredicts on nearly every pixel.
  const multiplier = (numColors - 1) / 255;
  const rounded = new Uint8Array(256);
  for (let value = 0; value < 256; value++) {
    rounded[value] = Math.round(value * multiplier);
  }

  const source = raw.data;
  const indices = new Uint8Array(raw.width * raw.height);
  for (let i = 0; i < indices.length; i++) {
    indices[i] = rounded[source[i]];
  }

  return indices;
}

/**
 * Pack palette index data into 1-bit, 4-bit, or 8-bit format with row padding.
 *
 * @param indices Array of palette indices.
 * @param options Layout options (dimensions, bit depth, row order).
 * @return Packed pixel data with rows padded to 4-byte boundaries.
 */
export function packIndexedPixels(indices: Uint8Array, options: PackIndexedOptions): Uint8Array {
  const { width, height, bitsPerPixel, isTopDown } = options;

  const stride = calculateStride(width, bitsPerPixel);
  const result = new Uint8Array(stride * height);

  for (let y = 0; y < height; y++) {
    const dstRow = isTopDown ? y : height - 1 - y;
    const srcRowStart = y * width;
    const dstRowStart = dstRow * stride;

    if (bitsPerPixel === 8) {
      result.set(indices.subarray(srcRowStart, srcRowStart + width), dstRowStart);
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
        result[dstRowStart + b] = ((indices[srcOffset] & 0x01) << 7) |
          ((indices[srcOffset + 1] & 0x01) << 6) | ((indices[srcOffset + 2] & 0x01) << 5) |
          ((indices[srcOffset + 3] & 0x01) << 4) | ((indices[srcOffset + 4] & 0x01) << 3) |
          ((indices[srcOffset + 5] & 0x01) << 2) | ((indices[srcOffset + 6] & 0x01) << 1) |
          (indices[srcOffset + 7] & 0x01);
      }
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
