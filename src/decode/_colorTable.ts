/** Color palette entry for indexed color BMP images */
export interface RGBQUAD {
  /** Blue channel intensity (0-255) */
  blue: number;
  /** Green channel intensity (0-255) */
  green: number;
  /** Red channel intensity (0-255) */
  red: number;
  /** Reserved field, typically 0 (used for alpha in some variants) */
  reserved: number;
}

/**
 * Extracts color palette from BMP file for indexed color images (1, 2, 4, 8 bits).
 */
export function extractColorTable(
  bmp: Uint8Array,
  bfOffBits: number,
  biSize: number,
  biBitCount: 1 | 2 | 4 | 8,
  biClrUsed: number,
): RGBQUAD[] {
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
      blue: bmp[idx],
      green: bmp[idx + 1],
      red: bmp[idx + 2],
      reserved: bytesPerEntry === 4 ? bmp[idx + 3] : 0,
    });
  }

  // 4. Fill in missing colors
  while (table.length < maxPossibleColors) {
    table.push({ blue: 0, green: 0, red: 0, reserved: 0 });
  }

  return table;
}
