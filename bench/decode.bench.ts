// deno-lint-ignore-file no-import-prefix

/**
 * Decode benchmark against other BMP libraries, on generated images (bench/_corpus.ts).
 */

import { Buffer } from "node:buffer";
import nsbmp from "npm:@cwasm/nsbmp@^0.1.3";
import bmpjs from "npm:bmp-js@^0.1.0";
import * as bmp_ts from "npm:bmp-ts@^1.0.9";
import bmpimagejs from "npm:bmpimagejs@^1.0.4";
import * as fast_bmp from "npm:fast-bmp@^4.0.1";
import * as nktkas_bmp from "../src/mod.ts";
import { type BenchName, DEFAULT_SIZE, PERF_CASES } from "./_corpus.ts";

interface BenchLib {
  name: string;
  fn: (data: Uint8Array) => unknown;
  only?: BenchName[];
}

const libs: BenchLib[] = [
  { name: "@nktkas/bmp", fn: (d) => nktkas_bmp.decode(d) },
  { name: "@cwasm/nsbmp", fn: (d) => nsbmp.decode(d) },
  {
    name: "bmpimagejs",
    fn: (d) => bmpimagejs.decode(d.buffer as ArrayBuffer),
    only: [
      "BI_RGB: 1 bit",
      "BI_RGB: 1 bit (grayscale)",
      "BI_RGB: 4 bit",
      "BI_RGB: 4 bit (grayscale)",
      "BI_RGB: 8 bit",
      "BI_RGB: 8 bit (grayscale)",
      "BI_RGB: 24 bit",
      "BI_RGB: 32 bit",
      "BI_RLE: 4 bit",
      "BI_RLE: 8 bit",
      "BI_BITFIELDS: 32 bit",
    ],
  },
  {
    name: "bmp-js",
    fn: (d) => bmpjs.decode(Buffer.from(d)),
    only: [
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
  },
  {
    name: "bmp-ts",
    fn: (d) => bmp_ts.decode(Buffer.from(d)),
    only: [
      "BI_RGB: 1 bit",
      "BI_RGB: 1 bit (grayscale)",
      "BI_RGB: 4 bit",
      "BI_RGB: 4 bit (grayscale)",
      "BI_RGB: 8 bit",
      "BI_RGB: 8 bit (grayscale)",
      "BI_RGB: 16 bit",
      "BI_RGB: 24 bit",
      "BI_RGB: 32 bit",
      "BI_BITFIELDS: 16 bit",
    ],
  },
  {
    name: "fast-bmp",
    fn: (d) => fast_bmp.decode(d),
    only: ["BI_RGB: 8 bit (grayscale)", "BI_RGB: 24 bit"],
  },
];

const cases = PERF_CASES.map((c) => ({
  name: c.name,
  data: nktkas_bmp.encode(c.gen(DEFAULT_SIZE, DEFAULT_SIZE), {
    bitsPerPixel: c.bitsPerPixel,
    compression: c.compression,
  }),
}));

for (const { name, data } of cases) {
  for (const lib of libs) {
    if (lib.only && !lib.only.includes(name)) continue;
    Deno.bench({
      name: lib.name,
      group: name,
      baseline: lib.name === "@nktkas/bmp",
      fn: () => void lib.fn(data),
    });
  }
}
