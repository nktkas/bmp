import { getNormalizedHeaderInfo, parseBMPHeader } from "./_bmpHeader.ts";
import { BI_RGB_TO_RAW } from "./_bi_rgb.ts";
import { BI_RLE_TO_RAW } from "./_bi_rle.ts";
import { BI_BITFIELDS_TO_RAW } from "./_bi_bitfields.ts";

/** Options for decoding a BMP image. */
export interface DecodeOptions {
  /**
   * Specifies whether to remove the alpha channel after decompressing a 32-bit image in BI_RGB compression if it's fully opaque.
   * Exists for compatibility with other decoders.
   * Strongly affects performance.
   * @default true
   */
  removeEmptyAlpha?: boolean;
}

/** Represents an RGB(A) image data */
export interface RGBImageData {
  /** Width of the image in pixels */
  width: number;
  /** Height of the image in pixels */
  height: number;
  /** Number of channels in the image */
  channels: 3 | 4;
  /** Raw RGB(A) data */
  data: Uint8Array;
}

/**
 * Converts a BMP image to an raw RGB(A) image
 * @param bmp The BMP array to convert
 * @returns The raw RGB(A) image data and metadata
 *
 * @example
 * ```ts
 * import { decode } from "@nktkas/bmp";
 * import * as fs from "node:fs/promises";
 *
 * const file = await fs.readFile("image.bmp");
 * const bmp = decode(file);
 * // {
 * //   width: 800,
 * //   height: 600,
 * //   channels: 4,
 * //   data: Uint8Array(1920000) [ ... ] // RGB(A) pixel data
 * // }
 * ```
 */
export function decode(bmp: Uint8Array, options?: DecodeOptions): RGBImageData {
  const header = parseBMPHeader(bmp);
  const { biCompression } = getNormalizedHeaderInfo(header.infoHeader);

  switch (biCompression) {
    case 0:
      return BI_RGB_TO_RAW(bmp, header, options);
    case 1:
    case 2:
      return BI_RLE_TO_RAW(bmp, header);
    case 3:
      return BI_BITFIELDS_TO_RAW(bmp, header);
    case 4:
    case 5:
      throw new Error(
        `Unsupported compression type: ${biCompression} (JPEG/PNG in BMP). Use "extractCompressedData" to extract the embedded image.`,
      );
    default:
      throw new Error(`Unsupported compression type: ${biCompression}`);
  }
}

export { type CompressedImage, extractCompressedData } from "./_extractData.ts";
