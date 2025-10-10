import type { RawImageData } from "../_common.ts";
import { getNormalizedHeaderInfo, readBMPHeader } from "./_bmpHeader.ts";
import { BI_RGB_TO_RAW } from "./_bi_rgb.ts";
import { BI_RLE_TO_RAW } from "./_bi_rle.ts";
import { BI_BITFIELDS_TO_RAW } from "./_bi_bitfields.ts";
import { BI_HUFFMAN_TO_RAW } from "./_bi_huffman.ts";

export type { RawImageData };

/**
 * Converts a BMP image to a raw pixel image data
 * @param bmp The BMP array to convert
 * @returns The raw pixel image data (width, height, channels, data)
 *
 * @example
 * ```ts
 * import { decode } from "@nktkas/bmp";
 *
 * // A minimal 1x1 pixel 24-bit BMP file
 * const bmp = new Uint8Array([
 *   // BMP File Header (14 bytes)
 *   0x42, 0x4D,             // Signature 'BM'
 *   0x3A, 0x00, 0x00, 0x00, // File size (58 bytes)
 *   0x00, 0x00,             // Reserved
 *   0x00, 0x00,             // Reserved
 *   0x36, 0x00, 0x00, 0x00, // Pixel data offset (54 bytes)
 *   // DIB Header (BITMAPINFOHEADER, 40 bytes)
 *   0x28, 0x00, 0x00, 0x00, // Header size (40)
 *   0x01, 0x00, 0x00, 0x00, // Width (1 pixel)
 *   0x01, 0x00, 0x00, 0x00, // Height (1 pixel)
 *   0x01, 0x00,             // Color planes (1)
 *   0x18, 0x00,             // Bits per pixel (24)
 *   0x00, 0x00, 0x00, 0x00, // Compression (0 = none)
 *   0x04, 0x00, 0x00, 0x00, // Image size (4 bytes with padding)
 *   0x00, 0x00, 0x00, 0x00, // X pixels per meter
 *   0x00, 0x00, 0x00, 0x00, // Y pixels per meter
 *   0x00, 0x00, 0x00, 0x00, // Colors used
 *   0x00, 0x00, 0x00, 0x00, // Important colors
 *   // Pixel data (BGR format + padding to 4 bytes)
 *   0x00, 0x00, 0x00,       // Black pixel (Blue, Green, Red)
 *   0x00                    // Padding to 4 bytes
 * ]);
 *
 * const raw = decode(bmp);
 * // { width: 1, height: 1, channels: 3, data: Uint8Array(3) [0, 0, 0] }
 * ```
 */
export function decode(bmp: Uint8Array): RawImageData {
  const header = readBMPHeader(bmp);
  const { biCompression, biBitCount } = getNormalizedHeaderInfo(header.infoHeader);

  if (biCompression === 0) {
    return BI_RGB_TO_RAW(bmp, header);
  }
  if (biCompression === 1 || biCompression === 2 || (biCompression === 4 && biBitCount === 24)) {
    return BI_RLE_TO_RAW(bmp, header);
  }
  if (biCompression === 3 && biBitCount === 1) {
    return BI_HUFFMAN_TO_RAW(bmp, header);
  }
  if (biCompression === 3 || biCompression === 6) {
    return BI_BITFIELDS_TO_RAW(bmp, header);
  }

  if (biCompression === 4) {
    throw new Error(
      `Unsupported compression type: ${biCompression} (JPEG in BMP). Use "extractCompressedData" to extract the embedded image.`,
    );
  }
  if (biCompression === 5) {
    throw new Error(
      `Unsupported compression type: ${biCompression} (PNG in BMP). Use "extractCompressedData" to extract the embedded image.`,
    );
  }
  throw new Error(`Unsupported compression type: ${biCompression}`);
}

/** Compressed image data extracted from BMP */
export interface CompressedImage {
  /** Image width in pixels */
  width: number;
  /** Image height in pixels */
  height: number;
  /**
   * Compression type:
   * - 0 = BI_RGB (no compression)
   * - 1 = BI_RLE8
   * - 2 = BI_RLE4
   * - 3 = BI_BITFIELDS
   * - 4 = BI_JPEG
   * - 5 = BI_PNG
   * - 6 = BI_ALPHABITFIELDS
   * - 11 = BI_CMYK
   * - 12 = BI_CMYKRLE8
   * - 13 = BI_CMYKRLE4
   */
  compression: number;
  /** Raw compressed data */
  data: Uint8Array;
}

/**
 * Extracts compressed image data from a BMP file without decompression.
 *
 * Useful for BI_JPEG and BI_PNG compressed BMPs.
 * But can also be used for other compression types if needed.
 * @param bmp The BMP array to extract from
 * @returns The compressed image data
 *
 * @example
 * ```ts
 * import { extractCompressedData } from "@nktkas/bmp";
 *
 * // A minimal 1x1 pixel BMP file with embedded PNG data (BI_PNG compression)
 * const bmp = new Uint8Array([
 *   // BMP File Header (14 bytes)
 *   0x42, 0x4D,             // Signature 'BM'
 *   0x7B, 0x00, 0x00, 0x00, // File size (123 bytes)
 *   0x00, 0x00,             // Reserved
 *   0x00, 0x00,             // Reserved
 *   0x36, 0x00, 0x00, 0x00, // Pixel data offset (54 bytes)
 *   // DIB Header (BITMAPINFOHEADER, 40 bytes)
 *   0x28, 0x00, 0x00, 0x00, // Header size (40)
 *   0x01, 0x00, 0x00, 0x00, // Width (1 pixel)
 *   0x01, 0x00, 0x00, 0x00, // Height (1 pixel)
 *   0x01, 0x00,             // Color planes (1)
 *   0x00, 0x00,             // Bits per pixel (0 for BI_PNG)
 *   0x05, 0x00, 0x00, 0x00, // Compression (5 = BI_PNG)
 *   0x45, 0x00, 0x00, 0x00, // Image size (69 bytes - PNG data size)
 *   0x00, 0x00, 0x00, 0x00, // X pixels per meter
 *   0x00, 0x00, 0x00, 0x00, // Y pixels per meter
 *   0x00, 0x00, 0x00, 0x00, // Colors used
 *   0x00, 0x00, 0x00, 0x00, // Important colors
 *   // Embedded PNG data (69 bytes) - 1x1 black pixel
 *   // PNG signature
 *   0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A,
 *   // IHDR chunk
 *   0x00, 0x00, 0x00, 0x0D, 0x49, 0x48, 0x44, 0x52,
 *   0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
 *   0x08, 0x00, 0x00, 0x00, 0x00, 0x3A, 0x7E, 0x9B, 0x55,
 *   // IDAT chunk
 *   0x00, 0x00, 0x00, 0x0C, 0x49, 0x44, 0x41, 0x54,
 *   0x08, 0x1D, 0x01, 0x02, 0x00, 0xFD, 0xFF, 0x00,
 *   0x00, 0xE5, 0xE3, 0x00, 0x09, 0x74, 0xC6, 0xD6, 0xC2,
 *   // IEND chunk
 *   0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4E, 0x44,
 *   0xAE, 0x42, 0x60, 0x82
 * ]);
 *
 * const extracted = extractCompressedData(bmp);
 * // { width: 1, height: 1, compression: 5, data: Uint8Array(69) [...] }
 * //                                     ^ BI_JPEG = 4, BI_PNG = 5
 *
 * // Then you can decode it with any JPEG/PNG decoder
 * import sharp from "npm:sharp";
 * const raw = await sharp(extracted.data).raw().toBuffer();
 * ```
 */
export function extractCompressedData(bmp: Uint8Array): CompressedImage {
  // 0. Get header data
  const header = readBMPHeader(bmp);
  const { bfOffBits } = header.fileHeader;
  const { biWidth, biHeight, biCompression, biSizeImage } = getNormalizedHeaderInfo(header.infoHeader);

  // 1. Extract image dimensions and data
  const absWidth = Math.abs(biWidth);
  const absHeight = Math.abs(biHeight);
  const data = bmp.slice(bfOffBits, bfOffBits + biSizeImage);

  return {
    width: absWidth,
    height: absHeight,
    compression: biCompression,
    data,
  };
}
