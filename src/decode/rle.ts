/**
 * Decodes BMP images with RLE (Run-Length Encoding) compression.
 *
 * BMP supports three RLE variants:
 * - RLE8 (compression = 1): each run is one palette index repeated N times
 * - RLE4 (compression = 2): each run alternates two palette indices (nibbles)
 * - RLE24 (compression = 4 with 24bpp): each run is a BGR triplet repeated N times
 *
 * @module
 */

import { type BmpHeader, getImageLayout, type RawImageData } from "../common.ts";
import { extractPalette } from "./palette.ts";

/**
 * Decode an RLE-compressed BMP image to raw pixel data.
 *
 * @param bmp Complete BMP file contents.
 * @param header Parsed BMP header.
 * @return Decoded pixel data.
 */
export function decodeRle(bmp: Uint8Array, header: BmpHeader): RawImageData {
  const { compression, bitsPerPixel } = header;
  if (compression === 4 && bitsPerPixel === 24) return decodeRle24(bmp, header);
  if (compression === 1) return decodeRle8(bmp, header);
  return decodeRle4(bmp, header);
}

/**
 * Decode RLE8: one byte per palette index.
 *
 * @param bmp Complete BMP file contents.
 * @param header Parsed BMP header.
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
    while (i < bmp.length - 1) {
      const count = bmp[i++];
      if (count > 0) {
        // Encoded: repeat single index
        const v = palR[bmp[i++]];
        let pos = y * absWidth + x;
        for (let j = 0; j < count; j++) output[pos++] = v;
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
            let pos = y * absWidth + x;
            for (let j = 0; j < escape; j++) output[pos++] = palR[bmp[i++]];
            if (escape & 1) i++; // Word-align
            x += escape;
          }
        }
      }
    }
  } else {
    while (i < bmp.length - 1) {
      const count = bmp[i++];
      if (count > 0) {
        // Encoded: repeat single index as RGB
        const idx = bmp[i++];
        const r = palR[idx], g = palG[idx], b = palB[idx];
        let pos = (y * absWidth + x) * 3;
        for (let j = 0; j < count; j++) {
          output[pos++] = r; // R
          output[pos++] = g; // G
          output[pos++] = b; // B
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
              output[pos++] = palR[idx]; // R
              output[pos++] = palG[idx]; // G
              output[pos++] = palB[idx]; // B
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
 * Decode RLE4: two nibbles (palette indices) per byte, alternating in runs.
 *
 * @param bmp Complete BMP file contents.
 * @param header Parsed BMP header.
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
        // Encoded: alternate two nibble indices
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
    while (i < bmp.length - 1) {
      const count = bmp[i++];
      if (count > 0) {
        // Encoded: alternate two nibble indices as RGB
        const byte = bmp[i++];
        const idx1 = (byte >> 4) & 0xF, idx2 = byte & 0xF;
        const r1 = palR[idx1], g1 = palG[idx1], b1 = palB[idx1];
        const r2 = palR[idx2], g2 = palG[idx2], b2 = palB[idx2];
        let pos = (y * absWidth + x) * 3;
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
              output[pos++] = palR[idx]; // R
              output[pos++] = palG[idx]; // G
              output[pos++] = palB[idx]; // B
              idx = byte & 0xF;
              output[pos++] = palR[idx]; // R
              output[pos++] = palG[idx]; // G
              output[pos++] = palB[idx]; // B
            }
            if (escape & 1) {
              const idx = (bmp[i++] >> 4) & 0xF;
              output[pos++] = palR[idx]; // R
              output[pos++] = palG[idx]; // G
              output[pos++] = palB[idx]; // B
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
 * Decode RLE24: no palette, direct BGR triplets per run.
 *
 * @param bmp Complete BMP file contents.
 * @param header Parsed BMP header.
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

  while (i < bmp.length - 1) {
    const count = bmp[i++];
    if (count > 0) {
      // Encoded: repeat one BGR triplet as RGB
      const b = bmp[i++]; // B
      const g = bmp[i++]; // G
      const r = bmp[i++]; // R
      let pos = (y * absWidth + x) * 3;
      for (let j = 0; j < count; j++) {
        output[pos++] = r; // R
        output[pos++] = g; // G
        output[pos++] = b; // B
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
