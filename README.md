# BMP Encoder/Decoder

[![License: MIT](https://img.shields.io/badge/License-MIT-brightgreen.svg)](https://opensource.org/licenses/MIT)
[![npm](https://img.shields.io/npm/v/@nktkas/bmp)](https://www.npmjs.com/package/@nktkas/bmp)
[![JSR](https://jsr.io/badges/@nktkas/bmp)](https://jsr.io/@nktkas/bmp)

Fast and lightweight BMP image encoder/decoder.

Works with:
<img alt="browsers" title="This package works with browsers." height="16px" src="https://jsr.io/logos/browsers.svg" />
<img alt="Deno" title="This package works with Deno." height="16px" src="https://jsr.io/logos/deno.svg" />
<img alt="Node.js" title="This package works with Node.js" height="16px" src="https://jsr.io/logos/node.svg" />
<img alt="Bun" title="This package works with Bun." height="16px" src="https://jsr.io/logos/bun.svg" />

## Usage

### Decode

Supported BMP formats:

- Any header types (BITMAPINFOHEADER, BITMAPV4HEADER, BITMAPV5HEADER, etc.)
- Any compression methods (BI_RGB, BI_RLE8, BI_RLE4, BI_BITFIELDS, etc.)
- Any bits per pixel (1, 4, 8, 16, 24, 32)
- Top-down and bottom-up images

<sub>Full list of supported BMP formats [here](https://entropymine.com/jason/bmpsuite/bmpsuite/html/bmpsuite.html)</sub>

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

Excluding compressed BMP images with embedded JPEG/PNG data (BI_JPEG/BI_PNG compression). For those, you can extract the
compressed data and decode it with any external JPEG/PNG decoder.

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

<details>
<summary>Complete list and comparison</summary>

<sub>Run command: [`deno bench --allow-read`](https://docs.deno.com/runtime/reference/cli/bench/)</sub>

```
    CPU | AMD Ryzen 9 9950X3D 16-Core Processor
Runtime | Deno 2.5.4 (x86_64-pc-windows-msvc)

| benchmark      | time/iter (avg) |        iter/s |      (min … max)      |      p75 |      p99 |     p995 |
| -------------- | --------------- | ------------- | --------------------- | -------- | -------- | -------- |

group BI_RGB: 1 bit
| @nktkas/bmp    |         15.5 µs |        64,590 | (  6.3 µs …   3.5 ms) |  12.5 µs |  95.4 µs | 124.8 µs |
| @cwasm/nsbmp   |         28.3 µs |        35,350 | ( 16.7 µs …   2.2 ms) |  24.4 µs | 112.5 µs | 191.3 µs |
| bmp-js         |         25.2 µs |        39,720 | ( 14.0 µs …   4.6 ms) |  25.4 µs |  89.9 µs | 149.7 µs |
| bmpimagejs     |         25.0 µs |        39,990 | ( 13.6 µs …   4.7 ms) |  24.9 µs |  62.0 µs | 108.2 µs |

summary
  @nktkas/bmp
     1.61x faster than bmpimagejs
     1.63x faster than bmp-js
     1.83x faster than @cwasm/nsbmp

group BI_RGB: 1 bit (grayscale)
| @nktkas/bmp    |          4.8 µs |       207,300 | (  4.0 µs …  11.4 µs) |   4.3 µs |  11.4 µs |  11.4 µs |
| @cwasm/nsbmp   |         25.1 µs |        39,870 | ( 16.3 µs …   5.5 ms) |  24.1 µs |  57.9 µs | 108.3 µs |
| bmp-js         |         22.7 µs |        44,090 | ( 14.1 µs …   4.5 ms) |  21.8 µs |  64.2 µs | 107.4 µs |
| bmpimagejs     |         24.3 µs |        41,080 | ( 14.3 µs …   5.4 ms) |  24.6 µs |  53.0 µs | 102.4 µs |

summary
  @nktkas/bmp
     4.70x faster than bmp-js
     5.05x faster than bmpimagejs
     5.20x faster than @cwasm/nsbmp

group BI_RGB: 4 bit
| @nktkas/bmp    |         17.6 µs |        56,930 | (  8.7 µs …   3.5 ms) |  14.9 µs |  86.0 µs | 111.6 µs |
| @cwasm/nsbmp   |         27.8 µs |        35,990 | ( 16.3 µs …   3.4 ms) |  23.9 µs |  97.4 µs | 128.2 µs |
| bmp-js         |         35.4 µs |        28,270 | ( 24.2 µs …   4.2 ms) |  32.5 µs | 107.2 µs | 147.1 µs |
| bmpimagejs     |         23.8 µs |        41,980 | ( 14.0 µs …   3.8 ms) |  21.9 µs |  90.1 µs | 116.0 µs |

summary
  @nktkas/bmp
     1.36x faster than bmpimagejs
     1.58x faster than @cwasm/nsbmp
     2.01x faster than bmp-js

group BI_RGB: 4 bit (grayscale)
| @nktkas/bmp    |          7.1 µs |       140,800 | (  5.1 µs …   2.5 ms) |   6.6 µs |  33.7 µs |  38.5 µs |
| @cwasm/nsbmp   |         26.5 µs |        37,800 | ( 15.5 µs …   3.6 ms) |  23.8 µs |  93.6 µs | 122.1 µs |
| bmp-js         |         35.3 µs |        28,310 | ( 24.4 µs …   4.3 ms) |  32.4 µs | 105.7 µs | 140.3 µs |
| bmpimagejs     |         26.3 µs |        38,050 | ( 14.1 µs …  77.2 ms) |  22.0 µs |  80.0 µs | 108.5 µs |

summary
  @nktkas/bmp
     3.70x faster than bmpimagejs
     3.73x faster than @cwasm/nsbmp
     4.97x faster than bmp-js

group BI_RGB: 8 bit
| @nktkas/bmp    |         14.3 µs |        69,980 | ( 11.1 µs …   1.8 ms) |  15.4 µs |  27.2 µs |  33.7 µs |
| @cwasm/nsbmp   |         25.9 µs |        38,580 | ( 15.6 µs …   3.9 ms) |  23.4 µs |  83.8 µs | 109.3 µs |
| fast-bmp       |         17.7 µs |        56,340 | ( 14.5 µs …   2.0 ms) |  16.8 µs |  44.6 µs |  53.1 µs |
| bmp-js         |         45.9 µs |        21,770 | ( 34.4 µs …   4.4 ms) |  44.5 µs | 120.1 µs | 158.1 µs |
| bmpimagejs     |         25.7 µs |        38,860 | ( 16.1 µs …   4.7 ms) |  24.5 µs |  81.2 µs | 108.9 µs |

summary
  @nktkas/bmp
     1.24x faster than fast-bmp
     1.80x faster than bmpimagejs
     1.81x faster than @cwasm/nsbmp
     3.21x faster than bmp-js

group BI_RGB: 8 bit (grayscale)
| @nktkas/bmp    |          9.1 µs |       110,000 | (  7.8 µs … 232.0 µs) |   8.9 µs |  15.9 µs |  20.3 µs |
| @cwasm/nsbmp   |         23.6 µs |        42,290 | ( 15.6 µs …   4.6 ms) |  23.2 µs |  70.1 µs | 103.6 µs |
| fast-bmp       |         17.5 µs |        57,250 | ( 14.0 µs …   1.6 ms) |  16.5 µs |  44.1 µs |  51.9 µs |
| bmp-js         |         44.3 µs |        22,570 | ( 34.5 µs …   4.2 ms) |  44.2 µs | 114.1 µs | 157.6 µs |
| bmpimagejs     |         23.6 µs |        42,300 | ( 16.1 µs …   4.3 ms) |  24.2 µs |  88.2 µs | 107.1 µs |

summary
  @nktkas/bmp
     1.92x faster than fast-bmp
     2.60x faster than bmpimagejs
     2.60x faster than @cwasm/nsbmp
     4.87x faster than bmp-js

group BI_RGB: 16 bit
| @nktkas/bmp    |         17.6 µs |        56,710 | ( 10.9 µs …   2.7 ms) |  16.9 µs |  78.4 µs | 103.0 µs |
| @cwasm/nsbmp   |         18.0 µs |        55,550 | ( 11.0 µs …   4.6 ms) |  18.5 µs |  78.5 µs | 104.5 µs |
| bmp-ts         |        115.0 µs |         8,695 | ( 92.4 µs …   3.2 ms) | 113.0 µs | 213.5 µs | 246.2 µs |
| bmp-js         |         28.0 µs |        35,690 | ( 15.1 µs …   3.4 ms) |  27.2 µs | 117.8 µs | 163.0 µs |
| bmpimagejs     |         19.6 µs |        51,010 | ( 11.7 µs …   4.0 ms) |  19.5 µs |  73.2 µs | 102.1 µs |

summary
  @nktkas/bmp
     1.02x faster than @cwasm/nsbmp
     1.11x faster than bmpimagejs
     1.59x faster than bmp-js
     6.52x faster than bmp-ts

group BI_RGB: 24 bit
| @nktkas/bmp    |         14.6 µs |        68,570 | (  8.3 µs …   3.0 ms) |  14.5 µs |  79.1 µs |  99.8 µs |
| @cwasm/nsbmp   |         15.0 µs |        66,520 | (  8.7 µs …   3.9 ms) |  16.4 µs |  82.0 µs | 102.4 µs |
| fast-bmp       |         35.5 µs |        28,160 | ( 27.4 µs …   3.1 ms) |  34.8 µs | 102.3 µs | 120.0 µs |
| bmp-js         |         27.9 µs |        35,800 | ( 16.2 µs …   3.1 ms) |  29.4 µs | 101.9 µs | 145.1 µs |
| bmpimagejs     |         16.6 µs |        60,240 | ( 10.2 µs …   3.8 ms) |  17.8 µs |  74.7 µs | 100.0 µs |

summary
  @nktkas/bmp
     1.03x faster than @cwasm/nsbmp
     1.14x faster than bmpimagejs
     1.92x faster than bmp-js
     2.44x faster than fast-bmp

group BI_RGB: 32 bit
| @nktkas/bmp    |         16.8 µs |        59,350 | ( 10.5 µs …   3.4 ms) |  16.6 µs |  88.2 µs | 102.9 µs |
| @cwasm/nsbmp   |         17.8 µs |        56,270 | ( 11.3 µs …   3.7 ms) |  18.8 µs |  83.2 µs | 103.3 µs |
| bmp-ts         |        116.8 µs |         8,560 | ( 98.6 µs …   5.4 ms) | 116.3 µs | 222.5 µs | 429.7 µs |
| bmp-js         |         53.0 µs |        18,860 | ( 42.5 µs …   5.3 ms) |  57.3 µs | 113.2 µs | 158.7 µs |
| bmpimagejs     |         17.5 µs |        57,030 | ( 12.5 µs …   4.8 ms) |  19.8 µs |  45.2 µs |  70.1 µs |

summary
  @nktkas/bmp
     1.04x faster than bmpimagejs
     1.05x faster than @cwasm/nsbmp
     3.15x faster than bmp-js
     6.93x faster than bmp-ts

group BI_RLE: 4 bit
| @nktkas/bmp    |         15.2 µs |        65,920 | (  9.3 µs …   3.6 ms) |  15.2 µs |  64.2 µs |  98.4 µs |
| @cwasm/nsbmp   |         16.6 µs |        60,060 | (  9.7 µs …   5.0 ms) |  18.1 µs |  61.3 µs |  98.5 µs |
| bmp-js         |         57.1 µs |        17,530 | ( 48.1 µs …   5.1 ms) |  56.8 µs | 116.9 µs | 147.1 µs |
| bmpimagejs     |         20.3 µs |        49,320 | ( 14.4 µs …   6.9 ms) |  22.1 µs |  46.2 µs |  70.2 µs |

summary
  @nktkas/bmp
     1.10x faster than @cwasm/nsbmp
     1.34x faster than bmpimagejs
     3.76x faster than bmp-js

group BI_RLE: 8 bit
| @nktkas/bmp    |         18.4 µs |        54,440 | ( 11.1 µs …   2.9 ms) |  17.3 µs |  51.1 µs |  67.4 µs |
| @cwasm/nsbmp   |         22.4 µs |        44,620 | ( 10.9 µs …   1.5 ms) |  18.8 µs | 119.1 µs | 181.2 µs |
| bmp-js         |         56.3 µs |        17,750 | ( 38.7 µs …   4.5 ms) |  52.3 µs |  98.0 µs | 129.0 µs |
| bmpimagejs     |         26.4 µs |        37,900 | ( 13.8 µs …  48.5 ms) |  22.0 µs |  87.2 µs | 139.4 µs |

summary
  @nktkas/bmp
     1.22x faster than @cwasm/nsbmp
     1.44x faster than bmpimagejs
     3.07x faster than bmp-js

group BI_BITFIELDS: 16 bit
| @nktkas/bmp    |         17.8 µs |        56,330 | ( 13.9 µs …   2.8 ms) |  19.4 µs |  40.9 µs |  82.8 µs |
| @cwasm/nsbmp   |         37.9 µs |        26,370 | ( 32.3 µs …   5.6 ms) |  39.7 µs |  70.5 µs |  93.1 µs |
| bmp-ts         |        113.3 µs |         8,826 | ( 97.9 µs …   3.7 ms) | 113.4 µs | 217.9 µs | 244.5 µs |
| bmpimagejs     |         39.1 µs |        25,550 | ( 31.9 µs …   1.6 ms) |  40.6 µs |  96.7 µs | 111.9 µs |

summary
  @nktkas/bmp
     2.14x faster than @cwasm/nsbmp
     2.21x faster than bmpimagejs
     6.38x faster than bmp-ts

group BI_BITFIELDS: 32 bit
| @nktkas/bmp    |         19.6 µs |        50,920 | ( 14.7 µs …   4.4 ms) |  20.7 µs |  47.3 µs |  86.8 µs |
| @cwasm/nsbmp   |         37.1 µs |        26,920 | ( 30.8 µs …   6.6 ms) |  38.6 µs |  73.3 µs |  95.1 µs |
| bmp-ts         |        114.0 µs |         8,769 | ( 99.9 µs …   6.1 ms) | 115.7 µs | 217.7 µs | 345.2 µs |
| bmpimagejs     |         37.8 µs |        26,420 | ( 30.8 µs …   2.3 ms) |  39.9 µs |  67.6 µs |  83.2 µs |

summary
  @nktkas/bmp
     1.89x faster than @cwasm/nsbmp
     1.93x faster than bmpimagejs
     5.81x faster than bmp-ts
```

</details>
