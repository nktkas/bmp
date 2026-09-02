/**
 * BMP image encoder — converts raw pixel data to BMP binary format.
 *
 * Supports BI_RGB, BI_RLE8, BI_RLE4, BI_BITFIELDS, and BI_ALPHABITFIELDS
 * compression types at various bit depths (1, 4, 8, 16, 24, 32).
 *
 * @example
 * ```ts
 * import { encode } from "@nktkas/bmp/encode";
 *
 * const raw = {
 *   width: 2,
 *   height: 2,
 *   channels: 3 as const,
 *   data: new Uint8Array([0, 0, 0, 255, 255, 255, 0, 0, 0, 255, 255, 255]), // 2x2 checkerboard
 * };
 * const bmp = encode(raw);
 * await Deno.writeFile("output.bmp", bmp);
 * ```
 *
 * @module
 */

import {
  BGRA8888_MASKS,
  type BitfieldMasks,
  BmpError,
  type BmpErrorCode,
  type Color,
  CompressionTypes,
  type RawImageData,
  RGB565_MASKS,
  validateImageSize,
} from "../common.ts";
import { encodeBitfields } from "./bitfields.ts";
import { headerLength, type HeaderType, writeHeader } from "./header.ts";
import { encodeRgb } from "./rgb.ts";
import { encodeRle4, encodeRle8 } from "./rle.ts";

export { BmpError };
export type { BitfieldMasks, BmpErrorCode, Color, HeaderType, RawImageData };

/** Options of {@linkcode encode}. */
export interface EncodeOptions {
  /**
   * Bit depth to encode at.
   *
   * @default Follows `raw.channels`: 8 for grayscale, 24 for RGB, 32 for RGBA.
   */
  bitsPerPixel?: 1 | 4 | 8 | 16 | 24 | 32;

  /**
   * Compression method:
   * - `0`: BI_RGB, uncompressed.
   * - `1`: BI_RLE8, run-length encoded, 8bpp only.
   * - `2`: BI_RLE4, run-length encoded, 4bpp only.
   * - `3`: BI_BITFIELDS, channel masks, 16 or 32bpp.
   * - `6`: BI_ALPHABITFIELDS, channel masks with alpha, 32bpp only.
   *
   * @default 0
   */
  compression?: 0 | 1 | 2 | 3 | 6;

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
   * Palette for the indexed depths (1, 4, 8), holding at least as many colors as the depth addresses;
   * anything past that count is dropped. Omitting it quantizes the image down to a palette of its own.
   */
  palette?: Color[];

  /**
   * Channel masks for the two bitfield compressions.
   *
   * @default RGB565 at 16bpp, BGRA8888 at 32bpp.
   */
  bitfields?: BitfieldMasks;
}

/**
 * Encodes raw pixel data into a complete BMP file.
 *
 * @param raw Source pixel data (grayscale, RGB, or RGBA).
 * @param options Encoding options.
 *
 * @return Complete BMP file as a byte array.
 *
 * @throws {BmpError} `INVALID_DIMENSIONS`, `INVALID_DATA_SIZE`, or `INCOMPATIBLE_OPTIONS`.
 *
 * @example
 * ```ts
 * import { encode } from "@nktkas/bmp/encode";
 *
 * const raw = {
 *   width: 2,
 *   height: 2,
 *   channels: 3 as const,
 *   data: new Uint8Array([0, 0, 0, 255, 255, 255, 0, 0, 0, 255, 255, 255]), // 2x2 checkerboard
 * };
 * const bmp = encode(raw);
 * await Deno.writeFile("output.bmp", bmp);
 * ```
 */
export function encode(raw: RawImageData, options: EncodeOptions = {}): Uint8Array {
  const bitsPerPixel = options.bitsPerPixel ?? getDefaultBitsPerPixel(raw.channels);
  const compression = options.compression ?? CompressionTypes.BI_RGB;
  const headerType = options.headerType ?? "BITMAPINFOHEADER";
  const isTopDown = options.isTopDown ?? false;

  validateOptions(raw, bitsPerPixel, compression, isTopDown, options.palette);

  let pixelData: Uint8Array;
  let palette: Color[] | undefined;
  let bitfields: BitfieldMasks | undefined;

  switch (compression) {
    case CompressionTypes.BI_RGB:
      ({ pixelData, palette } = encodeRgb(raw, bitsPerPixel, isTopDown, options.palette));
      break;

    case CompressionTypes.BI_RLE8:
      ({ pixelData, palette } = encodeRle8(raw, options.palette));
      break;

    case CompressionTypes.BI_RLE4:
      ({ pixelData, palette } = encodeRle4(raw, options.palette));
      break;

    default:
      // Only the two bitfield codes remain, and `validateOptions` has checked their depth.
      bitfields = options.bitfields ?? getDefaultBitfieldMasks(bitsPerPixel as 16 | 32);
      pixelData = encodeBitfields(raw, bitsPerPixel as 16 | 32, bitfields, isTopDown);
  }

  const params = {
    width: raw.width,
    height: raw.height,
    bitsPerPixel,
    compression,
    imageDataSize: pixelData.length,
    colorTable: palette,
    headerType,
    isTopDown,
    bitfields,
  };

  const headerSize = headerLength(params);
  const result = new Uint8Array(headerSize + pixelData.length);
  writeHeader(result, params);
  result.set(pixelData, headerSize);

  return result;
}

/**
 * Picks the depth that holds every source channel and no more.
 *
 * @param channels Number of color channels in the source.
 *
 * @return `8` for grayscale, `24` for RGB, `32` for RGBA.
 */
function getDefaultBitsPerPixel(channels: 1 | 3 | 4): 8 | 24 | 32 {
  if (channels === 1) return 8;
  if (channels === 3) return 24;
  return 32;
}

/**
 * Picks the masks used when a bitfields image names none.
 *
 * @param bitsPerPixel Target bit depth.
 *
 * @return RGB565 at 16bpp, BGRA8888 at 32bpp.
 */
function getDefaultBitfieldMasks(bitsPerPixel: 16 | 32): BitfieldMasks {
  return bitsPerPixel === 16 ? RGB565_MASKS : BGRA8888_MASKS;
}

/**
 * Rejects the combinations of source, depth and compression that cannot produce a valid BMP.
 *
 * @param raw Source pixel data.
 * @param bitsPerPixel Target bit depth.
 * @param compression Compression type.
 * @param isTopDown Whether rows are stored top-down.
 * @param palette Palette the caller supplied, if any.
 *
 * @throws {BmpError} `INVALID_DIMENSIONS`, `INVALID_DATA_SIZE`, or `INCOMPATIBLE_OPTIONS`.
 */
function validateOptions(
  raw: RawImageData,
  bitsPerPixel: number,
  compression: number,
  isTopDown: boolean,
  palette?: Color[],
): void {
  validateImageSize(raw.width, raw.height);

  const expectedSize = raw.width * raw.height * raw.channels;
  if (raw.data.length !== expectedSize) {
    throw new BmpError("INVALID_DATA_SIZE", `Invalid data size: expected ${expectedSize}, got ${raw.data.length}`);
  }
  if (compression === CompressionTypes.BI_RLE8 && bitsPerPixel !== 8) {
    throw new BmpError("INCOMPATIBLE_OPTIONS", `BI_RLE8 needs an 8-bit depth, got ${bitsPerPixel}`);
  }
  if (compression === CompressionTypes.BI_RLE4 && bitsPerPixel !== 4) {
    throw new BmpError("INCOMPATIBLE_OPTIONS", `BI_RLE4 needs a 4-bit depth, got ${bitsPerPixel}`);
  }
  // RLE images are always stored bottom-up; top-down RLE is invalid per the BMP spec.
  if ((compression === CompressionTypes.BI_RLE8 || compression === CompressionTypes.BI_RLE4) && isTopDown) {
    throw new BmpError("INCOMPATIBLE_OPTIONS", "RLE images are always stored bottom-up, so isTopDown cannot be set");
  }
  if (compression === CompressionTypes.BI_BITFIELDS && bitsPerPixel !== 16 && bitsPerPixel !== 32) {
    throw new BmpError("INCOMPATIBLE_OPTIONS", `BI_BITFIELDS needs a 16- or 32-bit depth, got ${bitsPerPixel}`);
  }
  if (compression === CompressionTypes.BI_ALPHABITFIELDS && bitsPerPixel !== 32) {
    throw new BmpError("INCOMPATIBLE_OPTIONS", `BI_ALPHABITFIELDS needs a 32-bit depth, got ${bitsPerPixel}`);
  }

  // Only the indexed depths read a palette, and every slot of it is addressable.
  const indexed = bitsPerPixel <= 8 && compression !== CompressionTypes.BI_BITFIELDS &&
    compression !== CompressionTypes.BI_ALPHABITFIELDS;
  const needed = 1 << bitsPerPixel;
  if (indexed && palette && palette.length < needed) {
    throw new BmpError(
      "INCOMPATIBLE_OPTIONS",
      `A ${bitsPerPixel}-bit image needs a palette of ${needed} colors, got ${palette.length}`,
    );
  }
}
