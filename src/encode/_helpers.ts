import type { RawImageData } from "../_common.ts";

/**
 * Calculates the row stride (bytes per row) with padding for BMP format.
 * BMP rows must be aligned to 4-byte boundaries.
 * @param width - Image width in pixels
 * @param bitsPerPixel - Bits per pixel (1, 2, 4, 8, 16, 24, 32, 64)
 * @returns Row stride in bytes including padding
 */
export function calculateStride(width: number, bitsPerPixel: number): number {
  const bytesPerRow = Math.ceil((width * bitsPerPixel) / 8);
  return Math.ceil(bytesPerRow / 4) * 4; // Align to 4-byte boundary
}

/**
 * Converts Grayscale/RGB/RGBA data to RGB555 format with padding for 16-bit BMP.
 * @param raw - Raw image data (grayscale, RGB or RGBA format)
 * @param topDown - If true, rows will be stored top-down, otherwise bottom-up
 * @returns 16-bit pixel data with padding
 */
export function rawToRgb555(raw: RawImageData, topDown: boolean): Uint8Array {
  const { width, height, channels, data } = raw;

  if (channels !== 1 && channels !== 3 && channels !== 4) {
    throw new Error("rgbTo16Bit expects grayscale, RGB or RGBA data");
  }

  const stride = calculateStride(width, 16);
  const result = new Uint8Array(stride * height);
  const view = new DataView(result.buffer);

  // OPTIMIZATION: Separate loops for each combination to eliminate branching in hot path
  if (channels === 1) {
    // Grayscale: duplicate gray value to R, G, B
    for (let y = 0; y < height; y++) {
      const dstRow = topDown ? y : (height - 1 - y);
      let srcOffset = y * width;
      let dstOffset = dstRow * stride;

      for (let x = 0; x < width; x++, srcOffset++, dstOffset += 2) {
        const gray = data[srcOffset] >> 3;

        const pixel16 = (gray << 10) | (gray << 5) | gray;

        view.setUint16(dstOffset, pixel16, true);
      }
    }
  } else if (channels === 3) {
    // RGB
    for (let y = 0; y < height; y++) {
      const dstRow = topDown ? y : (height - 1 - y);
      let srcOffset = y * width * 3;
      let dstOffset = dstRow * stride;

      for (let x = 0; x < width; x++, srcOffset += 3, dstOffset += 2) {
        const r = data[srcOffset];
        const g = data[srcOffset + 1];
        const b = data[srcOffset + 2];

        const pixel16 = ((r >> 3) << 10) | ((g >> 3) << 5) | (b >> 3);

        view.setUint16(dstOffset, pixel16, true);
      }
    }
  } else {
    // RGBA
    for (let y = 0; y < height; y++) {
      const dstRow = topDown ? y : (height - 1 - y);
      let srcOffset = y * width * 4;
      let dstOffset = dstRow * stride;

      for (let x = 0; x < width; x++, srcOffset += 4, dstOffset += 2) {
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
 * Converts Grayscale/RGB/RGBA pixel data to BGR format with padding for 24-bit BMP.
 * @param raw - Raw image data (grayscale, RGB or RGBA format, channels=1, 3 or 4)
 * @param topDown - If true, rows will be stored top-down, otherwise bottom-up
 * @returns BGR data with padding
 */
export function rawToBgr(raw: RawImageData, topDown: boolean): Uint8Array {
  const { width, height, channels, data } = raw;

  if (channels !== 1 && channels !== 3 && channels !== 4) {
    throw new Error(`"rawToBgr" expects grayscale, RGB or RGBA data (channels=1, 3 or 4)`);
  }

  const stride = calculateStride(width, 24);
  const result = new Uint8Array(stride * height);

  // OPTIMIZATION: Separate loops for each combination to eliminate branching in hot path
  if (channels === 1) {
    // Grayscale: duplicate gray value to B, G, R
    for (let y = 0; y < height; y++) {
      const dstRow = topDown ? y : (height - 1 - y);
      let srcOffset = y * width;
      let dstOffset = dstRow * stride;

      for (let x = 0; x < width; x++, srcOffset++, dstOffset += 3) {
        const gray = data[srcOffset];
        result[dstOffset] = gray; // B
        result[dstOffset + 1] = gray; // G
        result[dstOffset + 2] = gray; // R
      }
    }
  } else if (channels === 3) {
    const rowWidth = width * 3;
    const hasPadding = stride !== rowWidth;

    // OPTIMIZATION: Fast path for topDown without padding - single loop with sequential memory access
    if (!hasPadding && topDown) {
      for (let i = 0, len = data.length; i < len; i += 3) {
        result[i] = data[i + 2]; // B
        result[i + 1] = data[i + 1]; // G
        result[i + 2] = data[i]; // R
      }
    } else {
      // RGB: swap R and B channels, with padding or bottom-up
      for (let y = 0; y < height; y++) {
        const dstRow = topDown ? y : (height - 1 - y);
        let srcOffset = y * width * 3;
        let dstOffset = dstRow * stride;

        for (let x = 0; x < width; x++, srcOffset += 3, dstOffset += 3) {
          result[dstOffset] = data[srcOffset + 2]; // B
          result[dstOffset + 1] = data[srcOffset + 1]; // G
          result[dstOffset + 2] = data[srcOffset]; // R
        }
      }
    }
  } else {
    // RGBA: swap R and B channels, ignore alpha
    for (let y = 0; y < height; y++) {
      const dstRow = topDown ? y : (height - 1 - y);
      let srcOffset = y * width * 4;
      let dstOffset = dstRow * stride;

      for (let x = 0; x < width; x++, srcOffset += 4, dstOffset += 3) {
        result[dstOffset] = data[srcOffset + 2]; // B
        result[dstOffset + 1] = data[srcOffset + 1]; // G
        result[dstOffset + 2] = data[srcOffset]; // R
      }
    }
  }

  return result;
}

/**
 * Converts Grayscale/RGB/RGBA pixel data to BGRA format with padding for 32-bit BMP.
 * @param raw - Raw image data (grayscale, RGB or RGBA format, channels=1, 3 or 4)
 * @param topDown - If true, rows will be stored top-down, otherwise bottom-up
 * @returns BGRA data with padding
 */
export function rawToBgra(raw: RawImageData, topDown: boolean): Uint8Array {
  const { width, height, channels, data } = raw;

  if (channels !== 1 && channels !== 3 && channels !== 4) {
    throw new Error("'rawToBgra' expects grayscale, RGB or RGBA data (channels=1, 3 or 4)");
  }

  const stride = calculateStride(width, 32);
  const result = new Uint8Array(stride * height);

  // OPTIMIZATION: Separate loops for each combination to eliminate branching in hot path
  if (channels === 1) {
    // Grayscale: duplicate gray value to B, G, R, add opaque alpha
    for (let y = 0; y < height; y++) {
      const dstRow = topDown ? y : (height - 1 - y);
      let srcOffset = y * width;
      let dstOffset = dstRow * stride;

      for (let x = 0; x < width; x++, srcOffset++, dstOffset += 4) {
        const gray = data[srcOffset];
        result[dstOffset] = gray; // B
        result[dstOffset + 1] = gray; // G
        result[dstOffset + 2] = gray; // R
        result[dstOffset + 3] = 255; // A
      }
    }
  } else if (channels === 3) {
    // RGB: swap R and B, add opaque alpha
    for (let y = 0; y < height; y++) {
      const dstRow = topDown ? y : (height - 1 - y);
      let srcOffset = y * width * 3;
      let dstOffset = dstRow * stride;

      for (let x = 0; x < width; x++, srcOffset += 3, dstOffset += 4) {
        result[dstOffset] = data[srcOffset + 2]; // B
        result[dstOffset + 1] = data[srcOffset + 1]; // G
        result[dstOffset + 2] = data[srcOffset]; // R
        result[dstOffset + 3] = 255; // A
      }
    }
  } else {
    // RGBA
    const rowWidth = width * 4;
    const hasPadding = stride !== rowWidth;

    // OPTIMIZATION: Fast path for topDown without padding - single loop with sequential memory access
    if (!hasPadding && topDown) {
      for (let i = 0, len = data.length; i < len; i += 4) {
        result[i] = data[i + 2]; // B
        result[i + 1] = data[i + 1]; // G
        result[i + 2] = data[i]; // R
        result[i + 3] = data[i + 3]; // A
      }
    } else {
      // RGBA: swap R and B, keep alpha
      for (let y = 0; y < height; y++) {
        const dstRow = topDown ? y : (height - 1 - y);
        let srcOffset = y * width * 4;
        let dstOffset = dstRow * stride;

        for (let x = 0; x < width; x++, srcOffset += 4, dstOffset += 4) {
          result[dstOffset] = data[srcOffset + 2]; // B
          result[dstOffset + 1] = data[srcOffset + 1]; // G
          result[dstOffset + 2] = data[srcOffset]; // R
          result[dstOffset + 3] = data[srcOffset + 3]; // A
        }
      }
    }
  }

  return result;
}

/**
 * Converts grayscale data to palette indices using direct calculation.
 * @param raw - Raw image data (grayscale format, channels=1)
 * @param numColors - Number of colors in palette (2, 16, or 256)
 * @returns Array of palette indices
 */
export function grayscaleToIndices(raw: RawImageData, numColors: 2 | 16 | 256): Uint8Array {
  if (raw.channels !== 1) {
    throw new Error("grayscaleToIndices expects grayscale data (channels=1)");
  }

  // OPTIMIZATION: For 256 colors, grayscale values (0-255) are already palette indices
  if (numColors === 256) {
    return raw.data.slice(); // Return a copy
  }

  // Calculate indices using formula
  const indices = new Uint8Array(raw.width * raw.height);
  const multiplier = (numColors - 1) / 255;

  for (let i = 0; i < indices.length; i++) {
    indices[i] = Math.round(raw.data[i] * multiplier);
  }

  return indices;
}

/**
 * Packs indexed pixel data into 1-bit, 4-bit, or 8-bit format with padding.
 * @param indices - Array of palette indices (0-1 for 1-bit, 0-15 for 4-bit, 0-255 for 8-bit)
 * @param width - Image width in pixels
 * @param height - Image height in pixels
 * @param bitsPerPixel - Bits per pixel (1, 4, or 8)
 * @param topDown - If true, rows are stored top-down, otherwise bottom-up
 * @returns Packed pixel data with padding
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

  if (bitsPerPixel === 8) {
    // 8-bit: one byte per pixel
    const hasPadding = stride !== width;

    // OPTIMIZATION: Fast path for topDown without padding - direct copy
    if (!hasPadding && topDown) {
      result.set(indices);
    } else {
      for (let y = 0; y < height; y++) {
        const dstRow = topDown ? y : (height - 1 - y);
        let srcOffset = y * width;
        let dstOffset = dstRow * stride;

        for (let x = 0; x < width; x++, srcOffset++, dstOffset++) {
          result[dstOffset] = indices[srcOffset];
        }
      }
    }
  } else if (bitsPerPixel === 4) {
    // 4-bit: two pixels per byte
    // OPTIMIZATION: Batch processing - pack 2 pixels at once
    for (let y = 0; y < height; y++) {
      const dstRow = topDown ? y : (height - 1 - y);
      let srcOffset = y * width;
      const dstOffset = dstRow * stride;

      // Process pairs of pixels
      const pairCount = Math.floor(width / 2);
      for (let pair = 0; pair < pairCount; pair++, srcOffset += 2) {
        const highNibble = (indices[srcOffset] & 0x0F) << 4;
        const lowNibble = indices[srcOffset + 1] & 0x0F;
        result[dstOffset + pair] = highNibble | lowNibble;
      }

      // Handle odd pixel if width is odd
      if (width % 2 === 1) {
        const byteIndex = dstOffset + pairCount;
        const pixelIndex = (indices[srcOffset] & 0x0F) << 4;
        result[byteIndex] = pixelIndex;
      }
    }
  } else if (bitsPerPixel === 1) {
    // 1-bit: eight pixels per byte
    // OPTIMIZATION: Batch processing - pack 8 pixels at once
    for (let y = 0; y < height; y++) {
      const dstRow = topDown ? y : (height - 1 - y);
      let srcOffset = y * width;
      const dstOffset = dstRow * stride;

      // Process groups of 8 pixels
      const byteCount = Math.floor(width / 8);
      for (let byteIdx = 0; byteIdx < byteCount; byteIdx++, srcOffset += 8) {
        let byte = 0;
        for (let bit = 0; bit < 8; bit++) {
          if (indices[srcOffset + bit] & 0x01) {
            byte |= 1 << (7 - bit);
          }
        }
        result[dstOffset + byteIdx] = byte;
      }

      // Handle remaining pixels
      const remainingPixels = width % 8;
      if (remainingPixels > 0) {
        let byte = 0;
        for (let bit = 0; bit < remainingPixels; bit++) {
          if (indices[srcOffset + bit] & 0x01) {
            byte |= 1 << (7 - bit);
          }
        }
        result[dstOffset + byteCount] = byte;
      }
    }
  }

  return result;
}
