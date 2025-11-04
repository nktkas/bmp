// deno-lint-ignore-file no-import-prefix
import * as nktkas_bmp from "@nktkas/bmp";
import * as fast_bmp from "npm:fast-bmp@4.0.1";

// -------------------- Configuration --------------------

interface EncoderConfig {
  encode: (data: Uint8Array<ArrayBuffer>, bitsPerPixel: 1 | 4 | 8 | 16 | 24 | 32) => unknown;
  supportedGroups: string[];
}

const LIB_ENCODERS: Record<string, EncoderConfig> = {
  "@nktkas/bmp": {
    encode: (data, bitsPerPixel) => {
      const raw = nktkas_bmp.decode(data);
      return nktkas_bmp.encode(raw, { bitsPerPixel });
    },
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
    encode: (data, bitsPerPixel) => {
      const raw = nktkas_bmp.decode(data);
      return fast_bmp.encode({
        bitsPerPixel,
        width: raw.width,
        height: raw.height,
        data: raw.data,
        channels: raw.channels,
      });
    },
    supportedGroups: [ // other bmp formats are generated broken
      "BI_RGB: 8 bit (grayscale)",
      "BI_RGB: 24 bit",
    ],
  },
  // Placeholder for future libraries
  // "other-bmp-lib": {
  //   encode: (data) => {
  //     const raw = otherLib.decode(data);
  //     return otherLib.encode(raw);
  //   },
  //   supportedGroups: ["BI_RGB: 24 bit"],
  // },
};

// -------------------- Helpers --------------------

function runBench(group: string, data: Uint8Array<ArrayBuffer>, bitsPerPixel: 1 | 4 | 8 | 16 | 24 | 32) {
  for (const [libName, config] of Object.entries(LIB_ENCODERS)) {
    const isSupported = config.supportedGroups.includes(group);
    Deno.bench(libName, { group, ignore: !isSupported }, () => {
      config.encode(data, bitsPerPixel);
    });
  }
}

// -------------------- BI_RGB --------------------

const pal1bg = await Deno.readFile("./tests/_bmpsuite-2.8/g/pal1bg.bmp");
runBench("BI_RGB: 1 bit", pal1bg, 1);

const pal1 = await Deno.readFile("./tests/_bmpsuite-2.8/g/pal1.bmp");
runBench("BI_RGB: 1 bit (grayscale)", pal1, 1);

const pal4 = await Deno.readFile("./tests/_bmpsuite-2.8/g/pal4.bmp");
runBench("BI_RGB: 4 bit", pal4, 4);

const pal4gs = await Deno.readFile("./tests/_bmpsuite-2.8/g/pal4gs.bmp");
runBench("BI_RGB: 4 bit (grayscale)", pal4gs, 4);

const pal8 = await Deno.readFile("./tests/_bmpsuite-2.8/g/pal8.bmp");
runBench("BI_RGB: 8 bit", pal8, 8);

const pal8gs = await Deno.readFile("./tests/_bmpsuite-2.8/g/pal8gs.bmp");
runBench("BI_RGB: 8 bit (grayscale)", pal8gs, 8);

const rgb16 = await Deno.readFile("./tests/_bmpsuite-2.8/g/rgb16.bmp");
runBench("BI_RGB: 16 bit", rgb16, 16);

const rgb24 = await Deno.readFile("./tests/_bmpsuite-2.8/g/rgb24.bmp");
runBench("BI_RGB: 24 bit", rgb24, 24);

const rgb32 = await Deno.readFile("./tests/_bmpsuite-2.8/g/rgb32.bmp");
runBench("BI_RGB: 32 bit", rgb32, 32);

// -------------------- BI_RLE --------------------

const pal4rle = await Deno.readFile("./tests/_bmpsuite-2.8/g/pal4rle.bmp");
runBench("BI_RLE: 4 bit", pal4rle, 4);

const pal8rle = await Deno.readFile("./tests/_bmpsuite-2.8/g/pal8rle.bmp");
runBench("BI_RLE: 8 bit", pal8rle, 8);

// -------------------- BI_BITFIELDS --------------------

const rgb16bfdef = await Deno.readFile("./tests/_bmpsuite-2.8/g/rgb16bfdef.bmp");
runBench("BI_BITFIELDS: 16 bit", rgb16bfdef, 16);

const rgb32bfdef = await Deno.readFile("./tests/_bmpsuite-2.8/g/rgb32bfdef.bmp");
runBench("BI_BITFIELDS: 32 bit", rgb32bfdef, 32);
