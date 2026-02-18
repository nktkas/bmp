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

import { type BmpHeader, getImageLayout, type RawImageData } from "../common.ts";
import { extractPalette } from "./palette.ts";

// ============================================================================
// Huffman trie
// ============================================================================

/** Node in a binary trie for Huffman code lookup. */
interface TrieNode {
  /** Run length value (only defined at leaf nodes). */
  value: number;
  /** Child nodes: index 0 for bit 0, index 1 for bit 1. */
  children: [TrieNode | null, TrieNode | null];
}

/** Builds a binary trie from a table of bit-string codes → run lengths. */
function buildTrie(table: Record<string, number>): TrieNode {
  const root: TrieNode = { value: -1, children: [null, null] };
  for (const [code, value] of Object.entries(table)) {
    let node = root;
    for (let i = 0; i < code.length; i++) {
      const bit = code.charCodeAt(i) - 48; // '0'→0, '1'→1
      if (!node.children[bit]) {
        node.children[bit] = { value: -1, children: [null, null] };
      }
      node = node.children[bit]!;
    }
    node.value = value;
  }
  return root;
}

/** Merged trie containing both make-up and terminating codes for one color. */
interface RunTries {
  /** Trie for make-up codes (run lengths 64–1728, multiples of 64). */
  makeup: TrieNode;
  /** Trie for terminating codes (run lengths 0–63). */
  terminating: TrieNode;
}

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

// Build tries once at module load time
const WHITE_TRIES: RunTries = { makeup: buildTrie(WHITE_MAKEUP), terminating: buildTrie(WHITE_TERMINATING) };
const BLACK_TRIES: RunTries = { makeup: buildTrie(BLACK_MAKEUP), terminating: buildTrie(BLACK_TERMINATING) };

// ============================================================================
// Bit reader
// ============================================================================

/** Reads individual bits from a byte array, MSB first. */
class BitReader {
  private data: Uint8Array;
  private bitPos: number;
  private totalBits: number;

  constructor(data: Uint8Array, startByte: number) {
    this.data = data;
    this.bitPos = startByte * 8;
    this.totalBits = data.length * 8;
  }

  /** Reads one bit and advances the position. Returns 0 or 1. */
  readBit(): number {
    const byteIdx = this.bitPos >>> 3;
    const bitIdx = 7 - (this.bitPos & 7);
    this.bitPos++;
    return (this.data[byteIdx] >>> bitIdx) & 1;
  }

  /** Advances position by `n` bits. */
  skip(n: number): void {
    this.bitPos += n;
  }

  /** Returns true if there are at least `n` bits remaining. */
  hasAtLeast(n: number): boolean {
    return this.bitPos + n <= this.totalBits;
  }

  /** Checks whether the next 12 bits match the EOL pattern (000000000001). */
  isEol(): boolean {
    if (!this.hasAtLeast(12)) return false;
    let pos = this.bitPos;
    for (let i = 0; i < 11; i++) {
      if (((this.data[pos >>> 3] >>> (7 - (pos & 7))) & 1) !== 0) return false;
      pos++;
    }
    return ((this.data[pos >>> 3] >>> (7 - (pos & 7))) & 1) === 1;
  }
}

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
  const palR = palette.red;
  const palG = palette.green;
  const palB = palette.blue;

  const channels = palette.isGrayscale ? 1 : 3;
  const output = new Uint8Array(absWidth * absHeight * channels);

  // Decompress Huffman data into a flat array of 0/1 palette indices
  const pixels = decompressHuffman(bmp, dataOffset, absWidth, absHeight);

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
  const reader = new BitReader(bmp, dataOffset);
  let pixelPos = 0;

  // Skip initial EOL marker if present
  if (reader.isEol()) reader.skip(12);

  for (let row = 0; row < absHeight; row++) {
    let col = 0;
    let isWhite = true; // Each scan line starts with a white run

    while (col < absWidth) {
      const runLength = decodeRun(reader, isWhite);
      if (runLength < 0) break;

      // Fill pixels with the current color (0 = white, 1 = black)
      const colorValue = isWhite ? 0 : 1;
      const end = Math.min(col + runLength, absWidth);
      while (col < end) {
        pixels[pixelPos++] = colorValue;
        col++;
      }

      isWhite = !isWhite;
    }

    // Scan forward to the next EOL marker to align to the next row
    while (reader.hasAtLeast(12)) {
      if (reader.isEol()) {
        reader.skip(12);
        break;
      }
      reader.skip(1);
    }
  }

  return pixels;
}

/**
 * Decodes a single run (white or black) by walking the Huffman tries.
 * Returns the run length, or -1 if no valid code was found.
 */
function decodeRun(reader: BitReader, isWhite: boolean): number {
  const tries = isWhite ? WHITE_TRIES : BLACK_TRIES;
  let totalLength = 0;

  // Decode make-up codes (for runs >= 64 pixels)
  while (reader.hasAtLeast(2)) {
    const value = walkTrie(reader, tries.makeup);
    if (value < 0) break;
    totalLength += value;
  }

  // Decode the required terminating code (run length 0–63)
  if (reader.hasAtLeast(2)) {
    const value = walkTrie(reader, tries.terminating);
    if (value >= 0) {
      return totalLength + value;
    }
  }

  // Check for end-of-line marker
  if (reader.isEol()) return -1;

  // Return partial result if make-up codes were found
  return totalLength > 0 ? totalLength : -1;
}

/** Walks a Huffman trie bit-by-bit. Returns the decoded value, or -1 if no match. */
function walkTrie(reader: BitReader, root: TrieNode): number {
  let node: TrieNode | null = root;
  let bitsRead = 0;

  while (node && reader.hasAtLeast(1)) {
    const bit = reader.readBit();
    bitsRead++;
    node = node.children[bit];

    if (node && node.value >= 0) {
      return node.value; // Found a complete code
    }
  }

  // No match found — rewind the bits we consumed
  reader.skip(-bitsRead);
  return -1;
}
