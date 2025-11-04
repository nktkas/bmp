import type { RawImageData } from "../_common.ts";
import type { RGBQUAD } from "../decode/_colorTable.ts";
import { type BitfieldMasks, encodeBiBitfields } from "./_bi_bitfields.ts";
import { encodeBiRgb } from "./_bi_rgb.ts";
import { encodeBiRle4, encodeBiRle8 } from "./_bi_rle.ts";
import { CompressionTypes, type HeaderType, writeBMPHeader } from "./_bmpWriter.ts";

/** Options for encoding BMP images */
export interface EncodeOptions {
  /**
   * Bits per pixel (1, 4, 8, 16, 24, or 32).
   *
   * Default: Auto-detected from input channels
   * - channels=1 (grayscale) → 8-bit
   * - channels=3 (RGB) → 24-bit
   * - channels=4 (RGBA) → 32-bit
   */
  bitsPerPixel?: 1 | 4 | 8 | 16 | 24 | 32;

  /**
   * BMP compression method identifiers.
   * - 0 (BI_RGB) - No compression. Raw pixel data.
   * - 1 (BI_RLE8) - 8-bit run-length encoding. 256-color indexed only.
   * - 2 (BI_RLE4) - 4-bit run-length encoding. 16-color indexed only.
   * - 3 (BI_BITFIELDS) - Uncompressed with custom RGB bit masks.
   * - 6 (BI_ALPHABITFIELDS) - Uncompressed with custom RGBA bit masks.
   *
   * Default: 0 (BI_RGB)
   */
  compression?: 0 | 1 | 2 | 3 | 6;

  /**
   * BMP header format type. Determines header size and features.
   * - `BITMAPINFOHEADER`: 40 bytes. Basic format.
   * - `BITMAPV4HEADER`: 108 bytes. Embedded masks, color space, gamma support.
   * - `BITMAPV5HEADER`: 124 bytes. Adds ICC profiles and rendering intent.
   *
   * Default: `BITMAPINFOHEADER`
   */
  headerType?: HeaderType;

  /**
   * BMP image orientation.
   * - `false` - bottom-up (standard BMP)
   * - `true` - top-down
   *
   * Default: false
   */
  topDown?: boolean;

  /**
   * Color palette for indexed formats (1, 4, 8-bit).
   *
   * If not provided, palette will be generated automatically.
   */
  palette?: RGBQUAD[];

  /**
   * Bitfield masks for BI_BITFIELDS/BI_ALPHABITFIELDS compression.
   *
   * If not provided, default masks will be used:
   * - 16-bit - RGB565 (5-6-5)
   * - 32-bit - BGRA (8-8-8-8)
   */
  bitfields?: BitfieldMasks;
}

/**
 * Validates encode options and input data.
 * @param raw - Raw image data
 * @param options - Encode options
 */
function validateEncodeOptions(raw: RawImageData, options: EncodeOptions): void {
  // Validate dimensions
  if (raw.width <= 0 || raw.height <= 0) {
    throw new Error("Invalid image dimensions");
  }

  // Validate data size
  const expectedSize = raw.width * raw.height * raw.channels;
  if (raw.data.length !== expectedSize) {
    throw new Error(`Invalid data size: expected ${expectedSize}, got ${raw.data.length}`);
  }

  // Validate compression compatibility
  if (options.compression === CompressionTypes.BI_RLE8 && options.bitsPerPixel !== 8) {
    throw new Error("BI_RLE8 compression requires 8-bit format");
  }

  if (options.compression === CompressionTypes.BI_RLE4 && options.bitsPerPixel !== 4) {
    throw new Error("BI_RLE4 compression requires 4-bit format");
  }

  if (
    options.compression === CompressionTypes.BI_BITFIELDS &&
    options.bitsPerPixel !== 16 && options.bitsPerPixel !== 32
  ) {
    throw new Error("BI_BITFIELDS compression requires 16-bit or 32-bit format");
  }

  if (options.compression === CompressionTypes.BI_ALPHABITFIELDS && options.bitsPerPixel !== 32) {
    throw new Error("BI_ALPHABITFIELDS compression requires 32-bit format");
  }
}

/**
 * Determines default bits per pixel based on input channels.
 * @param channels - Number of channels in input
 * @returns Default bits per pixel
 */
function getDefaultBitsPerPixel(channels: 1 | 3 | 4): 8 | 24 | 32 {
  switch (channels) {
    case 1:
      return 8; // Grayscale → 8-bit indexed
    case 3:
      return 24; // RGB → 24-bit BGR
    case 4:
      return 32; // RGBA → 32-bit BGRA
  }
}

/**
 * Determines default bitfield masks based on bits per pixel.
 * @param bitsPerPixel - Bits per pixel (16 or 32)
 * @returns Default bitfield masks (RGB565 for 16-bit, BGRA for 32-bit)
 */
function getDefaultBitfieldMasks(bitsPerPixel: 16 | 32): BitfieldMasks {
  if (bitsPerPixel === 16) {
    return { // RGB565
      redMask: 0x0000F800, // 5 bits
      greenMask: 0x000007E0, // 6 bits
      blueMask: 0x0000001F, // 5 bits
    };
  } else {
    return { // BGRA
      redMask: 0x00FF0000, // 8 bits
      greenMask: 0x0000FF00, // 8 bits
      blueMask: 0x000000FF, // 8 bits
      alphaMask: 0xFF000000, // 8 bits
    };
  }
}

/**
 * Encodes raw image data into BMP format.
 * @param raw - Raw image data (grayscale, RGB, or RGBA)
 * @param options - Encoding options
 * @returns BMP file as Uint8Array
 *
 * @example
 * Basic usage
 * ```ts
 * import { encode } from "@nktkas/bmp";
 *
 * // A minimal raw image
 * const raw = {
 *   width: 2,
 *   height: 2,
 *   channels: 3, // 1 (grayscale), 3 (RGB), or 4 (RGBA)
 *   data: new Uint8Array([ // 2x2 black and white pixels
 *     0, 0, 0,  255, 255, 255,
 *     0, 0, 0,  255, 255, 255,
 *   ]),
 * } as const;
 *
 * // Encode to 24-bit BMP (automatic detection of best settings based on raw data)
 * const bmp = encode(raw);
 * // Returns Uint8Array with complete BMP file
 * ```
 *
 * @example
 * Advanced options
 * ```ts
 * import { encode } from "@nktkas/bmp";
 *
 * // A minimal raw image
 * const raw = {
 *   width: 2,
 *   height: 2,
 *   channels: 1, // 1 (grayscale), 3 (RGB), or 4 (RGBA)
 *   data: new Uint8Array([0, 255, 0, 255]), // 2x2 black and white pixels
 * } as const;
 *
 * // Encode with 8-bit indexed color
 * const bmp = encode(raw, { bitsPerPixel: 8 });
 * // Returns Uint8Array with complete BMP file
 * ```
 */
export function encode(raw: RawImageData, options: EncodeOptions = {}): Uint8Array {
  // Create options object
  const options_ = {
    bitsPerPixel: options.bitsPerPixel || getDefaultBitsPerPixel(raw.channels),
    compression: options.compression ?? CompressionTypes.BI_RGB,
    headerType: options.headerType || "BITMAPINFOHEADER",
    topDown: options.topDown ?? false,
    palette: options.palette,
    bitfields: options.bitfields,
  };
  validateEncodeOptions(raw, options_);

  // Encode pixel data based on compression
  let pixelData: Uint8Array;
  let palette: RGBQUAD[] | undefined;
  let bitfields: BitfieldMasks | undefined;

  switch (options_.compression) {
    case CompressionTypes.BI_RGB: {
      const result = encodeBiRgb(
        raw,
        options_.bitsPerPixel,
        options_.topDown,
        options_.palette,
      );
      pixelData = result.pixelData;
      palette = result.palette;
      break;
    }

    case CompressionTypes.BI_RLE8: {
      const result = encodeBiRle8(raw, options_.palette);
      pixelData = result.pixelData;
      palette = result.palette;
      break;
    }

    case CompressionTypes.BI_RLE4: {
      const result = encodeBiRle4(raw, options_.palette);
      pixelData = result.pixelData;
      palette = result.palette;
      break;
    }

    case CompressionTypes.BI_BITFIELDS:
    case CompressionTypes.BI_ALPHABITFIELDS: {
      bitfields = options_.bitfields || getDefaultBitfieldMasks(options_.bitsPerPixel as 16 | 32);
      pixelData = encodeBiBitfields(
        raw,
        raw.width,
        raw.height,
        options_.bitsPerPixel as 16 | 32,
        bitfields,
        options_.topDown,
      );
      break;
    }

    default:
      throw new Error(`Unsupported compression: ${options_.compression}`);
  }

  // Write BMP header
  const header = writeBMPHeader({
    width: raw.width,
    height: raw.height,
    bitsPerPixel: options_.bitsPerPixel,
    compression: options_.compression,
    imageDataSize: pixelData.length,
    colorTable: palette,
    headerType: options_.headerType,
    topDown: options_.topDown,
    bitfields,
  });

  // Combine header and pixel data
  const result = new Uint8Array(header.length + pixelData.length);
  result.set(header, 0);
  result.set(pixelData, header.length);

  return result;
}

// Re-export types
export type { BitfieldMasks, RawImageData, RGBQUAD };
