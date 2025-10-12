import type { RawImageData } from "./mod.ts";
import type { BMPHeader } from "./_bmpHeader.ts";
import { extractColorTable } from "./_colorTable.ts";

// Modified Huffman (CCITT Group 3 1D) code tables for white runs
const WHITE_TERMINATING: { [key: string]: number } = {
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

const WHITE_MAKEUP: { [key: string]: number } = {
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

// Modified Huffman (CCITT Group 3 1D) code tables for black runs
const BLACK_TERMINATING: { [key: string]: number } = {
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

const BLACK_MAKEUP: { [key: string]: number } = {
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

const EOL = "000000000001"; // End of line marker

/**
 * Converts a BMP with Modified Huffman (OS/2 Huffman 1D) compression to a raw pixel image data
 */
export function BI_HUFFMAN_TO_RAW(bmp: Uint8Array, header: BMPHeader): RawImageData {
  // 0. Get header data and validate
  const { bfOffBits } = header.fileHeader;
  const { biWidth, biHeight, biCompression, biSize, biBitCount, biClrUsed } = header.infoHeader;

  if (biCompression !== 3) {
    throw new Error(`Unsupported BMP compression method: received ${biCompression}, expected 3 (BI_HUFFMAN)`);
  }
  if (biBitCount !== 1) {
    throw new Error(`Unsupported BMP bit count: received ${biBitCount}, expected 1 for Huffman compression`);
  }

  // 1. Calculate image dimensions and orientation
  const absWidth = Math.abs(biWidth);
  const absHeight = Math.abs(biHeight);
  const isTopDown = biHeight < 0;

  // 2. Extract color palette
  const palette = extractColorTable(bmp, bfOffBits, biSize, biBitCount, biClrUsed);

  // 3. Check if palette is grayscale (R=G=B for all colors)
  const isGrayscale = palette.every((c) => c.red === c.green && c.green === c.blue);
  const channels = isGrayscale ? 1 : 3;

  // 4. Allocate output buffer
  const output = new Uint8Array(absWidth * absHeight * channels);

  // 5. Decode Huffman-compressed data
  const pixels = decompressHuffman(bmp, bfOffBits, absWidth, absHeight);

  // 6. Process pixels (palette indices to RGB/Grayscale)
  if (isGrayscale) {
    for (let y = 0; y < absHeight; y++) {
      const srcY = isTopDown ? y : (absHeight - 1 - y);
      let srcOffset = srcY * absWidth;
      let dstOffset = y * absWidth;

      for (let x = 0; x < absWidth; x++) {
        output[dstOffset++] = palette[pixels[srcOffset++]].red;
      }
    }
  } else {
    for (let y = 0; y < absHeight; y++) {
      const srcY = isTopDown ? y : (absHeight - 1 - y);
      let srcOffset = srcY * absWidth;
      let dstOffset = y * absWidth * 3;

      for (let x = 0; x < absWidth; x++) {
        const color = palette[pixels[srcOffset++]];
        output[dstOffset++] = color.red;
        output[dstOffset++] = color.green;
        output[dstOffset++] = color.blue;
      }
    }
  }

  return {
    width: absWidth,
    height: absHeight,
    channels: channels,
    data: output,
  };
}

/**
 * Decompresses Modified Huffman (CCITT Group 3 1D) encoded data
 */
function decompressHuffman(
  bmp: Uint8Array,
  bfOffBits: number,
  absWidth: number,
  absHeight: number,
): Uint8Array {
  const pixels = new Uint8Array(absWidth * absHeight);

  // Convert compressed data to bit string for easier parsing
  let bitString = "";
  for (let i = bfOffBits; i < bmp.length; i++) {
    bitString += bmp[i].toString(2).padStart(8, "0");
  }

  let bitPos = 0;
  let pixelPos = 0;

  // Skip initial EOL if present
  if (bitString.substring(bitPos, bitPos + 12) === EOL) {
    bitPos += 12;
  }

  for (let row = 0; row < absHeight; row++) {
    let col = 0;
    let isWhite = true; // Scan lines always start with white run

    while (col < absWidth) {
      const runLength = decodeRun(bitString, bitPos, isWhite);
      if (!runLength) break; // Error or EOL encountered

      bitPos += runLength.bitsConsumed;

      // Fill pixels with current color
      const colorValue = isWhite ? 0 : 1;
      for (let i = 0; i < runLength.length && col < absWidth; i++, col++) {
        pixels[pixelPos++] = colorValue;
      }

      isWhite = !isWhite;
    }

    // Skip any remaining bits to align to next scanline
    // Look for EOL marker
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

/**
 * Decodes a single run (white or black) from the bit stream
 */
function decodeRun(
  bitString: string,
  startPos: number,
  isWhite: boolean,
): { length: number; bitsConsumed: number } | null {
  const terminatingTable = isWhite ? WHITE_TERMINATING : BLACK_TERMINATING;
  const makeupTable = isWhite ? WHITE_MAKEUP : BLACK_MAKEUP;

  let totalLength = 0;
  let pos = startPos;

  // Decode make-up codes first (for runs >= 64)
  while (true) {
    let found = false;

    // Try to match make-up code (up to 13 bits)
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

  // Decode terminating code (required)
  for (let len = 2; len <= 13 && pos + len <= bitString.length; len++) {
    const code = bitString.substring(pos, pos + len);
    if (terminatingTable[code] !== undefined) {
      totalLength += terminatingTable[code];
      pos += len;
      return { length: totalLength, bitsConsumed: pos - startPos };
    }
  }

  // Check for EOL
  if (bitString.substring(pos, pos + 12) === EOL) {
    return null;
  }

  // If no valid code found, return what we have or error
  if (totalLength > 0) {
    return { length: totalLength, bitsConsumed: pos - startPos };
  }

  return null;
}
