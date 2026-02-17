/**
 * @module
 * Extracts the color palette (color table) from indexed BMP images.
 *
 * Indexed BMP images (1, 2, 4, 8 bits per pixel) store pixel values as
 * indices into a palette of colors located between the DIB header and pixel data.
 */

import type { BmpHeader, Color } from "../common.ts";

/**
 * Reads the color palette from an indexed BMP image.
 *
 * @param bmp - Complete BMP file contents.
 * @param header - Parsed BMP header.
 * @returns An array of colors, always sized to the maximum for the bit depth,
 *          with missing entries filled as black.
 */
export function extractPalette(bmp: Uint8Array, header: BmpHeader): Color[] {
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

  // Read palette entries (stored in BGR order in the file)
  const palette: Color[] = [];
  for (let i = 0; i < colorCount; i++) {
    const offset = paletteOffset + i * bytesPerEntry;
    palette.push({
      red: bmp[offset + 2],
      green: bmp[offset + 1],
      blue: bmp[offset],
    });
  }

  // Fill remaining slots with black so index lookups never go out of bounds
  while (palette.length < maxColors) {
    palette.push({ red: 0, green: 0, blue: 0 });
  }

  return palette;
}
