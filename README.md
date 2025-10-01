# BMP Decoder

[![License: MIT](https://img.shields.io/badge/License-MIT-brightgreen.svg)](https://opensource.org/licenses/MIT)
[![npm](https://img.shields.io/npm/v/@nktkas/bmp)](https://www.npmjs.com/package/@nktkas/bmp)
[![JSR](https://jsr.io/badges/@nktkas/bmp)](https://jsr.io/@nktkas/bmp)

Decoding for any BMP file formats.

Works with:
<img alt="browsers" title="This package works with browsers." height="16px" src="https://jsr.io/logos/browsers.svg" />
<img alt="Deno" title="This package works with Deno." height="16px" src="https://jsr.io/logos/deno.svg" />
<img alt="Node.js" title="This package works with Node.js" height="16px" src="https://jsr.io/logos/node.svg" />
<img alt="Bun" title="This package works with Bun." height="16px" src="https://jsr.io/logos/bun.svg" />

## Usage

### Decode

`decode` function reads a BMP buffer and returns a raw RGB(A) image data and metadata.

Supported BMP formats:

- Any bits per pixel (1, 4, 8, 16, 24, 32, 64)
- Any Windows and OS/2 headers (CORE, OS22X, INFO, V2, V3, V4, V5)
- [Compression methods](https://learn.microsoft.com/en-us/openspecs/windows_protocols/ms-wmf/4e588f70-bd92-4a6f-b77f-35d0feaf7a57):
  BI_RGB, BI_RLE8, BI_RLE4, BI_BITFIELDS
- Top-down and bottom-up images

```ts
import { decode } from "@nktkas/bmp";

const file = await fs.readFile("image.bmp");
const bmp = decode(file);
// {
//   width: 800,
//   height: 600,
//   channels: 4,
//   data: Uint8Array(1920000) [ ... ] // RGB(A) pixel data
// }
```

For compression methods BI_JPEG and BI_PNG, use `extractCompressedData` to get the embedded JPEG/PNG data.

```ts
import { extractCompressedData } from "@nktkas/bmp";

const file = await fs.readFile("jpeg.bmp");
const bmp = extractCompressedData(file);
// {
//   width: 800,
//   height: 600,
//   compression: 5, // 4 for BI_JPEG, 5 for BI_PNG
//   data: Uint8Array(123456) [ ... ] // JPEG/PNG binary data
// }
```

## Benchmarks

| benchmark           | time/iter (avg) | iter/s | (min … max)         | p75      | p99      | p995     |
| ------------------- | --------------- | ------ | ------------------- | -------- | -------- | -------- |
| **BI_RGB: 32 bits** |                 |        |                     |          |          |          |
| @cwasm/nsbmp        | 15.3 µs         | 65,500 | ( 11.3 µs … 6.8 ms) | 15.1 µs  | 34.6 µs  | 51.3 µs  |
| @nktkas/bmp         | 16.4 µs         | 60,910 | ( 12.6 µs … 7.0 ms) | 14.9 µs  | 38.0 µs  | 53.8 µs  |
| bmpimagejs          | 17.0 µs         | 58,770 | ( 12.6 µs … 6.3 ms) | 18.9 µs  | 35.6 µs  | 55.9 µs  |
| bmp-js              | 72.6 µs         | 13,780 | ( 61.8 µs … 7.5 ms) | 69.1 µs  | 147.9 µs | 180.8 µs |
| bmp-ts              | 113.6 µs        | 8,803  | ( 97.2 µs … 6.9 ms) | 113.4 µs | 209.1 µs | 318.1 µs |

| benchmark           | time/iter (avg) | iter/s | (min … max)         | p75     | p99      | p995     |
| ------------------- | --------------- | ------ | ------------------- | ------- | -------- | -------- |
| **BI_RGB: 24 bits** |                 |        |                     |         |          |          |
| @nktkas/bmp         | 11.7 µs         | 85,310 | ( 8.8 µs … 7.0 ms)  | 11.1 µs | 25.5 µs  | 43.1 µs  |
| @cwasm/nsbmp        | 12.7 µs         | 79,030 | ( 8.8 µs … 6.8 ms)  | 12.0 µs | 31.4 µs  | 52.4 µs  |
| bmpimagejs          | 16.0 µs         | 62,510 | ( 11.7 µs … 5.9 ms) | 17.3 µs | 35.8 µs  | 59.2 µs  |
| fast-bmp            | 33.2 µs         | 30,090 | ( 27.9 µs … 6.0 ms) | 33.9 µs | 53.6 µs  | 72.1 µs  |
| bmp-js              | 50.5 µs         | 19,810 | ( 41.3 µs … 6.6 ms) | 53.5 µs | 107.8 µs | 133.0 µs |
| bmp-ts              | 82.6 µs         | 12,100 | ( 70.0 µs … 6.7 ms) | 80.0 µs | 166.3 µs | 208.7 µs |

| benchmark                  | time/iter (avg) | iter/s | (min … max)         | p75     | p99     | p995     |
| -------------------------- | --------------- | ------ | ------------------- | ------- | ------- | -------- |
| **BI_RGB: palette 8 bits** |                 |        |                     |         |         |          |
| @nktkas/bmp                | 14.1 µs         | 71,030 | ( 11.2 µs … 1.6 ms) | 12.9 µs | 28.9 µs | 35.0 µs  |
| fast-bmp                   | 17.1 µs         | 58,600 | ( 14.3 µs … 1.3 ms) | 16.9 µs | 43.6 µs | 50.6 µs  |
| @cwasm/nsbmp               | 21.0 µs         | 47,540 | ( 15.6 µs … 6.9 ms) | 22.7 µs | 43.7 µs | 74.9 µs  |
| bmpimagejs                 | 24.3 µs         | 41,080 | ( 18.9 µs … 6.4 ms) | 26.0 µs | 43.5 µs | 58.4 µs  |
| bmp-js                     | 45.5 µs         | 21,960 | ( 38.4 µs … 7.5 ms) | 45.3 µs | 79.8 µs | 109.9 µs |
| bmp-ts                     | 47.6 µs         | 21,030 | ( 36.5 µs … 6.8 ms) | 52.4 µs | 96.6 µs | 127.0 µs |

<sub>Run [`deno bench --allow-read`](https://docs.deno.com/runtime/reference/cli/bench/) for full results</sub>
