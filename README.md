# BMP Encoder/Decoder

[![License: MIT](https://img.shields.io/badge/License-MIT-brightgreen.svg)](https://opensource.org/licenses/MIT)
[![npm](https://img.shields.io/npm/v/@nktkas/bmp)](https://www.npmjs.com/package/@nktkas/bmp)
[![JSR](https://jsr.io/badges/@nktkas/bmp)](https://jsr.io/@nktkas/bmp)

Fast and lightweight BMP image encoder/decoder.

Works with:
<img alt="browsers" title="This package works with browsers." height="16px" src="https://jsr.io/logos/browsers.svg" />
<img alt="Bun" title="This package works with Bun." height="16px" src="https://jsr.io/logos/bun.svg" />
<img alt="Deno" title="This package works with Deno." height="16px" src="https://jsr.io/logos/deno.svg" />
<img alt="Node.js" title="This package works with Node.js" height="16px" src="https://jsr.io/logos/node.svg" />
<img alt="Cloudflare Workers" title="This package works with Cloudflare Workers." height="16px" src="https://jsr.io/logos/cloudflare-workers.svg" />

## Usage

### Decode

Supported BMP formats:

- **Any header types**: BITMAPINFOHEADER, BITMAPV4HEADER, BITMAPV5HEADER, etc.
- **Any compression methods**: BI_RGB, BI_RLE8, BI_RLE4, BI_BITFIELDS, etc.
- **Any bits per pixel**: 1, 4, 8, 16, 24, 32
- **Top-down and bottom-up images**

<sub>Full list of supported BMP formats [here](https://entropymine.com/jason/bmpsuite/bmpsuite/html/bmpsuite.html)</sub>

#### Basic usage

<!-- deno-fmt-ignore -->
```ts
import { decode } from "@nktkas/bmp";

// A minimal 1x1 pixel 24-bit BMP file
const file = new Uint8Array([
  // BMP File Header (14 bytes)
  0x42, 0x4D,
  0x3A, 0x00, 0x00, 0x00,
  0x00, 0x00,
  0x00, 0x00,
  0x36, 0x00, 0x00, 0x00,
  // DIB Header (BITMAPINFOHEADER, 40 bytes)
  0x28, 0x00, 0x00, 0x00,
  0x01, 0x00, 0x00, 0x00,
  0x01, 0x00, 0x00, 0x00,
  0x01, 0x00,
  0x18, 0x00,
  0x00, 0x00, 0x00, 0x00,
  0x04, 0x00, 0x00, 0x00,
  0x00, 0x00, 0x00, 0x00,
  0x00, 0x00, 0x00, 0x00,
  0x00, 0x00, 0x00, 0x00,
  0x00, 0x00, 0x00, 0x00,
  // Pixel data (BGR + padding) - 1x1 black pixel
  0x00, 0x00, 0x00,
  0x00
]);

const raw = decode(bmp);
// { width: 1, height: 1, channels: 3, data: Uint8Array(3) [0, 0, 0] }
//                                 ^^^
//                                 may be 1 (grayscale), 3 (RGB), or 4 (RGBA)
```

#### BI_JPEG / BI_PNG compressed images

These formats use external compression (JPEG/PNG) for the pixel data, which is not directly supported by the BMP format.
To work with these images, you need to extract the compressed data and decode it with a suitable library.

<!-- deno-fmt-ignore -->
```ts
import { extractCompressedData } from "@nktkas/bmp";

// A minimal 1x1 pixel BMP file with embedded PNG data
const bmp = new Uint8Array([
  // BMP File Header (14 bytes)
  0x42, 0x4D,
  0x7B, 0x00, 0x00, 0x00,
  0x00, 0x00,
  0x00, 0x00,
  0x36, 0x00, 0x00, 0x00,
  // DIB Header (BITMAPINFOHEADER, 40 bytes)
  0x28, 0x00, 0x00, 0x00,
  0x01, 0x00, 0x00, 0x00,
  0x01, 0x00, 0x00, 0x00,
  0x01, 0x00,
  0x00, 0x00,
  0x05, 0x00, 0x00, 0x00,
  0x45, 0x00, 0x00, 0x00,
  0x00, 0x00, 0x00, 0x00,
  0x00, 0x00, 0x00, 0x00,
  0x00, 0x00, 0x00, 0x00,
  0x00, 0x00, 0x00, 0x00,
  // Embedded PNG data (69 bytes) - 1x1 black pixel
  // PNG signature
  0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A,
  // IHDR chunk
  0x00, 0x00, 0x00, 0x0D, 0x49, 0x48, 0x44, 0x52,
  0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
  0x08, 0x00, 0x00, 0x00, 0x00, 0x3A, 0x7E, 0x9B, 0x55,
  // IDAT chunk
  0x00, 0x00, 0x00, 0x0C, 0x49, 0x44, 0x41, 0x54,
  0x08, 0x1D, 0x01, 0x02, 0x00, 0xFD, 0xFF, 0x00,
  0x00, 0xE5, 0xE3, 0x00, 0x09, 0x74, 0xC6, 0xD6, 0xC2,
  // IEND chunk
  0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4E, 0x44,
  0xAE, 0x42, 0x60, 0x82
]);

const extracted = extractCompressedData(bmp);
// { width: 1, height: 1, compression: 5, data: Uint8Array(69) [...] }
//                                    ^^^
//                                    may be 4 (BI_JPEG) or 5 (BI_PNG) or others compressions

// Then you can decode it with any JPEG/PNG decoder
import sharp from "sharp";
const raw = await sharp(extracted.data).raw().toBuffer();
```

### Encode

Supported encoding formats:

- **Bits per pixel**: 1, 4, 8, 16, 24, 32
- **Compression**: BI_RGB, BI_RLE8, BI_RLE4, BI_BITFIELDS, BI_ALPHABITFIELDS
- **Header types**: BITMAPINFOHEADER, BITMAPV4HEADER, BITMAPV5HEADER
- **Orientation**: Top-down and bottom-up

#### Basic usage

<!-- deno-fmt-ignore -->
```ts
import { encode } from "@nktkas/bmp";

// A minimal raw image
const raw = {
  width: 2,
  height: 2,
  channels: 3, // 1 (grayscale), 3 (RGB), or 4 (RGBA)
  data: new Uint8Array([ // 2x2 black and white pixels
    0, 0, 0,  255, 255, 255,
    0, 0, 0,  255, 255, 255,
  ]),
} as const;

// Encode to 24-bit BMP (automatic detection of best settings based on raw data)
const bmp = encode(raw);
// Returns Uint8Array with complete BMP file
```

#### Advanced options

```ts
interface EncodeOptions {
  /**
   * Bits per pixel (1, 4, 8, 16, 24, or 32).
   *
   * Default: Auto-detected from input channels
   * - channels=1 (grayscale) → 8-bit
   * - channels=3 (RGB) → 24-bit
   * - channels=4 (RGBA) → 32-bit
   */
  bitsPerPixel?: 1 | 4 | 8 | 16 | 24 | 32;

  /**
   * BMP compression method identifiers.
   * - 0 (BI_RGB) - No compression. Raw pixel data.
   * - 1 (BI_RLE8) - 8-bit run-length encoding. 256-color indexed only.
   * - 2 (BI_RLE4) - 4-bit run-length encoding. 16-color indexed only.
   * - 3 (BI_BITFIELDS) - Uncompressed with custom RGB bit masks.
   * - 6 (BI_ALPHABITFIELDS) - Uncompressed with custom RGBA bit masks.
   *
   * Default: 0 (BI_RGB)
   */
  compression?: CompressionType;

  /**
   * BMP header format type. Determines header size and features.
   * - `BITMAPINFOHEADER`: 40 bytes. Basic format.
   * - `BITMAPV4HEADER`: 108 bytes. Embedded masks, color space, gamma support.
   * - `BITMAPV5HEADER`: 124 bytes. Adds ICC profiles and rendering intent.
   *
   * Default: `BITMAPINFOHEADER`
   */
  headerType?: HeaderType;

  /**
   * BMP image orientation.
   * - `false` - bottom-up (standard BMP)
   * - `true` - top-down
   *
   * Default: false
   */
  topDown?: boolean;

  /**
   * Color palette for indexed formats (1, 4, 8-bit).
   *
   * If not provided, palette will be generated automatically.
   */
  palette?: RGBQUAD[];

  /**
   * Bitfield masks for BI_BITFIELDS/BI_ALPHABITFIELDS compression.
   *
   * If not provided, default masks will be used:
   * - 16-bit - RGB565
   * - 32-bit - BGRA
   */
  bitfields?: BitfieldMasks;
}
```

## Benchmarks

### Decode

<sub>Run command: `npm run bench:decode`</sub>

```
# BI_RGB (127x64)
1bit x 64,590 ops/sec @ 15.5µs/op
4bit x 56,930 ops/sec @ 17.6µs/op
8bit x 69,980 ops/sec @ 14.3µs/op
16bit x 56,710 ops/sec @ 17.6µs/op
24bit x 68,570 ops/sec @ 14.6µs/op
32bit x 59,350 ops/sec @ 16.8µs/op

# BI_RLE (127x64)
4bit x 65,920 ops/sec @ 15.2µs/op
8bit x 54,440 ops/sec @ 18.4µs/op

# BI_BITFIELDS (127x64)
16bit x 56,330 ops/sec @ 17.8µs/op
32bit x 50,920 ops/sec @ 19.6µs/op
```

### Encode

<sub>Run command: `npm run bench:encode`</sub>

```
# BI_RGB (127x64)
1bit x 9,488 ops/sec @ 105.4µs/op
4bit x 3,677 ops/sec @ 271.9µs/op
8bit x 5,847 ops/sec @ 171.0µs/op
16bit x 27,340 ops/sec @ 36.6µs/op
24bit x 31,200 ops/sec @ 32.1µs/op
32bit x 27,690 ops/sec @ 36.1µs/op

# BI_RLE (127x64)
4bit x 3,591 ops/sec @ 278.5µs/op
8bit x 5,971 ops/sec @ 167.5µs/op

# BI_BITFIELDS (127x64)
16bit x 32,090 ops/sec @ 31.2µs/op
32bit x 29,110 ops/sec @ 34.4µs/op
```
