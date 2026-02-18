/**
 * @module
 * Shared types and utilities for BMP encoding/decoding.
 */

// ============================================================================
// Types
// ============================================================================

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
 * shape so that decoders don't need to handle each variant separately.
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

// ============================================================================
// Utilities
// ============================================================================

/**
 * Derives absolute dimensions and row order from the signed width/height stored in the BMP header.
 *
 * @param width - Image width (signed).
 * @param height - Image height (signed: positive = bottom-up, negative = top-down).
 * @returns Absolute dimensions and whether rows are stored top-down.
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
 * BMP rows must be padded to 4-byte boundaries.
 *
 * @param width - Image width in pixels.
 * @param bitsPerPixel - Bits per pixel.
 * @returns Bytes per row, padded to a 4-byte boundary.
 */
export function calculateStride(width: number, bitsPerPixel: number): number {
  const bytesPerRow = Math.ceil((width * bitsPerPixel) / 8);
  return Math.ceil(bytesPerRow / 4) * 4;
}

/**
 * Analyzes a bit mask to find where the channel bits start and how many there are.
 *
 * @param mask - Bit mask for a single color channel.
 * @returns `shift` — position of the lowest set bit; `bits` — number of consecutive set bits.
 */
export function analyzeBitMask(mask: number): { shift: number; bits: number } {
  if (mask === 0) return { shift: 0, bits: 0 };

  let temp = mask;

  // Count trailing zeros to find the shift amount
  let shift = 0;
  while ((temp & 1) === 0) {
    shift++;
    temp >>>= 1;
  }

  // Count consecutive 1-bits to find the channel depth
  let bits = 0;
  while ((temp & 1) === 1) {
    bits++;
    temp >>>= 1;
  }

  return { shift, bits };
}
