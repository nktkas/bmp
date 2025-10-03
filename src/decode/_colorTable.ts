import { type BMPHeader, getNormalizedHeaderInfo } from "./_bmpHeader.ts";

/** Color palette entry for indexed color BMP images */
export interface RGBQUAD {
  /** Blue channel intensity (0-255) */
  rgbBlue: number;
  /** Green channel intensity (0-255) */
  rgbGreen: number;
  /** Red channel intensity (0-255) */
  rgbRed: number;
  /** Reserved field, typically 0 (used for alpha in some variants) */
  rgbReserved: number;
}

/**
 * Extracts color palette from BMP file for indexed color images (1, 2, 4, 8 bits).
 * @param bmp Raw BMP file data
 * @param header Parsed BMP header
 * @returns Array of RGBQUAD entries, or null if no palette exists
 * @throws {Error} If data is insufficient to read the color table
 */
export function extractColorTable(bmp: Uint8Array, header: BMPHeader): RGBQUAD[] | null {
  // 0. Get header data and validate
  const { bfOffBits } = header.fileHeader;
  const { biSize, biBitCount, biClrUsed } = getNormalizedHeaderInfo(header.infoHeader);

  if (biBitCount > 8) return null; // color table only exists for 1, 2, 4, 8 bit images

  // 1. Calculate palette location (after 14-byte file header + info header)
  const colorTableOffset = 14 + biSize;
  const colorTableSize = bfOffBits - colorTableOffset;

  // 2. Determine color count (minimum of: specified, possible, or available space)
  const maxPossibleColors = 1 << biBitCount;
  const colorCount = Math.min(
    biClrUsed || maxPossibleColors,
    Math.floor(colorTableSize / (biSize === 12 ? 3 : 4)),
    maxPossibleColors,
  );
  const bytesPerEntry = Math.floor(colorTableSize / colorCount);

  // 3. Extract palette entries (BGR order, optional reserved byte)
  const table: RGBQUAD[] = [];
  for (let i = 0; i < colorCount; i++) {
    const idx = colorTableOffset + (i * bytesPerEntry);
    table.push({
      rgbBlue: bmp[idx],
      rgbGreen: bmp[idx + 1],
      rgbRed: bmp[idx + 2],
      rgbReserved: bytesPerEntry === 4 ? bmp[idx + 3] : 0,
    });
  }

  // 4. Fill in missing colors
  while (table.length < maxPossibleColors) {
    table.push({ rgbBlue: 0, rgbGreen: 0, rgbRed: 0, rgbReserved: 0 });
  }

  return table;
}
