/**
 * Decodes BMP images with RLE (Run-Length Encoding) compression.
 *
 * BMP supports three RLE variants:
 * - RLE8 (compression = 1): each run is one palette index repeated N times
 * - RLE4 (compression = 2): each run alternates two palette indices (nibbles)
 * - RLE24 (compression = 4 with 24bpp): each run is a BGR triplet repeated N times
 *
 * @see https://learn.microsoft.com/windows/win32/gdi/bitmap-compression
 *
 * @module
 */

import { type BmpHeader, CompressionTypes, getImageLayout, type RawImageData } from "../common.ts";
import { extractPalette } from "./palette.ts";

/**
 * Run length from which `Uint8Array.prototype.fill` is faster than a byte loop, measured on V8 15.0.
 * Below it the call overhead dominates.
 */
const MEMSET_RUN = 40;

/**
 * Decodes an RLE-compressed BMP image to raw pixel data.
 *
 * @param bmp Complete BMP file contents.
 * @param header Parsed BMP header.
 *
 * @return Decoded pixel data.
 */
export function decodeRle(bmp: Uint8Array, header: BmpHeader): RawImageData {
  const { compression, bitsPerPixel } = header;
  if (compression === CompressionTypes.BI_JPEG && bitsPerPixel === 24) return decodeRle24(bmp, header);
  if (compression === CompressionTypes.BI_RLE8) return decodeRle8(bmp, header);
  return decodeRle4(bmp, header);
}

/**
 * Decodes RLE8: one byte per palette index.
 *
 * @param bmp Complete BMP file contents.
 * @param header Parsed BMP header.
 *
 * @return Decoded pixel data.
 */
function decodeRle8(bmp: Uint8Array, header: BmpHeader): RawImageData {
  const { dataOffset, width, height } = header;
  const { absWidth, absHeight, isTopDown } = getImageLayout(width, height);

  const palette = extractPalette(bmp, header);
  const palR = palette.red;
  const palG = palette.green;
  const palB = palette.blue;

  const channels = palette.isGrayscale ? 1 : 3;
  const output = new Uint8Array(absWidth * absHeight * channels);

  let x = 0;
  let y = isTopDown ? 0 : absHeight - 1;
  let i = dataOffset;
  const yStep = isTopDown ? 1 : -1;

  if (channels === 1) {
    // An identity palette maps every index to itself, so an absolute block is a plain copy.
    let identityPalette = true;
    for (let k = 0; k < palR.length; k++) {
      if (palR[k] !== k) {
        identityPalette = false;
        break;
      }
    }

    while (i < bmp.length - 1) {
      const count = bmp[i++];
      if (count > 0) {
        // Encoded: repeat one index across the run.
        const v = palR[bmp[i++]];
        const pos = y * absWidth + x;
        if (count >= MEMSET_RUN && pos >= 0 && pos + count <= output.length) {
          output.fill(v, pos, pos + count);
        } else {
          for (let j = 0, p = pos; j < count; j++) output[p++] = v;
        }
        x += count;
      } else {
        const escape = bmp[i++];
        switch (escape) {
          case 0: // End of line
            x = 0;
            y += yStep;
            break;
          case 1: // End of bitmap
            return { width: absWidth, height: absHeight, channels, data: output };
          case 2: // Delta
            x += bmp[i++];
            y += bmp[i++] * yStep;
            break;
          default: { // Absolute: `escape` uncompressed indices
            const pos = y * absWidth + x;
            if (identityPalette && pos >= 0 && pos + escape <= output.length) {
              output.set(bmp.subarray(i, i + escape), pos);
              i += escape;
            } else {
              let p = pos;
              for (let j = 0; j < escape; j++) output[p++] = palR[bmp[i++]];
            }
            if (escape & 1) i++; // Word-align
            x += escape;
          }
        }
      }
    }
  } else {
    // A `DataView` writes little-endian on every host.
    const view = new DataView(output.buffer);

    while (i < bmp.length - 1) {
      const count = bmp[i++];
      if (count > 0) {
        // Encoded: repeat one RGB triplet across the run.
        const idx = bmp[i++];
        const r = palR[idx], g = palG[idx], b = palB[idx];
        let pos = (y * absWidth + x) * 3;
        if (pos >= 0 && pos + count * 3 <= output.length) {
          // Each store covers the triplet plus one byte that the next store overwrites,
          // so the final pixel is stored byte by byte and nothing is written past the run.
          const triplet = (r | (g << 8) | (b << 16) | (r << 24)) >>> 0;
          for (let j = count - 1; j > 0; j--, pos += 3) view.setUint32(pos, triplet, true);
          output[pos] = r;
          output[pos + 1] = g;
          output[pos + 2] = b;
        } else {
          for (let j = 0; j < count; j++) {
            output[pos++] = r;
            output[pos++] = g;
            output[pos++] = b;
          }
        }
        x += count;
      } else {
        const escape = bmp[i++];
        switch (escape) {
          case 0: // End of line
            x = 0;
            y += yStep;
            break;
          case 1: // End of bitmap
            return { width: absWidth, height: absHeight, channels, data: output };
          case 2: // Delta
            x += bmp[i++];
            y += bmp[i++] * yStep;
            break;
          default: { // Absolute: `escape` uncompressed indices
            let pos = (y * absWidth + x) * 3;
            for (let j = 0; j < escape; j++) {
              const idx = bmp[i++];
              output[pos++] = palR[idx];
              output[pos++] = palG[idx];
              output[pos++] = palB[idx];
            }
            if (escape & 1) i++; // Word-align
            x += escape;
          }
        }
      }
    }
  }

  return { width: absWidth, height: absHeight, channels, data: output };
}

/**
 * Decodes RLE4: two nibbles (palette indices) per byte, alternating in runs.
 *
 * @param bmp Complete BMP file contents.
 * @param header Parsed BMP header.
 *
 * @return Decoded pixel data.
 */
function decodeRle4(bmp: Uint8Array, header: BmpHeader): RawImageData {
  const { dataOffset, width, height } = header;
  const { absWidth, absHeight, isTopDown } = getImageLayout(width, height);

  const palette = extractPalette(bmp, header);
  const palR = palette.red;
  const palG = palette.green;
  const palB = palette.blue;

  const channels = palette.isGrayscale ? 1 : 3;
  const output = new Uint8Array(absWidth * absHeight * channels);

  let x = 0;
  let y = isTopDown ? 0 : absHeight - 1;
  let i = dataOffset;
  const yStep = isTopDown ? 1 : -1;

  if (channels === 1) {
    while (i < bmp.length - 1) {
      const count = bmp[i++];
      if (count > 0) {
        // Encoded: alternate two nibble indices.
        const byte = bmp[i++];
        const v1 = palR[(byte >> 4) & 0xF], v2 = palR[byte & 0xF];
        let pos = y * absWidth + x;
        for (let j = 0; j < count; j++) output[pos++] = j & 1 ? v2 : v1;
        x += count;
      } else {
        const escape = bmp[i++];
        switch (escape) {
          case 0: // End of line
            x = 0;
            y += yStep;
            break;
          case 1: // End of bitmap
            return { width: absWidth, height: absHeight, channels, data: output };
          case 2: // Delta
            x += bmp[i++];
            y += bmp[i++] * yStep;
            break;
          default: { // Absolute: `escape` uncompressed nibbles
            let pos = y * absWidth + x;
            const pairs = escape >> 1;
            for (let j = 0; j < pairs; j++) {
              const byte = bmp[i++];
              output[pos++] = palR[(byte >> 4) & 0xF];
              output[pos++] = palR[byte & 0xF];
            }
            if (escape & 1) output[pos++] = palR[(bmp[i++] >> 4) & 0xF];
            const bytesUsed = (escape + 1) >> 1;
            if (bytesUsed & 1) i++; // Word-align
            x += escape;
          }
        }
      }
    }
  } else {
    // A `DataView` writes little-endian on every host.
    const view = new DataView(output.buffer);

    while (i < bmp.length - 1) {
      const count = bmp[i++];
      if (count > 0) {
        // Encoded: alternate two nibble indices as RGB.
        const byte = bmp[i++];
        const idx1 = (byte >> 4) & 0xF, idx2 = byte & 0xF;
        const r1 = palR[idx1], g1 = palG[idx1], b1 = palB[idx1];
        const r2 = palR[idx2], g2 = palG[idx2], b2 = palB[idx2];
        let pos = (y * absWidth + x) * 3;
        if (pos >= 0 && pos + count * 3 <= output.length) {
          // Each store covers the triplet plus one byte that the next store overwrites,
          // so the final pixel is stored byte by byte and nothing is written past the run.
          const first = (r1 | (g1 << 8) | (b1 << 16) | (r2 << 24)) >>> 0;
          const second = (r2 | (g2 << 8) | (b2 << 16) | (r1 << 24)) >>> 0;
          for (let j = count - 1; j > 0; j--, pos += 3) {
            view.setUint32(pos, (count - 1 - j) & 1 ? second : first, true);
          }
          if ((count - 1) & 1) {
            output[pos] = r2;
            output[pos + 1] = g2;
            output[pos + 2] = b2;
          } else {
            output[pos] = r1;
            output[pos + 1] = g1;
            output[pos + 2] = b1;
          }
        } else {
          for (let j = 0; j < count; j++) {
            if (j & 1) {
              output[pos++] = r2;
              output[pos++] = g2;
              output[pos++] = b2;
            } else {
              output[pos++] = r1;
              output[pos++] = g1;
              output[pos++] = b1;
            }
          }
        }
        x += count;
      } else {
        const escape = bmp[i++];
        switch (escape) {
          case 0: // End of line
            x = 0;
            y += yStep;
            break;
          case 1: // End of bitmap
            return { width: absWidth, height: absHeight, channels, data: output };
          case 2: // Delta
            x += bmp[i++];
            y += bmp[i++] * yStep;
            break;
          default: { // Absolute: `escape` uncompressed nibbles
            let pos = (y * absWidth + x) * 3;
            const pairs = escape >> 1;
            for (let j = 0; j < pairs; j++) {
              const byte = bmp[i++];
              let idx = (byte >> 4) & 0xF;
              output[pos++] = palR[idx];
              output[pos++] = palG[idx];
              output[pos++] = palB[idx];
              idx = byte & 0xF;
              output[pos++] = palR[idx];
              output[pos++] = palG[idx];
              output[pos++] = palB[idx];
            }
            if (escape & 1) {
              const idx = (bmp[i++] >> 4) & 0xF;
              output[pos++] = palR[idx];
              output[pos++] = palG[idx];
              output[pos++] = palB[idx];
            }
            const bytesUsed = (escape + 1) >> 1;
            if (bytesUsed & 1) i++; // Word-align
            x += escape;
          }
        }
      }
    }
  }

  return { width: absWidth, height: absHeight, channels, data: output };
}

/**
 * Decodes RLE24: no palette, direct BGR triplets per run.
 *
 * @param bmp Complete BMP file contents.
 * @param header Parsed BMP header.
 *
 * @return Decoded pixel data.
 */
function decodeRle24(bmp: Uint8Array, header: BmpHeader): RawImageData {
  const { dataOffset, width, height } = header;
  const { absWidth, absHeight, isTopDown } = getImageLayout(width, height);
  const output = new Uint8Array(absWidth * absHeight * 3);

  let x = 0;
  let y = isTopDown ? 0 : absHeight - 1;
  let i = dataOffset;
  const yStep = isTopDown ? 1 : -1;

  // A `DataView` writes little-endian on every host.
  const view = new DataView(output.buffer);

  while (i < bmp.length - 1) {
    const count = bmp[i++];
    if (count > 0) {
      // Encoded: repeat one BGR triplet as RGB.
      const b = bmp[i++];
      const g = bmp[i++];
      const r = bmp[i++];
      let pos = (y * absWidth + x) * 3;
      if (pos >= 0 && pos + count * 3 <= output.length) {
        // Each store covers the triplet plus one byte that the next store overwrites,
        // so the final pixel is stored byte by byte and nothing is written past the run.
        const triplet = (r | (g << 8) | (b << 16) | (r << 24)) >>> 0;
        for (let j = count - 1; j > 0; j--, pos += 3) view.setUint32(pos, triplet, true);
        output[pos] = r;
        output[pos + 1] = g;
        output[pos + 2] = b;
      } else {
        for (let j = 0; j < count; j++) {
          output[pos++] = r;
          output[pos++] = g;
          output[pos++] = b;
        }
      }
      x += count;
    } else {
      const escape = bmp[i++];
      switch (escape) {
        case 0: // End of line
          x = 0;
          y += yStep;
          break;
        case 1: // End of bitmap
          return { width: absWidth, height: absHeight, channels: 3, data: output };
        case 2: // Delta
          x += bmp[i++];
          y += bmp[i++] * yStep;
          break;
        default: { // Absolute: `escape` uncompressed BGR triplets
          let pos = (y * absWidth + x) * 3;
          for (let j = 0; j < escape; j++) {
            output[pos++] = bmp[i + 2]; // R
            output[pos++] = bmp[i + 1]; // G
            output[pos++] = bmp[i]; // B
            i += 3;
          }
          if ((escape * 3) & 1) i++; // Word-align
          x += escape;
        }
      }
    }
  }

  return { width: absWidth, height: absHeight, channels: 3, data: output };
}
