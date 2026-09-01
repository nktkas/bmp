/**
 * BMP image encoding and decoding.
 *
 * @example
 * ```ts
 * import { decode, encode } from "@nktkas/bmp";
 *
 * const raw = decode(await Deno.readFile("image.bmp"));
 * const bmp = encode(raw, { bitsPerPixel: 8 });
 * ```
 *
 * @module
 */

export * from "./decode/mod.ts";
export * from "./encode/mod.ts";
