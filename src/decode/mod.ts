/**
 * BMP image decoder — converts BMP binary data to raw pixel data.
 *
 * Supports all standard BMP compression types: BI_RGB, BI_RLE8, BI_RLE4,
 * BI_BITFIELDS, BI_ALPHABITFIELDS, RLE24, and Modified Huffman.
 * For embedded JPEG/PNG, use {@linkcode extractCompressedData}.
 *
 * @example
 * ```ts
 * import { decode } from "@nktkas/bmp/decode";
 *
 * const bmp = await Deno.readFile("image.bmp");
 * const { width, height, channels, data } = decode(bmp);
 * ```
 *
 * @module
 */

import { BmpError, type BmpErrorCode, CompressionTypes, type RawImageData, validateImageSize } from "../common.ts";
import { decodeBitfields } from "./bitfields.ts";
import { readHeader } from "./header.ts";
import { decodeHuffman } from "./huffman.ts";
import { decodeRgb } from "./rgb.ts";
import { decodeRle } from "./rle.ts";

export { BmpError };
export type { BmpErrorCode, RawImageData };

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
 * Decodes a BMP image to raw pixel data.
 *
 * @param bmp Complete BMP file contents as a byte array.
 *
 * @return Raw pixel data. An image whose palette is all grays is returned as a single channel.
 *
 * @throws {BmpError} `INVALID_SIGNATURE`, `UNSUPPORTED_HEADER`, `UNSUPPORTED_DEPTH`, `UNSUPPORTED_COMPRESSION`,
 *                    `EMBEDDED_IMAGE`, `INVALID_DIMENSIONS`, or `MALFORMED_FILE`.
 *
 * @example
 * ```ts
 * import { decode } from "@nktkas/bmp/decode";
 *
 * const bmp = await Deno.readFile("image.bmp");
 * const { width, height, channels, data } = decode(bmp);
 * ```
 */
export function decode(bmp: Uint8Array): RawImageData {
  try {
    return decodeChecked(bmp);
  } catch (error) {
    if (error instanceof BmpError) throw error;
    // A short file makes `DataView` throw a `RangeError`; the caller sees a `BmpError` instead.
    throw new BmpError("MALFORMED_FILE", "Malformed BMP file", { cause: error });
  }
}

/**
 * Dispatches to the decoder for the file's compression.
 *
 * @param bmp Complete BMP file contents as a byte array.
 *
 * @return Raw pixel data.
 *
 * @throws {BmpError} Every code {@linkcode decode} lists, apart from `MALFORMED_FILE`.
 */
function decodeChecked(bmp: Uint8Array): RawImageData {
  const header = readHeader(bmp);
  const { compression, bitsPerPixel } = header;
  validateImageSize(Math.abs(header.width), Math.abs(header.height));

  switch (compression) {
    case CompressionTypes.BI_RGB:
      return decodeRgb(bmp, header);

    case CompressionTypes.BI_RLE8:
    case CompressionTypes.BI_RLE4:
      return decodeRle(bmp, header);

    case CompressionTypes.BI_ALPHABITFIELDS:
      return decodeBitfields(bmp, header);

    case CompressionTypes.BI_BITFIELDS:
      // At 1bpp this code means Modified Huffman rather than bitfields.
      return bitsPerPixel === 1 ? decodeHuffman(bmp, header) : decodeBitfields(bmp, header);

    case CompressionTypes.BI_JPEG:
      // At 24bpp the JPEG code means RLE24 rather than an embedded image.
      if (bitsPerPixel === 24) return decodeRle(bmp, header);
      throw new BmpError("EMBEDDED_IMAGE", 'The pixels are a whole JPEG; read them with "extractCompressedData"');

    case CompressionTypes.BI_PNG:
      throw new BmpError("EMBEDDED_IMAGE", 'The pixels are a whole PNG; read them with "extractCompressedData"');

    default:
      throw new BmpError("UNSUPPORTED_COMPRESSION", `Unsupported BMP compression: ${compression}`);
  }
}

/**
 * Extracts compressed image data from a BMP file without decompression.
 *
 * Compression 4 (BI_JPEG) and 5 (BI_PNG) put a whole JPEG or PNG file where the pixel data would be.
 *
 * @param bmp Complete BMP file contents as a byte array.
 *
 * @return Compressed image data with dimensions and compression type. Its `data` is a view into `bmp`,
 *         not a copy.
 *
 * @throws {BmpError} `INVALID_SIGNATURE`, `UNSUPPORTED_HEADER`, or `MALFORMED_FILE`.
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
  let header;
  try {
    header = readHeader(bmp);
  } catch (error) {
    if (error instanceof BmpError) throw error;
    throw new BmpError("MALFORMED_FILE", "Malformed BMP file", { cause: error });
  }
  const { dataOffset, imageSize, width, height, compression } = header;

  return {
    width: Math.abs(width),
    height: Math.abs(height),
    compression,
    data: bmp.subarray(dataOffset, dataOffset + imageSize),
  };
}
