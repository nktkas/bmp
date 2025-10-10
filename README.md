# BMP Encoder/Decoder

[![License: MIT](https://img.shields.io/badge/License-MIT-brightgreen.svg)](https://opensource.org/licenses/MIT)
[![npm](https://img.shields.io/npm/v/@nktkas/bmp)](https://www.npmjs.com/package/@nktkas/bmp)
[![JSR](https://jsr.io/badges/@nktkas/bmp)](https://jsr.io/@nktkas/bmp)

Encoding and decoding for any BMP file formats.

Works with:
<img alt="browsers" title="This package works with browsers." height="16px" src="https://jsr.io/logos/browsers.svg" />
<img alt="Deno" title="This package works with Deno." height="16px" src="https://jsr.io/logos/deno.svg" />
<img alt="Node.js" title="This package works with Node.js" height="16px" src="https://jsr.io/logos/node.svg" />
<img alt="Bun" title="This package works with Bun." height="16px" src="https://jsr.io/logos/bun.svg" />

## Usage

### Decode

`decode` function reads a BMP buffer and returns a raw pixel image data (width, height, channels, data).

Supported BMP formats:

- Header types:
  - [BITMAPCOREHEADER](https://learn.microsoft.com/en-us/windows/win32/api/wingdi/ns-wingdi-bitmapcoreheader)
  - [OS22XBITMAPHEADER](https://www.fileformat.info/format/os2bmp/egff.htm)
  - [BITMAPINFOHEADER](https://learn.microsoft.com/en-us/windows/win32/api/wingdi/ns-wingdi-bitmapinfoheader)
  - BITMAPV2INFOHEADER
  - BITMAPV3INFOHEADER
  - [BITMAPV4HEADER](https://learn.microsoft.com/en-us/windows/win32/api/wingdi/ns-wingdi-bitmapv4header)
  - [BITMAPV5HEADER](https://learn.microsoft.com/en-us/windows/win32/api/wingdi/ns-wingdi-bitmapv5header)
- [Compression methods](https://learn.microsoft.com/en-us/openspecs/windows_protocols/ms-wmf/4e588f70-bd92-4a6f-b77f-35d0feaf7a57):
  - BI_RGB
  - BI_RLE8
  - BI_RLE4
  - BI_BITFIELDS
  - BI_ALPHABITFIELDS
  - RLE24 (OS/2)
  - Huffman 1D (OS/2)
- Bit depths: 1, 2, 4, 8, 16, 24, 32, 64 bit
  - Indexed color (palette): 1, 2, 4, 8 bit
  - Direct color: 16, 24, 32, 64 bit
- Top-down and bottom-up images.

<!-- deno-fmt-ignore -->
```ts
import { decode } from "@nktkas/bmp";

// A minimal 1x1 pixel 24-bit BMP file
const file = new Uint8Array([
  // BMP File Header (14 bytes)
  0x42, 0x4D,             // Signature 'BM'
  0x3A, 0x00, 0x00, 0x00, // File size (58 bytes)
  0x00, 0x00,             // Reserved
  0x00, 0x00,             // Reserved
  0x36, 0x00, 0x00, 0x00, // Pixel data offset (54 bytes)
  // DIB Header (BITMAPINFOHEADER, 40 bytes)
  0x28, 0x00, 0x00, 0x00, // Header size (40)
  0x01, 0x00, 0x00, 0x00, // Width (1 pixel)
  0x01, 0x00, 0x00, 0x00, // Height (1 pixel)
  0x01, 0x00,             // Color planes (1)
  0x18, 0x00,             // Bits per pixel (24)
  0x00, 0x00, 0x00, 0x00, // Compression (0 = none)
  0x04, 0x00, 0x00, 0x00, // Image size (4 bytes with padding)
  0x00, 0x00, 0x00, 0x00, // X pixels per meter
  0x00, 0x00, 0x00, 0x00, // Y pixels per meter
  0x00, 0x00, 0x00, 0x00, // Colors used
  0x00, 0x00, 0x00, 0x00, // Important colors
  // Pixel data (BGR format + padding to 4 bytes)
  0x00, 0x00, 0x00,       // Black pixel (Blue, Green, Red)
  0x00                    // Padding to 4 bytes
]);

const raw = decode(bmp);
// { width: 1, height: 1, channels: 3, data: Uint8Array(3) [0, 0, 0] }
```

For compression methods BI_JPEG and BI_PNG, use `extractCompressedData` to get the embedded JPEG/PNG data. Then you can
decode it with any JPEG/PNG decoder.

<!-- deno-fmt-ignore -->
```ts
import { extractCompressedData } from "@nktkas/bmp";

// A minimal 1x1 pixel BMP file with embedded PNG data (BI_PNG compression)
const bmp = new Uint8Array([
  // BMP File Header (14 bytes)
  0x42, 0x4D,             // Signature 'BM'
  0x7B, 0x00, 0x00, 0x00, // File size (123 bytes)
  0x00, 0x00,             // Reserved
  0x00, 0x00,             // Reserved
  0x36, 0x00, 0x00, 0x00, // Pixel data offset (54 bytes)
  // DIB Header (BITMAPINFOHEADER, 40 bytes)
  0x28, 0x00, 0x00, 0x00, // Header size (40)
  0x01, 0x00, 0x00, 0x00, // Width (1 pixel)
  0x01, 0x00, 0x00, 0x00, // Height (1 pixel)
  0x01, 0x00,             // Color planes (1)
  0x00, 0x00,             // Bits per pixel (0 for BI_PNG)
  0x05, 0x00, 0x00, 0x00, // Compression (5 = BI_PNG)
  0x45, 0x00, 0x00, 0x00, // Image size (69 bytes - PNG data size)
  0x00, 0x00, 0x00, 0x00, // X pixels per meter
  0x00, 0x00, 0x00, 0x00, // Y pixels per meter
  0x00, 0x00, 0x00, 0x00, // Colors used
  0x00, 0x00, 0x00, 0x00, // Important colors
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
//                                     ^ BI_JPEG = 4, BI_PNG = 5

// Then you can decode it with any JPEG/PNG decoder
import sharp from "sharp";
const raw = await sharp(extracted.data).raw().toBuffer();
```

### Encode (TODO)

## Benchmarks

### Decode

```
# BI_RGB (127x64)
1bit x 167,800 ops/sec @ 6.0µs/op
4bit x 54,760 ops/sec @ 18.3µs/op
8bit x 68,010 ops/sec @ 14.7µs/op
16bit x 59,280 ops/sec @ 16.9µs/op
24bit x 75,390 ops/sec @ 13.3µs/op
32bit x 61,900 ops/sec @ 16.2µs/op

# BI_RLE (127x64)
4bit x 50,500 ops/sec @ 19.8µs/op
8bit x 48,730 ops/sec @ 20.5µs/op

# BI_BITFIELDS (127x64)
16bit x 54,340 ops/sec @ 18.4µs/op
32bit x 49,620 ops/sec @ 20.2µs/op
```

<details>
<summary>Complete list and comparison</summary>

<sub>Run command: [`deno bench --allow-read`](https://docs.deno.com/runtime/reference/cli/bench/)</sub>

```
    CPU | AMD Ryzen 9 9950X3D 16-Core Processor
Runtime | Deno 2.5.4 (x86_64-pc-windows-msvc)

| benchmark      | time/iter (avg) |        iter/s |      (min … max)      |      p75 |      p99 |     p995 |
| -------------- | --------------- | ------------- | --------------------- | -------- | -------- | -------- |

group BI_RGB: 1 bit
| @nktkas/bmp    |          6.0 µs |       167,800 | (  2.8 µs …   8.6 ms) |   4.8 µs |  33.2 µs |  41.7 µs |
| @cwasm/nsbmp   |         28.1 µs |        35,550 | ( 16.3 µs …   2.4 ms) |  24.1 µs | 115.4 µs | 205.8 µs |
| bmp-js         |         27.9 µs |        35,830 | ( 14.4 µs …   1.9 ms) |  26.4 µs | 136.1 µs | 238.8 µs |
| bmpimagejs     |         28.6 µs |        35,000 | ( 16.1 µs …   1.8 ms) |  24.6 µs | 121.5 µs | 226.7 µs |

summary
  @nktkas/bmp
     4.68x faster than bmp-js
     4.72x faster than @cwasm/nsbmp
     4.79x faster than bmpimagejs

group BI_RGB: 4 bit
| @nktkas/bmp    |         18.3 µs |        54,760 | (  8.9 µs …   2.1 ms) |  15.1 µs |  93.9 µs | 169.1 µs |
| @cwasm/nsbmp   |         27.3 µs |        36,660 | ( 16.2 µs … 961.2 µs) |  23.8 µs | 118.7 µs | 221.9 µs |
| bmp-js         |         38.2 µs |        26,160 | ( 27.5 µs …   4.9 ms) |  35.6 µs | 114.0 µs | 185.1 µs |
| bmpimagejs     |         27.1 µs |        36,910 | ( 16.8 µs …   5.3 ms) |  25.0 µs |  73.8 µs | 149.0 µs |

summary
  @nktkas/bmp
     1.48x faster than bmpimagejs
     1.49x faster than @cwasm/nsbmp
     2.09x faster than bmp-js

group BI_RGB: 8 bit
| @nktkas/bmp    |         14.7 µs |        68,010 | ( 11.0 µs …   1.7 ms) |  16.4 µs |  32.8 µs |  66.0 µs |
| @cwasm/nsbmp   |         27.4 µs |        36,450 | ( 15.4 µs …   6.0 ms) |  23.5 µs |  77.3 µs | 153.4 µs |
| fast-bmp       |         20.1 µs |        49,650 | ( 14.2 µs …   1.9 ms) |  19.1 µs |  54.4 µs |  69.4 µs |
| bmp-js         |         48.9 µs |        20,430 | ( 39.0 µs …   5.7 ms) |  48.6 µs | 119.0 µs | 157.7 µs |
| bmpimagejs     |         26.5 µs |        37,780 | ( 18.5 µs …   6.1 ms) |  26.3 µs |  69.3 µs | 101.7 µs |

summary
  @nktkas/bmp
     1.37x faster than fast-bmp
     1.80x faster than bmpimagejs
     1.87x faster than @cwasm/nsbmp
     3.33x faster than bmp-js

group BI_RGB: 16 bit
| @nktkas/bmp    |         16.9 µs |        59,280 | ( 11.2 µs …   5.0 ms) |  17.0 µs |  56.9 µs |  94.4 µs |
| @cwasm/nsbmp   |         16.4 µs |        61,120 | ( 11.0 µs …   5.9 ms) |  18.1 µs |  35.3 µs |  59.6 µs |
| bmp-ts         |        125.3 µs |         7,978 | (101.6 µs …   4.6 ms) | 124.7 µs | 236.6 µs | 279.9 µs |
| bmp-js         |         50.4 µs |        19,840 | ( 36.0 µs …   5.0 ms) |  48.7 µs | 131.1 µs | 172.9 µs |
| bmpimagejs     |         21.5 µs |        46,430 | ( 13.0 µs …   5.0 ms) |  20.8 µs |  67.7 µs | 104.0 µs |

summary
  @cwasm/nsbmp
     1.03x faster than @nktkas/bmp
     1.32x faster than bmpimagejs
     3.08x faster than bmp-js
     7.66x faster than bmp-ts

group BI_RGB: 24 bit
| @nktkas/bmp    |         13.3 µs |        75,390 | (  8.6 µs …   4.3 ms) |  14.4 µs |  42.4 µs |  94.6 µs |
| @cwasm/nsbmp   |         13.9 µs |        71,910 | (  8.8 µs …   5.2 ms) |  16.0 µs |  39.1 µs |  58.3 µs |
| fast-bmp       |         34.0 µs |        29,380 | ( 27.7 µs …   4.3 ms) |  34.6 µs |  87.3 µs | 115.4 µs |
| bmp-js         |         25.6 µs |        39,000 | ( 16.0 µs …   5.3 ms) |  29.3 µs | 103.8 µs | 148.5 µs |
| bmpimagejs     |         15.4 µs |        64,850 | ( 10.4 µs …   5.0 ms) |  17.7 µs |  46.1 µs |  87.1 µs |

summary
  @nktkas/bmp
     1.05x faster than @cwasm/nsbmp
     1.16x faster than bmpimagejs
     1.93x faster than bmp-js
     2.57x faster than fast-bmp

group BI_RGB: 32 bit
| @nktkas/bmp    |         16.2 µs |        61,900 | ( 10.6 µs …   4.7 ms) |  16.6 µs |  46.4 µs |  86.3 µs |
| @cwasm/nsbmp   |         17.1 µs |        58,470 | ( 11.3 µs …   5.1 ms) |  18.6 µs |  48.1 µs |  72.0 µs |
| bmp-ts         |        101.9 µs |         9,811 | ( 78.6 µs …   5.7 ms) | 104.3 µs | 205.5 µs | 276.5 µs |
| bmp-js         |         78.8 µs |        12,680 | ( 60.9 µs …   5.7 ms) |  76.7 µs | 184.8 µs | 231.1 µs |
| bmpimagejs     |         19.0 µs |        52,540 | ( 12.4 µs …   6.3 ms) |  19.8 µs |  51.7 µs |  76.7 µs |

summary
  @nktkas/bmp
     1.06x faster than @cwasm/nsbmp
     1.18x faster than bmpimagejs
     4.88x faster than bmp-js
     6.31x faster than bmp-ts

group BI_RLE: 4 bit
| @nktkas/bmp    |         19.8 µs |        50,500 | ( 14.3 µs …   5.0 ms) |  21.0 µs |  63.2 µs |  93.3 µs |
| @cwasm/nsbmp   |         15.6 µs |        64,010 | (  9.6 µs …   6.4 ms) |  17.7 µs |  37.3 µs |  71.3 µs |
| bmp-js         |         59.3 µs |        16,870 | ( 50.3 µs …   6.7 ms) |  58.9 µs | 120.8 µs | 171.5 µs |
| bmpimagejs     |         20.2 µs |        49,530 | ( 14.2 µs …   5.7 ms) |  21.7 µs |  45.2 µs |  72.2 µs |

summary
  @cwasm/nsbmp
     1.27x faster than @nktkas/bmp
     1.29x faster than bmpimagejs
     3.79x faster than bmp-js

group BI_RLE: 8 bit
| @nktkas/bmp    |         20.5 µs |        48,730 | ( 15.7 µs …   5.4 ms) |  22.0 µs |  47.9 µs |  58.5 µs |
| @cwasm/nsbmp   |         16.4 µs |        61,130 | ( 10.8 µs …   6.5 ms) |  17.8 µs |  47.4 µs |  74.3 µs |
| bmp-js         |         55.4 µs |        18,060 | ( 47.2 µs …   5.8 ms) |  55.9 µs | 119.0 µs | 150.8 µs |
| bmpimagejs     |         20.8 µs |        48,140 | ( 14.2 µs …   4.7 ms) |  21.8 µs |  62.8 µs | 101.5 µs |

summary
  @cwasm/nsbmp
     1.25x faster than @nktkas/bmp
     1.27x faster than bmpimagejs
     3.38x faster than bmp-js

group BI_BITFIELDS: 16 bit
| @nktkas/bmp    |         18.4 µs |        54,340 | ( 13.9 µs …   4.8 ms) |  19.7 µs |  49.0 µs |  88.9 µs |
| @cwasm/nsbmp   |         37.5 µs |        26,660 | ( 32.1 µs …   5.3 ms) |  39.5 µs |  74.6 µs | 101.9 µs |
| bmp-ts         |        127.2 µs |         7,864 | (110.0 µs …   4.8 ms) | 125.6 µs | 236.5 µs | 277.3 µs |
| bmpimagejs     |         40.5 µs |        24,670 | ( 31.0 µs …   5.1 ms) |  40.3 µs |  90.7 µs | 123.4 µs |

summary
  @nktkas/bmp
     2.04x faster than @cwasm/nsbmp
     2.20x faster than bmpimagejs
     6.91x faster than bmp-ts

group BI_BITFIELDS: 32 bit
| @nktkas/bmp    |         20.2 µs |        49,620 | ( 15.0 µs …   5.3 ms) |  20.8 µs |  57.7 µs | 100.4 µs |
| @cwasm/nsbmp   |         38.3 µs |        26,090 | ( 30.7 µs …   6.0 ms) |  38.5 µs |  83.4 µs | 111.9 µs |
| bmp-ts         |         92.3 µs |        10,830 | ( 78.7 µs …   6.0 ms) |  93.6 µs | 196.3 µs | 242.4 µs |
| bmpimagejs     |         38.9 µs |        25,720 | ( 30.7 µs …   5.6 ms) |  40.0 µs |  75.6 µs |  98.3 µs |

summary
  @nktkas/bmp
     1.90x faster than @cwasm/nsbmp
     1.93x faster than bmpimagejs
     4.58x faster than bmp-ts
```

</details>
