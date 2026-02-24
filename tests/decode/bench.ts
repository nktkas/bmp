// deno-lint-ignore-file no-import-prefix

/**
 * Benchmarks BMP decoding performance against third-party libraries using files from the BMP Suite.
 */

import { Buffer } from "node:buffer";
import nsbmp from "npm:@cwasm/nsbmp@^0.1.3";
import { join } from "jsr:@std/path@1";
import bmpjs from "npm:bmp-js@^0.1.0";
import * as bmp_ts from "npm:bmp-ts@^1.0.9";
import bmpimagejs from "npm:bmpimagejs@^1.0.4";
import * as fast_bmp from "npm:fast-bmp@^4.0.1";
import { bench, group, run, summary } from "npm:mitata@1";
import * as nktkas_bmp from "../../src/mod.ts";
import { SUITE_DIR } from "../_utils.ts";

// ============================================================================
// Configuration
// ============================================================================

type Benchmark = [
  // benchmark name
  string,
  // image data
  Uint8Array<ArrayBuffer>,
];

const goodDir = join(SUITE_DIR, "g");
const BENCHMARKS: Benchmark[] = [
  ["BI_RGB: 1 bit", await Deno.readFile(join(goodDir, "pal1bg.bmp"))],
  ["BI_RGB: 1 bit (grayscale)", await Deno.readFile(join(goodDir, "pal1.bmp"))],
  ["BI_RGB: 4 bit", await Deno.readFile(join(goodDir, "pal4.bmp"))],
  ["BI_RGB: 4 bit (grayscale)", await Deno.readFile(join(goodDir, "pal4gs.bmp"))],
  ["BI_RGB: 8 bit", await Deno.readFile(join(goodDir, "pal8.bmp"))],
  ["BI_RGB: 8 bit (grayscale)", await Deno.readFile(join(goodDir, "pal8gs.bmp"))],
  ["BI_RGB: 16 bit", await Deno.readFile(join(goodDir, "rgb16.bmp"))],
  ["BI_RGB: 24 bit", await Deno.readFile(join(goodDir, "rgb24.bmp"))],
  ["BI_RGB: 32 bit", await Deno.readFile(join(goodDir, "rgb32.bmp"))],
  ["BI_RLE: 4 bit", await Deno.readFile(join(goodDir, "pal4rle.bmp"))],
  ["BI_RLE: 8 bit", await Deno.readFile(join(goodDir, "pal8rle.bmp"))],
  ["BI_BITFIELDS: 16 bit", await Deno.readFile(join(goodDir, "rgb16bfdef.bmp"))],
  ["BI_BITFIELDS: 32 bit", await Deno.readFile(join(goodDir, "rgb32bfdef.bmp"))],
];

type DecoderLib = [
  // library name
  string,
  // supported benchmark names
  string[],
  // decode function
  (data: Uint8Array<ArrayBuffer>) => unknown,
];
const DECODER_LIBS: DecoderLib[] = [
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
    (data) => nktkas_bmp.decode(data),
  ],
  [
    "@cwasm/nsbmp",
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
    (data) => nsbmp.decode(data),
  ],
  [
    "fast-bmp",
    [
      "BI_RGB: 8 bit (grayscale)",
      "BI_RGB: 24 bit",
      "BI_BITFIELDS: 32 bit",
    ],
    (data) => fast_bmp.decode(data),
  ],
  [
    "bmp-ts",
    [
      "BI_RGB: 1 bit",
      "BI_RGB: 1 bit (grayscale)",
      "BI_RGB: 8 bit",
      "BI_RGB: 8 bit (grayscale)",
      "BI_RGB: 16 bit",
      "BI_RGB: 24 bit",
      "BI_RGB: 32 bit",
      "BI_BITFIELDS: 16 bit",
      "BI_BITFIELDS: 32 bit",
    ],
    (data) => bmp_ts.decode(Buffer.from(data)),
  ],
  [
    "bmp-js",
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
    ],
    (data) => bmpjs.decode(Buffer.from(data)),
  ],
  [
    "bmpimagejs",
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
    (data) => bmpimagejs.decode(data.buffer),
  ],
];

// ============================================================================
// Run
// ============================================================================

for (const [groupName, image] of BENCHMARKS) {
  group(groupName, () => {
    summary(() => {
      for (const [libName, supportedGroups, decode] of DECODER_LIBS) {
        if (supportedGroups.includes(groupName)) {
          bench(libName, () => decode(image))
            .baseline(libName === "@nktkas/bmp")
            .gc("once");
        }
      }
    });
  });
}

await run();
