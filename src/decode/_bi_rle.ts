import type { RGBImageData } from "./mod.ts";
import { type BMPHeader, getNormalizedHeaderInfo } from "./_bmpHeader.ts";
import { extractColorTable } from "./_colorTable.ts";

/**
 * Converts a BMP with RLE compression to an raw RGB image
 * @param bmp The BMP array to convert
 * @param header Parsed BMP header
 * @returns The raw RGB image data and metadata
 */
export function BI_RLE_TO_RAW(bmp: Uint8Array, header: BMPHeader): RGBImageData {
  // 0. Get header data
  const { biWidth, biHeight } = getNormalizedHeaderInfo(header.infoHeader);

  // 1. Calculate image dimensions and orientation
  const absWidth = Math.abs(biWidth);
  const absHeight = Math.abs(biHeight);
  const isTopDown = biHeight < 0;

  // 2. Extract color palette and decompress RLE data
  const palette = extractColorTable(bmp, header)!;
  const paletteIndices = decompressionRLE(bmp, header);

  // 3. Allocate output buffer
  const output = new Uint8Array(absWidth * absHeight * 3);

  // 4. Process pixels (palette indices to RGB)
  const rowStride = absWidth * 3;
  for (let y = 0; y < absHeight; y++) {
    const srcY = isTopDown ? y : (absHeight - 1 - y);
    let srcPos = srcY * absWidth;
    let dstPos = y * rowStride;

    for (let x = 0; x < absWidth; x++) {
      const color = palette[paletteIndices[srcPos++]];
      output[dstPos++] = color.rgbRed;
      output[dstPos++] = color.rgbGreen;
      output[dstPos++] = color.rgbBlue;
    }
  }

  return {
    width: absWidth,
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
  // 0. Get header data and validate
  const { bfOffBits } = header.fileHeader;
  const { biWidth, biHeight, biCompression } = getNormalizedHeaderInfo(header.infoHeader);

  if (biCompression !== 1 && biCompression !== 2) {
    throw new Error("Image is not RLE compressed");
  }

  // 1. Calculate image dimensions and orientation
  const absWidth = Math.abs(biWidth);
  const absHeight = Math.abs(biHeight);
  const isTopDown = biHeight < 0;

  // 2. Allocate output buffer (stores palette indices, not RGB values)
  const pixels = new Uint8Array(absWidth * absHeight);

  // 3. Decode RLE stream
  let x = 0;
  let y = isTopDown ? 0 : absHeight - 1;
  let i = bfOffBits; // Read position in compressed data

  while (i < bmp.length - 1) {
    const count = bmp[i++];
    const byte = bmp[i++];

    if (count === 0) {
      // Escape codes
      switch (byte) {
        case 0: { // End of line
          x = 0;
          y += isTopDown ? 1 : -1;
          break;
        }
        case 1: { // End of bitmap
          return pixels;
        }
        case 2: { // Delta (skip pixels)
          x += bmp[i++];
          y += bmp[i++] * (isTopDown ? 1 : -1);
          break;
        }
        default: { // Absolute mode (uncompressed pixels)
          const row = isTopDown ? y : absHeight - 1 - y;
          let pos = row * absWidth + x;

          if (biCompression === 1) {
            // RLE8: direct byte copy
            for (let j = 0; j < byte; j++) {
              pixels[pos++] = bmp[i++];
            }
            x += byte;

            if (byte & 1) i++; // Skip padding byte if odd count
          } else {
            // RLE4: unpack nibbles (2 pixels per byte)
            const pairs = byte >> 1;
            for (let j = 0; j < pairs; j++) {
              const sourceByte = bmp[i++];
              pixels[pos++] = (sourceByte >> 4) & 0xF; // High nibble
              pixels[pos++] = sourceByte & 0xF; // Low nibble
            }
            if (byte & 1) pixels[pos] = (bmp[i++] >> 4) & 0xF; // Last odd nibble
            x += byte;

            const bytesUsed = (byte + 1) >> 1;
            if (bytesUsed & 1) i++; // Skip padding byte if odd count
          }
        }
      }
    } else {
      // Encoded mode (repeat value)
      const row = isTopDown ? y : absHeight - 1 - y;
      let pos = row * absWidth + x;

      if (biCompression === 1) {
        // RLE8: repeat single byte
        for (let j = 0; j < count; j++) {
          pixels[pos++] = byte;
        }
        x += count;
      } else {
        // RLE4: repeat nibbles (2 pixels per byte)
        const highNibble = (byte >> 4) & 0xF;
        const lowNibble = byte & 0xF;
        const pairs = count >> 1;
        for (let j = 0; j < pairs; j++) {
          pixels[pos++] = highNibble;
          pixels[pos++] = lowNibble;
        }
        if (count & 1) pixels[pos] = highNibble;

        x += count;
      }
    }
  }

  return pixels;
}
