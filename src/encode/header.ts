/**
 * @module
 * Writes BMP file headers for encoding.
 *
 * Generates the complete header block (file header + DIB header +
 * optional bitfield masks + optional color table) that precedes
 * the pixel data in a BMP file.
 */

import type { BitfieldMasks, Color } from "../common.ts";

/**
 * BMP compression type constants.
 * - BI_RGB (0) — No compression. Raw pixel data.
 * - BI_RLE8 (1) — 8-bit run-length encoding (256-color indexed).
 * - BI_RLE4 (2) — 4-bit run-length encoding (16-color indexed).
 * - BI_BITFIELDS (3) — Uncompressed with custom RGB bit masks.
 * - BI_ALPHABITFIELDS (6) — Uncompressed with custom RGBA bit masks.
 */
export const CompressionTypes = {
  BI_RGB: 0,
  BI_RLE8: 1,
  BI_RLE4: 2,
  BI_BITFIELDS: 3,
  BI_ALPHABITFIELDS: 6,
} as const;

/**
 * Which DIB header format to write:
 * - `BITMAPINFOHEADER` — 40 bytes, most compatible.
 * - `BITMAPV4HEADER` — 108 bytes, includes masks and sRGB color space.
 * - `BITMAPV5HEADER` — 124 bytes, adds ICC profile and rendering intent.
 */
export type HeaderType = "BITMAPINFOHEADER" | "BITMAPV4HEADER" | "BITMAPV5HEADER";

/** Parameters for generating a BMP header. */
export interface HeaderParams {
  /** Image width in pixels. */
  width: number;
  /** Image height in pixels. */
  height: number;
  /** Bits per pixel: 1, 4, 8, 16, 24, or 32. */
  bitsPerPixel: 1 | 4 | 8 | 16 | 24 | 32;
  /** BMP compression type (see {@link CompressionTypes}). */
  compression: number;
  /** Size of the encoded pixel data in bytes. */
  imageDataSize: number;
  /** Color palette for indexed formats. */
  colorTable?: Color[];
  /** DIB header format to write. Default: "BITMAPINFOHEADER". */
  headerType?: HeaderType;
  /** If true, rows are stored top-down instead of the default bottom-up. */
  topDown?: boolean;
  /** Custom bit masks for BI_BITFIELDS/BI_ALPHABITFIELDS compression. */
  bitfields?: BitfieldMasks;
}

/**
 * Writes the complete BMP header: file header + DIB header + bitfield masks + color table.
 *
 * @param params - Header parameters.
 * @returns A byte array containing everything before the pixel data.
 */
export function writeHeader(params: HeaderParams): Uint8Array {
  const headerType = params.headerType || "BITMAPINFOHEADER";
  const infoHeaderSize = headerType === "BITMAPV5HEADER"
    ? 124
    : headerType === "BITMAPV4HEADER"
    ? 108
    : 40;

  // Build DIB header
  const infoHeader = writeInfoHeader(params, headerType, infoHeaderSize);

  // Bitfield masks are stored separately only for BITMAPINFOHEADER;
  // V4/V5 headers embed them in the DIB header itself
  const needsSeparateMasks = headerType === "BITMAPINFOHEADER" &&
    (params.compression === CompressionTypes.BI_BITFIELDS ||
      params.compression === CompressionTypes.BI_ALPHABITFIELDS) &&
    params.bitfields;
  const masksBuffer = needsSeparateMasks
    ? writeBitfieldMasks(params.bitfields!)
    : new Uint8Array(0);

  // Color table (palette)
  const colorTableBuffer = params.colorTable
    ? writeColorTable(params.colorTable)
    : new Uint8Array(0);

  // File header needs to know the total offset to pixel data
  const pixelDataOffset = 14 + infoHeaderSize + masksBuffer.length + colorTableBuffer.length;
  const fileHeader = writeFileHeader(params.imageDataSize, pixelDataOffset);

  // Concatenate all parts
  const result = new Uint8Array(pixelDataOffset);
  let offset = 0;
  result.set(fileHeader, offset);
  offset += fileHeader.length;
  result.set(infoHeader, offset);
  offset += infoHeader.length;
  result.set(masksBuffer, offset);
  offset += masksBuffer.length;
  result.set(colorTableBuffer, offset);

  return result;
}

/** Writes the 14-byte BMP file header ("BM" + file size + reserved + data offset). */
function writeFileHeader(imageDataSize: number, pixelDataOffset: number): Uint8Array {
  const header = new Uint8Array(14);
  const view = new DataView(header.buffer);

  view.setUint16(0, 0x4D42, true); // "BM" signature
  view.setUint32(2, pixelDataOffset + imageDataSize, true); // Total file size
  // Reserved fields at offset 6 and 8 are left as 0
  view.setUint32(10, pixelDataOffset, true); // Offset to pixel data

  return header;
}

/** Writes the DIB header (40, 108, or 124 bytes depending on version). */
function writeInfoHeader(params: HeaderParams, headerType: HeaderType, size: number): Uint8Array {
  const header = new Uint8Array(size);
  const view = new DataView(header.buffer);

  const height = params.topDown ? -params.height : params.height;

  // Base BITMAPINFOHEADER fields (40 bytes)
  view.setUint32(0, size, true); // Header size
  view.setInt32(4, params.width, true);
  view.setInt32(8, height, true); // Negative = top-down row order
  view.setUint16(12, 1, true); // Color planes (always 1)
  view.setUint16(14, params.bitsPerPixel, true);
  view.setUint32(16, params.compression, true);
  view.setUint32(20, params.imageDataSize, true);
  view.setInt32(24, 2835, true); // X resolution: 72 DPI
  view.setInt32(28, 2835, true); // Y resolution: 72 DPI
  // Colors used (32) and Important colors (36) are left as 0

  // V4/V5 extensions: embedded bitfield masks + color space
  if (headerType === "BITMAPV4HEADER" || headerType === "BITMAPV5HEADER") {
    if (params.bitfields) {
      view.setUint32(40, params.bitfields.redMask, true);
      view.setUint32(44, params.bitfields.greenMask, true);
      view.setUint32(48, params.bitfields.blueMask, true);
      view.setUint32(52, params.bitfields.alphaMask || 0, true);
    } else if (params.bitsPerPixel === 32) {
      // Default BGRA masks
      view.setUint32(40, 0x00FF0000, true);
      view.setUint32(44, 0x0000FF00, true);
      view.setUint32(48, 0x000000FF, true);
      view.setUint32(52, 0xFF000000, true);
    } else if (params.bitsPerPixel === 16) {
      // Default RGB565 masks
      view.setUint32(40, 0x0000F800, true);
      view.setUint32(44, 0x000007E0, true);
      view.setUint32(48, 0x0000001F, true);
    }
    view.setUint32(56, 0x73524742, true); // Color space: LCS_sRGB
    // Endpoints (60–96) and gamma (96–108) are left as 0 for sRGB
  }

  // V5 extensions: rendering intent
  if (headerType === "BITMAPV5HEADER") {
    view.setUint32(108, 2, true); // Intent: LCS_GM_GRAPHICS (relative colorimetric)
    // ProfileData (112), ProfileSize (116), Reserved (120) are left as 0
  }

  return header;
}

/** Writes bitfield masks as a separate block (12 or 16 bytes). */
function writeBitfieldMasks(masks: BitfieldMasks): Uint8Array {
  const hasAlpha = masks.alphaMask !== undefined;
  const buffer = new Uint8Array(hasAlpha ? 16 : 12);
  const view = new DataView(buffer.buffer);

  view.setUint32(0, masks.redMask, true);
  view.setUint32(4, masks.greenMask, true);
  view.setUint32(8, masks.blueMask, true);
  if (hasAlpha) {
    view.setUint32(12, masks.alphaMask!, true);
  }

  return buffer;
}

/** Writes a color table (palette) in BMP's BGR+reserved format. */
function writeColorTable(colors: Color[]): Uint8Array {
  const buffer = new Uint8Array(colors.length * 4);

  for (let i = 0; i < colors.length; i++) {
    const offset = i * 4;
    buffer[offset] = colors[i].blue;
    buffer[offset + 1] = colors[i].green;
    buffer[offset + 2] = colors[i].red;
    // buffer[offset + 3] stays 0 (reserved byte)
  }

  return buffer;
}
