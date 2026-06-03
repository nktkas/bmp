/**
 * Procedurally generated benchmark images:
 * - {@link genPhoto} — smooth multi-frequency field + grain: hundreds of thousands of distinct
 *   colors, so encoding to an indexed format always runs the Wu quantizer.
 * - {@link genFlatRich} — long horizontal color segments: thousands of distinct colors (drives
 *   the quantizer) with long runs (drives RLE run-fill).
 * - {@link genGray} — smooth single-channel field for the grayscale indexed paths.
 *
 * Everything is seeded ({@link mulberry32}), so the corpus is byte-for-byte reproducible.
 *
 * @module
 */

import type { RawImageData } from "../src/mod.ts";

/** Default edge length for generated benchmark images. */
export const DEFAULT_SIZE = 1024;

/**
 * Small, fast, seeded PRNG (mulberry32).
 *
 * @param seed 32-bit seed.
 * @return Function returning the next value in [0, 1).
 */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const clamp8 = (v: number) => (v < 0 ? 0 : v > 255 ? 255 : Math.round(v));

/**
 * Photographic-like RGB image: a sum of low-frequency sine waves per channel plus fine grain.
 *
 * Continuous tones + grain yield very high unique-color counts, forcing the Wu quantizer to run
 * for any indexed target depth.
 *
 * @param width Image width.
 * @param height Image height.
 * @param seed PRNG seed.
 * @return RGB image data.
 */
export function genPhoto(width: number, height: number, seed = 0x1234): RawImageData {
  const rnd = mulberry32(seed);
  // 5 sine components per channel, a few cycles across the image for large smooth features.
  const comps = Array.from({ length: 3 }, () =>
    Array.from({ length: 5 }, () => ({
      fx: (1 + rnd() * 3) * 2 * Math.PI / width,
      fy: (1 + rnd() * 3) * 2 * Math.PI / height,
      ph: rnd() * 2 * Math.PI,
      amp: 0.5 + rnd(),
    })));

  const data = new Uint8Array(width * height * 3);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 3;
      for (let c = 0; c < 3; c++) {
        let v = 0, norm = 0;
        for (const s of comps[c]) {
          v += s.amp * Math.sin(s.fx * x + s.fy * y + s.ph);
          norm += s.amp;
        }
        v = (v / norm + 1) / 2 + (rnd() - 0.5) * 0.12; // normalize to 0..1 + ~6% grain
        data[i + c] = clamp8(v * 255);
      }
    }
  }
  return { width, height, channels: 3, data };
}

/**
 * Flat-but-colorful RGB image: each row is split into horizontal segments (mostly long, some short),
 * each filled with a smoothly varying color.
 *
 * Long runs exercise RLE run-fill; the many distinct segment colors force the quantizer;
 * the short segments keep the absolute/single-pixel RLE paths exercised.
 *
 * @param width Image width.
 * @param height Image height.
 * @param seed PRNG seed.
 * @return RGB image data.
 */
export function genFlatRich(width: number, height: number, seed = 0x55AA): RawImageData {
  const rnd = mulberry32(seed);
  const maxLong = Math.max(12, Math.floor(width * 0.12));
  const data = new Uint8Array(width * height * 3);
  for (let y = 0; y < height; y++) {
    let x = 0;
    while (x < width) {
      const len = rnd() < 0.15 ? 1 + Math.floor(rnd() * 6) : 12 + Math.floor(rnd() * maxLong);
      const end = Math.min(width, x + len);
      // Continuous color function of the segment's position, so segments span many distinct colors.
      const r = clamp8((Math.sin(x * 0.03 + y * 0.011) + 1) * 127.5);
      const g = clamp8((Math.sin(x * 0.013 + y * 0.021 + 2) + 1) * 127.5);
      const b = clamp8((Math.sin(x * 0.007 + y * 0.017 + 4) + 1) * 127.5);
      for (; x < end; x++) {
        const i = (y * width + x) * 3;
        data[i] = r;
        data[i + 1] = g;
        data[i + 2] = b;
      }
    }
  }
  return { width, height, channels: 3, data };
}

/**
 * Smooth single-channel (grayscale) image with grain, for the grayscale indexed paths.
 *
 * @param width Image width.
 * @param height Image height.
 * @param seed PRNG seed.
 * @return Grayscale image data (1 channel).
 */
export function genGray(width: number, height: number, seed = 0xC0FF): RawImageData {
  const rnd = mulberry32(seed);
  const data = new Uint8Array(width * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const v = (Math.sin(x * 0.02) + Math.sin(y * 0.015) + 2) / 4 + (rnd() - 0.5) * 0.1;
      data[y * width + x] = clamp8(v * 255);
    }
  }
  return { width, height, channels: 1, data };
}

/** A benchmark case: a format label, the generator that feeds it, and the encode parameters. */
export interface PerfCase {
  /** Human-readable format label (matched by each library's `only` list). */
  name: string;
  /** Source image generator. */
  gen: (w: number, h: number) => RawImageData;
  /** Bit depth to encode/decode at. */
  bitsPerPixel: 1 | 4 | 8 | 16 | 24 | 32;
  /** BMP compression type (0=BI_RGB, 1=BI_RLE8, 2=BI_RLE4, 3=BI_BITFIELDS). */
  compression: 0 | 1 | 2 | 3;
}

/**
 * The shared benchmark matrix: one case per BMP format the encoder supports.
 *
 * Indexed cases use a high-unique-color source so the quantizer runs; RLE cases use long runs;
 * grayscale cases use the single-channel source.
 */
export const PERF_CASES = [
  { name: "BI_RGB: 1 bit", gen: genFlatRich, bitsPerPixel: 1, compression: 0 },
  { name: "BI_RGB: 1 bit (grayscale)", gen: genGray, bitsPerPixel: 1, compression: 0 },
  { name: "BI_RGB: 4 bit", gen: genFlatRich, bitsPerPixel: 4, compression: 0 },
  { name: "BI_RGB: 4 bit (grayscale)", gen: genGray, bitsPerPixel: 4, compression: 0 },
  { name: "BI_RGB: 8 bit", gen: genPhoto, bitsPerPixel: 8, compression: 0 },
  { name: "BI_RGB: 8 bit (grayscale)", gen: genGray, bitsPerPixel: 8, compression: 0 },
  { name: "BI_RGB: 16 bit", gen: genPhoto, bitsPerPixel: 16, compression: 0 },
  { name: "BI_RGB: 24 bit", gen: genPhoto, bitsPerPixel: 24, compression: 0 },
  { name: "BI_RGB: 32 bit", gen: genPhoto, bitsPerPixel: 32, compression: 0 },
  { name: "BI_RLE: 4 bit", gen: genFlatRich, bitsPerPixel: 4, compression: 2 },
  { name: "BI_RLE: 8 bit", gen: genFlatRich, bitsPerPixel: 8, compression: 1 },
  { name: "BI_BITFIELDS: 16 bit", gen: genPhoto, bitsPerPixel: 16, compression: 3 },
  { name: "BI_BITFIELDS: 32 bit", gen: genPhoto, bitsPerPixel: 32, compression: 3 },
] as const satisfies readonly PerfCase[];

/** A benchmark case name — one of {@link PERF_CASES}. */
export type BenchName = (typeof PERF_CASES)[number]["name"];
