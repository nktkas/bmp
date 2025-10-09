import { getNormalizedHeaderInfo, parseBMPHeader } from "./_bmpHeader.ts";
import { BI_RGB_TO_RAW } from "./_bi_rgb.ts";
import { BI_RLE_TO_RAW } from "./_bi_rle.ts";
import { BI_BITFIELDS_TO_RAW } from "./_bi_bitfields.ts";

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
export function decode(bmp: Uint8Array): RGBImageData {
  const header = parseBMPHeader(bmp);
  const { biCompression } = getNormalizedHeaderInfo(header.infoHeader);

  switch (biCompression) {
    case 0:
      return BI_RGB_TO_RAW(bmp, header);
    case 1:
    case 2:
      return BI_RLE_TO_RAW(bmp, header);
    case 3:
    case 6:
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
