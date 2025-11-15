/**
 * Check that encode() creates BMP files with correct headers and pixel data
 * by comparing against reference BMP files from the BMP Suite by Jason Summers (https://entropymine.com/jason/bmpsuite/).
 */

import assert from "node:assert";
import test from "node:test";
import fs from "node:fs/promises";
import pixelmatch from "pixelmatch";
import { decode, encode, type EncodeOptions } from "../../src/mod.ts";
import { type BMPHeader, readBMPHeader } from "../../src/decode/_bmpHeader.ts";
import { extractColorTable } from "../../src/decode/_colorTable.ts";

/** Maps header size to HeaderType string */
function mapHeaderType(headerSize: number): "BITMAPINFOHEADER" | "BITMAPV4HEADER" | "BITMAPV5HEADER" {
  if (headerSize === 108) return "BITMAPV4HEADER";
  if (headerSize === 124) return "BITMAPV5HEADER";
  return "BITMAPINFOHEADER"; // Default: 40 bytes
}

/** Helper to extract bitfield masks from header */
function extractBitfieldMasks(bmp: Uint8Array, header: BMPHeader) {
  const { infoHeader } = header;

  // Check if BITFIELDS compression
  if (infoHeader.biCompression !== 3 && infoHeader.biCompression !== 6) return undefined;

  // V4/V5 headers (108/124 bytes) - masks in header
  if ("bV4RedMask" in infoHeader) {
    return {
      redMask: infoHeader.bV4RedMask,
      greenMask: infoHeader.bV4GreenMask,
      blueMask: infoHeader.bV4BlueMask,
      alphaMask: infoHeader.bV4AlphaMask,
    };
  }

  // V2/V3 headers (52/56 bytes) - masks in header
  if ("biRedMask" in infoHeader) {
    return {
      redMask: infoHeader.biRedMask,
      greenMask: infoHeader.biGreenMask,
      blueMask: infoHeader.biBlueMask,
      alphaMask: "biAlphaMask" in infoHeader ? infoHeader.biAlphaMask : undefined,
    };
  }

  // V1 BITMAPINFOHEADER (40 bytes) - masks after header
  const view = new DataView(bmp.buffer, bmp.byteOffset, bmp.byteLength);
  const maskOffset = 14 + infoHeader.biSize;
  return {
    redMask: view.getUint32(maskOffset, true),
    greenMask: view.getUint32(maskOffset + 4, true),
    blueMask: view.getUint32(maskOffset + 8, true),
    alphaMask: infoHeader.biCompression === 6 ? view.getUint32(maskOffset + 12, true) : undefined,
  };
}

/** Converts grayscale/RGB/RGBA to RGBA for pixelmatch comparison */
function addAlphaChannel(data: Uint8Array, channels: 1 | 3 | 4): Uint8Array {
  if (channels === 1) {
    // Grayscale to RGBA
    const withAlpha = new Uint8Array(data.length * 4);
    for (let i = 0, j = 0; i < data.length; i++, j += 4) {
      withAlpha[j] = data[i];
      withAlpha[j + 1] = data[i];
      withAlpha[j + 2] = data[i];
      withAlpha[j + 3] = 255;
    }
    return withAlpha;
  }
  if (channels === 3) {
    // RGB to RGBA
    const withAlpha = new Uint8Array((data.length / 3) * 4);
    for (let i = 0, j = 0; i < data.length; i += 3, j += 4) {
      withAlpha[j] = data[i];
      withAlpha[j + 1] = data[i + 1];
      withAlpha[j + 2] = data[i + 2];
      withAlpha[j + 3] = 255;
    }
    return withAlpha;
  }
  return data; // Already RGBA
}

/** Encodes a BMP file and compares it against the original BMP file */
async function runTest(filename: string) {
  // 1. Read original BMP
  const originalBmp = await fs.readFile(`./tests/_bmpsuite-2.8/g/${filename}`);

  // 2. Parse original header
  const originalHeader = readBMPHeader(originalBmp);
  const { fileHeader, infoHeader } = originalHeader;

  // 3. Decode to get raw pixel data
  const raw = decode(originalBmp);

  // 4. Extract metadata for encoding
  const encodeOptions: EncodeOptions = {
    bitsPerPixel: infoHeader.biBitCount as 1 | 4 | 8 | 16 | 24 | 32,
    compression: infoHeader.biCompression as 0 | 1 | 2 | 3 | 6,
    headerType: mapHeaderType(infoHeader.biSize),
    topDown: infoHeader.biHeight < 0,
    palette: infoHeader.biBitCount <= 8
      ? extractColorTable(
        originalBmp,
        fileHeader.bfOffBits,
        infoHeader.biSize,
        infoHeader.biBitCount as 1 | 2 | 4 | 8,
        infoHeader.biClrUsed,
      )
      : undefined,
    bitfields: extractBitfieldMasks(originalBmp, originalHeader),
  };

  // 5. Encode with original parameters
  const encoded = encode(raw, encodeOptions);

  // 6. Parse encoded header
  const encodedHeader = readBMPHeader(encoded);
  const { infoHeader: encodedInfoHeader } = encodedHeader;

  // 7. Validate headers
  assert.strictEqual(encodedInfoHeader.biWidth, infoHeader.biWidth, "Width mismatch");
  assert.strictEqual(encodedInfoHeader.biHeight, infoHeader.biHeight, "Height mismatch");
  assert.strictEqual(encodedInfoHeader.biBitCount, infoHeader.biBitCount, "BitsPerPixel mismatch");
  assert.strictEqual(encodedInfoHeader.biCompression, infoHeader.biCompression, "Compression mismatch");
  assert.strictEqual(encodedInfoHeader.biSize, infoHeader.biSize, "HeaderSize mismatch");

  // Validate bitfield masks if present
  if (encodeOptions.bitfields) {
    const encodedBitfieldMasks = extractBitfieldMasks(encoded, encodedHeader);
    assert.deepStrictEqual(encodedBitfieldMasks, encodeOptions.bitfields, "Bitfield masks mismatch");
  }

  // Validate palette if present
  if (encodeOptions.palette) {
    const encodedPalette = extractColorTable(
      encoded,
      encodedHeader.fileHeader.bfOffBits,
      encodedInfoHeader.biSize,
      encodedInfoHeader.biBitCount as 1 | 2 | 4 | 8,
      encodedInfoHeader.biClrUsed,
    );
    assert.deepStrictEqual(encodedPalette, encodeOptions.palette, "Palette mismatch");
  }

  // 8. Decode both BMPs and compare pixels using pixelmatch
  const originalRaw = decode(originalBmp);
  const encodedRaw = decode(encoded);

  // Pixel-by-pixel comparison
  const diff = pixelmatch(
    addAlphaChannel(originalRaw.data, originalRaw.channels),
    addAlphaChannel(encodedRaw.data, encodedRaw.channels),
    undefined,
    originalRaw.width,
    originalRaw.height,
  );
  assert.strictEqual(diff, 0, "Found different pixels");
}

test("Encode", async (t) => {
  await t.test("Paletted", async (t) => {
    await t.test("1-bit", async (t) => {
      await t.test("pal1.bmp", () => runTest("pal1.bmp"));
      await t.test("pal1bg.bmp", () => runTest("pal1bg.bmp"));
    });

    await t.test("4-bit", async (t) => {
      await t.test("pal4.bmp", () => runTest("pal4.bmp"));
      await t.test("pal4gs.bmp", () => runTest("pal4gs.bmp"));
    });

    await t.test("8-bit", async (t) => {
      await t.test("pal8.bmp", () => runTest("pal8.bmp"));
      await t.test("pal8gs.bmp", () => runTest("pal8gs.bmp"));
    });
  });

  await t.test("Truecolor", async (t) => {
    await t.test("16-bit", async (t) => {
      await t.test("rgb16.bmp", () => runTest("rgb16.bmp"));
      await t.test("rgb16bfdef.bmp", () => runTest("rgb16bfdef.bmp"));
    });

    await t.test("24-bit", async (t) => {
      await t.test("rgb24.bmp", () => runTest("rgb24.bmp"));
    });

    await t.test("32-bit", async (t) => {
      await t.test("rgb32.bmp", () => runTest("rgb32.bmp"));
      await t.test("rgb32bfdef.bmp", () => runTest("rgb32bfdef.bmp"));
    });
  });

  await t.test("Bitfields", async (t) => {
    await t.test("16-bit", async (t) => {
      await t.test("rgb16bfdef.bmp", () => runTest("rgb16bfdef.bmp"));
    });

    await t.test("32-bit", async (t) => {
      await t.test("rgb32bfdef.bmp", () => runTest("rgb32bfdef.bmp"));
    });
  });

  await t.test("Compression", async (t) => {
    await t.test("RLE4", () => runTest("pal4rle.bmp"));
    await t.test("RLE8", () => runTest("pal8rle.bmp"));
  });

  await t.test("Header types", async (t) => {
    await t.test("v4", () => runTest("pal8v4.bmp"));
    await t.test("v5", () => runTest("pal8v5.bmp"));
  });

  await t.test("Edge cases", async (t) => {
    await t.test("Top-down", () => runTest("pal8topdown.bmp"));
  });
});
