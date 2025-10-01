import type { RGBImageData } from "./mod.ts";
import { type BMPHeader, getNormalizedHeaderInfo } from "./_bmpHeader.ts";

/** Extracted bit mask information */
interface BitMasks {
  redMask: number;
  greenMask: number;
  blueMask: number;
  alphaMask: number;
}

/** Analyzed mask information with shift and scale values */
interface MaskInfo {
  shift: number;
  bits: number;
  scale: number;
}

/** Lookup tables for fast color scaling */
interface ColorScalingLUTs {
  redLUT: Uint8Array;
  greenLUT: Uint8Array;
  blueLUT: Uint8Array;
  alphaLUT: Uint8Array | null;
}

/**
 * Converts a BMP with BI_BITFIELDS compression to an raw RGB(A) image
 * @param bmp The BMP array to convert
 * @param header Optional pre-parsed BMP header (to avoid re-parsing)
 * @returns The raw RGB(A) image data and metadata
 */
export function BI_BITFIELDS_TO_RAW(bmp: Uint8Array, header: BMPHeader): RGBImageData {
  const { bfOffBits } = header.fileHeader;
  const { biWidth, biHeight, biBitCount, biCompression } = getNormalizedHeaderInfo(header.infoHeader);

  // Validate compression type
  if (biCompression !== 3) {
    throw new Error(`Unsupported BMP compression method: received ${biCompression}, expected 3 (BI_BITFIELDS)`);
  }
  if (biBitCount !== 16 && biBitCount !== 32) {
    throw new Error(`Bitfields compression only supported for 16 and 32 bit images, got ${biBitCount}`);
  }

  // Handle image orientation (negative height means top-down)
  const absHeight = Math.abs(biHeight);
  const isTopDown = biHeight < 0;

  // Extract bit masks from BMP header
  const { redMask, greenMask, blueMask, alphaMask } = extractBitMasks(bmp, header);

  // Analyze bit masks to extract shift and scale values
  const red = analyzeBitMask(redMask);
  const green = analyzeBitMask(greenMask);
  const blue = analyzeBitMask(blueMask);
  const alpha = analyzeBitMask(alphaMask);

  // Calculate row stride (bytes per row, padded to 4-byte boundary)
  const stride = Math.floor((biBitCount * biWidth + 31) / 32) * 4;

  // Determine output format: RGB (3 channels) or RGBA (4 channels)
  const channels = alpha.bits > 0 ? 4 : 3;

  // Allocate output buffer
  const output = new Uint8Array(biWidth * absHeight * channels);

  // Create DataView for reading pixel data
  const view = new DataView(bmp.buffer, bmp.byteOffset, bmp.byteLength);

  // Bytes per pixel (2 for 16-bit, 4 for 32-bit)
  const bytesPerPixel = biBitCount / 8;

  // Create lookup tables for fast color scaling
  const { redLUT, greenLUT, blueLUT, alphaLUT } = createColorScalingLookupTables(red, green, blue, alpha);

  // === Process pixels ===
  // We use separate loops for each combination of bit depth and channel count
  // to eliminate conditional branching in the hot path (inner loop)
  if (biBitCount === 16) {
    // 16-bit pixels
    if (channels === 4) {
      // RGBA
      for (let y = 0; y < absHeight; y++) {
        // Calculate source row index (handle top-down vs bottom-up)
        const srcY = isTopDown ? y : (absHeight - 1 - y);

        // Calculate byte offsets for source and destination rows
        const srcRowOffset = bfOffBits + srcY * stride;
        const dstRowOffset = y * biWidth * channels;

        for (let x = 0; x < biWidth; x++) {
          // Read 16-bit pixel value
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
      // RGB (no alpha)
      for (let y = 0; y < absHeight; y++) {
        const srcY = isTopDown ? y : (absHeight - 1 - y);

        const srcRowOffset = bfOffBits + srcY * stride;
        const dstRowOffset = y * biWidth * channels;

        for (let x = 0; x < biWidth; x++) {
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
    // 32-bit pixels
    if (channels === 4) {
      // RGBA
      for (let y = 0; y < absHeight; y++) {
        const srcY = isTopDown ? y : (absHeight - 1 - y);

        const srcRowOffset = bfOffBits + srcY * stride;
        const dstRowOffset = y * biWidth * channels;

        for (let x = 0; x < biWidth; x++) {
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
      // RGB (no alpha)
      for (let y = 0; y < absHeight; y++) {
        const srcY = isTopDown ? y : (absHeight - 1 - y);

        const srcRowOffset = bfOffBits + srcY * stride;
        const dstRowOffset = y * biWidth * channels;

        for (let x = 0; x < biWidth; x++) {
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
    width: biWidth,
    height: absHeight,
    channels: channels,
    data: output,
  };
}

/** Extract bit masks from BMP header */
function extractBitMasks(bmp: Uint8Array, header: BMPHeader): BitMasks {
  const { bfOffBits } = header.fileHeader;
  const { biBitCount, biSize } = getNormalizedHeaderInfo(header.infoHeader);

  let redMask: number, greenMask: number, blueMask: number, alphaMask: number;

  // Check if masks are stored in the header (BITMAPV2INFOHEADER or later)
  if ("bV4RedMask" in header.infoHeader) {
    redMask = header.infoHeader.bV4RedMask;
    greenMask = header.infoHeader.bV4GreenMask;
    blueMask = header.infoHeader.bV4BlueMask;
    alphaMask = header.infoHeader.bV4AlphaMask;
  } else if ("bV3RedMask" in header.infoHeader) {
    redMask = header.infoHeader.bV3RedMask;
    greenMask = header.infoHeader.bV3GreenMask;
    blueMask = header.infoHeader.bV3BlueMask;
    alphaMask = header.infoHeader.bV3AlphaMask;
  } else if ("bV2RedMask" in header.infoHeader) {
    redMask = header.infoHeader.bV2RedMask;
    greenMask = header.infoHeader.bV2GreenMask;
    blueMask = header.infoHeader.bV2BlueMask;
    alphaMask = 0;
  } else {
    // Masks are stored after the info header in BITMAPINFOHEADER
    const view = new DataView(bmp.buffer, bmp.byteOffset, bmp.byteLength);
    const maskOffset = 14 + biSize; // 14-byte file header + info header size

    redMask = view.getUint32(maskOffset, true);
    greenMask = view.getUint32(maskOffset + 4, true);
    blueMask = view.getUint32(maskOffset + 8, true);
    // Alpha mask is optional and only present for 32-bit images
    alphaMask = biBitCount === 32 && bfOffBits >= maskOffset + 16 ? view.getUint32(maskOffset + 12, true) : 0;

    // If all masks are zero, use default masks
    if (redMask === 0 && greenMask === 0 && blueMask === 0) {
      if (biBitCount === 16) {
        // Default 5-5-5 RGB format for 16-bit
        redMask = 0x7c00; // bits 10-14 (5 bits)
        greenMask = 0x03e0; // bits 5-9 (5 bits)
        blueMask = 0x001f; // bits 0-4 (5 bits)
        alphaMask = 0;
      } else {
        // Default 8-8-8-8 BGRA format for 32-bit
        redMask = 0x00ff0000; // bits 16-23 (8 bits)
        greenMask = 0x0000ff00; // bits 8-15 (8 bits)
        blueMask = 0x000000ff; // bits 0-7 (8 bits)
        alphaMask = 0xff000000; // bits 24-31 (8 bits)
      }
    }
  }

  return { redMask, greenMask, blueMask, alphaMask };
}

/** Analyze a single bit mask to extract shift and scale values */
function analyzeBitMask(mask: number): MaskInfo {
  if (mask === 0) {
    return { shift: 0, bits: 0, scale: 0 };
  }

  let shift = 0;
  let bits = 0;
  let temp = mask;

  // Count trailing zeros (shift amount)
  while ((temp & 1) === 0) {
    shift++;
    temp >>>= 1;
  }

  // Count consecutive ones (bit count)
  while ((temp & 1) === 1) {
    bits++;
    temp >>>= 1;
  }

  // Calculate scale factor to convert to 0-255 range
  const maxValue = (1 << bits) - 1;
  const scale = maxValue > 0 ? 255 / maxValue : 0;

  return { shift, bits, scale };
}

/** Create lookup tables for fast color scaling */
function createColorScalingLookupTables(
  red: MaskInfo,
  green: MaskInfo,
  blue: MaskInfo,
  alpha: MaskInfo,
): ColorScalingLUTs {
  // Instead of doing Math.round(value * scale) for each pixel,
  // we pre-compute all possible scaled values in lookup tables
  const redLUT = new Uint8Array(1 << red.bits);
  const greenLUT = new Uint8Array(1 << green.bits);
  const blueLUT = new Uint8Array(1 << blue.bits);
  const alphaLUT = alpha.bits > 0 ? new Uint8Array(1 << alpha.bits) : null;

  // Fill lookup tables by scaling N-bit values to 8-bit range
  // For bits <= 4: uses simple left shift
  // For 4 < bits <= 8: uses bit replication (shift left, then fill lower bits with replicated high bits)
  // For bits > 8: takes the high 8 bits (shift right)
  // Examples:
  // - 4-bit value 15 (1111) becomes 11110000 (240) from simple left shift
  // - 5-bit value 31 (11111) becomes 11111111 (255), not 11111000 (248) from simple left shift
  // - 10-bit value 1023 (1111111111) becomes 11111111 (255) by taking high 8 bits
  function scaleValue(value: number, bits: number): number {
    if (bits > 8) {
      return value >> (bits - 8); // Take high 8 bits
    } else if (bits > 4) {
      return (value << (8 - bits)) | (value >> (2 * bits - 8)); // Bit replication
    } else if (bits > 0) {
      return value << (8 - bits); // Simple left shift
    } else {
      return 0;
    }
  }
  for (let i = 0; i < redLUT.length; i++) {
    redLUT[i] = scaleValue(i, red.bits);
  }
  for (let i = 0; i < greenLUT.length; i++) {
    greenLUT[i] = scaleValue(i, green.bits);
  }
  for (let i = 0; i < blueLUT.length; i++) {
    blueLUT[i] = scaleValue(i, blue.bits);
  }
  if (alphaLUT) {
    for (let i = 0; i < alphaLUT.length; i++) {
      alphaLUT[i] = scaleValue(i, alpha.bits);
    }
  }

  return { redLUT, greenLUT, blueLUT, alphaLUT };
}
