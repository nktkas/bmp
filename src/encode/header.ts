/**
 * Writes BMP file headers for encoding.
 *
 * Generates the complete header block (file header + DIB header +
 * optional bitfield masks + optional color table) that precedes
 * the pixel data in a BMP file.
 *
 * @module
 */

import {
  BGRA8888_MASKS,
  type BitfieldMasks,
  type Color,
  type CompressionType,
  CompressionTypes,
  FILE_HEADER_SIZE,
  RGB555_MASKS,
} from "../common.ts";

/**
 * Which DIB header format to write:
 * - `BITMAPINFOHEADER` — 40 bytes, most compatible.
 * - `BITMAPV4HEADER` — 108 bytes, includes masks and sRGB color space.
 * - `BITMAPV5HEADER` — 124 bytes, adds ICC profile and rendering intent.
 */
export type HeaderType = "BITMAPINFOHEADER" | "BITMAPV4HEADER" | "BITMAPV5HEADER";

/** Parameters of {@linkcode writeHeader} and {@linkcode headerLength}. */
export interface HeaderParams {
  /** Image width in pixels. */
  width: number;
  /** Image height in pixels, always positive; `isTopDown` decides the sign that reaches the file. */
  height: number;
  /** Bit depth the pixel data was encoded at. */
  bitsPerPixel: 1 | 4 | 8 | 16 | 24 | 32;
  /** BMP compression the pixel data was encoded with. */
  compression: CompressionType;
  /** Size of the encoded pixel data in bytes. */
  imageDataSize: number;
  /** Palette to write after the header. Omitting it writes no color table and reports no colors used. */
  colorTable?: Color[];
  /**
   * DIB header format to write.
   *
   * @default "BITMAPINFOHEADER"
   */
  headerType?: HeaderType;
  /**
   * Store rows top-down instead of bottom-up.
   *
   * @default false
   */
  isTopDown?: boolean;
  /**
   * Channel masks for the two bitfield compressions. Omitting them leaves a BITMAPINFOHEADER without a mask
   * block, while a V4 or V5 header still gets the standard masks for the 16- and 32-bit depths.
   */
  bitfields?: BitfieldMasks;
}

/**
 * Measures the header block, which is also the offset of the pixel data.
 *
 * @param params Header parameters.
 *
 * @return Number of bytes before the pixel data.
 */
export function headerLength(params: HeaderParams): number {
  const headerType = params.headerType ?? "BITMAPINFOHEADER";
  return FILE_HEADER_SIZE + infoHeaderSize(headerType) + maskBlockSize(params, headerType) +
    (params.colorTable?.length ?? 0) * 4;
}

/**
 * Writes the complete BMP header into `output`: file header + DIB header + bitfield masks + color table.
 *
 * The caller allocates, so the header and the pixel data share one buffer.
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
  writeInfoHeader(view, FILE_HEADER_SIZE, params, headerType, dibSize);

  let offset = FILE_HEADER_SIZE + dibSize;
  if (params.bitfields && maskBlockSize(params, headerType) > 0) {
    offset = writeBitfieldMasks(view, offset, params.bitfields);
  }
  if (params.colorTable) {
    writeColorTable(output, offset, params.colorTable);
  }
}

/**
 * Gives the byte size of a DIB header version.
 *
 * @param headerType DIB header format.
 *
 * @return Header size in bytes.
 */
function infoHeaderSize(headerType: HeaderType): number {
  if (headerType === "BITMAPV5HEADER") return 124;
  if (headerType === "BITMAPV4HEADER") return 108;
  return 40;
}

/**
 * Measures the mask block that follows the DIB header, which only BITMAPINFOHEADER stores separately.
 *
 * @param params Header parameters.
 * @param headerType DIB header format.
 *
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
 * Writes the BMP file header ("BM" + file size + reserved + data offset).
 *
 * @param view Destination view.
 * @param imageDataSize Size of the pixel data in bytes.
 * @param pixelDataOffset Byte offset from the start of the file to the pixel data.
 */
function writeFileHeader(view: DataView, imageDataSize: number, pixelDataOffset: number): void {
  view.setUint16(0, 0x4D42, true); // "BM" signature
  view.setUint32(2, pixelDataOffset + imageDataSize, true); // Total file size
  // Reserved fields at offset 6 and 8 are left as 0.
  view.setUint32(10, pixelDataOffset, true); // Offset to pixel data
}

/**
 * Writes the DIB header (40, 108, or 124 bytes depending on version).
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

  // --- The 40 bytes every version starts with ------------------------------------------------------------------------

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

  // --- What V4 adds: masks inside the header, plus a color space -----------------------------------------------------

  if (headerType === "BITMAPV4HEADER" || headerType === "BITMAPV5HEADER") {
    // Without masks the compression is BI_RGB, whose pixel layout is fixed by the depth.
    const masks = params.bitfields ??
      (params.bitsPerPixel === 32 ? BGRA8888_MASKS : params.bitsPerPixel === 16 ? RGB555_MASKS : undefined);
    if (masks) {
      view.setUint32(base + 40, masks.redMask, true);
      view.setUint32(base + 44, masks.greenMask, true);
      view.setUint32(base + 48, masks.blueMask, true);
      view.setUint32(base + 52, masks.alphaMask ?? 0, true);
    }
    view.setUint32(base + 56, 0x73524742, true); // Color space: LCS_sRGB
    // Endpoints (60–96) and gamma (96–108) are left as 0 for sRGB.
  }

  // --- What V5 adds on top: a rendering intent -----------------------------------------------------------------------

  if (headerType === "BITMAPV5HEADER") {
    view.setUint32(base + 108, 2, true); // Intent: LCS_GM_GRAPHICS (relative colorimetric)
    // ProfileData (112), ProfileSize (116), Reserved (120) are left as 0.
  }
}

/**
 * Writes bitfield masks as a separate block (12 or 16 bytes).
 *
 * @param view Destination view.
 * @param offset Byte offset to write at.
 * @param masks Bitfield masks for each channel.
 *
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
 * Writes a color table (palette) in BMP's BGR+reserved format.
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
