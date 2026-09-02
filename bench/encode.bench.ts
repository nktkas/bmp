// deno-lint-ignore-file no-import-prefix

/**
 * Encode benchmark against other BMP libraries, over the shared corpus.
 *
 * @module
 */

import { Buffer } from "node:buffer";
import bmpjs from "npm:bmp-js@^0.1.0";
import * as fast_bmp from "npm:fast-bmp@^4.0.1";
import * as nktkas_bmp from "../src/mod.ts";
import type { RawImageData } from "../src/mod.ts";
import { type BenchLib, DEFAULT_SIZE, genPhoto, PERF_CASES, registerBenches } from "./_corpus.ts";

/** The image every case is built from, and the ABGR copy bmp-js takes. */
const PHOTO = genPhoto(DEFAULT_SIZE, DEFAULT_SIZE);
const PHOTO_ABGR = Buffer.alloc(PHOTO.width * PHOTO.height * 4);
for (let i = 0; i < PHOTO.width * PHOTO.height; i++) {
  const si = i * PHOTO.channels;
  PHOTO_ABGR[i * 4] = 255;
  PHOTO_ABGR[i * 4 + 1] = PHOTO.data[si + 2];
  PHOTO_ABGR[i * 4 + 2] = PHOTO.data[si + 1];
  PHOTO_ABGR[i * 4 + 3] = PHOTO.data[si];
}

/** The input every encode benchmark takes: an image plus the format to write it in. */
type EncodeInput = RawImageData & { bitsPerPixel: 1 | 4 | 8 | 16 | 24 | 32; compression: 0 | 1 | 2 | 3 };

const LIBS: BenchLib<EncodeInput>[] = [
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
    fn: () => bmpjs.encode({ data: PHOTO_ABGR, width: PHOTO.width, height: PHOTO.height }),
    only: ["BI_RGB: 24 bit"],
  },
];

const CASES = PERF_CASES.map((c) => ({
  name: c.name,
  data: {
    ...c.gen(DEFAULT_SIZE, DEFAULT_SIZE),
    bitsPerPixel: c.bitsPerPixel,
    compression: c.compression,
  },
}));

registerBenches<EncodeInput>(CASES, LIBS);
