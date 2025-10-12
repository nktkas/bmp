import type { RawImageData } from "./mod.ts";
import type { BMPHeader } from "./_bmpHeader.ts";
import { extractColorTable, type RGBQUAD } from "./_colorTable.ts";

/**
 * Converts a BMP with RLE compression to a raw pixel image data
 */
export function BI_RLE_TO_RAW(bmp: Uint8Array, header: BMPHeader): RawImageData {
  const { bfOffBits } = header.fileHeader;
  const { biWidth, biHeight, biCompression, biSize, biBitCount, biClrUsed } = header.infoHeader;

  const isRLE24 = biCompression === 4 && biBitCount === 24;
  if (biCompression !== 1 && biCompression !== 2 && !isRLE24) {
    throw new Error(
      `Unsupported BMP compression method: received ${biCompression}, expected 1 (RLE8), 2 (RLE4), or 4 with bitCount=24 (RLE24)`,
    );
  }

  if (isRLE24) {
    const data = decompressRLE24(bmp, bfOffBits, biWidth, biHeight);

    return {
      width: Math.abs(biWidth),
      height: Math.abs(biHeight),
      channels: 3,
      data,
    };
  } else {
    const palette = extractColorTable(bmp, bfOffBits, biSize, biBitCount as 1 | 2 | 4 | 8, biClrUsed);

    const { data, channels } = biCompression === 1
      ? decompressRLE8(bmp, bfOffBits, biWidth, biHeight, palette)
      : decompressRLE4(bmp, bfOffBits, biWidth, biHeight, palette);

    return {
      width: Math.abs(biWidth),
      height: Math.abs(biHeight),
      channels,
      data,
    };
  }
}

/**
 * Decompresses RLE24-encoded BMP data directly to RGB output
 */
function decompressRLE24(
  bmp: Uint8Array,
  bfOffBits: number,
  biWidth: number,
  biHeight: number,
): Uint8Array {
  const absWidth = Math.abs(biWidth);
  const absHeight = Math.abs(biHeight);
  const isTopDown = biHeight < 0;

  const output = new Uint8Array(absWidth * absHeight * 3);

  let x = 0;
  let y = isTopDown ? 0 : absHeight - 1;
  let i = bfOffBits;
  const yStep = isTopDown ? 1 : -1;

  while (i < bmp.length - 1) {
    const count = bmp[i++];

    if (count === 0) {
      // Escape codes
      const byte = bmp[i++];

      switch (byte) {
        case 0: { // End of line
          x = 0;
          y += yStep;
          break;
        }
        case 1: { // End of bitmap
          return output;
        }
        case 2: { // Delta (skip pixels)
          x += bmp[i++];
          y += bmp[i++] * yStep;
          break;
        }
        default: { // Absolute mode (uncompressed pixels)
          let pos = (y * absWidth + x) * 3;

          for (let j = 0; j < byte; j++) {
            // Read BGR triplet and write as RGB
            const b = bmp[i++];
            const g = bmp[i++];
            const r = bmp[i++];
            output[pos++] = r;
            output[pos++] = g;
            output[pos++] = b;
          }
          x += byte;

          // Align to word boundary (2 bytes)
          const bytesUsed = byte * 3;
          if (bytesUsed & 1) i++; // Skip padding byte if odd number of bytes
        }
      }
    } else {
      // Encoded mode (repeat BGR triplet)
      let pos = (y * absWidth + x) * 3;

      // Read BGR triplet
      const b = bmp[i++];
      const g = bmp[i++];
      const r = bmp[i++];

      for (let j = 0; j < count; j++) {
        // Write as RGB
        output[pos++] = r;
        output[pos++] = g;
        output[pos++] = b;
      }
      x += count;
    }
  }

  return output;
}

/**
 * Decompresses RLE8-encoded BMP data directly to RGB/grayscale output
 */
function decompressRLE8(
  bmp: Uint8Array,
  bfOffBits: number,
  biWidth: number,
  biHeight: number,
  palette: RGBQUAD[],
): { data: Uint8Array; channels: 1 | 3 } {
  const absWidth = Math.abs(biWidth);
  const absHeight = Math.abs(biHeight);
  const isTopDown = biHeight < 0;

  const isGrayscale = palette.every((c) => c.red === c.green && c.green === c.blue);
  const pixelStride = isGrayscale ? 1 : 3;

  const output = new Uint8Array(absWidth * absHeight * pixelStride);

  let x = 0;
  let y = isTopDown ? 0 : absHeight - 1;
  let i = bfOffBits;
  const yStep = isTopDown ? 1 : -1;

  while (i < bmp.length - 1) {
    const count = bmp[i++];

    if (count === 0) {
      // Escape codes
      const byte = bmp[i++];

      switch (byte) {
        case 0: { // End of line
          x = 0;
          y += yStep;
          break;
        }
        case 1: { // End of bitmap
          return { data: output, channels: pixelStride };
        }
        case 2: { // Delta (skip pixels)
          x += bmp[i++];
          y += bmp[i++] * yStep;
          break;
        }
        default: { // Absolute mode (uncompressed pixels)
          let pos = (y * absWidth + x) * pixelStride;

          if (isGrayscale) {
            for (let j = 0; j < byte; j++) {
              // Read color from palette and write as grayscale
              output[pos++] = palette[bmp[i++]].red;
            }
          } else {
            for (let j = 0; j < byte; j++) {
              // Read color from palette and write as RGB
              const color = palette[bmp[i++]];
              output[pos++] = color.red;
              output[pos++] = color.green;
              output[pos++] = color.blue;
            }
          }
          x += byte;

          // Align to word boundary (2 bytes)
          if (byte & 1) i++; // Skip padding byte if odd count
        }
      }
    } else {
      // Encoded mode (repeat single byte)
      let pos = (y * absWidth + x) * pixelStride;

      // Read color from palette
      const color = palette[bmp[i++]];

      if (isGrayscale) {
        for (let j = 0; j < count; j++) {
          // Write as grayscale
          output[pos++] = color.red;
        }
      } else {
        for (let j = 0; j < count; j++) {
          // Write as RGB
          output[pos++] = color.red;
          output[pos++] = color.green;
          output[pos++] = color.blue;
        }
      }
      x += count;
    }
  }

  return { data: output, channels: pixelStride };
}

/**
 * Decompresses RLE4-encoded BMP data directly to RGB/grayscale output
 */
function decompressRLE4(
  bmp: Uint8Array,
  bfOffBits: number,
  biWidth: number,
  biHeight: number,
  palette: RGBQUAD[],
): { data: Uint8Array; channels: 1 | 3 } {
  const absWidth = Math.abs(biWidth);
  const absHeight = Math.abs(biHeight);
  const isTopDown = biHeight < 0;

  const isGrayscale = palette.every((c) => c.red === c.green && c.green === c.blue);
  const pixelStride = isGrayscale ? 1 : 3;

  const output = new Uint8Array(absWidth * absHeight * pixelStride);

  let x = 0;
  let y = isTopDown ? 0 : absHeight - 1;
  let i = bfOffBits;
  const yStep = isTopDown ? 1 : -1;

  while (i < bmp.length - 1) {
    const count = bmp[i++];

    if (count === 0) {
      // Escape codes
      const byte = bmp[i++];

      switch (byte) {
        case 0: { // End of line
          x = 0;
          y += yStep;
          break;
        }
        case 1: { // End of bitmap
          return { data: output, channels: pixelStride };
        }
        case 2: { // Delta (skip pixels)
          x += bmp[i++];
          y += bmp[i++] * yStep;
          break;
        }
        default: { // Absolute mode (uncompressed pixels)
          let pos = (y * absWidth + x) * pixelStride;

          const pairs = byte >> 1;
          if (isGrayscale) {
            for (let j = 0; j < pairs; j++) {
              const sourceByte = bmp[i++];
              const highNibble = (sourceByte >> 4) & 0xF;
              const lowNibble = sourceByte & 0xF;

              // Read colors from palette and write as grayscale
              output[pos++] = palette[highNibble].red;
              output[pos++] = palette[lowNibble].red;
            }

            if (byte & 1) { // Odd count, read one more nibble
              const sourceByte = bmp[i++];
              const highNibble = (sourceByte >> 4) & 0xF;

              output[pos] = palette[highNibble].red;
            }
          } else {
            for (let j = 0; j < pairs; j++) {
              const sourceByte = bmp[i++];
              const highNibble = (sourceByte >> 4) & 0xF;
              const lowNibble = sourceByte & 0xF;

              // Read colors from palette and write as RGB
              const color1 = palette[highNibble];
              output[pos++] = color1.red;
              output[pos++] = color1.green;
              output[pos++] = color1.blue;
              const color2 = palette[lowNibble];
              output[pos++] = color2.red;
              output[pos++] = color2.green;
              output[pos++] = color2.blue;
            }

            if (byte & 1) { // Odd count, read one more nibble
              const sourceByte = bmp[i++];
              const highNibble = (sourceByte >> 4) & 0xF;

              const color = palette[highNibble];
              output[pos++] = color.red;
              output[pos++] = color.green;
              output[pos++] = color.blue;
            }
          }
          x += byte;

          // Align to word boundary (2 bytes)
          const bytesUsed = (byte + 1) >> 1;
          if (bytesUsed & 1) i++; // Skip padding byte if odd count
        }
      }
    } else {
      // Encoded mode (repeat nibbles)
      let pos = (y * absWidth + x) * pixelStride;

      const byte = bmp[i++];
      const highNibble = (byte >> 4) & 0xF;
      const lowNibble = byte & 0xF;

      // Read colors from palette
      const color1 = palette[highNibble];
      const color2 = palette[lowNibble];

      const pairs = count >> 1;
      if (isGrayscale) {
        for (let j = 0; j < pairs; j++) {
          // Write as grayscale
          output[pos++] = color1.red;
          output[pos++] = color2.red;
        }
        if (count & 1) output[pos] = color1.red; // Last odd pixel
      } else {
        for (let j = 0; j < pairs; j++) {
          // Write as RGB
          output[pos++] = color1.red;
          output[pos++] = color1.green;
          output[pos++] = color1.blue;
          output[pos++] = color2.red;
          output[pos++] = color2.green;
          output[pos++] = color2.blue;
        }
        if (count & 1) { // Last odd pixel
          output[pos++] = color1.red;
          output[pos++] = color1.green;
          output[pos++] = color1.blue;
        }
      }
      x += count;
    }
  }

  return { data: output, channels: pixelStride };
}
