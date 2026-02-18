/**
 * @module
 * Decodes BMP images with Modified Huffman (CCITT Group 3 1D) compression.
 *
 * This is an OS/2-specific compression method (biCompression = 3 with 1bpp)
 * that uses variable-length Huffman codes to represent alternating runs of
 * white and black pixels. Each scan line starts with a white run (which may
 * be zero-length), followed by alternating black and white runs.
 *
 * The lookup tables below are defined by the CCITT Group 3 standard.
 */

import { type BmpHeader, getImageLayout, isPaletteGrayscale, type RawImageData } from "../common.ts";
import { extractPalette } from "./palette.ts";

// ============================================================================
// Huffman code tables (CCITT Group 3 1D standard)
// ============================================================================

// --- White run codes ---

/** White terminating codes: bit patterns → run lengths 0–63. */
const WHITE_TERMINATING: Record<string, number> = {
  "00110101": 0,
  "000111": 1,
  "0111": 2,
  "1000": 3,
  "1011": 4,
  "1100": 5,
  "1110": 6,
  "1111": 7,
  "10011": 8,
  "10100": 9,
  "00111": 10,
  "01000": 11,
  "001000": 12,
  "000011": 13,
  "110100": 14,
  "110101": 15,
  "101010": 16,
  "101011": 17,
  "0100111": 18,
  "0001100": 19,
  "0001000": 20,
  "0010111": 21,
  "0000011": 22,
  "0000100": 23,
  "0101000": 24,
  "0101011": 25,
  "0010011": 26,
  "0100100": 27,
  "0011000": 28,
  "00000010": 29,
  "00000011": 30,
  "00011010": 31,
  "00011011": 32,
  "00010010": 33,
  "00010011": 34,
  "00010100": 35,
  "00010101": 36,
  "00010110": 37,
  "00010111": 38,
  "00101000": 39,
  "00101001": 40,
  "00101010": 41,
  "00101011": 42,
  "00101100": 43,
  "00101101": 44,
  "00000100": 45,
  "00000101": 46,
  "00001010": 47,
  "00001011": 48,
  "01010010": 49,
  "01010011": 50,
  "01010100": 51,
  "01010101": 52,
  "00100100": 53,
  "00100101": 54,
  "01011000": 55,
  "01011001": 56,
  "01011010": 57,
  "01011011": 58,
  "01001010": 59,
  "01001011": 60,
  "00110010": 61,
  "00110011": 62,
  "00110100": 63,
};

/** White make-up codes: bit patterns → run lengths 64–1728 (multiples of 64). */
const WHITE_MAKEUP: Record<string, number> = {
  "11011": 64,
  "10010": 128,
  "010111": 192,
  "0110111": 256,
  "00110110": 320,
  "00110111": 384,
  "01100100": 448,
  "01100101": 512,
  "01101000": 576,
  "01100111": 640,
  "011001100": 704,
  "011001101": 768,
  "011010010": 832,
  "011010011": 896,
  "011010100": 960,
  "011010101": 1024,
  "011010110": 1088,
  "011010111": 1152,
  "011011000": 1216,
  "011011001": 1280,
  "011011010": 1344,
  "011011011": 1408,
  "010011000": 1472,
  "010011001": 1536,
  "010011010": 1600,
  "011000": 1664,
  "010011011": 1728,
};

// --- Black run codes ---

/** Black terminating codes: bit patterns → run lengths 0–63. */
const BLACK_TERMINATING: Record<string, number> = {
  "0000110111": 0,
  "010": 1,
  "11": 2,
  "10": 3,
  "011": 4,
  "0011": 5,
  "0010": 6,
  "00011": 7,
  "000101": 8,
  "000100": 9,
  "0000100": 10,
  "0000101": 11,
  "0000111": 12,
  "00000100": 13,
  "00000111": 14,
  "000011000": 15,
  "0000010111": 16,
  "0000011000": 17,
  "0000001000": 18,
  "00001100111": 19,
  "00001101000": 20,
  "00001101100": 21,
  "00000110111": 22,
  "00000101000": 23,
  "00000010111": 24,
  "00000011000": 25,
  "000011001010": 26,
  "000011001011": 27,
  "000011001100": 28,
  "000011001101": 29,
  "000001101000": 30,
  "000001101001": 31,
  "000001101010": 32,
  "000001101011": 33,
  "000011010010": 34,
  "000011010011": 35,
  "000011010100": 36,
  "000011010101": 37,
  "000011010110": 38,
  "000011010111": 39,
  "000001101100": 40,
  "000001101101": 41,
  "000011011010": 42,
  "000011011011": 43,
  "000001010100": 44,
  "000001010101": 45,
  "000001010110": 46,
  "000001010111": 47,
  "000001100100": 48,
  "000001100101": 49,
  "000001010010": 50,
  "000001010011": 51,
  "000000100100": 52,
  "000000110111": 53,
  "000000111000": 54,
  "000000100111": 55,
  "000000101000": 56,
  "000001011000": 57,
  "000001011001": 58,
  "000000101011": 59,
  "000000101100": 60,
  "000001011010": 61,
  "000001100110": 62,
  "000001100111": 63,
};

/** Black make-up codes: bit patterns → run lengths 64–1728 (multiples of 64). */
const BLACK_MAKEUP: Record<string, number> = {
  "0000001111": 64,
  "000011001000": 128,
  "000011001001": 192,
  "000001011011": 256,
  "000000110011": 320,
  "000000110100": 384,
  "000000110101": 448,
  "0000001101100": 512,
  "0000001101101": 576,
  "0000001001010": 640,
  "0000001001011": 704,
  "0000001001100": 768,
  "0000001001101": 832,
  "0000001110010": 896,
  "0000001110011": 960,
  "0000001110100": 1024,
  "0000001110101": 1088,
  "0000001110110": 1152,
  "0000001110111": 1216,
  "0000001010010": 1280,
  "0000001010011": 1344,
  "0000001010100": 1408,
  "0000001010101": 1472,
  "0000001011010": 1536,
  "0000001011011": 1600,
  "0000001100100": 1664,
  "0000001100101": 1728,
};

/** End-of-line marker: twelve 0-bits followed by a 1-bit. */
const EOL = "000000000001";

// ============================================================================
// Decoder
// ============================================================================

/**
 * Decodes a Modified Huffman (CCITT Group 3 1D) compressed BMP to raw pixel data.
 *
 * @param bmp - Complete BMP file contents.
 * @param header - Parsed BMP header (must be 1bpp).
 * @returns Decoded pixel data (grayscale or RGB depending on palette).
 */
export function decodeHuffman(bmp: Uint8Array, header: BmpHeader): RawImageData {
  const { dataOffset, width, height } = header;
  const { absWidth, absHeight, isTopDown } = getImageLayout(width, height);

  const palette = extractPalette(bmp, header);
  const channels = isPaletteGrayscale(palette) ? 1 : 3;
  const output = new Uint8Array(absWidth * absHeight * channels);

  // Decompress Huffman data into a flat array of 0/1 palette indices
  const pixels = decompressHuffman(bmp, dataOffset, absWidth, absHeight);

  // Flatten palette into typed arrays for fast indexed access
  const palR = new Uint8Array(palette.length);
  const palG = new Uint8Array(palette.length);
  const palB = new Uint8Array(palette.length);
  for (let i = 0; i < palette.length; i++) {
    palR[i] = palette[i].red;
    palG[i] = palette[i].green;
    palB[i] = palette[i].blue;
  }

  // Map palette indices to output pixels, handling row order
  for (let y = 0; y < absHeight; y++) {
    const srcY = isTopDown ? y : absHeight - 1 - y;
    let srcOffset = srcY * absWidth;
    let dstOffset = y * absWidth * channels;

    if (channels === 1) {
      for (let x = 0; x < absWidth; x++) {
        output[dstOffset++] = palR[pixels[srcOffset++]];
      }
    } else {
      for (let x = 0; x < absWidth; x++) {
        const idx = pixels[srcOffset++];
        output[dstOffset++] = palR[idx]; // R
        output[dstOffset++] = palG[idx]; // G
        output[dstOffset++] = palB[idx]; // B
      }
    }
  }

  return { width: absWidth, height: absHeight, channels, data: output };
}

/** Decompresses Modified Huffman data into a flat array of 0/1 palette indices. */
function decompressHuffman(
  bmp: Uint8Array,
  dataOffset: number,
  absWidth: number,
  absHeight: number,
): Uint8Array {
  const pixels = new Uint8Array(absWidth * absHeight);

  // Convert compressed bytes to a binary string for easier parsing
  let bitString = "";
  for (let i = dataOffset; i < bmp.length; i++) {
    bitString += bmp[i].toString(2).padStart(8, "0");
  }

  let bitPos = 0;
  let pixelPos = 0;

  // Skip initial EOL marker if present
  if (bitString.substring(bitPos, bitPos + 12) === EOL) {
    bitPos += 12;
  }

  for (let row = 0; row < absHeight; row++) {
    let col = 0;
    let isWhite = true; // Each scan line starts with a white run

    while (col < absWidth) {
      const run = decodeRun(bitString, bitPos, isWhite);
      if (!run) break;

      bitPos += run.bitsConsumed;

      // Fill pixels with the current color (0 = white, 1 = black)
      const colorValue = isWhite ? 0 : 1;
      for (let i = 0; i < run.length && col < absWidth; i++, col++) {
        pixels[pixelPos++] = colorValue;
      }

      isWhite = !isWhite;
    }

    // Scan forward to the next EOL marker to align to the next row
    while (bitPos < bitString.length - 12) {
      if (bitString.substring(bitPos, bitPos + 12) === EOL) {
        bitPos += 12;
        break;
      }
      bitPos++;
    }
  }

  return pixels;
}

/** Decodes a single run (white or black) from the Huffman bit stream. */
function decodeRun(
  bitString: string,
  startPos: number,
  isWhite: boolean,
): { length: number; bitsConsumed: number } | null {
  const terminatingTable = isWhite ? WHITE_TERMINATING : BLACK_TERMINATING;
  const makeupTable = isWhite ? WHITE_MAKEUP : BLACK_MAKEUP;

  let totalLength = 0;
  let pos = startPos;

  // Decode make-up codes (for runs >= 64 pixels)
  while (true) {
    let found = false;
    for (let len = 2; len <= 13 && pos + len <= bitString.length; len++) {
      const code = bitString.substring(pos, pos + len);
      if (makeupTable[code] !== undefined) {
        totalLength += makeupTable[code];
        pos += len;
        found = true;
        break;
      }
    }
    if (!found) break;
  }

  // Decode the required terminating code (run length 0–63)
  for (let len = 2; len <= 13 && pos + len <= bitString.length; len++) {
    const code = bitString.substring(pos, pos + len);
    if (terminatingTable[code] !== undefined) {
      totalLength += terminatingTable[code];
      pos += len;
      return { length: totalLength, bitsConsumed: pos - startPos };
    }
  }

  // Check for end-of-line marker
  if (bitString.substring(pos, pos + 12) === EOL) {
    return null;
  }

  // Return partial result if make-up codes were found
  if (totalLength > 0) {
    return { length: totalLength, bitsConsumed: pos - startPos };
  }

  return null;
}
