import type { RGBQUAD } from "../decode/_colorTable.ts";
import type { BitfieldMasks } from "./_bi_bitfields.ts";

/**
 * BMP compression method identifiers.
 * - BI_RGB (0) - No compression. Raw pixel data.
 * - BI_RLE8 (1) - 8-bit run-length encoding. 256-color indexed only.
 * - BI_RLE4 (2) - 4-bit run-length encoding. 16-color indexed only.
 * - BI_BITFIELDS (3) - Uncompressed with custom RGB bit masks.
 * - BI_ALPHABITFIELDS (6) - Uncompressed with custom RGBA bit masks.
 */
export const CompressionTypes = {
  BI_RGB: 0,
  BI_RLE8: 1,
  BI_RLE4: 2,
  BI_BITFIELDS: 3,
  BI_ALPHABITFIELDS: 6,
} as const;

/**
 * BMP header format type. Determines header size and features.
 * - `BITMAPINFOHEADER`: 40 bytes. Basic format.
 * - `BITMAPV4HEADER`: 108 bytes. Embedded masks, color space, gamma support.
 * - `BITMAPV5HEADER`: 124 bytes. Adds ICC profiles and rendering intent.
 */
export type HeaderType = "BITMAPINFOHEADER" | "BITMAPV4HEADER" | "BITMAPV5HEADER";

/** Parameters for writing BMP headers */
export interface BMPWriterParams {
  width: number;
  height: number;
  bitsPerPixel: 1 | 4 | 8 | 16 | 24 | 32;
  compression: number;
  imageDataSize: number;
  colorTable?: RGBQUAD[];
  headerType?: HeaderType;
  topDown?: boolean;
  bitfields?: BitfieldMasks;
}

/**
 * Writes BITMAPFILEHEADER (14 bytes).
 * @param params - BMP writer parameters
 * @param pixelDataOffset - Offset to pixel data from file start
 * @returns 14-byte file header
 */
function writeBitmapFileHeader(params: BMPWriterParams, pixelDataOffset: number): Uint8Array {
  const header = new Uint8Array(14);
  const view = new DataView(header.buffer);

  const fileSize = pixelDataOffset + params.imageDataSize;

  view.setUint16(0, 0x4D42, true); // "BM" signature
  view.setUint32(2, fileSize, true); // Total file size
  view.setUint16(6, 0, true); // Reserved1
  view.setUint16(8, 0, true); // Reserved2
  view.setUint32(10, pixelDataOffset, true); // Offset to pixel data

  return header;
}

/**
 * Writes BITMAPINFOHEADER (40 bytes).
 * @param params - BMP writer parameters
 * @returns 40-byte info header
 */
function writeBitmapInfoHeader(params: BMPWriterParams): Uint8Array {
  const header = new Uint8Array(40);
  const view = new DataView(header.buffer);

  const height = params.topDown ? -params.height : params.height;

  view.setUint32(0, 40, true); // Header size
  view.setInt32(4, params.width, true); // Width
  view.setInt32(8, height, true); // Height (negative for top-down)
  view.setUint16(12, 1, true); // Planes (always 1)
  view.setUint16(14, params.bitsPerPixel, true); // Bits per pixel
  view.setUint32(16, params.compression, true); // Compression
  view.setUint32(20, params.imageDataSize, true); // Image size
  view.setInt32(24, 2835, true); // X pixels per meter (72 DPI)
  view.setInt32(28, 2835, true); // Y pixels per meter (72 DPI)
  view.setUint32(32, 0, true); // Colors used (0 = all)
  view.setUint32(36, 0, true); // Important colors (0 = all)

  return header;
}

/**
 * Writes BITMAPV4HEADER (108 bytes).
 * @param params - BMP writer parameters
 * @returns 108-byte V4 header
 */
function writeBitmapV4Header(params: BMPWriterParams): Uint8Array {
  const infoHeader = writeBitmapInfoHeader(params);
  const header = new Uint8Array(108);
  const view = new DataView(header.buffer);

  // Copy base BITMAPINFOHEADER (first 40 bytes)
  header.set(infoHeader);

  // Update header size to V4
  view.setUint32(0, 108, true);

  // V4 extension: bit masks (40-56 bytes)
  if (params.bitfields) {
    view.setUint32(40, params.bitfields.redMask, true); // Red mask
    view.setUint32(44, params.bitfields.greenMask, true); // Green mask
    view.setUint32(48, params.bitfields.blueMask, true); // Blue mask
    view.setUint32(52, params.bitfields.alphaMask || 0, true); // Alpha mask
  } else if (params.bitsPerPixel === 32) {
    // Default BGRA masks for 32-bit
    view.setUint32(40, 0x00FF0000, true); // Red mask
    view.setUint32(44, 0x0000FF00, true); // Green mask
    view.setUint32(48, 0x000000FF, true); // Blue mask
    view.setUint32(52, 0xFF000000, true); // Alpha mask
  } else if (params.bitsPerPixel === 16) {
    // Default RGB565 masks for 16-bit
    view.setUint32(40, 0x0000F800, true); // Red mask
    view.setUint32(44, 0x000007E0, true); // Green mask
    view.setUint32(48, 0x0000001F, true); // Blue mask
    view.setUint32(52, 0x00000000, true); // Alpha mask
  }

  // V4 color space (56-108 bytes)
  view.setUint32(56, 0x73524742, true); // LCS_sRGB ('sRGB' in ASCII)

  // Endpoints (60-96 bytes) - zero for sRGB
  for (let i = 60; i < 96; i += 4) {
    view.setUint32(i, 0, true);
  }

  // Gamma values (96-108 bytes)
  view.setUint32(96, 0, true); // GammaRed
  view.setUint32(100, 0, true); // GammaGreen
  view.setUint32(104, 0, true); // GammaBlue

  return header;
}

/**
 * Writes BITMAPV5HEADER (124 bytes).
 * @param params - BMP writer parameters
 * @returns 124-byte V5 header
 */
function writeBitmapV5Header(params: BMPWriterParams): Uint8Array {
  const v4Header = writeBitmapV4Header(params);
  const header = new Uint8Array(124);
  const view = new DataView(header.buffer);

  // Copy V4 header (first 108 bytes)
  header.set(v4Header);

  // Update header size to V5
  view.setUint32(0, 124, true);

  // V5 extension (108-124 bytes)
  view.setUint32(108, 2, true); // Intent: LCS_GM_GRAPHICS (relative colorimetric)
  view.setUint32(112, 0, true); // ProfileData offset
  view.setUint32(116, 0, true); // ProfileSize
  view.setUint32(120, 0, true); // Reserved

  return header;
}

/**
 * Writes color table (RGBQUAD array).
 * @param colorTable - Array of RGBQUAD entries
 * @returns Color table buffer
 */
function writeColorTable(colorTable: RGBQUAD[]): Uint8Array {
  const buffer = new Uint8Array(colorTable.length * 4);

  for (let i = 0; i < colorTable.length; i++) {
    const offset = i * 4;
    buffer[offset] = colorTable[i].blue;
    buffer[offset + 1] = colorTable[i].green;
    buffer[offset + 2] = colorTable[i].red;
    buffer[offset + 3] = colorTable[i].reserved;
  }

  return buffer;
}

/**
 * Calculates the size of the info header based on header type.
 * @param headerType - Type of header
 * @returns Header size in bytes
 */
function getHeaderSize(headerType: HeaderType): number {
  switch (headerType) {
    case "BITMAPINFOHEADER":
      return 40;
    case "BITMAPV4HEADER":
      return 108;
    case "BITMAPV5HEADER":
      return 124;
  }
}

/**
 * Writes bitfield masks for BI_BITFIELDS/BI_ALPHABITFIELDS compression.
 * Only used with BITMAPINFOHEADER (for V4/V5 masks are in header).
 * @param params - BMP writer parameters
 * @returns Bitfield masks buffer (12 or 16 bytes)
 */
function writeBitfieldMasks(params: BMPWriterParams): Uint8Array {
  // 12 bytes for RGB masks, 16 bytes if alpha mask is present
  const hasAlpha = params.bitfields!.alphaMask !== undefined;
  const maskSize = hasAlpha ? 16 : 12;
  const buffer = new Uint8Array(maskSize);
  const view = new DataView(buffer.buffer);

  view.setUint32(0, params.bitfields!.redMask, true);
  view.setUint32(4, params.bitfields!.greenMask, true);
  view.setUint32(8, params.bitfields!.blueMask, true);
  if (hasAlpha && params.bitfields!.alphaMask !== undefined) {
    view.setUint32(12, params.bitfields!.alphaMask, true);
  }

  return buffer;
}

/**
 * Writes complete BMP header (file header + info header + bitfield masks + color table).
 * @param params - BMP writer parameters
 * @returns Complete header buffer
 */
export function writeBMPHeader(params: BMPWriterParams): Uint8Array {
  const headerType = params.headerType || "BITMAPINFOHEADER";

  // Write info header
  let infoHeader: Uint8Array;
  switch (headerType) {
    case "BITMAPINFOHEADER":
      infoHeader = writeBitmapInfoHeader(params);
      break;
    case "BITMAPV4HEADER":
      infoHeader = writeBitmapV4Header(params);
      break;
    case "BITMAPV5HEADER":
      infoHeader = writeBitmapV5Header(params);
      break;
  }

  // Write bitfield masks if BITMAPINFOHEADER + BI_BITFIELDS/BI_ALPHABITFIELDS
  // (for V4/V5 masks are already in header)
  const needsSeparateMasks = headerType === "BITMAPINFOHEADER" &&
    (params.compression === CompressionTypes.BI_BITFIELDS ||
      params.compression === CompressionTypes.BI_ALPHABITFIELDS) &&
    params.bitfields;
  const bitfieldMasksBuffer = needsSeparateMasks ? writeBitfieldMasks(params) : new Uint8Array(0);

  // Write color table if present
  const colorTableBuffer = params.colorTable ? writeColorTable(params.colorTable) : new Uint8Array(0);

  // Calculate pixel data offset
  const fileHeaderSize = 14;
  const infoHeaderSize = getHeaderSize(headerType);
  const pixelDataOffset = fileHeaderSize + infoHeaderSize + bitfieldMasksBuffer.length + colorTableBuffer.length;

  // Write file header
  const fileHeader = writeBitmapFileHeader(params, pixelDataOffset);

  // Combine all parts
  const totalSize = fileHeader.length + infoHeader.length + bitfieldMasksBuffer.length + colorTableBuffer.length;
  const result = new Uint8Array(totalSize);

  result.set(fileHeader, 0); // File header
  result.set(infoHeader, fileHeader.length); // Info header
  result.set(bitfieldMasksBuffer, fileHeader.length + infoHeader.length); // Bitfield masks
  result.set(colorTableBuffer, fileHeader.length + infoHeader.length + bitfieldMasksBuffer.length); // Color table

  return result;
}
