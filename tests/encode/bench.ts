// deno-lint-ignore-file no-import-prefix
import { join } from "jsr:@std/path@1";
import { bench, group, run, summary } from "npm:mitata@1";
import type { RawImageData } from "../../src/mod.ts";
import { SUITE_DIR } from "../_utils.ts";

// -------------------- Configuration --------------------

import * as nktkas_bmp from "../../src/mod.ts";
import * as fast_bmp from "npm:fast-bmp@^4.0.1";
import bmpjs from "npm:bmp-js@^0.1.0";
import { Buffer } from "node:buffer";

type Benchmark = [
  // benchmark name
  string,
  // image data
  RawImageData & { bitsPerPixel: 1 | 4 | 8 | 16 | 24 | 32 },
];

const goodDir = join(SUITE_DIR, "g");

/** Loads a BMP test file, decodes it, and attaches bitsPerPixel metadata. */
async function loadBenchmark(
  file: string,
  bitsPerPixel: 1 | 4 | 8 | 16 | 24 | 32,
): Promise<RawImageData & { bitsPerPixel: typeof bitsPerPixel }> {
  const data = await Deno.readFile(join(goodDir, file));
  return {
    ...nktkas_bmp.decode(data),
    bitsPerPixel,
  };
}

const BENCHMARKS: Benchmark[] = [
  ["BI_RGB: 1 bit", await loadBenchmark("pal1bg.bmp", 1)],
  ["BI_RGB: 1 bit (grayscale)", await loadBenchmark("pal1.bmp", 1)],
  ["BI_RGB: 4 bit", await loadBenchmark("pal4.bmp", 4)],
  ["BI_RGB: 4 bit (grayscale)", await loadBenchmark("pal4gs.bmp", 4)],
  ["BI_RGB: 8 bit", await loadBenchmark("pal8.bmp", 8)],
  ["BI_RGB: 8 bit (grayscale)", await loadBenchmark("pal8gs.bmp", 8)],
  ["BI_RGB: 16 bit", await loadBenchmark("rgb16.bmp", 16)],
  ["BI_RGB: 24 bit", await loadBenchmark("rgb24.bmp", 24)],
  ["BI_RGB: 32 bit", await loadBenchmark("rgb32.bmp", 32)],
  ["BI_RLE: 4 bit", await loadBenchmark("pal4rle.bmp", 4)],
  ["BI_RLE: 8 bit", await loadBenchmark("pal8rle.bmp", 8)],
  ["BI_BITFIELDS: 16 bit", await loadBenchmark("rgb16bfdef.bmp", 16)],
  ["BI_BITFIELDS: 32 bit", await loadBenchmark("rgb32bfdef.bmp", 32)],
];

type EncoderLib = [
  // library name
  string,
  // supported benchmark names
  string[],
  // encode function
  (data: RawImageData & { bitsPerPixel: 1 | 4 | 8 | 16 | 24 | 32 }) => unknown,
];
const ENCODER_LIBS: EncoderLib[] = [
  [
    "@nktkas/bmp",
    [
      "BI_RGB: 1 bit",
      "BI_RGB: 1 bit (grayscale)",
      "BI_RGB: 4 bit",
      "BI_RGB: 4 bit (grayscale)",
      "BI_RGB: 8 bit",
      "BI_RGB: 8 bit (grayscale)",
      "BI_RGB: 16 bit",
      "BI_RGB: 24 bit",
      "BI_RGB: 32 bit",
      "BI_RLE: 4 bit",
      "BI_RLE: 8 bit",
      "BI_BITFIELDS: 16 bit",
      "BI_BITFIELDS: 32 bit",
    ],
    (data) => nktkas_bmp.encode(data, { ...data }),
  ],
  [
    "fast-bmp",
    [
      "BI_RGB: 8 bit (grayscale)",
      "BI_RGB: 24 bit",
    ],
    (data) => fast_bmp.encode({ ...data }),
  ],
  [
    "bmp-js",
    [
      "BI_RGB: 24 bit",
    ],
    (data) => {
      const abgr = Buffer.alloc(data.width * data.height * 4);
      for (let i = 0; i < data.width * data.height; i++) {
        const si = i * data.channels;
        abgr[i * 4] = 255;
        abgr[i * 4 + 1] = data.data[si + 2];
        abgr[i * 4 + 2] = data.data[si + 1];
        abgr[i * 4 + 3] = data.data[si];
      }
      return bmpjs.encode({ data: abgr, width: data.width, height: data.height });
    },
  ],
];

// -------------------- Run --------------------

for (const [groupName, image] of BENCHMARKS) {
  group(groupName, () => {
    summary(() => {
      for (const [libName, supportedGroups, encode] of ENCODER_LIBS) {
        if (supportedGroups.includes(groupName)) {
          bench(libName, () => encode(image))
            .baseline(libName === "@nktkas/bmp")
            .gc("once");
        }
      }
    });
  });
}

await run();
