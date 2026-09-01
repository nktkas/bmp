/**
 * Parses the BMP file header and DIB (info) header into a single flat structure.
 *
 * Supports all known DIB header sizes: BITMAPCOREHEADER (12), OS22XBITMAPHEADER (16/64),
 * BITMAPINFOHEADER (40), BITMAPV2INFOHEADER (52), BITMAPV3INFOHEADER (56),
 * BITMAPV4HEADER (108), BITMAPV5HEADER (124).
 *
 * @see https://learn.microsoft.com/windows/win32/gdi/bitmap-header-types
 *
 * @module
 */

import { BmpError, type BmpHeader, CompressionTypes, FILE_HEADER_SIZE } from "../common.ts";

/**
 * Reads and normalizes the BMP file header + DIB header into a flat {@linkcode BmpHeader}.
 *
 * @param data Complete BMP file contents.
 *
 * @return The header fields; a field the header version does not carry is `0`.
 *
 * @throws {BmpError} `INVALID_SIGNATURE` when the first two bytes are not `BM`, `UNSUPPORTED_HEADER` when the
 *                    DIB header size is neither 12, nor 16, nor 40 and above.
 */
export function readHeader(data: Uint8Array): BmpHeader {
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);

  // --- File header (14 bytes, always present) ------------------------------------------------------------------------

  const bfType = view.getUint16(0, true);
  if (bfType !== 0x4D42) {
    throw new BmpError("INVALID_SIGNATURE", `Invalid BMP signature: 0x${bfType.toString(16).toUpperCase()}`);
  }

  const dataOffset = view.getUint32(10, true);
  const headerSize = view.getUint32(FILE_HEADER_SIZE, true);

  // --- DIB header (variable size) ------------------------------------------------------------------------------------

  // Start with defaults for fields that may not exist in older headers.
  let width = 0;
  let height = 0;
  let bitsPerPixel = 0;
  let compression = 0;
  let imageSize = 0;
  let colorsUsed = 0;
  let redMask = 0;
  let greenMask = 0;
  let blueMask = 0;
  let alphaMask = 0;

  if (headerSize === 12) {
    // BITMAPCOREHEADER — OS/2 1.x, uses 16-bit width/height (unsigned).
    width = view.getUint16(18, true);
    height = view.getUint16(20, true);
    bitsPerPixel = view.getUint16(24, true);
  } else if (headerSize === 16 || headerSize === 64) {
    // OS22XBITMAPHEADER — OS/2 2.x (short variant: 16 bytes, full: 64 bytes).
    width = view.getInt32(18, true);
    height = view.getInt32(22, true);
    bitsPerPixel = view.getUint16(28, true);
    if (headerSize === 64) {
      compression = view.getUint32(30, true);
      imageSize = view.getUint32(34, true);
      colorsUsed = view.getUint32(46, true);
    }
  } else if (headerSize >= 40) {
    // BITMAPINFOHEADER and all later versions (V2, V3, V4, V5).
    width = view.getInt32(18, true);
    height = view.getInt32(22, true);
    bitsPerPixel = view.getUint16(28, true);
    compression = view.getUint32(30, true);
    imageSize = view.getUint32(34, true);
    colorsUsed = view.getUint32(46, true);

    // Bitfield masks — location depends on header version.
    if (headerSize >= 52) {
      // V2+ headers store masks at fixed offsets within the header.
      redMask = view.getUint32(54, true);
      greenMask = view.getUint32(58, true);
      blueMask = view.getUint32(62, true);
    }
    if (headerSize >= 56) {
      // V3+ headers add an alpha mask.
      alphaMask = view.getUint32(66, true);
    }

    if (headerSize === 40) {
      // A plain BITMAPINFOHEADER has no mask fields; the masks follow the header instead.
      if (compression === CompressionTypes.BI_BITFIELDS || compression === CompressionTypes.BI_ALPHABITFIELDS) {
        const maskOffset = FILE_HEADER_SIZE + headerSize;
        redMask = view.getUint32(maskOffset, true);
        greenMask = view.getUint32(maskOffset + 4, true);
        blueMask = view.getUint32(maskOffset + 8, true);
        if (dataOffset >= maskOffset + 16) {
          alphaMask = view.getUint32(maskOffset + 12, true);
        }
      }
    }
  } else {
    throw new BmpError("UNSUPPORTED_HEADER", `Unsupported BMP header size: ${headerSize} bytes`);
  }

  return {
    dataOffset,
    headerSize,
    width,
    height,
    bitsPerPixel,
    compression,
    imageSize,
    colorsUsed,
    redMask,
    greenMask,
    blueMask,
    alphaMask,
  };
}
