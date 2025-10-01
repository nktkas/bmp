// deno-lint-ignore-file no-import-prefix
import * as nktkas_bmp from "@nktkas/bmp";
import nsbmp from "npm:@cwasm/nsbmp@0.1.3";
import * as fast_bmp from "npm:fast-bmp@4.0.1";
import * as bmp_ts from "npm:bmp-ts@1.0.9";
// @ts-types="npm:@types/bmp-js"
import bmpjs from "npm:bmp-js@0.1.0";
import bmpimagejs from "npm:bmpimagejs@1.0.4";
import { Buffer } from "node:buffer";

// -------------------- Configuration --------------------

const LIB_DECODERS: Record<string, (buf: Uint8Array<ArrayBuffer>) => unknown> = {
  "@nktkas/bmp": (data) => nktkas_bmp.decode(data, { removeEmptyAlpha: false }),
  "@cwasm/nsbmp": nsbmp.decode,
  "fast-bmp": fast_bmp.decode,
  "bmp-ts": (data) => bmp_ts.decode(Buffer.from(data)),
  "bmp-js": (data) => bmpjs.decode(Buffer.from(data)),
  "bmpimagejs": (data) => bmpimagejs.decode(data.buffer),
};

// -------------------- Helpers --------------------

function runBench(group: string, data: Uint8Array<ArrayBuffer>) {
  for (const [libName, decodeFn] of Object.entries(LIB_DECODERS)) {
    const isThrow = !isNonThrowFn(() => decodeFn(data));
    Deno.bench(libName, { group, ignore: isThrow, n: 50_000 }, () => {
      decodeFn(data);
    });
  }
}

function isNonThrowFn(fn: () => unknown): boolean {
  try {
    fn();
    return true;
  } catch {
    return false;
  }
}

// -------------------- BI_RGB --------------------

const pal1 = await Deno.readFile("./tests/decode/images/good/pal1.bmp");
runBench("BI_RGB__pal1", pal1);

const pal4 = await Deno.readFile("./tests/decode/images/good/pal4.bmp");
runBench("BI_RGB__pal4", pal4);

const pal8 = await Deno.readFile("./tests/decode/images/good/pal8.bmp");
runBench("BI_RGB__pal8", pal8);

const rgb16 = await Deno.readFile("./tests/decode/images/good/rgb16.bmp");
runBench("BI_RGB__rgb16", rgb16);

const rgb24 = await Deno.readFile("./tests/decode/images/good/rgb24.bmp");
runBench("BI_RGB__rgb24", rgb24);

const rgb32 = await Deno.readFile("./tests/decode/images/good/rgb32.bmp");
runBench("BI_RGB__rgb32", rgb32);

// -------------------- BI_RLE --------------------

const pal4rle = await Deno.readFile("./tests/decode/images/good/pal4rle.bmp");
runBench("BI_RLE__pal4", pal4rle);

const pal8rle = await Deno.readFile("./tests/decode/images/good/pal8rle.bmp");
runBench("BI_RLE__pal8", pal8rle);

// -------------------- BI_BITFIELDS --------------------

const rgb16bfdef = await Deno.readFile("./tests/decode/images/good/rgb16bfdef.bmp");
runBench("BI_BITFIELDS__rgb16", rgb16bfdef);

const rgb32bfdef = await Deno.readFile("./tests/decode/images/good/rgb32bfdef.bmp");
runBench("BI_BITFIELDS__rgb32", rgb32bfdef);
