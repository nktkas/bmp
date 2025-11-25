// deno-lint-ignore-file no-import-prefix
import { bench, group, run, summary } from "npm:mitata@1";
import type { RawImageData } from "../../src/mod.ts";

// -------------------- Configuration --------------------

import * as nktkas_bmp from "../../src/mod.ts";
import * as fast_bmp from "npm:fast-bmp@^4.0.1";

type Benchmark = [
  // benchmark name
  string,
  // image data
  RawImageData & { bitsPerPixel: 1 | 4 | 8 | 16 | 24 | 32 },
];
const BENCHMARKS: Benchmark[] = [
  [
    "BI_RGB: 1 bit",
    {
      ...nktkas_bmp.decode(await Deno.readFile("./tests/_bmpsuite-2.8/g/pal1bg.bmp")),
      bitsPerPixel: 1,
    },
  ],
  [
    "BI_RGB: 1 bit (grayscale)",
    {
      ...nktkas_bmp.decode(await Deno.readFile("./tests/_bmpsuite-2.8/g/pal1.bmp")),
      bitsPerPixel: 1,
    },
  ],
  [
    "BI_RGB: 4 bit",
    {
      ...nktkas_bmp.decode(await Deno.readFile("./tests/_bmpsuite-2.8/g/pal4.bmp")),
      bitsPerPixel: 4,
    },
  ],
  [
    "BI_RGB: 4 bit (grayscale)",
    {
      ...nktkas_bmp.decode(await Deno.readFile("./tests/_bmpsuite-2.8/g/pal4gs.bmp")),
      bitsPerPixel: 4,
    },
  ],
  [
    "BI_RGB: 8 bit",
    {
      ...nktkas_bmp.decode(await Deno.readFile("./tests/_bmpsuite-2.8/g/pal8.bmp")),
      bitsPerPixel: 8,
    },
  ],
  [
    "BI_RGB: 8 bit (grayscale)",
    {
      ...nktkas_bmp.decode(await Deno.readFile("./tests/_bmpsuite-2.8/g/pal8gs.bmp")),
      bitsPerPixel: 8,
    },
  ],
  [
    "BI_RGB: 16 bit",
    {
      ...nktkas_bmp.decode(await Deno.readFile("./tests/_bmpsuite-2.8/g/rgb16.bmp")),
      bitsPerPixel: 16,
    },
  ],
  [
    "BI_RGB: 24 bit",
    {
      ...nktkas_bmp.decode(await Deno.readFile("./tests/_bmpsuite-2.8/g/rgb24.bmp")),
      bitsPerPixel: 24,
    },
  ],
  [
    "BI_RGB: 32 bit",
    {
      ...nktkas_bmp.decode(await Deno.readFile("./tests/_bmpsuite-2.8/g/rgb32.bmp")),
      bitsPerPixel: 32,
    },
  ],
  [
    "BI_RLE: 4 bit",
    {
      ...nktkas_bmp.decode(await Deno.readFile("./tests/_bmpsuite-2.8/g/pal4rle.bmp")),
      bitsPerPixel: 4,
    },
  ],
  [
    "BI_RLE: 8 bit",
    {
      ...nktkas_bmp.decode(await Deno.readFile("./tests/_bmpsuite-2.8/g/pal8rle.bmp")),
      bitsPerPixel: 8,
    },
  ],
  [
    "BI_BITFIELDS: 16 bit",
    {
      ...nktkas_bmp.decode(await Deno.readFile("./tests/_bmpsuite-2.8/g/rgb16bfdef.bmp")),
      bitsPerPixel: 16,
    },
  ],
  [
    "BI_BITFIELDS: 32 bit",
    {
      ...nktkas_bmp.decode(await Deno.readFile("./tests/_bmpsuite-2.8/g/rgb32bfdef.bmp")),
      bitsPerPixel: 32,
    },
  ],
];

type DecoderLib = [
  // library name
  string,
  // supported benchmark names
  string[],
  // encode function
  (data: RawImageData & { bitsPerPixel: 1 | 4 | 8 | 16 | 24 | 32 }) => unknown,
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
];

// -------------------- Run --------------------

for (const [groupName, image] of BENCHMARKS) {
  group(groupName, () => {
    summary(() => {
      for (const [libName, supportedGroups, encode] of DECODER_LIBS) {
        const isSupported = supportedGroups.includes(groupName);
        if (isSupported) {
          bench(libName, () => encode(image))
            .baseline(libName === "@nktkas/bmp")
            .gc("once"); // clears memory from previous benchmarks
        }
      }
    });
  });
}

await run();
