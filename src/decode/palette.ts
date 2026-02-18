/**
 * @module
 * Extracts the color palette (color table) from indexed BMP images.
 *
 * Indexed BMP images (1, 2, 4, 8 bits per pixel) store pixel values as
 * indices into a palette of colors located between the DIB header and pixel data.
 */

import type { BmpHeader } from "../common.ts";

/** Flat palette with pre-split channel arrays for fast indexed lookup. */
export interface FlatPalette {
  /** Red channel values, one per palette entry. */
  red: Uint8Array;
  /** Green channel values, one per palette entry. */
  green: Uint8Array;
  /** Blue channel values, one per palette entry. */
  blue: Uint8Array;
  /** Whether all colors are grayscale (R = G = B). */
  isGrayscale: boolean;
}

/**
 * Reads the color palette from an indexed BMP image into flat typed arrays.
 *
 * @param bmp - Complete BMP file contents.
 * @param header - Parsed BMP header.
 * @returns Flat palette arrays sized to the maximum for the bit depth,
 *          with missing entries zeroed (black).
 */
export function extractPalette(bmp: Uint8Array, header: BmpHeader): FlatPalette {
  const { dataOffset, headerSize, bitsPerPixel, colorsUsed } = header;

  // Palette starts right after the 14-byte file header + DIB header
  const paletteOffset = 14 + headerSize;
  const paletteSize = dataOffset - paletteOffset;

  // Each entry is 3 bytes for CORE headers (size 12), 4 bytes otherwise
  const bytesPerEntry = headerSize === 12 ? 3 : 4;

  // Number of colors: use colorsUsed if specified, otherwise the maximum for this depth
  const maxColors = 1 << bitsPerPixel;
  const colorCount = Math.min(
    colorsUsed || maxColors,
    Math.floor(paletteSize / bytesPerEntry),
    maxColors,
  );

  // Read palette entries into flat arrays (stored in BGR order in the file)
  // Uint8Array is pre-zeroed, so unused entries are already black
  const red = new Uint8Array(maxColors);
  const green = new Uint8Array(maxColors);
  const blue = new Uint8Array(maxColors);
  let isGrayscale = true;

  for (let i = 0; i < colorCount; i++) {
    const offset = paletteOffset + i * bytesPerEntry;
    const r = bmp[offset + 2]; // R
    const g = bmp[offset + 1]; // G
    const b = bmp[offset]; // B
    red[i] = r;
    green[i] = g;
    blue[i] = b;
    if (isGrayscale && (r !== g || g !== b)) isGrayscale = false;
  }

  return { red, green, blue, isGrayscale };
}
