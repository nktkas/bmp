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

```ts
import { decode } from "@nktkas/bmp";

const file = new Uint8Array([/* ... BMP file bytes ... */]);
const raw = decode(file);
// { width: 1, height: 1, channels: 3, data: Uint8Array(3) [0, 0, 0] }
//                                  ^
//                                  may be 1 (grayscale), 3 (RGB), or 4 (RGBA)
```

#### BI_JPEG / BI_PNG compressed images

BMP files can embed JPEG or PNG data as pixel payload. Use `extractCompressedData` to get the embedded data, then decode
it with any JPEG/PNG library.

```ts
import { extractCompressedData } from "@nktkas/bmp";

const bmp = new Uint8Array([/* ... BMP file bytes with BI_PNG compression ... */]);
const extracted = extractCompressedData(bmp);
// { width: 1, height: 1, compression: 5, data: Uint8Array(69) [...] }
//                                     ^
//                                     4 = BI_JPEG, 5 = BI_PNG

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
//    ^^^
//    Uint8Array([...]) containing the BMP file bytes
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
  isTopDown?: boolean;

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

// Encode to 8-bit indexed BMP with auto-generated 256-color palette
const bmp = encode(raw, { bitsPerPixel: 8 });
//    ^^^
//    Uint8Array([...]) containing the BMP file bytes
```

## Benchmarks

All benchmarks run on procedurally generated 1024×1024 images.

Milliseconds per operation (lower is better). **Bold** = fastest in row, `—` = unsupported.

### Decode comparison

<sub>Run command: `deno bench --allow-read bench/decode.bench.ts`</sub>

| Format            | @nktkas/bmp | [@cwasm/nsbmp](https://www.npmjs.com/package/@cwasm/nsbmp) (WASM) | [bmpimagejs](https://www.npmjs.com/package/bmpimagejs) | [bmp-js](https://www.npmjs.com/package/bmp-js) | [fast-bmp](https://www.npmjs.com/package/fast-bmp) | [bmp-ts](https://www.npmjs.com/package/bmp-ts) |
| ----------------- | :---------: | :---------------------------------------------------------------: | :----------------------------------------------------: | :--------------------------------------------: | :------------------------------------------------: | :--------------------------------------------: |
| BI_RGB 1-bit      |  **0.99**   |                                2.3                                |                          2.6                           |                      2.8                       |                         —                          |                      3.1                       |
| BI_RGB 1-bit (gs) |  **0.72**   |                                2.2                                |                          2.6                           |                      2.9                       |                         —                          |                      3.4                       |
| BI_RGB 4-bit      |   **1.2**   |                                2.1                                |                          2.4                           |                      3.8                       |                         —                          |                      4.4                       |
| BI_RGB 4-bit (gs) |  **0.50**   |                                2.0                                |                          2.7                           |                      4.1                       |                         —                          |                      4.3                       |
| BI_RGB 8-bit      |   **1.3**   |                                1.7                                |                          2.8                           |                      4.7                       |                         —                          |                      6.2                       |
| BI_RGB 8-bit (gs) |  **0.55**   |                                1.6                                |                          2.5                           |                      4.3                       |                        2.2                         |                      6.2                       |
| BI_RGB 16-bit     |   **1.5**   |                              **1.5**                              |                           —                            |                      2.0                       |                         —                          |                      12.1                      |
| BI_RGB 24-bit     |  **0.83**   |                                1.2                                |                          2.1                           |                      5.1                       |                        4.2                         |                      5.8                       |
| BI_RGB 32-bit     |  **0.87**   |                                1.5                                |                          1.3                           |                      6.0                       |                         —                          |                      12.8                      |
| BI_RLE4           |    0.90     |                             **0.71**                              |                          0.87                          |                       —                        |                         —                          |                       —                        |
| BI_RLE8           |    0.81     |                             **0.60**                              |                          0.77                          |                       —                        |                         —                          |                       —                        |
| BI_BITFIELDS 16   |   **1.5**   |                                4.4                                |                           —                            |                       —                        |                         —                          |                      12.0                      |
| BI_BITFIELDS 32   |   **1.8**   |                                4.1                                |                          4.0                           |                       —                        |                         —                          |                       —                        |

### Encode comparison

<sub>Run command: `deno bench bench/encode.bench.ts`</sub>

| Format            | @nktkas/bmp | [fast-bmp](https://www.npmjs.com/package/fast-bmp) | [bmp-js](https://www.npmjs.com/package/bmp-js) |
| ----------------- | :---------: | :------------------------------------------------: | :--------------------------------------------: |
| BI_RGB 1-bit      |    11.9     |                         —                          |                       —                        |
| BI_RGB 1-bit (gs) |     2.7     |                         —                          |                       —                        |
| BI_RGB 4-bit      |    28.6     |                         —                          |                       —                        |
| BI_RGB 4-bit (gs) |     7.1     |                         —                          |                       —                        |
| BI_RGB 8-bit      |    264.1    |                         —                          |                       —                        |
| BI_RGB 8-bit (gs) |  **0.50**   |                        3.3                         |                       —                        |
| BI_RGB 16-bit     |     1.2     |                         —                          |                       —                        |
| BI_RGB 24-bit     |   **1.3**   |                        8.2                         |                      1.4                       |
| BI_RGB 32-bit     |     1.4     |                         —                          |                       —                        |
| BI_RLE4           |    26.3     |                         —                          |                       —                        |
| BI_RLE8           |    15.5     |                         —                          |                       —                        |
| BI_BITFIELDS 16   |     1.8     |                         —                          |                       —                        |
| BI_BITFIELDS 32   |     4.3     |                         —                          |                       —                        |

## License

**@nktkas/bmp** is licensed under the [MIT License](LICENSE).

Copyright © 2025-present [nktkas](https://github.com/nktkas).
