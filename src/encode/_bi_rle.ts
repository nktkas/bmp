import type { RawImageData } from "../_common.ts";
import type { RGBQUAD } from "../decode/_colorTable.ts";
import { convertToIndexed, generateGrayscalePalette, generatePalette } from "./_colorQuantization.ts";

/** Result of RLE encoding */
export interface EncodedRleData {
  /** Encoded pixel data */
  pixelData: Uint8Array;
  /** Color palette */
  palette: RGBQUAD[];
}

/**
 * Encodes image data in BI_RLE8 format (8-bit RLE compression).
 * @param raw - Raw image data
 * @param palette - Optional 256-color palette
 * @returns Encoded data with palette
 */
export function encodeBiRle8(raw: RawImageData, palette?: RGBQUAD[]): EncodedRleData {
  // Generate or use provided palette
  let finalPalette: RGBQUAD[];

  if (palette && palette.length >= 256) {
    finalPalette = palette.slice(0, 256);
  } else if (raw.channels === 1) {
    finalPalette = generateGrayscalePalette(256);
  } else {
    finalPalette = generatePalette(raw, 256);
  }

  // Convert to indexed format
  const indices = convertToIndexed(raw, finalPalette);

  // Encode with RLE8
  const pixelData = encodeRle8Pixels(indices, raw.width, raw.height);

  return { pixelData, palette: finalPalette };
}

/**
 * Encodes image data in BI_RLE4 format (4-bit RLE compression).
 * @param raw - Raw image data
 * @param palette - Optional 16-color palette
 * @returns Encoded data with palette
 */
export function encodeBiRle4(raw: RawImageData, palette?: RGBQUAD[]): EncodedRleData {
  // Generate or use provided palette
  let finalPalette: RGBQUAD[];

  if (palette && palette.length >= 16) {
    finalPalette = palette.slice(0, 16);
  } else if (raw.channels === 1) {
    finalPalette = generateGrayscalePalette(16);
  } else {
    finalPalette = generatePalette(raw, 16);
  }

  // Convert to indexed format
  const indices = convertToIndexed(raw, finalPalette);

  // Encode with RLE4
  const pixelData = encodeRle4Pixels(indices, raw.width, raw.height);

  return { pixelData, palette: finalPalette };
}

/**
 * Encodes indexed pixel data using RLE8 compression.
 * @param indices - Array of palette indices (0-255)
 * @param width - Image width
 * @param height - Image height
 * @returns RLE8 compressed data
 */
function encodeRle8Pixels(indices: Uint8Array, width: number, height: number): Uint8Array {
  const output: number[] = [];

  // Process bottom-up (BMP default)
  for (let y = height - 1; y >= 0; y--) {
    let x = 0;
    const rowStart = y * width;

    while (x < width) {
      const currentValue = indices[rowStart + x];
      let runLength = 1;

      // Count consecutive pixels with same value (max 255)
      while (
        x + runLength < width &&
        indices[rowStart + x + runLength] === currentValue &&
        runLength < 255
      ) {
        runLength++;
      }

      // Use encoded mode if run length >= 3 (more efficient)
      if (runLength >= 3) {
        output.push(runLength, currentValue);
        x += runLength;
      } else {
        // Use absolute mode for non-repeating pixels
        let absoluteCount = 0;
        const absoluteStart = x;

        while (x < width && absoluteCount < 255) {
          const val = indices[rowStart + x];
          let nextRunLength = 1;

          // Check if next pixels form a run
          while (
            x + nextRunLength < width &&
            indices[rowStart + x + nextRunLength] === val &&
            nextRunLength < 3
          ) {
            nextRunLength++;
          }

          // If we find a run of 3+, stop absolute mode
          if (nextRunLength >= 3) {
            break;
          }

          x++;
          absoluteCount++;
        }

        // Write absolute mode escape sequence (only if count >= 3 to avoid conflict with escape codes)
        if (absoluteCount >= 3) {
          output.push(0x00, absoluteCount);
          for (let i = 0; i < absoluteCount; i++) {
            output.push(indices[rowStart + absoluteStart + i]);
          }
          // Word-align (pad to even byte count)
          if (absoluteCount % 2 === 1) {
            output.push(0x00);
          }
        } else {
          // For counts < 3, write as individual encoded runs to avoid escape code conflict
          for (let i = 0; i < absoluteCount; i++) {
            output.push(1, indices[rowStart + absoluteStart + i]);
          }
        }
      }
    }

    // End of line marker
    output.push(0x00, 0x00);
  }

  // End of bitmap marker
  output.push(0x00, 0x01);

  return new Uint8Array(output);
}

/**
 * Encodes indexed pixel data using RLE4 compression.
 * @param indices - Array of palette indices (0-15)
 * @param width - Image width
 * @param height - Image height
 * @returns RLE4 compressed data
 */
function encodeRle4Pixels(indices: Uint8Array, width: number, height: number): Uint8Array {
  const output: number[] = [];

  // Process bottom-up (BMP default)
  for (let y = height - 1; y >= 0; y--) {
    let x = 0;
    const rowStart = y * width;

    while (x < width) {
      const currentValue = indices[rowStart + x] & 0x0F;
      let runLength = 1;

      // Count consecutive pixels with same value (max 255)
      while (
        x + runLength < width &&
        (indices[rowStart + x + runLength] & 0x0F) === currentValue &&
        runLength < 255
      ) {
        runLength++;
      }

      // Use encoded mode if run length >= 3
      if (runLength >= 3) {
        // For RLE4, the value byte contains two nibbles
        const valueByte = (currentValue << 4) | currentValue;
        output.push(runLength, valueByte);
        x += runLength;
      } else {
        // Use absolute mode for non-repeating pixels
        let absoluteCount = 0;
        const absoluteStart = x;

        while (x < width && absoluteCount < 255) {
          const val = indices[rowStart + x] & 0x0F;
          let nextRunLength = 1;

          // Check if next pixels form a run
          while (
            x + nextRunLength < width &&
            (indices[rowStart + x + nextRunLength] & 0x0F) === val &&
            nextRunLength < 3
          ) {
            nextRunLength++;
          }

          // If we find a run of 3+, stop absolute mode
          if (nextRunLength >= 3) {
            break;
          }

          x++;
          absoluteCount++;
        }

        // Write absolute mode escape sequence (only if count >= 3 to avoid conflict with escape codes)
        if (absoluteCount >= 3) {
          output.push(0x00, absoluteCount);

          // Pack pixels (2 per byte)
          for (let i = 0; i < absoluteCount; i += 2) {
            const highNibble = indices[rowStart + absoluteStart + i] & 0x0F;
            const lowNibble = (i + 1 < absoluteCount) ? (indices[rowStart + absoluteStart + i + 1] & 0x0F) : 0;
            output.push((highNibble << 4) | lowNibble);
          }

          // Word-align (pad to even byte count)
          const byteCount = Math.ceil(absoluteCount / 2);
          if (byteCount % 2 === 1) {
            output.push(0x00);
          }
        } else {
          // For counts < 3, write as individual encoded runs to avoid escape code conflict
          for (let i = 0; i < absoluteCount; i++) {
            const val = indices[rowStart + absoluteStart + i] & 0x0F;
            const valueByte = (val << 4) | val;
            output.push(1, valueByte);
          }
        }
      }
    }

    // End of line marker
    output.push(0x00, 0x00);
  }

  // End of bitmap marker
  output.push(0x00, 0x01);

  return new Uint8Array(output);
}
