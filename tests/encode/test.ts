/**
 * Check that encode() creates BMP files with correct headers and pixel data
 * by comparing against reference BMP files from the BMP Suite by Jason Summers (https://entropymine.com/jason/bmpsuite/).
 */

// deno-lint-ignore-file no-import-prefix
import { assertEquals } from "jsr:@std/assert@1";
import { join } from "jsr:@std/path@1";
import { type Color, decode, encode, type EncodeOptions } from "../../src/mod.ts";
import { readHeader } from "../../src/decode/header.ts";
import { extractPalette, type FlatPalette } from "../../src/decode/palette.ts";
import pixelmatch from "npm:pixelmatch@7";
import { SUITE_DIR, toRgba } from "../_utils.ts";

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
    topDown: originalHeader.height < 0,
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

  // 6. Roundtrip comparison: decode encoded BMP and compare pixels
  const encodedRaw = decode(encoded);

  const diff = pixelmatch(
    toRgba(raw.data, raw.channels),
    toRgba(encodedRaw.data, encodedRaw.channels),
    undefined,
    raw.width,
    raw.height,
  );
  assertEquals(diff, 0, "Found different pixels");
}

Deno.test("Encode", async (t) => {
  await t.step("Paletted", async (t) => {
    await t.step("1-bit", async (t) => {
      await t.step("pal1.bmp", () => runTest("pal1.bmp"));
      await t.step("pal1bg.bmp", () => runTest("pal1bg.bmp"));
    });

    await t.step("4-bit", async (t) => {
      await t.step("pal4.bmp", () => runTest("pal4.bmp"));
      await t.step("pal4gs.bmp", () => runTest("pal4gs.bmp"));
    });

    await t.step("8-bit", async (t) => {
      await t.step("pal8.bmp", () => runTest("pal8.bmp"));
      await t.step("pal8gs.bmp", () => runTest("pal8gs.bmp"));
    });
  });

  await t.step("Truecolor", async (t) => {
    await t.step("16-bit", async (t) => {
      await t.step("rgb16.bmp", () => runTest("rgb16.bmp"));
      await t.step("rgb16bfdef.bmp", () => runTest("rgb16bfdef.bmp"));
    });

    await t.step("24-bit", async (t) => {
      await t.step("rgb24.bmp", () => runTest("rgb24.bmp"));
    });

    await t.step("32-bit", async (t) => {
      await t.step("rgb32.bmp", () => runTest("rgb32.bmp"));
      await t.step("rgb32bfdef.bmp", () => runTest("rgb32bfdef.bmp"));
    });
  });

  await t.step("Bitfields", async (t) => {
    await t.step("16-bit", async (t) => {
      await t.step("rgb16bfdef.bmp", () => runTest("rgb16bfdef.bmp"));
    });

    await t.step("32-bit", async (t) => {
      await t.step("rgb32bfdef.bmp", () => runTest("rgb32bfdef.bmp"));
    });
  });

  await t.step("Compression", async (t) => {
    await t.step("RLE4", () => runTest("pal4rle.bmp"));
    await t.step("RLE8", () => runTest("pal8rle.bmp"));
  });

  await t.step("Header types", async (t) => {
    await t.step("v4", () => runTest("pal8v4.bmp"));
    await t.step("v5", () => runTest("pal8v5.bmp"));
  });

  await t.step("Edge cases", async (t) => {
    await t.step("Top-down", () => runTest("pal8topdown.bmp"));
  });
});
