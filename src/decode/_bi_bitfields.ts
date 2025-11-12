import type { RawImageData } from "./mod.ts";
import type { BMPHeader } from "./_bmpHeader.ts";
import type { DecodeOptions } from "./_types.ts";

/** Extracted bit mask information */
interface BitMasks {
  redMask: number;
  greenMask: number;
  blueMask: number;
  alphaMask: number;
}

/** Analyzed mask information with shift and bit depth values */
interface BitMaskInfo {
  shift: number;
  bits: number;
}

/** Lookup tables for fast color scaling */
interface ColorScalingLUTs {
  redLUT: Uint8Array;
  greenLUT: Uint8Array;
  blueLUT: Uint8Array;
  alphaLUT: Uint8Array | null;
}

/**
 * Converts a BMP with BI_BITFIELDS compression to a raw pixel image data
 */
export function BI_BITFIELDS_TO_RAW(bmp: Uint8Array, header: BMPHeader, options?: DecodeOptions): RawImageData {
  // 0. Get header data and validate
  const { bfOffBits } = header.fileHeader;
  const { biWidth, biHeight, biBitCount, biCompression } = header.infoHeader;

  if (biCompression !== 3 && biCompression !== 6) {
    throw new Error(
      `Unsupported BMP compression method: received ${biCompression}, expected 3 (BI_BITFIELDS) or 6 (BI_ALPHABITFIELDS)`,
    );
  }
  if (biBitCount !== 16 && biBitCount !== 32) {
    throw new Error(`Unsupported BMP bit count: received ${biBitCount}, expected 16 or 32`);
  }

  // 1. Calculate image dimensions and orientation
  const absWidth = Math.abs(biWidth);
  const absHeight = Math.abs(biHeight);
  const isTopDown = biHeight < 0;

  // 2. Extract and analyze bit masks
  const { redMask, greenMask, blueMask, alphaMask } = extractBitMasks(bmp, header);
  const red = analyzeBitMask(redMask);
  const green = analyzeBitMask(greenMask);
  const blue = analyzeBitMask(blueMask);
  const alpha = analyzeBitMask(alphaMask);

  // 3. Calculate row stride and pixel parameters
  const stride = Math.ceil((biBitCount * absWidth) / 32) * 4;
  const bytesPerPixel = biBitCount / 8;
  const channels = options?.desiredChannels ?? (alpha.bits > 0 ? 4 : 3);

  // 4. Allocate output buffer and create DataView
  const output = new Uint8Array(absWidth * absHeight * channels);
  const view = new DataView(bmp.buffer, bmp.byteOffset, bmp.byteLength);

  // 5. Create lookup tables for fast color scaling
  let { redLUT, greenLUT, blueLUT, alphaLUT } = createColorScalingLookupTables(
    red.bits,
    green.bits,
    blue.bits,
    alpha.bits,
  );
  alphaLUT = !alphaLUT && channels === 4 ? new Uint8Array(256).fill(255) : alphaLUT;

  // 6. Process pixels
  // OPTIMIZATION: Separate loops for each combination to eliminate branching in hot path
  if (biBitCount === 16) {
    if (channels === 4) {
      for (let y = 0; y < absHeight; y++) {
        const srcY = isTopDown ? y : (absHeight - 1 - y);
        const srcRowOffset = bfOffBits + srcY * stride;
        const dstRowOffset = y * absWidth * channels;

        for (let x = 0; x < absWidth; x++) {
          const byteOffset = srcRowOffset + x * bytesPerPixel;
          const pixel = view.getUint16(byteOffset, true);
          const dstOffset = dstRowOffset + x * channels;

          // Extract color components using bit masks and lookup tables
          // 1. Apply mask to isolate the bits for this channel
          // 2. Right-shift to get the raw value
          // 3. Use lookup table to scale to 0-255 range
          output[dstOffset] = redLUT[(pixel & redMask) >>> red.shift];
          output[dstOffset + 1] = greenLUT[(pixel & greenMask) >>> green.shift];
          output[dstOffset + 2] = blueLUT[(pixel & blueMask) >>> blue.shift];
          output[dstOffset + 3] = alphaLUT![(pixel & alphaMask) >>> alpha.shift];
        }
      }
    } else {
      for (let y = 0; y < absHeight; y++) {
        const srcY = isTopDown ? y : (absHeight - 1 - y);

        const srcRowOffset = bfOffBits + srcY * stride;
        const dstRowOffset = y * absWidth * channels;

        for (let x = 0; x < absWidth; x++) {
          const byteOffset = srcRowOffset + x * bytesPerPixel;
          const pixel = view.getUint16(byteOffset, true);
          const dstOffset = dstRowOffset + x * channels;

          output[dstOffset] = redLUT[(pixel & redMask) >>> red.shift];
          output[dstOffset + 1] = greenLUT[(pixel & greenMask) >>> green.shift];
          output[dstOffset + 2] = blueLUT[(pixel & blueMask) >>> blue.shift];
        }
      }
    }
  } else {
    if (channels === 4) {
      for (let y = 0; y < absHeight; y++) {
        const srcY = isTopDown ? y : (absHeight - 1 - y);

        const srcRowOffset = bfOffBits + srcY * stride;
        const dstRowOffset = y * absWidth * channels;

        for (let x = 0; x < absWidth; x++) {
          const byteOffset = srcRowOffset + x * bytesPerPixel;
          const pixel = view.getUint32(byteOffset, true);
          const dstOffset = dstRowOffset + x * channels;

          output[dstOffset] = redLUT[(pixel & redMask) >>> red.shift];
          output[dstOffset + 1] = greenLUT[(pixel & greenMask) >>> green.shift];
          output[dstOffset + 2] = blueLUT[(pixel & blueMask) >>> blue.shift];
          output[dstOffset + 3] = alphaLUT![(pixel & alphaMask) >>> alpha.shift];
        }
      }
    } else {
      for (let y = 0; y < absHeight; y++) {
        const srcY = isTopDown ? y : (absHeight - 1 - y);

        const srcRowOffset = bfOffBits + srcY * stride;
        const dstRowOffset = y * absWidth * channels;

        for (let x = 0; x < absWidth; x++) {
          const byteOffset = srcRowOffset + x * bytesPerPixel;
          const pixel = view.getUint32(byteOffset, true);
          const dstOffset = dstRowOffset + x * channels;

          output[dstOffset] = redLUT[(pixel & redMask) >>> red.shift];
          output[dstOffset + 1] = greenLUT[(pixel & greenMask) >>> green.shift];
          output[dstOffset + 2] = blueLUT[(pixel & blueMask) >>> blue.shift];
        }
      }
    }
  }

  return {
    width: absWidth,
    height: absHeight,
    channels,
    data: output,
  };
}

/**
 * Extract bit masks from BMP header
 */
function extractBitMasks(bmp: Uint8Array, header: BMPHeader): BitMasks {
  // 0. Get header info
  const { bfOffBits } = header.fileHeader;
  const { biBitCount, biSize } = header.infoHeader;

  // 1. Read masks from appropriate source
  let redMask: number, greenMask: number, blueMask: number, alphaMask: number;

  if ("bV4RedMask" in header.infoHeader) {
    // BITMAPV4HEADER or BITMAPV5HEADER
    redMask = header.infoHeader.bV4RedMask;
    greenMask = header.infoHeader.bV4GreenMask;
    blueMask = header.infoHeader.bV4BlueMask;
    alphaMask = header.infoHeader.bV4AlphaMask;
  } else if ("biRedMask" in header.infoHeader) {
    // BITMAPV2INFOHEADER or BITMAPV3INFOHEADER
    redMask = header.infoHeader.biRedMask;
    greenMask = header.infoHeader.biGreenMask;
    blueMask = header.infoHeader.biBlueMask;
    alphaMask = "biAlphaMask" in header.infoHeader ? header.infoHeader.biAlphaMask : 0;
  } else {
    // BITMAPINFOHEADER: masks stored after info header
    const view = new DataView(bmp.buffer, bmp.byteOffset, bmp.byteLength);
    const maskOffset = 14 + biSize;

    redMask = view.getUint32(maskOffset, true);
    greenMask = view.getUint32(maskOffset + 4, true);
    blueMask = view.getUint32(maskOffset + 8, true);
    alphaMask = bfOffBits >= maskOffset + 16 ? view.getUint32(maskOffset + 12, true) : 0;
  }

  // 2. Apply default masks if all are zero
  if (redMask === 0 && greenMask === 0 && blueMask === 0) {
    if (biBitCount === 16) {
      // Default 5-5-5 RGB format
      redMask = 0x7c00;
      greenMask = 0x03e0;
      blueMask = 0x001f;
      alphaMask = 0;
    } else {
      // Default 8-8-8-8 BGRA format
      redMask = 0x00ff0000;
      greenMask = 0x0000ff00;
      blueMask = 0x000000ff;
      alphaMask = 0xff000000;
    }
  }

  return { redMask, greenMask, blueMask, alphaMask };
}

/**
 * Analyze a single bit mask to determine shift and bit depth
 */
function analyzeBitMask(mask: number): BitMaskInfo {
  // 0. Handle zero mask
  if (mask === 0) {
    return { shift: 0, bits: 0 };
  }

  let temp = mask;

  // 1. Count trailing zeros for shift amount
  let shift = 0;
  while ((temp & 1) === 0) {
    shift++;
    temp >>>= 1;
  }

  // 2. Count consecutive ones for bit depth
  let bits = 0;
  while ((temp & 1) === 1) {
    bits++;
    temp >>>= 1;
  }

  return { shift, bits };
}

/**
 * Create lookup tables for fast color scaling
 */
function createColorScalingLookupTables(
  redBits: number,
  greenBits: number,
  blueBits: number,
  alphaBits: number,
): ColorScalingLUTs {
  // 1. Allocate lookup tables
  const redLUT = new Uint8Array(1 << redBits);
  const greenLUT = new Uint8Array(1 << greenBits);
  const blueLUT = new Uint8Array(1 << blueBits);
  const alphaLUT = alphaBits > 0 ? new Uint8Array(1 << alphaBits) : null;

  // 2. Calculate max values and fill tables with scaled values
  const redMax = (1 << redBits) - 1;
  const greenMax = (1 << greenBits) - 1;
  const blueMax = (1 << blueBits) - 1;

  for (let i = 0; i < redLUT.length; i++) {
    redLUT[i] = Math.min(255, Math.round((i * 255) / redMax));
  }
  for (let i = 0; i < greenLUT.length; i++) {
    greenLUT[i] = Math.min(255, Math.round((i * 255) / greenMax));
  }
  for (let i = 0; i < blueLUT.length; i++) {
    blueLUT[i] = Math.min(255, Math.round((i * 255) / blueMax));
  }
  if (alphaLUT) {
    const alphaMax = (1 << alphaBits) - 1;
    for (let i = 0; i < alphaLUT.length; i++) {
      alphaLUT[i] = Math.min(255, Math.round((i * 255) / alphaMax));
    }
  }

  return { redLUT, greenLUT, blueLUT, alphaLUT };
}
