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

interface DecoderConfig {
  decode: (buf: Uint8Array<ArrayBuffer>) => unknown;
  // only those bmp formats that are correctly decoded
  supportedGroups: string[];
}

const LIB_DECODERS: Record<string, DecoderConfig> = {
  "@nktkas/bmp": {
    decode: (data) => nktkas_bmp.decode(data),
    supportedGroups: [
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
  },
  "@cwasm/nsbmp": {
    decode: nsbmp.decode,
    supportedGroups: [
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
  },
  "fast-bmp": {
    decode: fast_bmp.decode,
    supportedGroups: [
      "BI_RGB: 8 bit",
      "BI_RGB: 8 bit (grayscale)",
      "BI_RGB: 24 bit",
    ],
  },
  "bmp-ts": {
    decode: (data) => bmp_ts.decode(Buffer.from(data)),
    supportedGroups: [
      "BI_RGB: 16 bit",
      "BI_RGB: 32 bit",
      "BI_BITFIELDS: 16 bit",
      "BI_BITFIELDS: 32 bit",
    ],
  },
  "bmp-js": {
    decode: (data) => bmpjs.decode(Buffer.from(data)),
    supportedGroups: [
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
  },
  "bmpimagejs": {
    decode: (data) => bmpimagejs.decode(data.buffer),
    supportedGroups: [
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
  },
};

// -------------------- Helpers --------------------

function runBench(group: string, data: Uint8Array<ArrayBuffer>) {
  for (const [libName, config] of Object.entries(LIB_DECODERS)) {
    const isSupported = config.supportedGroups.includes(group);
    Deno.bench(libName, { group, ignore: !isSupported, n: 50_000 }, () => {
      config.decode(data);
    });
  }
}

// -------------------- BI_RGB --------------------

const pal1bg = await Deno.readFile("./tests/bmpsuite-2.8/g/pal1bg.bmp");
runBench("BI_RGB: 1 bit", pal1bg);

const pal1 = await Deno.readFile("./tests/bmpsuite-2.8/g/pal1.bmp");
runBench("BI_RGB: 1 bit (grayscale)", pal1);

const pal4 = await Deno.readFile("./tests/bmpsuite-2.8/g/pal4.bmp");
runBench("BI_RGB: 4 bit", pal4);

const pal4gs = await Deno.readFile("./tests/bmpsuite-2.8/g/pal4gs.bmp");
runBench("BI_RGB: 4 bit (grayscale)", pal4gs);

const pal8 = await Deno.readFile("./tests/bmpsuite-2.8/g/pal8.bmp");
runBench("BI_RGB: 8 bit", pal8);

const pal8gs = await Deno.readFile("./tests/bmpsuite-2.8/g/pal8gs.bmp");
runBench("BI_RGB: 8 bit (grayscale)", pal8gs);

const rgb16 = await Deno.readFile("./tests/bmpsuite-2.8/g/rgb16.bmp");
runBench("BI_RGB: 16 bit", rgb16);

const rgb24 = await Deno.readFile("./tests/bmpsuite-2.8/g/rgb24.bmp");
runBench("BI_RGB: 24 bit", rgb24);

const rgb32 = await Deno.readFile("./tests/bmpsuite-2.8/g/rgb32.bmp");
runBench("BI_RGB: 32 bit", rgb32);

// -------------------- BI_RLE --------------------

const pal4rle = await Deno.readFile("./tests/bmpsuite-2.8/g/pal4rle.bmp");
runBench("BI_RLE: 4 bit", pal4rle);

const pal8rle = await Deno.readFile("./tests/bmpsuite-2.8/g/pal8rle.bmp");
runBench("BI_RLE: 8 bit", pal8rle);

// -------------------- BI_BITFIELDS --------------------

const rgb16bfdef = await Deno.readFile("./tests/bmpsuite-2.8/g/rgb16bfdef.bmp");
runBench("BI_BITFIELDS: 16 bit", rgb16bfdef);

const rgb32bfdef = await Deno.readFile("./tests/bmpsuite-2.8/g/rgb32bfdef.bmp");
runBench("BI_BITFIELDS: 32 bit", rgb32bfdef);
