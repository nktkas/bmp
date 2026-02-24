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

import type { BitfieldMasks, Color, RawImageData } from "../common.ts";
import { encodeBitfields } from "./bitfields.ts";
import { CompressionTypes, type HeaderType, writeHeader } from "./header.ts";
import { encodeRgb } from "./rgb.ts";
import { encodeRle4, encodeRle8 } from "./rle.ts";

export type { BitfieldMasks, Color, RawImageData };

/** Options for encoding a BMP image. */
export interface EncodeOptions {
  /**
   * Bits per pixel (1, 4, 8, 16, 24, or 32).
   * Default: auto-detected from channels (`1`→`8`, `3`→`24`, `4`→`32`).
   */
  bitsPerPixel?: 1 | 4 | 8 | 16 | 24 | 32;

  /**
   * Compression method (0=BI_RGB, 1=BI_RLE8, 2=BI_RLE4,
   * 3=BI_BITFIELDS, 6=BI_ALPHABITFIELDS).
   * Default: `0` (BI_RGB).
   */
  compression?: 0 | 1 | 2 | 3 | 6;

  /**
   * Header format: "BITMAPINFOHEADER" (40 bytes),
   * "BITMAPV4HEADER" (108 bytes), or "BITMAPV5HEADER" (124 bytes).
   * Default: `"BITMAPINFOHEADER"`.
   */
  headerType?: HeaderType;

  /** If true, rows are stored top-down instead of the default bottom-up. Default: `false`. */
  isTopDown?: boolean;

  /** Custom color palette for indexed formats (1/4/8-bit). Auto-generated if omitted. */
  palette?: Color[];

  /**
   * Custom bit masks for BI_BITFIELDS/BI_ALPHABITFIELDS.
   * Defaults: RGB565 for 16-bit, BGRA8888 for 32-bit.
   */
  bitfields?: BitfieldMasks;
}

/**
 * Encode raw pixel data into a complete BMP file.
 *
 * @param raw Source pixel data (grayscale, RGB, or RGBA).
 * @param options Encoding options.
 * @return Complete BMP file as a byte array.
 */
export function encode(raw: RawImageData, options: EncodeOptions = {}): Uint8Array {
  const bitsPerPixel = options.bitsPerPixel ?? getDefaultBitsPerPixel(raw.channels);
  const compression = options.compression ?? CompressionTypes.BI_RGB;
  const headerType = options.headerType ?? "BITMAPINFOHEADER";
  const isTopDown = options.isTopDown ?? false;

  validateOptions(raw, bitsPerPixel, compression);

  // Encode pixel data
  let pixelData: Uint8Array;
  let palette: Color[] | undefined;
  let bitfields: BitfieldMasks | undefined;

  switch (compression) {
    case CompressionTypes.BI_RGB: {
      const result = encodeRgb(raw, bitsPerPixel, isTopDown, options.palette);
      pixelData = result.pixelData;
      palette = result.palette;
      break;
    }

    case CompressionTypes.BI_RLE8: {
      const result = encodeRle8(raw, options.palette);
      pixelData = result.pixelData;
      palette = result.palette;
      break;
    }

    case CompressionTypes.BI_RLE4: {
      const result = encodeRle4(raw, options.palette);
      pixelData = result.pixelData;
      palette = result.palette;
      break;
    }

    case CompressionTypes.BI_BITFIELDS:
    case CompressionTypes.BI_ALPHABITFIELDS: {
      bitfields = options.bitfields ?? getDefaultBitfieldMasks(bitsPerPixel as 16 | 32);
      pixelData = encodeBitfields(raw, bitsPerPixel as 16 | 32, bitfields, isTopDown);
      break;
    }

    default:
      throw new Error(`Unsupported compression: ${compression}`);
  }

  // Build header + pixel data
  const header = writeHeader({
    width: raw.width,
    height: raw.height,
    bitsPerPixel,
    compression,
    imageDataSize: pixelData.length,
    colorTable: palette,
    headerType,
    isTopDown,
    bitfields,
  });

  const result = new Uint8Array(header.length + pixelData.length);
  result.set(header, 0);
  result.set(pixelData, header.length);

  return result;
}

/**
 * Auto-detect bit depth from channel count.
 *
 * @param channels Number of color channels.
 * @return Corresponding bit depth.
 */
function getDefaultBitsPerPixel(channels: 1 | 3 | 4): 8 | 24 | 32 {
  if (channels === 1) return 8;
  if (channels === 3) return 24;
  return 32;
}

/**
 * Return default bitfield masks: RGB565 for 16-bit, BGRA8888 for 32-bit.
 *
 * @param bitsPerPixel Target bit depth.
 * @return Default bitfield masks.
 */
function getDefaultBitfieldMasks(bitsPerPixel: 16 | 32): BitfieldMasks {
  if (bitsPerPixel === 16) {
    return { redMask: 0x0000F800, greenMask: 0x000007E0, blueMask: 0x0000001F };
  }
  return {
    redMask: 0x00FF0000,
    greenMask: 0x0000FF00,
    blueMask: 0x000000FF,
    alphaMask: 0xFF000000,
  };
}

/**
 * Validate that compression and bit depth are compatible.
 *
 * @param raw Source pixel data.
 * @param bitsPerPixel Target bit depth.
 * @param compression Compression type.
 */
function validateOptions(raw: RawImageData, bitsPerPixel: number, compression: number): void {
  if (raw.width <= 0 || raw.height <= 0) {
    throw new Error("Invalid image dimensions");
  }
  const expectedSize = raw.width * raw.height * raw.channels;
  if (raw.data.length !== expectedSize) {
    throw new Error(`Invalid data size: expected ${expectedSize}, got ${raw.data.length}`);
  }
  if (compression === 1 && bitsPerPixel !== 8) throw new Error("BI_RLE8 requires 8-bit format");
  if (compression === 2 && bitsPerPixel !== 4) throw new Error("BI_RLE4 requires 4-bit format");
  if (compression === 3 && bitsPerPixel !== 16 && bitsPerPixel !== 32) {
    throw new Error("BI_BITFIELDS requires 16 or 32-bit format");
  }
  if (compression === 6 && bitsPerPixel !== 32) {
    throw new Error("BI_ALPHABITFIELDS requires 32-bit format");
  }
}
