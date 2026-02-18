/**
 * @module
 * Decodes BMP images with RLE (Run-Length Encoding) compression.
 *
 * BMP supports three RLE variants:
 * - RLE8 (compression = 1): each run is one palette index repeated N times
 * - RLE4 (compression = 2): each run alternates two palette indices (nibbles)
 * - RLE24 (compression = 4 with 24bpp): each run is a BGR triplet repeated N times
 */

import { type BmpHeader, getImageLayout, type RawImageData } from "../common.ts";
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
  const { compression, bitsPerPixel, dataOffset, width, height } = header;
  const { absWidth, absHeight, isTopDown } = getImageLayout(width, height);

  // RLE24: no palette, direct BGR pixels
  if (compression === 4 && bitsPerPixel === 24) {
    const channels = 3;
    const output = new Uint8Array(absWidth * absHeight * channels);
    decompressRle(bmp, dataOffset, absWidth, absHeight, isTopDown, channels, output, {
      readEncoded(bmp, i, count, output, pos) {
        // Read one BGR triplet, repeat it `count` times as RGB
        const b = bmp[i++]; // B
        const g = bmp[i++]; // G
        const r = bmp[i++]; // R
        for (let j = 0; j < count; j++) {
          output[pos++] = r; // R
          output[pos++] = g; // G
          output[pos++] = b; // B
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
  const palR = palette.red;
  const palG = palette.green;
  const palB = palette.blue;
  const channels = palette.isGrayscale ? 1 : 3;
  const output = new Uint8Array(absWidth * absHeight * channels);

  if (compression === 1) {
    // RLE8: one byte per pixel index
    decompressRle(bmp, dataOffset, absWidth, absHeight, isTopDown, channels, output, {
      readEncoded(bmp, i, count, output, pos) {
        const idx = bmp[i++];
        if (channels === 1) {
          const v = palR[idx];
          for (let j = 0; j < count; j++) output[pos++] = v;
        } else {
          const r = palR[idx], g = palG[idx], b = palB[idx];
          for (let j = 0; j < count; j++) {
            output[pos++] = r; // R
            output[pos++] = g; // G
            output[pos++] = b; // B
          }
        }
        return i;
      },
      readAbsolute(bmp, i, count, output, pos) {
        if (channels === 1) {
          for (let j = 0; j < count; j++) output[pos++] = palR[bmp[i++]];
        } else {
          for (let j = 0; j < count; j++) {
            const idx = bmp[i++];
            output[pos++] = palR[idx]; // R
            output[pos++] = palG[idx]; // G
            output[pos++] = palB[idx]; // B
          }
        }
        // RLE8 absolute mode: pad to word boundary
        if (count & 1) i++;
        return i;
      },
    });
  } else {
    // RLE4: two nibbles (palette indices) per byte
    decompressRle(bmp, dataOffset, absWidth, absHeight, isTopDown, channels, output, {
      readEncoded(bmp, i, count, output, pos) {
        const byte = bmp[i++];
        const idx1 = (byte >> 4) & 0xF;
        const idx2 = byte & 0xF;
        if (channels === 1) {
          const v1 = palR[idx1], v2 = palR[idx2];
          for (let j = 0; j < count; j++) output[pos++] = j & 1 ? v2 : v1;
        } else {
          const r1 = palR[idx1], g1 = palG[idx1], b1 = palB[idx1];
          const r2 = palR[idx2], g2 = palG[idx2], b2 = palB[idx2];
          for (let j = 0; j < count; j++) {
            if (j & 1) {
              output[pos++] = r2; // R
              output[pos++] = g2; // G
              output[pos++] = b2; // B
            } else {
              output[pos++] = r1; // R
              output[pos++] = g1; // G
              output[pos++] = b1; // B
            }
          }
        }
        return i;
      },
      readAbsolute(bmp, i, count, output, pos) {
        const pairs = count >> 1;
        if (channels === 1) {
          for (let j = 0; j < pairs; j++) {
            const byte = bmp[i++];
            output[pos++] = palR[(byte >> 4) & 0xF];
            output[pos++] = palR[byte & 0xF];
          }
          if (count & 1) output[pos++] = palR[(bmp[i++] >> 4) & 0xF];
        } else {
          for (let j = 0; j < pairs; j++) {
            const byte = bmp[i++];
            let idx = (byte >> 4) & 0xF;
            output[pos++] = palR[idx]; // R
            output[pos++] = palG[idx]; // G
            output[pos++] = palB[idx]; // B
            idx = byte & 0xF;
            output[pos++] = palR[idx]; // R
            output[pos++] = palG[idx]; // G
            output[pos++] = palB[idx]; // B
          }
          if (count & 1) {
            const idx = (bmp[i++] >> 4) & 0xF;
            output[pos++] = palR[idx]; // R
            output[pos++] = palG[idx]; // G
            output[pos++] = palB[idx]; // B
          }
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
