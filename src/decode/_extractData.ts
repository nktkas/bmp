import { getNormalizedHeaderInfo, parseBMPHeader } from "./_bmpHeader.ts";

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
 * For example, to extract embedded JPEG or PNG data.
 * @param bmp The BMP array to extract from
 * @returns The compressed image data and metadata
 *
 * @example
 * ```ts
 * import { extractCompressedData } from "@nktkas/bmp";
 * import * as fs from "node:fs/promises";
 *
 * const file = await fs.readFile("jpeg.bmp");
 * const bmp = extractCompressedData(file);
 * // {
 * //   width: 800,
 * //   height: 600,
 * //   compression: 5, // 4 for BI_JPEG, 5 for BI_PNG
 * //   data: Uint8Array(123456) [ ... ] // JPEG/PNG binary data
 * // }
 * ```
 */
export function extractCompressedData(bmp: Uint8Array): CompressedImage {
  const header = parseBMPHeader(bmp);
  const { bfOffBits } = header.fileHeader;
  const { biWidth, biHeight, biCompression, biSizeImage } = getNormalizedHeaderInfo(header.infoHeader);

  const absHeight = Math.abs(biHeight);
  const data = bmp.slice(bfOffBits, bfOffBits + biSizeImage);

  return {
    width: biWidth,
    height: absHeight,
    compression: biCompression,
    data,
  };
}
