/**
 * @module
 * BMP image decoder — converts BMP binary data to raw pixel data.
 *
 * Supports all standard BMP compression types: BI_RGB, BI_RLE8, BI_RLE4,
 * BI_BITFIELDS, BI_ALPHABITFIELDS, RLE24, and Modified Huffman.
 * For embedded JPEG/PNG, use {@link extractCompressedData}.
 *
 * @example
 * ```ts
 * import { decode } from "@nktkas/bmp/decode";
 *
 * const bmp = await Deno.readFile("image.bmp");
 * const { width, height, channels, data } = decode(bmp);
 * ```
 */

import type { RawImageData } from "../common.ts";
import { readHeader } from "./header.ts";
import { decodeRgb } from "./rgb.ts";
import { decodeBitfields } from "./bitfields.ts";
import { decodeRle } from "./rle.ts";
import { decodeHuffman } from "./huffman.ts";

/**
 * Decodes a BMP image to raw pixel data.
 *
 * @param bmp - Complete BMP file contents as a byte array.
 * @returns Raw pixel data with width, height, channel count, and pixel buffer.
 */
export function decode(bmp: Uint8Array): RawImageData {
  const header = readHeader(bmp);

  switch (header.compression) {
    case 0: // BI_RGB — uncompressed
      return decodeRgb(bmp, header);

    case 1: // BI_RLE8
    case 2: // BI_RLE4
      return decodeRle(bmp, header);

    case 3: // BI_BITFIELDS or BI_HUFFMAN (distinguished by bitsPerPixel)
      return header.bitsPerPixel === 1 ? decodeHuffman(bmp, header) : decodeBitfields(bmp, header);

    case 4: // BI_JPEG or RLE24 (distinguished by bitsPerPixel)
      if (header.bitsPerPixel === 24) return decodeRle(bmp, header);
      throw new Error(
        `Unsupported compression: ${header.compression} (JPEG in BMP). Use "extractCompressedData" to extract the embedded image.`,
      );

    case 5: // BI_PNG
      throw new Error(
        `Unsupported compression: ${header.compression} (PNG in BMP). Use "extractCompressedData" to extract the embedded image.`,
      );

    case 6: // BI_ALPHABITFIELDS
      return decodeBitfields(bmp, header);

    default:
      throw new Error(`Unsupported compression type: ${header.compression}`);
  }
}

/** Compressed image data extracted from a BMP file without decompression. */
export interface CompressedImageData {
  /** Image width in pixels. */
  width: number;
  /** Image height in pixels. */
  height: number;
  /** BMP compression type (e.g. 4 = BI_JPEG, 5 = BI_PNG). */
  compression: number;
  /** Raw compressed data (e.g. a complete JPEG or PNG file). */
  data: Uint8Array;
}

/**
 * Extracts compressed image data from a BMP file without decompression.
 *
 * Useful for BMP files that embed JPEG (compression = 4) or PNG (compression = 5)
 * data. The extracted data can be decoded with any standard JPEG/PNG decoder.
 *
 * @param bmp - Complete BMP file contents as a byte array.
 * @returns Compressed image data with dimensions and compression type.
 *
 * @example
 * ```ts
 * import { extractCompressedData } from "@nktkas/bmp/decode";
 *
 * const bmp = await Deno.readFile("embedded_png.bmp");
 * const { data, compression } = extractCompressedData(bmp);
 * // `data` is a complete PNG file that can be decoded separately
 * ```
 */
export function extractCompressedData(bmp: Uint8Array): CompressedImageData {
  const header = readHeader(bmp);
  const { dataOffset, imageSize, width, height, compression } = header;

  return {
    width: Math.abs(width),
    height: Math.abs(height),
    compression,
    data: bmp.subarray(dataOffset, dataOffset + imageSize),
  };
}

export type { RawImageData };
