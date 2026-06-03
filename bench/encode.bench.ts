// deno-lint-ignore-file no-import-prefix

/**
 * Encode benchmark against other BMP libraries, on generated images (bench/_corpus.ts).
 */

import { Buffer } from "node:buffer";
import bmpjs from "npm:bmp-js@^0.1.0";
import * as fast_bmp from "npm:fast-bmp@^4.0.1";
import * as nktkas_bmp from "../src/mod.ts";
import type { RawImageData } from "../src/mod.ts";
import { type BenchName, DEFAULT_SIZE, genPhoto, PERF_CASES } from "./_corpus.ts";

interface BenchLib {
  name: string;
  fn: (data: RawImageData & { bitsPerPixel: 1 | 4 | 8 | 16 | 24 | 32; compression: 0 | 1 | 2 | 3 }) => unknown;
  only?: BenchName[];
}

// bmp-js takes an ABGR buffer; build it once
const photo = genPhoto(DEFAULT_SIZE, DEFAULT_SIZE);
const photoAbgr = Buffer.alloc(photo.width * photo.height * 4);
for (let i = 0; i < photo.width * photo.height; i++) {
  const si = i * photo.channels;
  photoAbgr[i * 4] = 255;
  photoAbgr[i * 4 + 1] = photo.data[si + 2];
  photoAbgr[i * 4 + 2] = photo.data[si + 1];
  photoAbgr[i * 4 + 3] = photo.data[si];
}

const libs: BenchLib[] = [
  {
    name: "@nktkas/bmp",
    fn: (d) => nktkas_bmp.encode(d, { bitsPerPixel: d.bitsPerPixel, compression: d.compression }),
  },
  {
    name: "fast-bmp",
    fn: (d) => fast_bmp.encode({ ...d }),
    only: ["BI_RGB: 8 bit (grayscale)", "BI_RGB: 24 bit"],
  },
  {
    name: "bmp-js",
    fn: () => bmpjs.encode({ data: photoAbgr, width: photo.width, height: photo.height }),
    only: ["BI_RGB: 24 bit"],
  },
];

const cases = PERF_CASES.map((c) => ({
  name: c.name,
  data: {
    ...c.gen(DEFAULT_SIZE, DEFAULT_SIZE),
    bitsPerPixel: c.bitsPerPixel,
    compression: c.compression,
  },
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
