/**
 * Procedurally generated benchmark images:
 * - {@linkcode genPhoto} — smooth multi-frequency field + grain: hundreds of thousands of distinct
 *   colors, so encoding to an indexed format always runs the Wu quantizer.
 * - {@linkcode genFlatRich} — long horizontal color segments: thousands of distinct colors (drives
 *   the quantizer) with long runs (drives RLE run-fill).
 * - {@linkcode genGray} — smooth single-channel field for the grayscale indexed paths.
 *   Its gradient rarely repeats a value twice in a row, so it is also what drives RLE absolute mode.
 *
 * Everything is seeded ({@linkcode mulberry32}), so the corpus is byte-for-byte reproducible.
 *
 * @module
 */

import type { RawImageData } from "../src/mod.ts";

/** Default edge length for generated benchmark images. */
export const DEFAULT_SIZE = 1024;

/**
 * A small, fast, seeded PRNG (mulberry32).
 *
 * @param seed 32-bit seed.
 *
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

/**
 * Rounds a value into the byte range a channel is stored in.
 *
 * @param v Value to clamp, in any range.
 *
 * @return The nearest integer within 0–255.
 */
function clamp8(v: number): number {
  return Math.min(255, Math.max(0, Math.round(v)));
}

/**
 * Photographic-like RGB image: a sum of low-frequency sine waves per channel plus fine grain.
 *
 * Continuous tones + grain yield very high unique-color counts, forcing the Wu quantizer to run
 * for any indexed target depth.
 *
 * @param width Image width.
 * @param height Image height.
 * @param seed PRNG seed.
 *
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
 * Long runs exercise RLE run-fill and the many distinct segment colors force the quantizer.
 * Even the short segments end up encoded as runs, so RLE absolute mode is left to {@linkcode genGray}.
 *
 * @param width Image width.
 * @param height Image height.
 * @param seed PRNG seed.
 *
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
 * Neighbouring pixels almost always differ, so an RLE encoder falls back to absolute mode for nearly every pixel.
 * That is the opposite of {@linkcode genFlatRich}.
 *
 * @param width Image width.
 * @param height Image height.
 * @param seed PRNG seed.
 *
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
  /**
   * BMP compression type:
   * - `0`: BI_RGB.
   * - `1`: BI_RLE8.
   * - `2`: BI_RLE4.
   * - `3`: BI_BITFIELDS.
   */
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
  { name: "BI_RLE: 8 bit (grayscale)", gen: genGray, bitsPerPixel: 8, compression: 1 },
  { name: "BI_BITFIELDS: 16 bit", gen: genPhoto, bitsPerPixel: 16, compression: 3 },
  { name: "BI_BITFIELDS: 32 bit", gen: genPhoto, bitsPerPixel: 32, compression: 3 },
] as const satisfies readonly PerfCase[];

/** A benchmark case name — one of {@linkcode PERF_CASES}. */
export type BenchName = (typeof PERF_CASES)[number]["name"];

/**
 * One library taking part in a benchmark group.
 *
 * @typeParam T The input the library's call takes: an encoded file for decoding, an image for encoding.
 */
export interface BenchLib<T> {
  /** Package name, shown as the benchmark's own name inside its group. */
  name: string;
  /** The call being measured. */
  fn: (data: T) => unknown;
  /** Cases the library takes part in. Omitting it enters every case. */
  only?: BenchName[];
}

/**
 * Registers one benchmark per (case, library) pair, with `@nktkas/bmp` as the baseline of each group.
 *
 * @typeParam T The input type shared by the cases and the libraries.
 * @param cases The prepared input of every case, in matrix order.
 * @param libs The libraries to measure.
 */
export function registerBenches<T>(cases: { name: BenchName; data: T }[], libs: BenchLib<T>[]): void {
  for (const { name, data } of cases) {
    for (const lib of libs) {
      if (lib.only && !lib.only.includes(name)) continue;
      Deno.bench({
        name: lib.name,
        group: name,
        baseline: lib.name === "@nktkas/bmp",
        fn: () => void lib.fn(data),
      });
    }
  }
}
