import { bench, group, run, summary } from "mitata";
import fs from "node:fs/promises";

// -------------------- Configuration --------------------

import * as nktkas_bmp from "../../src/mod.ts";
import nsbmp from "@cwasm/nsbmp";
import * as fast_bmp from "fast-bmp";
import * as bmp_ts from "bmp-ts";
import bmpjs from "bmp-js";
import bmpimagejs from "bmpimagejs";
import { Buffer } from "node:buffer";

type Benchmark = [
  // benchmark name
  string,
  // image data
  Uint8Array<ArrayBuffer>,
];
const BENCHMARKS: Benchmark[] = [
  ["BI_RGB: 1 bit", await fs.readFile("./tests/_bmpsuite-2.8/g/pal1bg.bmp")],
  ["BI_RGB: 1 bit (grayscale)", await fs.readFile("./tests/_bmpsuite-2.8/g/pal1.bmp")],
  ["BI_RGB: 4 bit", await fs.readFile("./tests/_bmpsuite-2.8/g/pal4.bmp")],
  ["BI_RGB: 4 bit (grayscale)", await fs.readFile("./tests/_bmpsuite-2.8/g/pal4gs.bmp")],
  ["BI_RGB: 8 bit", await fs.readFile("./tests/_bmpsuite-2.8/g/pal8.bmp")],
  ["BI_RGB: 8 bit (grayscale)", await fs.readFile("./tests/_bmpsuite-2.8/g/pal8gs.bmp")],
  ["BI_RGB: 16 bit", await fs.readFile("./tests/_bmpsuite-2.8/g/rgb16.bmp")],
  ["BI_RGB: 24 bit", await fs.readFile("./tests/_bmpsuite-2.8/g/rgb24.bmp")],
  ["BI_RGB: 32 bit", await fs.readFile("./tests/_bmpsuite-2.8/g/rgb32.bmp")],
  ["BI_RLE: 4 bit", await fs.readFile("./tests/_bmpsuite-2.8/g/pal4rle.bmp")],
  ["BI_RLE: 8 bit", await fs.readFile("./tests/_bmpsuite-2.8/g/pal8rle.bmp")],
  ["BI_BITFIELDS: 16 bit", await fs.readFile("./tests/_bmpsuite-2.8/g/rgb16bfdef.bmp")],
  ["BI_BITFIELDS: 32 bit", await fs.readFile("./tests/_bmpsuite-2.8/g/rgb32bfdef.bmp")],
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
      "BI_RGB: 8 bit",
      "BI_RGB: 8 bit (grayscale)",
      "BI_RGB: 24 bit",
    ],
    (data) => fast_bmp.decode(data),
  ],
  [
    "bmp-ts",
    [
      "BI_RGB: 16 bit",
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
      "BI_RLE: 4 bit",
      "BI_RLE: 8 bit",
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

// -------------------- Run --------------------

for (const [groupName, image] of BENCHMARKS) {
  group(groupName, () => {
    summary(() => {
      for (const [libName, supportedGroups, decode] of DECODER_LIBS) {
        const isSupported = supportedGroups.includes(groupName);
        if (isSupported) {
          bench(libName, () => decode(image))
            .baseline(libName === "@nktkas/bmp")
            .gc("once"); // clears memory from previous benchmarks
        }
      }
    });
  });
}

await run();
