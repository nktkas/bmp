import type { RawImageData } from "../_common.ts";
import type { RGBQUAD } from "../decode/_colorTable.ts";
import { convertToIndexed, generateGrayscalePalette, generatePalette } from "./_colorQuantization.ts";
import { grayscaleToIndices, packIndexedPixels, rawToBgr, rawToBgra, rawToRgb555 } from "./_helpers.ts";

/** Result of BI_RGB encoding */
export interface EncodedBiRgbData {
  /** Encoded pixel data */
  pixelData: Uint8Array;
  /** Color palette (for indexed formats) */
  palette?: RGBQUAD[];
}

/**
 * Encodes image data in BI_RGB format (uncompressed).
 * @param raw - Raw image data
 * @param bitsPerPixel - Target bits per pixel (1, 4, 8, 16, 24, or 32)
 * @param topDown - If true, rows are stored top-down, otherwise bottom-up (default: false)
 * @param palette - Palette to use for indexed formats (default: auto-generated)
 * @returns Encoded pixel data and palette
 */
export function encodeBiRgb(
  raw: RawImageData,
  bitsPerPixel: 1 | 4 | 8 | 16 | 24 | 32,
  topDown: boolean = false,
  palette?: RGBQUAD[],
): EncodedBiRgbData {
  switch (bitsPerPixel) {
    case 1:
      return encodeBiRgb1Bit(raw, topDown, palette);
    case 4:
      return encodeBiRgb4Bit(raw, topDown, palette);
    case 8:
      return encodeBiRgb8Bit(raw, topDown, palette);
    case 16:
      return encodeBiRgb16Bit(raw, topDown);
    case 24:
      return encodeBiRgb24Bit(raw, topDown);
    case 32:
      return encodeBiRgb32Bit(raw, topDown);
    default:
      throw new Error(`Unsupported bits per pixel: ${bitsPerPixel}`);
  }
}

/**
 * Encodes image data in 1-bit BI_RGB format (2 color).
 * @param raw - Raw image data
 * @param topDown - If true, rows are stored top-down
 * @param palette - Optional 2-color palette
 * @returns Encoded data with palette
 */
function encodeBiRgb1Bit(raw: RawImageData, topDown: boolean, palette?: RGBQUAD[]): EncodedBiRgbData {
  let finalPalette: RGBQUAD[];
  let indices: Uint8Array;
  if (palette && palette.length >= 2) {
    finalPalette = palette.slice(0, 2);
    indices = convertToIndexed(raw, finalPalette);
  } else {
    finalPalette = raw.channels === 1 ? generateGrayscalePalette(2) : generatePalette(raw, 2);
    indices = raw.channels === 1 ? grayscaleToIndices(raw, 2) : convertToIndexed(raw, finalPalette);
  }

  const pixelData = packIndexedPixels(indices, raw.width, raw.height, 1, topDown);

  return { pixelData, palette: finalPalette };
}

/**
 * Encodes image data in 4-bit BI_RGB format (16 colors).
 * @param raw - Raw image data
 * @param topDown - If true, rows are stored top-down
 * @param palette - Optional 16-color palette
 * @returns Encoded data with palette
 */
function encodeBiRgb4Bit(raw: RawImageData, topDown: boolean, palette?: RGBQUAD[]): EncodedBiRgbData {
  let finalPalette: RGBQUAD[];
  let indices: Uint8Array;
  if (palette && palette.length >= 16) {
    finalPalette = palette.slice(0, 16);
    indices = convertToIndexed(raw, finalPalette);
  } else {
    finalPalette = raw.channels === 1 ? generateGrayscalePalette(16) : generatePalette(raw, 16);
    indices = raw.channels === 1 ? grayscaleToIndices(raw, 16) : convertToIndexed(raw, finalPalette);
  }

  const pixelData = packIndexedPixels(indices, raw.width, raw.height, 4, topDown);

  return { pixelData, palette: finalPalette };
}

/**
 * Encodes image data in 8-bit BI_RGB format (256 colors).
 * @param raw - Raw image data
 * @param topDown - If true, rows are stored top-down
 * @param palette - Optional 256-color palette
 * @returns Encoded data with palette
 */
function encodeBiRgb8Bit(raw: RawImageData, topDown: boolean, palette?: RGBQUAD[]): EncodedBiRgbData {
  let finalPalette: RGBQUAD[];
  let indices: Uint8Array;
  if (palette && palette.length >= 256) {
    finalPalette = palette.slice(0, 256);
    indices = convertToIndexed(raw, finalPalette);
  } else {
    finalPalette = raw.channels === 1 ? generateGrayscalePalette(256) : generatePalette(raw, 256);
    indices = raw.channels === 1 ? grayscaleToIndices(raw, 256) : convertToIndexed(raw, finalPalette);
  }

  const pixelData = packIndexedPixels(indices, raw.width, raw.height, 8, topDown);

  return { pixelData, palette: finalPalette };
}

/**
 * Encodes image data in 16-bit BI_RGB format (RGB555).
 * @param raw - Raw image data (grayscale, RGB or RGBA)
 * @param topDown - If true, rows are stored top-down
 * @returns Encoded data (no palette)
 */
function encodeBiRgb16Bit(raw: RawImageData, topDown: boolean): EncodedBiRgbData {
  if (raw.channels !== 1 && raw.channels !== 3 && raw.channels !== 4) {
    throw new Error("16-bit encoding requires grayscale, RGB or RGBA data");
  }
  const pixelData = rawToRgb555(raw, topDown);
  return { pixelData };
}

/**
 * Encodes image data in 24-bit BI_RGB format (BGR).
 * @param raw - Raw image data (RGB or RGBA)
 * @param topDown - If true, rows are stored top-down
 * @returns Encoded data (no palette)
 */
function encodeBiRgb24Bit(raw: RawImageData, topDown: boolean): EncodedBiRgbData {
  if (raw.channels !== 1 && raw.channels !== 3 && raw.channels !== 4) {
    throw new Error("24-bit encoding requires grayscale, RGB, or RGBA data");
  }
  const pixelData = rawToBgr(raw, topDown);
  return { pixelData };
}

/**
 * Encodes image data in 32-bit BI_RGB format (BGRA).
 * @param raw - Raw image data (RGB or RGBA)
 * @param topDown - If true, rows are stored top-down
 * @returns Encoded data (no palette)
 */
function encodeBiRgb32Bit(raw: RawImageData, topDown: boolean): EncodedBiRgbData {
  if (raw.channels !== 1 && raw.channels !== 3 && raw.channels !== 4) {
    throw new Error("32-bit encoding requires grayscale, RGB, or RGBA data");
  }
  const pixelData = rawToBgra(raw, topDown);
  return { pixelData };
}
