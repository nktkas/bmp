import type { RGBImageData } from "./mod.ts";
import { type BMPHeader, getNormalizedHeaderInfo } from "./_bmpHeader.ts";
import { parseColorTable } from "./_colorTable.ts";

/**
 * Converts a BMP with RLE compression to an raw RGB image
 * @param bmp The BMP array to convert
 * @param header Optional pre-parsed BMP header (to avoid re-parsing)
 * @returns The raw RGB image data and metadata
 */
export function BI_RLE_TO_RAW(bmp: Uint8Array, header: BMPHeader): RGBImageData {
  const { biWidth, biHeight } = getNormalizedHeaderInfo(header.infoHeader);

  // Handle image orientation
  const absHeight = Math.abs(biHeight);
  const isTopDown = biHeight < 0;

  // Parse color table
  const palette = parseColorTable(bmp, header.infoHeader);

  // Decompress RLE data to raw palette indices
  const paletteIndices = decompressionRLE(bmp, header);

  // Create output buffer
  const output = new Uint8Array(biWidth * absHeight * 3);

  // Process each row
  for (let y = 0; y < absHeight; y++) {
    // Determine source row based on image orientation
    const srcY = isTopDown ? y : (absHeight - 1 - y);

    // Calculate row offset
    const dstRowOffset = y * biWidth * 3;

    // Process each pixel in the row
    for (let x = 0; x < biWidth; x++) {
      // Get color from palette
      const colorIndex = paletteIndices[srcY * biWidth + x];
      const r = palette![colorIndex].rgbRed;
      const g = palette![colorIndex].rgbGreen;
      const b = palette![colorIndex].rgbBlue;

      // Write pixel to output buffer in RGB format (RLE not supporting alpha)
      const dstOffset = dstRowOffset + x * 3;
      output[dstOffset] = r;
      output[dstOffset + 1] = g;
      output[dstOffset + 2] = b;
    }
  }

  return {
    width: biWidth,
    height: absHeight,
    channels: 3,
    data: output,
  };
}

/**
 * Decompresses RLE-encoded BMP data to raw palette indices
 * RLE format: pairs of (count, value) bytes with escape sequences
 * - count=0: escape code (end of line, end of bitmap, delta, or absolute mode)
 * - count>0: encoded mode (repeat value count times)
 */
function decompressionRLE(bmp: Uint8Array, header: BMPHeader): Uint8Array {
  const { bfOffBits } = header.fileHeader;
  const { biWidth, biHeight, biCompression } = getNormalizedHeaderInfo(header.infoHeader);

  // Validate compression type: 1=RLE8, 2=RLE4
  if (biCompression !== 1 && biCompression !== 2) {
    throw new Error("Image is not RLE compressed");
  }

  // Handle image orientation
  const absHeight = Math.abs(biHeight);
  const isTopDown = biHeight < 0;

  // Output buffer stores palette indices (not RGB values)
  const pixels = new Uint8Array(biWidth * absHeight);

  // Cursor position in the output image
  let x = 0;
  let y = isTopDown ? 0 : absHeight - 1;
  let i = bfOffBits; // Read position in compressed data

  while (i < bmp.length - 1) {
    const count = bmp[i++];
    const byte = bmp[i++];

    if (count === 0) { // Escape codes
      switch (byte) {
        case 0: { // End of line
          // Move to the start of the next line
          x = 0;
          y += isTopDown ? 1 : -1;
          break;
        }
        case 1: { // End of bitmap
          // Finished decoding
          return pixels;
        }
        case 2: { // Delta
          // Skip pixels
          x += bmp[i++];
          y += bmp[i++] * (isTopDown ? 1 : -1);
          break;
        }
        default: { // Absolute mode: copy uncompressed pixels
          // Calculate target row (flip for bottom-up images)
          const row = isTopDown ? y : absHeight - 1 - y;
          const rowOffset = row * biWidth;

          if (biCompression === 1) { // RLE8
            // Direct byte copy
            for (let j = 0; j < byte; j++) {
              pixels[rowOffset + x + j] = bmp[i + j];
            }
            i += byte;
            x += byte;
            if (byte & 1) i++; // Skip padding byte if odd byte count
          } else { // RLE4
            // Unpack nibbles (2 pixels per byte)
            for (let j = 0; j < byte; j++) {
              const byteIndex = j >> 1;
              const sourceByte = bmp[i + byteIndex];
              pixels[rowOffset + x + j] = (j & 1)
                ? (sourceByte & 0xF) // low nibble
                : ((sourceByte >> 4) & 0xF); // high nibble
            }
            const bytesUsed = (byte + 1) >> 1;
            i += bytesUsed;
            x += byte;
            if (bytesUsed & 1) i++; // Skip padding byte if odd byte count
          }
        }
      }
    } else { // Encoded mode: repeat value
      // Calculate target row (flip for bottom-up images)
      const row = isTopDown ? y : absHeight - 1 - y;
      const rowOffset = row * biWidth;

      if (biCompression === 1) { // RLE8
        // Repeat single byte
        for (let j = 0; j < count; j++) {
          pixels[rowOffset + x + j] = byte;
        }
        x += count;
      } else { // RLE4
        // Repeat nibbles (2 pixels per byte)
        const highNibble = (byte >> 4) & 0xF;
        const lowNibble = byte & 0xF;
        for (let j = 0; j < count; j++) {
          pixels[rowOffset + x + j] = (j & 1) ? lowNibble : highNibble;
        }
        x += count;
      }
    }
  }

  return pixels;
}
