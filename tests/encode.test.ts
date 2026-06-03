// deno-lint-ignore-file no-import-prefix

/**
 * Check that encode() creates BMP files with correct headers and pixel data
 * by comparing against reference BMP files from the BMP Suite by Jason Summers (https://entropymine.com/jason/bmpsuite/).
 */

import { assertEquals } from "jsr:@std/assert@1";
import { join } from "jsr:@std/path@1";
import { type Color, decode, encode, type EncodeOptions } from "../src/mod.ts";
import { readHeader } from "../src/decode/header.ts";
import { extractPalette, type FlatPalette } from "../src/decode/palette.ts";
import { assertPixelsMatch, SUITE_DIR } from "./_utils.ts";

/** Converts a FlatPalette back to Color[] for encode compatibility. */
function toColorArray(pal: FlatPalette): Color[] {
  const colors: Color[] = [];
  for (let i = 0; i < pal.red.length; i++) {
    colors.push({ red: pal.red[i], green: pal.green[i], blue: pal.blue[i] });
  }
  return colors;
}

/** Maps DIB header size to HeaderType string. */
function mapHeaderType(
  headerSize: number,
): "BITMAPINFOHEADER" | "BITMAPV4HEADER" | "BITMAPV5HEADER" {
  if (headerSize === 108) return "BITMAPV4HEADER";
  if (headerSize === 124) return "BITMAPV5HEADER";
  return "BITMAPINFOHEADER";
}

/** Extracts bitfield masks from BmpHeader (only for BITFIELDS compression). */
function extractBitfieldMasks(header: ReturnType<typeof readHeader>) {
  if (header.compression !== 3 && header.compression !== 6) return undefined;
  return {
    redMask: header.redMask,
    greenMask: header.greenMask,
    blueMask: header.blueMask,
    alphaMask: header.compression === 6 ? header.alphaMask : undefined,
  };
}

/** Encodes a BMP file with the same parameters as the original and compares the result. */
async function runTest(filename: string) {
  // 1. Read original BMP and parse header
  const originalBmp = await Deno.readFile(join(SUITE_DIR, "g", filename));
  const originalHeader = readHeader(originalBmp);

  // 2. Decode to get raw pixel data
  const raw = decode(originalBmp);

  // 3. Build encode options from original header
  const encodeOptions: EncodeOptions = {
    bitsPerPixel: originalHeader.bitsPerPixel as 1 | 4 | 8 | 16 | 24 | 32,
    compression: originalHeader.compression as 0 | 1 | 2 | 3 | 6,
    headerType: mapHeaderType(originalHeader.headerSize),
    isTopDown: originalHeader.height < 0,
    palette: originalHeader.bitsPerPixel <= 8 ? toColorArray(extractPalette(originalBmp, originalHeader)) : undefined,
    bitfields: extractBitfieldMasks(originalHeader),
  };

  // 4. Encode with original parameters
  const encoded = encode(raw, encodeOptions);

  // 5. Parse encoded header and validate
  const encodedHeader = readHeader(encoded);

  assertEquals(encodedHeader.width, Math.abs(originalHeader.width), "Width mismatch");
  assertEquals(
    Math.abs(encodedHeader.height),
    Math.abs(originalHeader.height),
    "Height mismatch",
  );
  assertEquals(encodedHeader.bitsPerPixel, originalHeader.bitsPerPixel, "BitsPerPixel mismatch");
  assertEquals(encodedHeader.compression, originalHeader.compression, "Compression mismatch");
  assertEquals(encodedHeader.headerSize, originalHeader.headerSize, "HeaderSize mismatch");

  // Validate bitfield masks if present
  if (encodeOptions.bitfields) {
    const encodedMasks = extractBitfieldMasks(encodedHeader);
    assertEquals(encodedMasks, encodeOptions.bitfields, "BitfieldMasks mismatch");
  }

  // Validate palette if present
  if (encodeOptions.palette) {
    const encodedPalette = toColorArray(extractPalette(encoded, encodedHeader));
    assertEquals(encodedPalette, encodeOptions.palette, "Palette mismatch");
  }

  // 6. Roundtrip comparison: decode the encoded BMP and compare pixels
  assertPixelsMatch(raw, decode(encoded));
}

// Representative files for each encodable format. The other g/ files are omitted as redundant
// variants of these — except pal8os2.bmp, whose OS/2 header the encoder cannot reproduce.
const CASES: Record<string, string[]> = {
  Paletted: ["pal1.bmp", "pal1bg.bmp", "pal4.bmp", "pal4gs.bmp", "pal8.bmp", "pal8gs.bmp"],
  Truecolor: ["rgb16.bmp", "rgb24.bmp", "rgb32.bmp"],
  Bitfields: ["rgb16bfdef.bmp", "rgb32bfdef.bmp"],
  Compression: ["pal4rle.bmp", "pal8rle.bmp"],
  "Header types": ["pal8v4.bmp", "pal8v5.bmp"],
  "Edge cases": ["pal8topdown.bmp"],
};

Deno.test("Encode", async (t) => {
  for (const [group, files] of Object.entries(CASES)) {
    await t.step(group, async (t) => {
      for (const file of files) await t.step(file, () => runTest(file));
    });
  }
});
