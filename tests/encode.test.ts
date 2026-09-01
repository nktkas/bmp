// deno-lint-ignore-file no-import-prefix

/**
 * Encode tests against the BMP Suite by Jason Summers (https://entropymine.com/jason/bmpsuite/):
 * each file is re-encoded with the parameters it was written with, then checked header and pixel by pixel.
 */

import { assertEquals, assertThrows } from "jsr:@std/assert@1";
import { join } from "jsr:@std/path@1";
import {
  type BitfieldMasks,
  BmpError,
  type Color,
  decode,
  encode,
  type EncodeOptions,
  type RawImageData,
} from "../src/mod.ts";
import type { BmpHeader } from "../src/common.ts";
import { readHeader } from "../src/decode/header.ts";
import { extractPalette, type FlatPalette } from "../src/decode/palette.ts";
import type { HeaderType } from "../src/encode/header.ts";
import { assertPixelsMatch, SUITE_DIR } from "./_utils.ts";

/** Turns the decoder's channel arrays back into the array of colors the encoder takes. */
function toColorArray(pal: FlatPalette): Color[] {
  const colors: Color[] = [];
  for (let i = 0; i < pal.red.length; i++) {
    colors.push({ red: pal.red[i], green: pal.green[i], blue: pal.blue[i] });
  }
  return colors;
}

/** Names the header version a DIB header of this size belongs to. */
function mapHeaderType(headerSize: number): HeaderType {
  if (headerSize === 108) return "BITMAPV4HEADER";
  if (headerSize === 124) return "BITMAPV5HEADER";
  return "BITMAPINFOHEADER";
}

/** Reads back the masks of a bitfields image, or nothing when the file uses another compression. */
function extractBitfieldMasks(header: BmpHeader): BitfieldMasks | undefined {
  if (header.compression !== 3 && header.compression !== 6) return undefined;
  return {
    redMask: header.redMask,
    greenMask: header.greenMask,
    blueMask: header.blueMask,
    alphaMask: header.compression === 6 ? header.alphaMask : undefined,
  };
}

/** Re-encodes one suite file with the parameters it was written with, and checks it comes back the same. */
async function runTest(filename: string) {
  // --- Arrange -------------------------------------------------------------------------------------------------------

  const originalBmp = await Deno.readFile(join(SUITE_DIR, "g", filename));
  const originalHeader = readHeader(originalBmp);
  const raw = decode(originalBmp);

  const encodeOptions: EncodeOptions = {
    bitsPerPixel: originalHeader.bitsPerPixel as 1 | 4 | 8 | 16 | 24 | 32,
    compression: originalHeader.compression as 0 | 1 | 2 | 3 | 6,
    headerType: mapHeaderType(originalHeader.headerSize),
    isTopDown: originalHeader.height < 0,
    palette: originalHeader.bitsPerPixel <= 8 ? toColorArray(extractPalette(originalBmp, originalHeader)) : undefined,
    bitfields: extractBitfieldMasks(originalHeader),
  };

  // --- Act -----------------------------------------------------------------------------------------------------------

  const encoded = encode(raw, encodeOptions);

  // --- Assert --------------------------------------------------------------------------------------------------------

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
  assertEquals(encodedHeader.colorsUsed, encodeOptions.palette?.length ?? 0, "ColorsUsed mismatch");

  if (encodeOptions.bitfields) {
    const encodedMasks = extractBitfieldMasks(encodedHeader);
    assertEquals(encodedMasks, encodeOptions.bitfields, "BitfieldMasks mismatch");
  }

  if (encodeOptions.palette) {
    const encodedPalette = toColorArray(extractPalette(encoded, encodedHeader));
    assertEquals(encodedPalette, encodeOptions.palette, "Palette mismatch");
  }

  assertPixelsMatch(raw, decode(encoded));
}

// One representative file per encodable format.
const CASES: Record<string, string[]> = {
  Paletted: ["pal1.bmp", "pal1bg.bmp", "pal4.bmp", "pal4gs.bmp", "pal8.bmp", "pal8gs.bmp"],
  Truecolor: ["rgb16.bmp", "rgb24.bmp", "rgb32.bmp"],
  Bitfields: ["rgb16bfdef.bmp", "rgb32bfdef.bmp"],
  Compression: ["pal4rle.bmp", "pal8rle.bmp"],
  "Header types": ["pal8v4.bmp", "pal8v5.bmp"],
  "Edge cases": ["pal8topdown.bmp"],
};

Deno.test("encode() reproduces the header and the pixels of the file it was given", async (t) => {
  for (const [group, files] of Object.entries(CASES)) {
    await t.step(group, async (t) => {
      for (const file of files) await t.step(file, () => runTest(file));
    });
  }
});

/** An image whose every pixel is a distinct color, so that the quantizer runs its colormap path. */
function manyColors(width: number, height: number): RawImageData {
  const data = new Uint8Array(width * height * 3);
  for (let i = 0, o = 0; i < width * height; i++, o += 3) {
    data[o] = i & 0xFF;
    data[o + 1] = (i >> 8) & 0xFF;
    data[o + 2] = (i >> 16) & 0xFF;
  }
  return { width, height, channels: 3, data };
}

Deno.test("encode() picks the depth from the channel count when none is given", async (t) => {
  const cases: Array<[channels: 1 | 3 | 4, bitsPerPixel: number]> = [[1, 8], [3, 24], [4, 32]];

  for (const [channels, bitsPerPixel] of cases) {
    await t.step(`${channels} channel(s)`, () => {
      const raw = { width: 2, height: 2, channels, data: new Uint8Array(2 * 2 * channels).fill(128) };
      assertEquals(readHeader(encode(raw)).bitsPerPixel, bitsPerPixel);
    });
  }
});

Deno.test("encode() builds a palette from the image when none is given", async (t) => {
  for (const bitsPerPixel of [1, 4, 8] as const) {
    await t.step(`${bitsPerPixel}bpp from an image of many colors`, () => {
      const raw = manyColors(64, 64);
      const header = readHeader(encode(raw, { bitsPerPixel }));

      assertEquals(header.bitsPerPixel, bitsPerPixel);
      assertEquals(header.colorsUsed, 1 << bitsPerPixel, "Every palette slot should be filled");
    });

    await t.step(`${bitsPerPixel}bpp from a grayscale image`, () => {
      const data = new Uint8Array(64 * 64);
      for (let i = 0; i < data.length; i++) data[i] = (i * 3) & 0xFF;
      const raw: RawImageData = { width: 64, height: 64, channels: 1, data };

      const encoded = encode(raw, { bitsPerPixel });
      const palette = extractPalette(encoded, readHeader(encoded));

      assertEquals(palette.isGrayscale, true, "A grayscale source should produce a grayscale palette");
      assertEquals(palette.red[0], 0, "The ramp should start at black");
    });
  }
});

Deno.test("encode() writes an alpha bitfields image", () => {
  const raw: RawImageData = { width: 2, height: 1, channels: 4, data: new Uint8Array([255, 0, 0, 128, 0, 255, 0, 64]) };
  const header = readHeader(encode(raw, { bitsPerPixel: 32, compression: 6 }));

  assertEquals(header.compression, 6);
  assertEquals(header.alphaMask, 0xFF000000);
});

Deno.test("encode() rejects the option combinations it cannot honor", async (t) => {
  const rgb: RawImageData = { width: 2, height: 1, channels: 3, data: new Uint8Array(6) };
  const rejected: Array<[name: string, raw: RawImageData, options: EncodeOptions]> = [
    ["zero width", { ...rgb, width: 0, data: new Uint8Array(0) }, {}],
    ["pixel data of the wrong length", { ...rgb, data: new Uint8Array(5) }, {}],
    ["BI_RLE8 at a depth other than 8", rgb, { bitsPerPixel: 4, compression: 1 }],
    ["BI_RLE4 at a depth other than 4", rgb, { bitsPerPixel: 8, compression: 2 }],
    ["RLE asked for top-down", rgb, { bitsPerPixel: 8, compression: 1, isTopDown: true }],
    ["BI_BITFIELDS at a depth other than 16 or 32", rgb, { bitsPerPixel: 24, compression: 3 }],
    ["BI_ALPHABITFIELDS at a depth other than 32", rgb, { bitsPerPixel: 16, compression: 6 }],
    ["a palette too short for the depth", rgb, { bitsPerPixel: 4, palette: [{ red: 1, green: 2, blue: 3 }] }],
  ];

  for (const [name, raw, options] of rejected) {
    await t.step(name, () => {
      assertThrows(() => encode(raw, options), BmpError);
    });
  }
});

Deno.test("encode() declares channel masks that match the pixels it wrote", async (t) => {
  const raw = { width: 1, height: 1, channels: 3 as const, data: new Uint8Array([0, 255, 0]) };

  for (const headerType of ["BITMAPV4HEADER", "BITMAPV5HEADER"] as const) {
    for (const bitsPerPixel of [16, 32] as const) {
      await t.step(`${headerType} at ${bitsPerPixel}bpp`, () => {
        const file = encode(raw, { bitsPerPixel, headerType });
        const header = readHeader(file);

        const pixel = bitsPerPixel === 16
          ? file[header.dataOffset] | (file[header.dataOffset + 1] << 8)
          : new DataView(file.buffer).getUint32(header.dataOffset, true);

        // Read the green channel back through the mask the file declares.
        const shift = 31 - Math.clz32(header.greenMask & -header.greenMask);
        const bits = 32 - Math.clz32(header.greenMask >>> shift);
        const green = Math.round((((pixel & header.greenMask) >>> shift) * 255) / ((1 << bits) - 1));

        assertEquals(green, 255, "Green read through the declared mask does not match the pixel written");
      });
    }
  }
});
