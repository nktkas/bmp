/**
 * Shared types and utilities for BMP encoding/decoding.
 *
 * @module
 */

// =====================================================================================================================
// Types
// =====================================================================================================================

/** Raw pixel data in grayscale, RGB, or RGBA format. */
export interface RawImageData {
  /** Image width in pixels. */
  width: number;
  /** Image height in pixels. */
  height: number;
  /** Number of color channels: 1 (grayscale), 3 (RGB), or 4 (RGBA). */
  channels: 1 | 3 | 4;
  /** Pixel data buffer, laid out row by row, left to right, top to bottom. */
  data: Uint8Array;
}

/** A color from the BMP palette (color table). */
export interface Color {
  /** Red channel intensity (0–255). */
  red: number;
  /** Green channel intensity (0–255). */
  green: number;
  /** Blue channel intensity (0–255). */
  blue: number;
}

/** Custom bit masks that define how color channels are packed into each pixel. */
export interface BitfieldMasks {
  /** Bit mask for the red channel (e.g. 0x7C00 for 5-bit red in 16-bit pixel). */
  redMask: number;
  /** Bit mask for the green channel. */
  greenMask: number;
  /** Bit mask for the blue channel. */
  blueMask: number;
  /** Bit mask for the alpha channel. Omit or set to 0 if there is no alpha. */
  alphaMask?: number;
}

/**
 * Normalized BMP header — a flat representation of all BMP header variants.
 *
 * BMP files have many header versions (CORE 12 bytes, OS/2 16/64, INFO 40,
 * V2 52, V3 56, V4 108, V5 124). This interface normalizes them all into one
 * shape so that decoders do not need to handle each variant separately.
 */
export interface BmpHeader {
  /** Byte offset from the start of the file to the pixel data. */
  dataOffset: number;
  /** Size of the DIB header in bytes. Determines which BMP version was used. */
  headerSize: number;
  /** Image width in pixels. */
  width: number;
  /**
   * Image height in pixels (signed).
   * Positive = bottom-up row order (standard), negative = top-down row order.
   */
  height: number;
  /** Bits per pixel: 1, 2, 4, 8, 16, 24, 32, or 64. */
  bitsPerPixel: number;
  /**
   * Compression method:
   * - 0 = BI_RGB (uncompressed)
   * - 1 = BI_RLE8
   * - 2 = BI_RLE4
   * - 3 = BI_BITFIELDS (or BI_HUFFMAN when bitsPerPixel = 1)
   * - 4 = BI_JPEG (also used for RLE24 with 24bpp)
   * - 5 = BI_PNG
   * - 6 = BI_ALPHABITFIELDS
   */
  compression: number;
  /** Size of the pixel data in bytes. May be 0 for BI_RGB images. */
  imageSize: number;
  /** Number of colors in the palette. 0 means the maximum for this bit depth. */
  colorsUsed: number;
  /** Bit mask for red channel. 0 if not specified. */
  redMask: number;
  /** Bit mask for green channel. 0 if not specified. */
  greenMask: number;
  /** Bit mask for blue channel. 0 if not specified. */
  blueMask: number;
  /** Bit mask for alpha channel. 0 if not specified. */
  alphaMask: number;
}

// =====================================================================================================================
// Constants
// =====================================================================================================================

/** Bytes of the BMP file header, which precedes the DIB header in every variant. */
export const FILE_HEADER_SIZE = 14;

/** Five bits per channel, red highest, top bit unused. This is the layout of every uncompressed 16-bit BMP. */
export const RGB555_MASKS: BitfieldMasks = { redMask: 0x7C00, greenMask: 0x03E0, blueMask: 0x001F };

/** Six bits of green, five of red and blue. The encoder writes these when a 16-bit bitfields image names none. */
export const RGB565_MASKS: BitfieldMasks = { redMask: 0xF800, greenMask: 0x07E0, blueMask: 0x001F };

/** One byte per channel, alpha in the high byte. Both ends fall back to these at 32bpp. */
export const BGRA8888_MASKS: BitfieldMasks = {
  redMask: 0x00FF0000,
  greenMask: 0x0000FF00,
  blueMask: 0x000000FF,
  alphaMask: 0xFF000000,
};

/**
 * BMP compression methods (the `biCompression` field).
 *
 * Note the format overloads two codes by bit depth:
 * - code 3 is BI_BITFIELDS, or Modified Huffman when `bitsPerPixel === 1`
 * - code 4 is BI_JPEG, or RLE24 when `bitsPerPixel === 24`
 */
export const CompressionTypes = {
  /** Uncompressed RGB / indexed. */
  BI_RGB: 0,
  /** 8-bit run-length encoding (256-color indexed). */
  BI_RLE8: 1,
  /** 4-bit run-length encoding (16-color indexed). */
  BI_RLE4: 2,
  /** Custom RGB bit masks (or Modified Huffman at 1bpp). */
  BI_BITFIELDS: 3,
  /** Embedded JPEG (or RLE24 at 24bpp). */
  BI_JPEG: 4,
  /** Embedded PNG. */
  BI_PNG: 5,
  /** Custom RGBA bit masks. */
  BI_ALPHABITFIELDS: 6,
} as const satisfies Record<string, number>;

/** A BMP compression method value (see {@linkcode CompressionTypes}). */
export type CompressionType = typeof CompressionTypes[keyof typeof CompressionTypes];

// =====================================================================================================================
// Errors
// =====================================================================================================================

/**
 * Why a {@linkcode BmpError} was thrown, in a form code can branch on:
 * - `"INVALID_SIGNATURE"`: The bytes do not begin with a BMP file header.
 * - `"UNSUPPORTED_HEADER"`: The DIB header size matches no BMP header version this package reads.
 * - `"UNSUPPORTED_DEPTH"`: The BMP format defines no pixel layout for this depth under this compression.
 * - `"UNSUPPORTED_COMPRESSION"`: The compression method is one this package does not implement.
 * - `"EMBEDDED_IMAGE"`: The pixel data is a complete JPEG or PNG; {@linkcode extractCompressedData} returns it.
 * - `"INVALID_DIMENSIONS"`: The dimensions are not positive, or too large to allocate a buffer for.
 * - `"INVALID_DATA_SIZE"`: The pixel buffer length is not width x height x channels.
 * - `"INCOMPATIBLE_OPTIONS"`: The given depth, compression, row order and palette do not fit together.
 * - `"MALFORMED_FILE"`: The file is shorter than its header declares.
 */
export type BmpErrorCode =
  | "INVALID_SIGNATURE"
  | "UNSUPPORTED_HEADER"
  | "UNSUPPORTED_DEPTH"
  | "UNSUPPORTED_COMPRESSION"
  | "EMBEDDED_IMAGE"
  | "INVALID_DIMENSIONS"
  | "INVALID_DATA_SIZE"
  | "INCOMPATIBLE_OPTIONS"
  | "MALFORMED_FILE";

/**
 * Every failure of this package is reported as this class; {@linkcode BmpErrorCode} says which.
 *
 * An error raised outside the package is wrapped in one of these, with the original in `cause`.
 *
 * @typeParam C The code this error carries.
 *
 * @example
 * ```ts
 * import { BmpError, decode } from "@nktkas/bmp";
 *
 * try {
 *   decode(await Deno.readFile("image.bmp"));
 * } catch (error) {
 *   if (error instanceof BmpError && error.code === "EMBEDDED_IMAGE") console.log("the pixels are a JPEG or PNG");
 * }
 * ```
 */
export class BmpError<C extends BmpErrorCode = BmpErrorCode> extends Error {
  /** Prints as `BmpError: …` instead of `Error: …`. */
  override readonly name = "BmpError";

  /** Why the call failed. */
  readonly code: C;

  /**
   * Creates an error with the given code.
   *
   * @param code Why the call failed.
   * @param message What went wrong, naming the values involved.
   * @param options Forwarded to `Error`.
   */
  constructor(code: C, message: string, options?: ErrorOptions) {
    super(message, options);
    this.code = code;
  }
}

// =====================================================================================================================
// Utilities
// =====================================================================================================================

/**
 * Derives absolute dimensions and row order from the signed width/height stored in the BMP header.
 *
 * @param width Image width (signed).
 * @param height Image height (signed: positive = bottom-up, negative = top-down).
 *
 * @return Absolute dimensions and whether rows are stored top-down.
 */
export function getImageLayout(width: number, height: number): {
  absWidth: number;
  absHeight: number;
  isTopDown: boolean;
} {
  return {
    absWidth: Math.abs(width),
    absHeight: Math.abs(height),
    isTopDown: height < 0,
  };
}

/**
 * Calculates the byte stride (bytes per row) for a BMP image.
 *
 * @param width Image width in pixels.
 * @param bitsPerPixel Bits per pixel.
 *
 * @return Bytes per row, padded to a 4-byte boundary.
 */
export function calculateStride(width: number, bitsPerPixel: number): number {
  const bytesPerRow = Math.ceil((width * bitsPerPixel) / 8);
  return Math.ceil(bytesPerRow / 4) * 4;
}

/**
 * Rejects image dimensions too absurd to allocate a pixel buffer for.
 *
 * A 32-bit header field lets a small file declare 10^12 pixels. The cap is above any real image size
 * and is checked before allocation.
 *
 * @param width Absolute image width in pixels.
 * @param height Absolute image height in pixels.
 *
 * @throws {BmpError} `INVALID_DIMENSIONS`, when either dimension is not positive, or the two multiply out
 *                    past the cap.
 */
export function validateImageSize(width: number, height: number): void {
  const MAX_IMAGE_PIXELS = 1 << 30;
  if (width <= 0 || height <= 0) {
    throw new BmpError("INVALID_DIMENSIONS", `Invalid image dimensions: ${width}x${height}`);
  }
  if (width * height > MAX_IMAGE_PIXELS) {
    throw new BmpError(
      "INVALID_DIMENSIONS",
      `Image dimensions too large: ${width}x${height} exceeds ${MAX_IMAGE_PIXELS} pixels`,
    );
  }
}

/**
 * Analyzes a bit mask to find where the channel bits start and how many there are.
 *
 * @param mask Bit mask for a single color channel.
 *
 * @return `shift` — position of the lowest set bit; `bits` — number of consecutive set bits.
 */
export function analyzeBitMask(mask: number): { shift: number; bits: number } {
  if (mask === 0) return { shift: 0, bits: 0 };

  let temp = mask;

  let shift = 0;
  while ((temp & 1) === 0) {
    shift++;
    temp >>>= 1;
  }

  let bits = 0;
  while ((temp & 1) === 1) {
    bits++;
    temp >>>= 1;
  }

  return { shift, bits };
}
