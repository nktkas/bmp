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
   * Bit depth to encode at.
   *
   * @default Follows `raw.channels`: 8 for grayscale, 24 for RGB, 32 for RGBA.
   */
  bitsPerPixel?: 1 | 4 | 8 | 16 | 24 | 32;

  /**
   * Compression method:
   * - `0`: BI_RGB, uncompressed.
   * - `1`: BI_RLE8, run-length encoded, 8bpp only.
   * - `2`: BI_RLE4, run-length encoded, 4bpp only.
   * - `3`: BI_BITFIELDS, channel masks, 16 or 32bpp.
   * - `6`: BI_ALPHABITFIELDS, channel masks with alpha, 32bpp only.
   *
   * @default 0
   */
  compression?: 0 | 1 | 2 | 3 | 6;

  /**
   * DIB header format to write:
   * - `BITMAPINFOHEADER` — 40 bytes, most compatible.
   * - `BITMAPV4HEADER` — 108 bytes, includes masks and sRGB color space.
   * - `BITMAPV5HEADER` — 124 bytes, adds ICC profile and rendering intent.
   *
   * @default "BITMAPINFOHEADER"
   */
  headerType?: HeaderType;

  /**
   * Store rows top-down instead of bottom-up.
   *
   * @default false
   */
  isTopDown?: boolean;

  /**
   * Palette for the indexed depths (1, 4, 8), holding at least as many colors as the depth addresses;
   * anything past that count is dropped. Omitting it quantizes the image down to a palette of its own.
   */
  palette?: Color[];

  /**
   * Channel masks for the two bitfield compressions.
   *
   * @default RGB565 at 16bpp, BGRA8888 at 32bpp.
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

### Errors

Every failure is a `BmpError` with a `code`. An error raised outside the package is wrapped in one of these, with the
original in `cause`.

```ts
import { BmpError, decode, extractCompressedData } from "@nktkas/bmp";

const file = await Deno.readFile("image.bmp");

try {
  const raw = decode(file);
} catch (error) {
  if (!(error instanceof BmpError)) throw error;
  if (error.code !== "EMBEDDED_IMAGE") throw error;

  const { data, compression } = extractCompressedData(file);
}
```

| Code                      |     Thrown by     | Meaning                                                                         |
| ------------------------- | :---------------: | ------------------------------------------------------------------------------- |
| `INVALID_SIGNATURE`       |     `decode`      | The bytes do not begin with a BMP file header.                                  |
| `UNSUPPORTED_HEADER`      |     `decode`      | The DIB header size matches no BMP header version this package reads.           |
| `UNSUPPORTED_DEPTH`       |     `decode`      | The BMP format defines no pixel layout for this depth under this compression.   |
| `UNSUPPORTED_COMPRESSION` |     `decode`      | The compression method is one this package does not implement.                  |
| `EMBEDDED_IMAGE`          |     `decode`      | The pixel data is a complete JPEG or PNG; `extractCompressedData` returns it.   |
| `MALFORMED_FILE`          |     `decode`      | The file is shorter than its header declares; `cause` holds the original error. |
| `INVALID_DATA_SIZE`       |     `encode`      | The pixel buffer length is not width × height × channels.                       |
| `INCOMPATIBLE_OPTIONS`    |     `encode`      | The given depth, compression, row order and palette do not fit together.        |
| `INVALID_DIMENSIONS`      | `decode`,`encode` | The dimensions are not positive, or too large to allocate a buffer for.         |

## Benchmarks

All benchmarks run on procedurally generated 1024×1024 images.

Milliseconds per operation (lower is better). **Bold** = fastest in row, `—` = unsupported.

### Decode comparison

<sub>Run command: `deno bench --allow-read bench/decode.bench.ts`</sub>

| Format            | @nktkas/bmp | [@cwasm/nsbmp](https://www.npmjs.com/package/@cwasm/nsbmp) (WASM) | [bmpimagejs](https://www.npmjs.com/package/bmpimagejs) | [bmp-js](https://www.npmjs.com/package/bmp-js) | [fast-bmp](https://www.npmjs.com/package/fast-bmp) | [bmp-ts](https://www.npmjs.com/package/bmp-ts) |
| ----------------- | :---------: | :---------------------------------------------------------------: | :----------------------------------------------------: | :--------------------------------------------: | :------------------------------------------------: | :--------------------------------------------: |
| BI_RGB 1-bit      |   **1.4**   |                                2.4                                |                          2.7                           |                      2.8                       |                         —                          |                      3.5                       |
| BI_RGB 1-bit (gs) |  **0.74**   |                                2.5                                |                          2.7                           |                      2.8                       |                         —                          |                      3.5                       |
| BI_RGB 4-bit      |   **1.3**   |                                2.2                                |                          2.7                           |                      4.1                       |                         —                          |                      4.2                       |
| BI_RGB 4-bit (gs) |  **0.47**   |                                1.9                                |                          2.3                           |                      3.8                       |                         —                          |                      4.2                       |
| BI_RGB 8-bit      |   **1.1**   |                                1.7                                |                          2.5                           |                      4.4                       |                         —                          |                      6.2                       |
| BI_RGB 8-bit (gs) |  **0.56**   |                                1.7                                |                          2.6                           |                      4.4                       |                        2.3                         |                      6.3                       |
| BI_RGB 16-bit     |     1.6     |                              **1.5**                              |                           —                            |                      2.2                       |                         —                          |                      12.0                      |
| BI_RGB 24-bit     |   **1.1**   |                                1.4                                |                          2.2                           |                      2.4                       |                        4.4                         |                      6.0                       |
| BI_RGB 32-bit     |   **1.0**   |                                1.6                                |                          1.4                           |                      5.8                       |                         —                          |                      12.9                      |
| BI_RLE4           |  **0.81**   |                               0.85                                |                          0.99                          |                       —                        |                         —                          |                       —                        |
| BI_RLE8           |  **0.70**   |                               0.72                                |                          0.91                          |                       —                        |                         —                          |                       —                        |
| BI_RLE8 (gs)      |  **0.22**   |                                1.2                                |                          1.2                           |                       —                        |                         —                          |                       —                        |
| BI_BITFIELDS 16   |   **1.5**   |                                4.6                                |                           —                            |                       —                        |                         —                          |                      12.1                      |
| BI_BITFIELDS 32   |   **1.9**   |                                4.3                                |                          4.0                           |                       —                        |                         —                          |                       —                        |

### Encode comparison

<sub>Run command: `deno bench bench/encode.bench.ts`</sub>

| Format            | @nktkas/bmp | [fast-bmp](https://www.npmjs.com/package/fast-bmp) | [bmp-js](https://www.npmjs.com/package/bmp-js) |
| ----------------- | :---------: | :------------------------------------------------: | :--------------------------------------------: |
| BI_RGB 1-bit      |    12.2     |                         —                          |                       —                        |
| BI_RGB 1-bit (gs) |    0.74     |                         —                          |                       —                        |
| BI_RGB 4-bit      |     9.6     |                         —                          |                       —                        |
| BI_RGB 4-bit (gs) |    0.89     |                         —                          |                       —                        |
| BI_RGB 8-bit      |    38.4     |                         —                          |                       —                        |
| BI_RGB 8-bit (gs) |  **0.08**   |                        3.4                         |                       —                        |
| BI_RGB 16-bit     |     1.3     |                         —                          |                       —                        |
| BI_RGB 24-bit     |   **1.3**   |                        8.2                         |                      1.4                       |
| BI_RGB 32-bit     |     1.3     |                         —                          |                       —                        |
| BI_RLE4           |     9.6     |                         —                          |                       —                        |
| BI_RLE8           |    11.7     |                         —                          |                       —                        |
| BI_RLE8 (gs)      |     2.2     |                         —                          |                       —                        |
| BI_BITFIELDS 16   |     1.8     |                         —                          |                       —                        |
| BI_BITFIELDS 32   |     4.0     |                         —                          |                       —                        |

## License

**@nktkas/bmp** is licensed under the [MIT License](LICENSE).

Copyright © 2025-present [nktkas](https://github.com/nktkas).
