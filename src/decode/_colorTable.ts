import { type BMPHeader, getNormalizedHeaderInfo, isBITMAPCOREHEADER, isOS22XBITMAPHEADER } from "./_bmpHeader.ts";

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
 * Parses color palette from BMP file for indexed color images (1, 4, or 8 bits per pixel).
 * @param bmp Raw BMP file data
 * @param header Optional pre-parsed BMP header (to avoid re-parsing)
 * @returns Array of RGBQUAD entries, or null if no palette exists
 * @throws {Error} If data is insufficient to read the color table
 */
export function parseColorTable(bmp: Uint8Array, infoHeader: BMPHeader["infoHeader"]): RGBQUAD[] | null {
  const { biSize, biBitCount, biClrUsed } = getNormalizedHeaderInfo(infoHeader);

  // Color table only exists for 1, 4, or 8 bpp images
  if (biBitCount > 8) return null;

  const colorCount = biClrUsed || (1 << biBitCount);
  const offset = 14 + biSize;
  // OS/2 BMPs use 3 bytes per entry, Windows BMPs use 4 bytes per entry
  const bytesPerEntry = (isBITMAPCOREHEADER(infoHeader) || isOS22XBITMAPHEADER(infoHeader)) ? 3 : 4;
  const table: RGBQUAD[] = [];

  for (let i = 0; i < colorCount; i++) {
    const idx = offset + (i * bytesPerEntry);
    table.push({
      rgbBlue: bmp[idx],
      rgbGreen: bmp[idx + 1],
      rgbRed: bmp[idx + 2],
      rgbReserved: bytesPerEntry === 4 ? bmp[idx + 3] : 0,
    });
  }

  return table;
}
