# BMP Encoder/Decoder

[![npm](https://img.shields.io/npm/v/@nktkas/bmp)](https://www.npmjs.com/package/@nktkas/bmp)
[![JSR](https://jsr.io/badges/@nktkas/bmp)](https://jsr.io/@nktkas/bmp)
[![bundlejs](https://img.shields.io/bundlejs/size/@nktkas/bmp)](https://bundlejs.com/?q=@nktkas/bmp)

A fast, lightweight, zero-dependency BMP image encoder/decoder written in pure JavaScript.

Works with:
<img alt="browsers" title="This package works with browsers." height="16px" src="https://jsr.io/logos/browsers.svg" />
<img alt="Bun" title="This package works with Bun." height="16px" src="https://jsr.io/logos/bun.svg" />
<img alt="Deno" title="This package works with Deno." height="16px" src="https://jsr.io/logos/deno.svg" />
<img alt="Node.js" title="This package works with Node.js" height="16px" src="https://jsr.io/logos/node.svg" />
<img alt="Cloudflare Workers" title="This package works with Cloudflare Workers." height="16px" src="https://jsr.io/logos/cloudflare-workers.svg" />

## Usage

### Decode

Supported BMP formats:

- **Header types**: BITMAPCOREHEADER, OS22XBITMAPHEADER, BITMAPINFOHEADER, BITMAPV2–V5
- **Compression**: BI_RGB, BI_RLE8, BI_RLE4, BI_BITFIELDS, BI_ALPHABITFIELDS, Modified Huffman, RLE24
- **Bit depths**: 1, 2, 4, 8, 16, 24, 32, 64
- **Row order**: top-down and bottom-up

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

const raw = decode(file);
// { width: 1, height: 1, channels: 3, data: Uint8Array(3) [0, 0, 0] }
//                                 ^^^
//                                 may be 1 (grayscale), 3 (RGB), or 4 (RGBA)
```

#### BI_JPEG / BI_PNG compressed images

BMP files can embed JPEG or PNG data as pixel payload. Use `extractCompressedData` to get the embedded data, then decode
it with any JPEG/PNG library.

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
//                                    4 = BI_JPEG, 5 = BI_PNG

// Then decode with any JPEG/PNG library
import sharp from "sharp";
const raw = await sharp(extracted.data).raw().toBuffer();
```

### Encode

Supported encoding formats:

- **Bit depths**: 1, 4, 8, 16, 24, 32
- **Compression**: BI_RGB, BI_RLE8, BI_RLE4, BI_BITFIELDS, BI_ALPHABITFIELDS
- **Header types**: BITMAPINFOHEADER, BITMAPV4HEADER, BITMAPV5HEADER
- **Row order**: top-down and bottom-up

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
   * BMP compression method.
   * - 0 (BI_RGB) - No compression. Raw pixel data.
   * - 1 (BI_RLE8) - 8-bit run-length encoding. 256-color indexed only.
   * - 2 (BI_RLE4) - 4-bit run-length encoding. 16-color indexed only.
   * - 3 (BI_BITFIELDS) - Uncompressed with custom RGB bit masks.
   * - 6 (BI_ALPHABITFIELDS) - Uncompressed with custom RGBA bit masks.
   *
   * Default: 0 (BI_RGB)
   */
  compression?: 0 | 1 | 2 | 3 | 6;

  /**
   * BMP header format.
   * - "BITMAPINFOHEADER": 40 bytes. Most compatible.
   * - "BITMAPV4HEADER": 108 bytes. Includes masks and sRGB color space.
   * - "BITMAPV5HEADER": 124 bytes. Adds ICC profiles and rendering intent.
   *
   * Default: "BITMAPINFOHEADER"
   */
  headerType?: "BITMAPINFOHEADER" | "BITMAPV4HEADER" | "BITMAPV5HEADER";

  /**
   * Row order.
   * - false - bottom-up (standard BMP)
   * - true - top-down
   *
   * Default: false
   */
  topDown?: boolean;

  /**
   * Color palette for indexed formats (1, 4, 8-bit).
   * If not provided, palette will be generated automatically.
   */
  palette?: Color[];

  /**
   * Bit masks for BI_BITFIELDS/BI_ALPHABITFIELDS compression.
   *
   * Default: RGB565 for 16-bit, BGRA8888 for 32-bit.
   */
  bitfields?: BitfieldMasks;
}
```

## Benchmarks

All benchmarks use the [BMP Suite](https://entropymine.com/jason/bmpsuite/) test images (127x64 pixels).

Microseconds per operation (µs; lower is better). **Bold** = fastest in row, `—` = not supported.

### Decode comparison

<sub>Run command: `deno run -A tests/decode/bench.ts`</sub>

| Format            | @nktkas/bmp | [@cwasm/nsbmp](https://www.npmjs.com/package/@cwasm/nsbmp) | [bmpimagejs](https://www.npmjs.com/package/bmpimagejs) | [bmp-js](https://www.npmjs.com/package/bmp-js) | [fast-bmp](https://www.npmjs.com/package/fast-bmp) | [bmp-ts](https://www.npmjs.com/package/bmp-ts) |
| ----------------- | :---------: | :--------------------------------------------------------: | :----------------------------------------------------: | :--------------------------------------------: | :------------------------------------------------: | :--------------------------------------------: |
| BI_RGB 1-bit      |   **9.3**   |                            18.7                            |                          18.9                          |                      24.9                      |                         —                          |                      27.8                      |
| BI_RGB 1-bit (gs) |   **4.7**   |                            18.6                            |                          18.6                          |                      23.5                      |                         —                          |                      26.0                      |
| BI_RGB 4-bit      |  **10.6**   |                            18.8                            |                          19.8                          |                      34.4                      |                         —                          |                       —                        |
| BI_RGB 4-bit (gs) |   **5.2**   |                            19.1                            |                          20.3                          |                      34.8                      |                         —                          |                       —                        |
| BI_RGB 8-bit      |  **11.3**   |                            18.5                            |                          21.7                          |                      46.5                      |                         —                          |                      61.8                      |
| BI_RGB 8-bit (gs) |   **6.3**   |                            18.7                            |                          21.5                          |                      46.0                      |                        19.5                        |                      43.8                      |
| BI_RGB 16-bit     |  **12.9**   |                            14.5                            |                          15.2                          |                      19.8                      |                         —                          |                     109.3                      |
| BI_RGB 24-bit     |   **6.9**   |                            12.6                            |                          13.3                          |                      21.1                      |                        32.5                        |                      52.4                      |
| BI_RGB 32-bit     |  **12.0**   |                            14.7                            |                          17.9                          |                      51.9                      |                         —                          |                     116.6                      |
| BI_RLE4           |  **12.9**   |                            13.8                            |                          17.7                          |                       —                        |                         —                          |                       —                        |
| BI_RLE8           |  **12.9**   |                            14.6                            |                          18.1                          |                       —                        |                         —                          |                       —                        |
| BI_BITFIELDS 16   |  **14.0**   |                            39.2                            |                          37.9                          |                       —                        |                         —                          |                     106.5                      |
| BI_BITFIELDS 32   |  **15.4**   |                            38.0                            |                          36.2                          |                       —                        |                        47.3                        |                     118.4                      |

> `@cwasm/nsbmp` uses WebAssembly (compiled C). The other libraries, including `@nktkas/bmp`, are pure JavaScript.

### Encode comparison

<sub>Run command: `deno run -A tests/encode/bench.ts`</sub>

| Format            | @nktkas/bmp | [fast-bmp](https://www.npmjs.com/package/fast-bmp) | [bmp-js](https://www.npmjs.com/package/bmp-js) |
| ----------------- | :---------: | :------------------------------------------------: | :--------------------------------------------: |
| BI_RGB 1-bit      |    82.9     |                         —                          |                       —                        |
| BI_RGB 1-bit (gs) |    17.1     |                         —                          |                       —                        |
| BI_RGB 4-bit      |    133.5    |                         —                          |                       —                        |
| BI_RGB 4-bit (gs) |    17.3     |                         —                          |                       —                        |
| BI_RGB 8-bit      |    163.1    |                         —                          |                       —                        |
| BI_RGB 8-bit (gs) |  **14.0**   |                        31.6                        |                       —                        |
| BI_RGB 16-bit     |    13.2     |                         —                          |                       —                        |
| BI_RGB 24-bit     |  **18.4**   |                        74.0                        |                      30.5                      |
| BI_RGB 32-bit     |    17.4     |                         —                          |                       —                        |
| BI_RLE4           |    133.9    |                         —                          |                       —                        |
| BI_RLE8           |    160.7    |                         —                          |                       —                        |
| BI_BITFIELDS 16   |    13.7     |                         —                          |                       —                        |
| BI_BITFIELDS 32   |    17.4     |                         —                          |                       —                        |
