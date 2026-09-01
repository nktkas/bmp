/**
 * Writes BMP file headers for encoding.
 *
 * Generates the complete header block (file header + DIB header +
 * optional bitfield masks + optional color table) that precedes
 * the pixel data in a BMP file.
 *
 * @module
 */

import { type BitfieldMasks, type Color, CompressionTypes } from "../common.ts";

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
  /** DIB header format to write. Default: `"BITMAPINFOHEADER"`. */
  headerType?: HeaderType;
  /** If true, rows are stored top-down instead of the default bottom-up. */
  isTopDown?: boolean;
  /** Custom bit masks for BI_BITFIELDS/BI_ALPHABITFIELDS compression. */
  bitfields?: BitfieldMasks;
}

/**
 * Byte length of the header block for these parameters, i.e. the offset the pixel data starts at.
 *
 * @param params Header parameters.
 * @return Number of bytes before the pixel data.
 */
export function headerLength(params: HeaderParams): number {
  const headerType = params.headerType ?? "BITMAPINFOHEADER";
  return 14 + infoHeaderSize(headerType) + maskBlockSize(params, headerType) +
    (params.colorTable?.length ?? 0) * 4;
}

/**
 * Write the complete BMP header into `output`: file header + DIB header + bitfield masks + color table.
 *
 * The caller allocates, so header and pixel data share one buffer instead of being built apart and copied.
 *
 * @param output Destination buffer, holding at least {@linkcode headerLength} bytes.
 * @param params Header parameters.
 */
export function writeHeader(output: Uint8Array, params: HeaderParams): void {
  const headerType = params.headerType ?? "BITMAPINFOHEADER";
  const dibSize = infoHeaderSize(headerType);
  const view = new DataView(output.buffer, output.byteOffset, output.byteLength);

  const pixelDataOffset = headerLength(params);
  writeFileHeader(view, params.imageDataSize, pixelDataOffset);
  writeInfoHeader(view, 14, params, headerType, dibSize);

  let offset = 14 + dibSize;
  if (maskBlockSize(params, headerType) > 0) {
    offset = writeBitfieldMasks(view, offset, params.bitfields!);
  }
  if (params.colorTable) {
    writeColorTable(output, offset, params.colorTable);
  }
}

/**
 * Size of the DIB header for a header format.
 *
 * @param headerType DIB header format.
 * @return Header size in bytes.
 */
function infoHeaderSize(headerType: HeaderType): number {
  if (headerType === "BITMAPV5HEADER") return 124;
  if (headerType === "BITMAPV4HEADER") return 108;
  return 40;
}

/**
 * Size of the bitfield mask block, which only BITMAPINFOHEADER stores outside the DIB header.
 *
 * @param params Header parameters.
 * @param headerType DIB header format.
 * @return Block size in bytes, or `0` when the masks live inside the DIB header or are absent.
 */
function maskBlockSize(params: HeaderParams, headerType: HeaderType): number {
  if (headerType !== "BITMAPINFOHEADER" || !params.bitfields) return 0;
  if (
    params.compression !== CompressionTypes.BI_BITFIELDS &&
    params.compression !== CompressionTypes.BI_ALPHABITFIELDS
  ) {
    return 0;
  }
  return params.bitfields.alphaMask !== undefined ? 16 : 12;
}

/**
 * Write the 14-byte BMP file header ("BM" + file size + reserved + data offset).
 *
 * @param view Destination view.
 * @param imageDataSize Size of the pixel data in bytes.
 * @param pixelDataOffset Byte offset from the start of the file to the pixel data.
 */
function writeFileHeader(view: DataView, imageDataSize: number, pixelDataOffset: number): void {
  view.setUint16(0, 0x4D42, true); // "BM" signature
  view.setUint32(2, pixelDataOffset + imageDataSize, true); // Total file size
  // Reserved fields at offset 6 and 8 are left as 0
  view.setUint32(10, pixelDataOffset, true); // Offset to pixel data
}

/**
 * Write the DIB header (40, 108, or 124 bytes depending on version).
 *
 * @param view Destination view.
 * @param base Byte offset the DIB header starts at.
 * @param params Header parameters.
 * @param headerType DIB header format.
 * @param size Header size in bytes.
 */
function writeInfoHeader(
  view: DataView,
  base: number,
  params: HeaderParams,
  headerType: HeaderType,
  size: number,
): void {
  const height = params.isTopDown ? -params.height : params.height;

  // Base BITMAPINFOHEADER fields (40 bytes)
  view.setUint32(base, size, true); // Header size
  view.setInt32(base + 4, params.width, true);
  view.setInt32(base + 8, height, true); // Negative = top-down row order
  view.setUint16(base + 12, 1, true); // Color planes (always 1)
  view.setUint16(base + 14, params.bitsPerPixel, true);
  view.setUint32(base + 16, params.compression, true);
  view.setUint32(base + 20, params.imageDataSize, true);
  view.setInt32(base + 24, 2835, true); // X resolution: 72 DPI
  view.setInt32(base + 28, 2835, true); // Y resolution: 72 DPI
  view.setUint32(base + 32, params.colorTable?.length ?? 0, true); // Colors used (the actual palette size)

  // V4/V5 extensions: embedded bitfield masks + color space
  if (headerType === "BITMAPV4HEADER" || headerType === "BITMAPV5HEADER") {
    if (params.bitfields) {
      view.setUint32(base + 40, params.bitfields.redMask, true);
      view.setUint32(base + 44, params.bitfields.greenMask, true);
      view.setUint32(base + 48, params.bitfields.blueMask, true);
      view.setUint32(base + 52, params.bitfields.alphaMask ?? 0, true);
    } else if (params.bitsPerPixel === 32) {
      // Default BGRA masks
      view.setUint32(base + 40, 0x00FF0000, true);
      view.setUint32(base + 44, 0x0000FF00, true);
      view.setUint32(base + 48, 0x000000FF, true);
      view.setUint32(base + 52, 0xFF000000, true);
    } else if (params.bitsPerPixel === 16) {
      // Default RGB565 masks
      view.setUint32(base + 40, 0x0000F800, true);
      view.setUint32(base + 44, 0x000007E0, true);
      view.setUint32(base + 48, 0x0000001F, true);
    }
    view.setUint32(base + 56, 0x73524742, true); // Color space: LCS_sRGB
    // Endpoints (60–96) and gamma (96–108) are left as 0 for sRGB
  }

  // V5 extensions: rendering intent
  if (headerType === "BITMAPV5HEADER") {
    view.setUint32(base + 108, 2, true); // Intent: LCS_GM_GRAPHICS (relative colorimetric)
    // ProfileData (112), ProfileSize (116), Reserved (120) are left as 0
  }
}

/**
 * Write bitfield masks as a separate block (12 or 16 bytes).
 *
 * @param view Destination view.
 * @param offset Byte offset to write at.
 * @param masks Bitfield masks for each channel.
 * @return Byte offset just past the block.
 */
function writeBitfieldMasks(view: DataView, offset: number, masks: BitfieldMasks): number {
  view.setUint32(offset, masks.redMask, true);
  view.setUint32(offset + 4, masks.greenMask, true);
  view.setUint32(offset + 8, masks.blueMask, true);
  if (masks.alphaMask === undefined) return offset + 12;

  view.setUint32(offset + 12, masks.alphaMask, true);
  return offset + 16;
}

/**
 * Write a color table (palette) in BMP's BGR+reserved format.
 *
 * @param output Destination buffer.
 * @param offset Byte offset to write at.
 * @param colors Array of palette colors.
 */
function writeColorTable(output: Uint8Array, offset: number, colors: Color[]): void {
  for (let i = 0; i < colors.length; i++) {
    const dstOffset = offset + i * 4;
    output[dstOffset] = colors[i].blue; // B
    output[dstOffset + 1] = colors[i].green; // G
    output[dstOffset + 2] = colors[i].red; // R
    // output[dstOffset + 3] stays 0 (reserved byte)
  }
}
