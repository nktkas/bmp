import type { RawImageData } from "./mod.ts";
import { type BMPHeader, getNormalizedHeaderInfo } from "./_bmpHeader.ts";
import { extractColorTable } from "./_colorTable.ts";

/**
 * Converts a BMP with RLE compression to a raw pixel image data
 * @param bmp The BMP array to convert
 * @param header Parsed BMP header
 * @returns The raw pixel image data (width, height, channels, data)
 */
export function BI_RLE_TO_RAW(bmp: Uint8Array, header: BMPHeader): RawImageData {
  // 0. Get header data
  const { biWidth, biHeight, biCompression, biBitCount } = getNormalizedHeaderInfo(header.infoHeader);

  const isRLE24 = biCompression === 4 && biBitCount === 24;
  if (biCompression !== 1 && biCompression !== 2 && !isRLE24) {
    throw new Error(
      `Unsupported BMP compression method: received ${biCompression}, expected 1 (RLE8), 2 (RLE4), or 4 with bitCount=24 (RLE24)`,
    );
  }

  // 1. Calculate image dimensions and orientation
  const absWidth = Math.abs(biWidth);
  const absHeight = Math.abs(biHeight);
  const isTopDown = biHeight < 0;

  // 2. Allocate output buffer
  const output = new Uint8Array(absWidth * absHeight * 3);

  // 3. Route based on RLE type
  if (isRLE24) {
    // RLE24 - direct RGB output, no palette
    const pixels = decompressRLE(bmp, header);

    // 4. Process pixels (BGR to RGB)
    const rowStride = absWidth * 3;
    for (let y = 0; y < absHeight; y++) {
      const srcY = isTopDown ? y : (absHeight - 1 - y);
      let srcPos = srcY * absWidth * 3;
      let dstPos = y * rowStride;

      for (let x = 0; x < absWidth; x++) {
        // Convert BGR to RGB
        output[dstPos++] = pixels[srcPos + 2]; // R
        output[dstPos++] = pixels[srcPos + 1]; // G
        output[dstPos++] = pixels[srcPos]; // B
        srcPos += 3;
      }
    }
  } else {
    // RLE4/RLE8 - indexed color with palette
    const palette = extractColorTable(bmp, header)!;
    const paletteIndices = decompressRLE(bmp, header);

    // 4. Process pixels (palette indices to RGB)
    const rowStride = absWidth * 3;
    for (let y = 0; y < absHeight; y++) {
      const srcY = isTopDown ? y : (absHeight - 1 - y);
      let srcPos = srcY * absWidth;
      let dstPos = y * rowStride;

      for (let x = 0; x < absWidth; x++) {
        // Lookup color in palette
        const color = palette[paletteIndices[srcPos++]];
        output[dstPos++] = color.red;
        output[dstPos++] = color.green;
        output[dstPos++] = color.blue;
      }
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
 * Decompresses RLE-encoded BMP data
 * - RLE4/RLE8: returns palette indices (1 byte per pixel)
 * - RLE24: returns BGR triplets (3 bytes per pixel)
 * RLE format: pairs of (count, value) bytes with escape sequences
 * - count=0: escape code (end of line, end of bitmap, delta, or absolute mode)
 * - count>0: encoded mode (repeat value count times)
 */
function decompressRLE(bmp: Uint8Array, header: BMPHeader): Uint8Array {
  // 0. Get header data
  const { bfOffBits } = header.fileHeader;
  const { biWidth, biHeight, biCompression, biBitCount } = getNormalizedHeaderInfo(header.infoHeader);

  const isRLE24 = biCompression === 4 && biBitCount === 24;

  // 1. Calculate image dimensions and orientation
  const absWidth = Math.abs(biWidth);
  const absHeight = Math.abs(biHeight);
  const isTopDown = biHeight < 0;

  // 2. Determine pixel size and allocate buffer
  const pixelSize = isRLE24 ? 3 : 1; // RLE24: 3 bytes (BGR), RLE4/8: 1 byte (index)
  const pixels = new Uint8Array(absWidth * absHeight * pixelSize);

  // 3. Decode RLE stream
  let x = 0;
  let y = isTopDown ? 0 : absHeight - 1;
  let i = bfOffBits; // Read position in compressed data

  while (i < bmp.length - 1) {
    const count = bmp[i++];

    if (count === 0) {
      // Escape codes
      const byte = bmp[i++];

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
          let pos = (row * absWidth + x) * pixelSize;

          if (isRLE24) {
            // RLE24: copy BGR triplets
            for (let j = 0; j < byte; j++) {
              pixels[pos++] = bmp[i++]; // B
              pixels[pos++] = bmp[i++]; // G
              pixels[pos++] = bmp[i++]; // R
            }
            x += byte;

            // Align to word boundary (2 bytes)
            const bytesUsed = byte * 3;
            if (bytesUsed & 1) i++; // Skip padding byte if odd number of bytes
          } else if (biCompression === 1) {
            // RLE8: direct byte copy
            for (let j = 0; j < byte; j++) {
              pixels[pos++] = bmp[i++];
            }
            x += byte;

            if (byte & 1) i++; // Skip padding byte if odd count
          } else {
            // RLE4: unpack nibbles
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
      let pos = (row * absWidth + x) * pixelSize;

      if (isRLE24) {
        // RLE24: repeat BGR triplet
        const b = bmp[i++];
        const g = bmp[i++];
        const r = bmp[i++];

        for (let j = 0; j < count; j++) {
          pixels[pos++] = b;
          pixels[pos++] = g;
          pixels[pos++] = r;
        }
        x += count;
      } else if (biCompression === 1) {
        // RLE8: repeat single byte
        const byte = bmp[i++];
        for (let j = 0; j < count; j++) {
          pixels[pos++] = byte;
        }
        x += count;
      } else {
        // RLE4: repeat nibbles
        const byte = bmp[i++];
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
