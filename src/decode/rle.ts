/**
 * @module
 * Decodes BMP images with RLE (Run-Length Encoding) compression.
 *
 * BMP supports three RLE variants:
 * - RLE8 (compression = 1): each run is one palette index repeated N times
 * - RLE4 (compression = 2): each run alternates two palette indices (nibbles)
 * - RLE24 (compression = 4 with 24bpp): each run is a BGR triplet repeated N times
 */

import type { BmpHeader, RawImageData } from "../common.ts";
import { getImageLayout, isPaletteGrayscale, writePaletteColor } from "../common.ts";
import { extractPalette } from "./palette.ts";

/** Callbacks for format-specific pixel reading within the shared RLE loop. */
interface RleCallbacks {
  /** Reads an encoded-mode run and writes pixels. Returns new source index. */
  readEncoded(bmp: Uint8Array, i: number, count: number, output: Uint8Array, pos: number): number;
  /** Reads absolute-mode pixels and writes them. Returns new source index. */
  readAbsolute(bmp: Uint8Array, i: number, count: number, output: Uint8Array, pos: number): number;
}

/**
 * Decodes an RLE-compressed BMP image to raw pixel data.
 *
 * @param bmp - Complete BMP file contents.
 * @param header - Parsed BMP header.
 * @returns Decoded pixel data.
 */
export function decodeRle(bmp: Uint8Array, header: BmpHeader): RawImageData {
  const { absWidth, absHeight, isTopDown } = getImageLayout(header.width, header.height);

  // RLE24: no palette, direct BGR pixels
  if (header.compression === 4 && header.bitsPerPixel === 24) {
    const channels = 3;
    const output = new Uint8Array(absWidth * absHeight * channels);
    decompressRle(bmp, header.dataOffset, absWidth, absHeight, isTopDown, channels, output, {
      readEncoded(bmp, i, count, output, pos) {
        // Read one BGR triplet, repeat it `count` times as RGB
        const b = bmp[i++], g = bmp[i++], r = bmp[i++];
        for (let j = 0; j < count; j++) {
          output[pos++] = r;
          output[pos++] = g;
          output[pos++] = b;
        }
        return i;
      },
      readAbsolute(bmp, i, count, output, pos) {
        // Read `count` BGR triplets, write as RGB
        for (let j = 0; j < count; j++) {
          output[pos++] = bmp[i + 2]; // R
          output[pos++] = bmp[i + 1]; // G
          output[pos++] = bmp[i]; // B
          i += 3;
        }
        // RLE24 absolute mode: pad to word boundary (2 bytes)
        if ((count * 3) & 1) i++;
        return i;
      },
    });
    return { width: absWidth, height: absHeight, channels, data: output };
  }

  // RLE8 / RLE4: palette-based
  const palette = extractPalette(bmp, header);
  const channels: 1 | 3 = isPaletteGrayscale(palette) ? 1 : 3;
  const output = new Uint8Array(absWidth * absHeight * channels);

  if (header.compression === 1) {
    // RLE8: one byte per pixel index
    decompressRle(bmp, header.dataOffset, absWidth, absHeight, isTopDown, channels, output, {
      readEncoded(bmp, i, count, output, pos) {
        const color = palette[bmp[i++]];
        for (let j = 0; j < count; j++) {
          pos = writePaletteColor(output, pos, color, channels);
        }
        return i;
      },
      readAbsolute(bmp, i, count, output, pos) {
        for (let j = 0; j < count; j++) {
          pos = writePaletteColor(output, pos, palette[bmp[i++]], channels);
        }
        // RLE8 absolute mode: pad to word boundary
        if (count & 1) i++;
        return i;
      },
    });
  } else {
    // RLE4: two nibbles (palette indices) per byte
    decompressRle(bmp, header.dataOffset, absWidth, absHeight, isTopDown, channels, output, {
      readEncoded(bmp, i, count, output, pos) {
        const byte = bmp[i++];
        const color1 = palette[(byte >> 4) & 0xF];
        const color2 = palette[byte & 0xF];
        for (let j = 0; j < count; j++) {
          // Alternate between the two colors
          pos = writePaletteColor(output, pos, j & 1 ? color2 : color1, channels);
        }
        return i;
      },
      readAbsolute(bmp, i, count, output, pos) {
        const pairs = count >> 1;
        for (let j = 0; j < pairs; j++) {
          const byte = bmp[i++];
          pos = writePaletteColor(output, pos, palette[(byte >> 4) & 0xF], channels);
          pos = writePaletteColor(output, pos, palette[byte & 0xF], channels);
        }
        if (count & 1) {
          pos = writePaletteColor(output, pos, palette[(bmp[i++] >> 4) & 0xF], channels);
        }
        // RLE4 absolute mode: pad to word boundary
        const bytesUsed = (count + 1) >> 1;
        if (bytesUsed & 1) i++;
        return i;
      },
    });
  }

  return { width: absWidth, height: absHeight, channels, data: output };
}

/** Core RLE decompression loop, handling escape codes and delegating pixel reading to callbacks. */
function decompressRle(
  bmp: Uint8Array,
  dataOffset: number,
  absWidth: number,
  absHeight: number,
  isTopDown: boolean,
  channels: number,
  output: Uint8Array,
  callbacks: RleCallbacks,
): void {
  let x = 0;
  let y = isTopDown ? 0 : absHeight - 1;
  let i = dataOffset;
  const yStep = isTopDown ? 1 : -1;

  while (i < bmp.length - 1) {
    const count = bmp[i++];

    if (count > 0) {
      // Encoded mode: repeat pixel(s) `count` times
      // Note: out-of-bounds writes to TypedArrays are safely ignored in JavaScript
      const pos = (y * absWidth + x) * channels;
      i = callbacks.readEncoded(bmp, i, count, output, pos);
      x += count;
    } else {
      // Escape code
      const escape = bmp[i++];

      switch (escape) {
        case 0: // End of line
          x = 0;
          y += yStep;
          break;
        case 1: // End of bitmap
          return;
        case 2: // Delta: skip (dx, dy) pixels
          x += bmp[i++];
          y += bmp[i++] * yStep;
          break;
        default: { // Absolute mode: `escape` uncompressed pixels follow
          const pos = (y * absWidth + x) * channels;
          i = callbacks.readAbsolute(bmp, i, escape, output, pos);
          x += escape;
        }
      }
    }
  }
}
