/**
 * Extracts the color palette (color table) from indexed BMP images.
 *
 * The table sits between the DIB header and the pixel data, and covers the depths 1, 2, 4 and 8.
 *
 * @module
 */

import { type BmpHeader, FILE_HEADER_SIZE } from "../common.ts";

/** A palette split into one array per channel. */
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
 * Reads the color palette of an indexed BMP image into flat typed arrays.
 *
 * @param bmp Complete BMP file contents.
 * @param header Parsed BMP header.
 *
 * @return Flat palette arrays sized to the maximum for the bit depth,
 *         with missing entries zeroed (black).
 */
export function extractPalette(bmp: Uint8Array, header: BmpHeader): FlatPalette {
  const { dataOffset, headerSize, bitsPerPixel, colorsUsed } = header;

  const paletteOffset = FILE_HEADER_SIZE + headerSize;
  const paletteSize = dataOffset - paletteOffset;

  // Each entry is 3 bytes for CORE headers (size 12), 4 bytes otherwise.
  const bytesPerEntry = headerSize === 12 ? 3 : 4;

  // `colorsUsed` of 0 means the depth's maximum; the space up to `dataOffset` can hold fewer entries than that.
  const maxColors = 1 << bitsPerPixel;
  const colorCount = Math.min(
    colorsUsed || maxColors,
    Math.floor(paletteSize / bytesPerEntry),
    maxColors,
  );

  // Palette entries are stored in BGR order.
  const channels = new Uint8Array(maxColors * 3);
  const red = channels.subarray(0, maxColors);
  const green = channels.subarray(maxColors, maxColors * 2);
  const blue = channels.subarray(maxColors * 2);
  let isGrayscale = true;

  for (let i = 0; i < colorCount; i++) {
    const offset = paletteOffset + i * bytesPerEntry;
    const r = bmp[offset + 2];
    const g = bmp[offset + 1];
    const b = bmp[offset];
    red[i] = r;
    green[i] = g;
    blue[i] = b;
    if (isGrayscale && (r !== g || g !== b)) isGrayscale = false;
  }

  return { red, green, blue, isGrayscale };
}
