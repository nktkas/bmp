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

`decode` function reads a BMP buffer and returns a raw RGB(A) data and metadata (width, height, channels).

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
- Color depths: 16, 24, 32, 64 bit.
- Color palettes: 1, 2, 4, 8 bit.
- Top-down and bottom-up images.

Unsupported BMP formats:

- ICC profile is ignored.
- BI_JPEG and BI_PNG compression are not supported. Use `extractCompressedData` to get the embedded JPEG/PNG data.
- Huffman 1D (OS/2) and RLE24 (OS/2) compressions are not supported.

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
1bit x 40,910 ops/sec @ 24.4µs/op
4bit x 46,330 ops/sec @ 21.6µs/op
8bit x 62,600 ops/sec @ 16.0µs/op
16bit x 57,870 ops/sec @ 17.3µs/op
24bit x 63,400 ops/sec @ 15.8µs/op
32bit x 59,180 ops/sec @ 16.9µs/op

# BI_RLE (127x64)
4bit x 44,710 ops/sec @ 22.4µs/op
8bit x 37,770 ops/sec @ 26.5µs/op

# BI_BITFIELDS (127x64) 
16bit x 51,030 ops/sec @ 19.6µs/op
32bit x 47,760 ops/sec @ 20.9µs/op
```

<details>
<summary>Complete list and comparison</summary>

<sub>Run command: [`deno bench --allow-read`](https://docs.deno.com/runtime/reference/cli/bench/)</sub>

```
    CPU | AMD Ryzen 9 9950X3D 16-Core Processor
Runtime | Deno 2.5.2 (x86_64-pc-windows-msvc)

| benchmark      | time/iter (avg) |        iter/s |      (min … max)      |      p75 |      p99 |     p995 |
| -------------- | --------------- | ------------- | --------------------- | -------- | -------- | -------- |

group BI_RGB: 1 bit
| @nktkas/bmp    |         24.4 µs |        40,910 | ( 11.1 µs …   3.2 ms) |  24.1 µs | 107.9 µs | 143.3 µs |
| @cwasm/nsbmp   |         29.8 µs |        33,610 | ( 16.6 µs …   2.4 ms) |  25.6 µs | 118.8 µs | 214.8 µs |
| fast-bmp       |         12.3 µs |        81,450 | (  7.3 µs …  10.8 ms) |  10.5 µs |  41.9 µs |  52.8 µs |
| bmp-ts         |         37.2 µs |        26,910 | ( 18.4 µs …   2.6 ms) |  33.4 µs | 141.4 µs | 276.0 µs |
| bmp-js         |         34.1 µs |        29,350 | ( 15.0 µs …   5.1 ms) |  32.9 µs | 111.0 µs | 197.8 µs |
| bmpimagejs     |         29.7 µs |        33,670 | ( 16.7 µs …   7.4 ms) |  26.4 µs |  69.8 µs | 143.2 µs |

summary
  fast-bmp
     1.99x faster than @nktkas/bmp
     2.42x faster than bmpimagejs
     2.42x faster than @cwasm/nsbmp
     2.77x faster than bmp-js
     3.03x faster than bmp-ts

group BI_RGB: 4 bit
| @nktkas/bmp    |         21.6 µs |        46,330 | ( 11.3 µs …   4.0 ms) |  20.4 µs |  62.0 µs | 107.0 µs |
| @cwasm/nsbmp   |         26.6 µs |        37,650 | ( 16.1 µs …   5.2 ms) |  24.3 µs |  54.9 µs |  98.7 µs |
| bmp-ts         |          8.1 µs |       123,400 | (  1.8 µs …   6.0 ms) |   9.4 µs |  57.0 µs |  73.7 µs |
| bmp-js         |         40.5 µs |        24,720 | ( 27.2 µs …   5.9 ms) |  41.8 µs |  89.0 µs | 123.0 µs |
| bmpimagejs     |         23.7 µs |        42,240 | ( 17.3 µs …   5.9 ms) |  25.1 µs |  50.6 µs |  64.6 µs |

summary
  bmp-ts
     2.66x faster than @nktkas/bmp
     2.92x faster than bmpimagejs
     3.28x faster than @cwasm/nsbmp
     4.99x faster than bmp-js

group BI_RGB: 8 bit
| @nktkas/bmp    |         16.0 µs |        62,600 | ( 11.1 µs …   6.4 ms) |  15.3 µs |  31.0 µs |  35.9 µs |
| @cwasm/nsbmp   |         21.7 µs |        46,160 | ( 15.6 µs …   5.9 ms) |  23.3 µs |  41.4 µs |  66.0 µs |
| fast-bmp       |         21.2 µs |        47,180 | ( 14.4 µs …   2.4 ms) |  21.5 µs |  49.3 µs |  57.2 µs |
| bmp-ts         |         58.1 µs |        17,200 | ( 36.2 µs …   8.4 ms) |  63.2 µs | 128.1 µs | 159.1 µs |
| bmp-js         |         54.4 µs |        18,390 | ( 39.7 µs …   5.4 ms) |  56.2 µs | 104.4 µs | 142.1 µs |
| bmpimagejs     |         26.6 µs |        37,650 | ( 19.0 µs …   5.7 ms) |  28.2 µs |  55.2 µs |  75.7 µs |

summary
  @nktkas/bmp
     1.33x faster than fast-bmp
     1.36x faster than @cwasm/nsbmp
     1.66x faster than bmpimagejs
     3.40x faster than bmp-js
     3.64x faster than bmp-ts

group BI_RGB: 16 bit
| @nktkas/bmp    |         17.3 µs |        57,870 | ( 11.3 µs …   4.7 ms) |  19.3 µs |  37.8 µs |  88.9 µs |
| @cwasm/nsbmp   |         17.2 µs |        58,040 | ( 11.0 µs …   5.7 ms) |  18.6 µs |  40.6 µs |  58.6 µs |
| bmp-ts         |        135.6 µs |         7,375 | ( 99.4 µs …   4.9 ms) | 134.6 µs | 252.6 µs | 356.7 µs |
| bmp-js         |         52.0 µs |        19,250 | ( 36.5 µs …   5.3 ms) |  53.5 µs | 120.0 µs | 158.0 µs |
| bmpimagejs     |         22.3 µs |        44,940 | ( 13.2 µs …   6.6 ms) |  24.1 µs |  50.2 µs |  81.6 µs |

summary
  @cwasm/nsbmp
     1.00x faster than @nktkas/bmp
     1.29x faster than bmpimagejs
     3.02x faster than bmp-js
     7.87x faster than bmp-ts

group BI_RGB: 24 bit
| @nktkas/bmp    |         15.8 µs |        63,400 | (  8.2 µs …   5.2 ms) |  17.6 µs |  39.5 µs |  70.2 µs |
| @cwasm/nsbmp   |         18.1 µs |        55,390 | (  8.9 µs …   5.9 ms) |  19.9 µs |  46.6 µs |  74.3 µs |
| fast-bmp       |         39.4 µs |        25,410 | ( 27.2 µs …   5.6 ms) |  39.4 µs |  76.9 µs | 109.4 µs |
| bmp-ts         |        100.3 µs |         9,969 | ( 68.8 µs …   6.4 ms) | 101.3 µs | 205.7 µs | 262.7 µs |
| bmp-js         |         63.3 µs |        15,800 | ( 41.8 µs …   6.3 ms) |  66.8 µs | 130.0 µs | 171.0 µs |
| bmpimagejs     |         19.1 µs |        52,300 | ( 11.6 µs …   6.9 ms) |  21.5 µs |  40.2 µs |  57.7 µs |

summary
  @nktkas/bmp
     1.15x faster than @cwasm/nsbmp
     1.21x faster than bmpimagejs
     2.50x faster than fast-bmp
     4.01x faster than bmp-js
     6.36x faster than bmp-ts

group BI_RGB: 32 bit
| @nktkas/bmp    |         16.9 µs |        59,180 | ( 10.5 µs …   2.5 ms) |  18.5 µs |  36.2 µs |  59.4 µs |
| @cwasm/nsbmp   |         19.3 µs |        51,900 | ( 11.3 µs …   6.3 ms) |  21.5 µs |  53.1 µs | 108.2 µs |
| bmp-ts         |        113.1 µs |         8,843 | ( 79.4 µs …   7.5 ms) | 115.9 µs | 220.3 µs | 257.3 µs |
| bmp-js         |         89.6 µs |        11,160 | ( 61.6 µs …   7.0 ms) |  91.3 µs | 193.4 µs | 230.0 µs |
| bmpimagejs     |         19.2 µs |        52,110 | ( 12.8 µs …   5.1 ms) |  17.0 µs |  40.1 µs |  45.8 µs |

summary
  @nktkas/bmp
     1.14x faster than bmpimagejs
     1.14x faster than @cwasm/nsbmp
     5.30x faster than bmp-js
     6.69x faster than bmp-ts

group BI_RLE: 4 bit
| @nktkas/bmp    |         22.4 µs |        44,710 | ( 14.3 µs …   6.6 ms) |  22.6 µs |  50.2 µs |  68.5 µs |
| @cwasm/nsbmp   |         17.2 µs |        58,130 | (  9.9 µs …   7.2 ms) |  19.4 µs |  34.9 µs |  58.7 µs |
| bmp-ts         |         49.2 µs |        20,310 | ( 36.8 µs …   6.5 ms) |  47.9 µs |  93.3 µs | 130.0 µs |
| bmp-js         |         62.8 µs |        15,920 | ( 50.4 µs …   2.0 ms) |  60.5 µs | 119.7 µs | 145.8 µs |
| bmpimagejs     |         22.9 µs |        43,670 | ( 14.3 µs …   6.8 ms) |  24.2 µs |  46.4 µs |  69.9 µs |

summary
  @cwasm/nsbmp
     1.30x faster than @nktkas/bmp
     1.33x faster than bmpimagejs
     2.86x faster than bmp-ts
     3.65x faster than bmp-js

group BI_RLE: 8 bit
| @nktkas/bmp    |         26.5 µs |        37,770 | ( 17.6 µs …   6.2 ms) |  26.3 µs |  64.2 µs |  90.2 µs |
| @cwasm/nsbmp   |         18.3 µs |        54,770 | ( 11.0 µs …   7.7 ms) |  18.7 µs |  40.3 µs |  67.9 µs |
| bmp-ts         |         62.6 µs |        15,970 | ( 45.9 µs …   6.1 ms) |  64.0 µs | 127.0 µs | 162.4 µs |
| bmp-js         |         63.3 µs |        15,790 | ( 47.6 µs …   7.7 ms) |  60.5 µs | 123.7 µs | 159.0 µs |
| bmpimagejs     |         22.0 µs |        45,390 | ( 14.3 µs …   6.2 ms) |  23.9 µs |  44.8 µs |  59.0 µs |

summary
  @cwasm/nsbmp
     1.21x faster than bmpimagejs
     1.45x faster than @nktkas/bmp
     3.43x faster than bmp-ts
     3.47x faster than bmp-js

group BI_BITFIELDS: 16 bit
| @nktkas/bmp    |         19.6 µs |        51,030 | ( 14.1 µs …   4.4 ms) |  18.2 µs |  43.8 µs |  83.9 µs |
| @cwasm/nsbmp   |         44.0 µs |        22,730 | ( 32.4 µs …   7.9 ms) |  46.7 µs |  83.0 µs |  93.4 µs |
| bmp-ts         |        131.9 µs |         7,582 | (101.1 µs …   7.8 ms) | 132.0 µs | 242.6 µs | 292.3 µs |
| bmpimagejs     |         42.3 µs |        23,630 | ( 31.7 µs …   6.4 ms) |  40.2 µs |  88.2 µs |  99.8 µs |

summary
  @nktkas/bmp
     2.16x faster than bmpimagejs
     2.25x faster than @cwasm/nsbmp
     6.73x faster than bmp-ts

group BI_BITFIELDS: 32 bit
| @nktkas/bmp    |         20.9 µs |        47,760 | ( 15.2 µs …   2.8 ms) |  19.1 µs |  43.3 µs |  78.1 µs |
| @cwasm/nsbmp   |         44.4 µs |        22,520 | ( 31.1 µs …   6.1 ms) |  45.5 µs |  79.0 µs |  90.2 µs |
| fast-bmp       |         50.4 µs |        19,840 | ( 36.9 µs …   6.1 ms) |  49.8 µs |  97.5 µs | 129.1 µs |
| bmp-ts         |        104.6 µs |         9,558 | ( 79.6 µs …   5.9 ms) | 103.0 µs | 185.3 µs | 226.3 µs |
| bmpimagejs     |         42.2 µs |        23,670 | ( 31.2 µs …   6.6 ms) |  40.8 µs |  86.7 µs |  95.7 µs |

summary
  @nktkas/bmp
     2.02x faster than bmpimagejs
     2.12x faster than @cwasm/nsbmp
     2.41x faster than fast-bmp
     5.00x faster than bmp-ts
```

</details>
