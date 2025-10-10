import type { RGBImageData } from "./mod.ts";
import { type BMPHeader, getNormalizedHeaderInfo } from "./_bmpHeader.ts";
import { extractColorTable } from "./_colorTable.ts";

/**
 * Converts a BMP with BI_RGB compression to an raw RGB(A) image
 * @param bmp The BMP array to convert
 * @param header Parsed BMP header
 * @returns The raw RGB(A) image data and metadata
 */
export function BI_RGB_TO_RAW(bmp: Uint8Array, header: BMPHeader): RGBImageData {
  // 0. Get header info and validate
  const { biBitCount, biCompression } = getNormalizedHeaderInfo(header.infoHeader);

  if (biCompression !== 0) {
    throw new Error(`Unsupported BMP compression method: received ${biCompression}, expected 0 (BI_RGB)`);
  }

  // 1. Route to appropriate decoder based on bit depth
  if (biBitCount === 1) {
    return decode1Bit(bmp, header);
  } else if (biBitCount === 2) {
    return decode2Bit(bmp, header);
  } else if (biBitCount === 4) {
    return decode4Bit(bmp, header);
  } else if (biBitCount === 8) {
    return decode8Bit(bmp, header);
  } else if (biBitCount === 16) {
    return decode16Bit(bmp, header);
  } else if (biBitCount === 24) {
    return decode24Bit(bmp, header);
  } else if (biBitCount === 32) {
    return decode32Bit(bmp, header);
  } else if (biBitCount === 64) {
    return decode64Bit(bmp, header);
  } else {
    throw new Error(`Unsupported BMP bit depth: ${biBitCount} bpp`);
  }
}

/** Decode 1 bit per pixel (monochrome) */
function decode1Bit(bmp: Uint8Array, header: BMPHeader): RGBImageData {
  // 0. Get header data
  const { bfOffBits } = header.fileHeader;
  const { biWidth, biHeight, biBitCount } = getNormalizedHeaderInfo(header.infoHeader);

  // 1. Calculate image dimensions and orientation
  const absWidth = Math.abs(biWidth);
  const absHeight = Math.abs(biHeight);
  const isTopDown = biHeight < 0;

  // 2. Calculate row stride and extract color palette
  const stride = Math.ceil((biBitCount * absWidth) / 32) * 4;
  const palette = extractColorTable(bmp, header)!;

  // 3. Check if palette is grayscale (R=G=B for all colors)
  const isGrayscale = palette.every((c) => c.rgbRed === c.rgbGreen && c.rgbGreen === c.rgbBlue);
  const channels = isGrayscale ? 1 : 3;

  // 4. Allocate output buffer
  const output = new Uint8Array(absWidth * absHeight * channels);

  // 5. Process pixels
  if (isGrayscale) { // For grayscale, output single channel
    // Precompute palette values
    const color0 = palette[0].rgbRed;
    const color1 = palette[1].rgbRed;

    for (let y = 0; y < absHeight; y++) {
      const srcY = isTopDown ? y : (absHeight - 1 - y);
      const srcRowStart = bfOffBits + srcY * stride;
      let dstOffset = y * absWidth;
      let srcOffset = srcRowStart;

      // Process full bytes
      const fullBytes = Math.floor(absWidth / 8);
      for (let b = 0; b < fullBytes; b++) {
        const byte = bmp[srcOffset++];
        output[dstOffset++] = (byte & 0x80) ? color1 : color0;
        output[dstOffset++] = (byte & 0x40) ? color1 : color0;
        output[dstOffset++] = (byte & 0x20) ? color1 : color0;
        output[dstOffset++] = (byte & 0x10) ? color1 : color0;
        output[dstOffset++] = (byte & 0x08) ? color1 : color0;
        output[dstOffset++] = (byte & 0x04) ? color1 : color0;
        output[dstOffset++] = (byte & 0x02) ? color1 : color0;
        output[dstOffset++] = (byte & 0x01) ? color1 : color0;
      }

      // Process remaining pixels
      let x = fullBytes * 8;
      if (x < absWidth) {
        const byte = bmp[srcOffset];
        for (let bit = 7; x < absWidth; bit--, x++) {
          output[dstOffset++] = (byte >> bit) & 0x01 ? color1 : color0;
        }
      }
    }
  } else { // For color, output 3 channels (RGB)
    // Precompute palette values
    const color0R = palette[0].rgbRed;
    const color0G = palette[0].rgbGreen;
    const color0B = palette[0].rgbBlue;
    const color1R = palette[1].rgbRed;
    const color1G = palette[1].rgbGreen;
    const color1B = palette[1].rgbBlue;

    for (let y = 0; y < absHeight; y++) {
      const srcY = isTopDown ? y : (absHeight - 1 - y);
      const srcRowStart = bfOffBits + srcY * stride;
      let dstOffset = y * absWidth * 3;
      let srcOffset = srcRowStart;

      // Process full bytes
      const fullBytes = Math.floor(absWidth / 8);
      for (let b = 0; b < fullBytes; b++) {
        const byte = bmp[srcOffset++];
        output[dstOffset++] = (byte & 0x80) ? color1R : color0R;
        output[dstOffset++] = (byte & 0x80) ? color1G : color0G;
        output[dstOffset++] = (byte & 0x80) ? color1B : color0B;
        output[dstOffset++] = (byte & 0x40) ? color1R : color0R;
        output[dstOffset++] = (byte & 0x40) ? color1G : color0G;
        output[dstOffset++] = (byte & 0x40) ? color1B : color0B;
        output[dstOffset++] = (byte & 0x20) ? color1R : color0R;
        output[dstOffset++] = (byte & 0x20) ? color1G : color0G;
        output[dstOffset++] = (byte & 0x20) ? color1B : color0B;
        output[dstOffset++] = (byte & 0x10) ? color1R : color0R;
        output[dstOffset++] = (byte & 0x10) ? color1G : color0G;
        output[dstOffset++] = (byte & 0x10) ? color1B : color0B;
        output[dstOffset++] = (byte & 0x08) ? color1R : color0R;
        output[dstOffset++] = (byte & 0x08) ? color1G : color0G;
        output[dstOffset++] = (byte & 0x08) ? color1B : color0B;
        output[dstOffset++] = (byte & 0x04) ? color1R : color0R;
        output[dstOffset++] = (byte & 0x04) ? color1G : color0G;
        output[dstOffset++] = (byte & 0x04) ? color1B : color0B;
        output[dstOffset++] = (byte & 0x02) ? color1R : color0R;
        output[dstOffset++] = (byte & 0x02) ? color1G : color0G;
        output[dstOffset++] = (byte & 0x02) ? color1B : color0B;
        output[dstOffset++] = (byte & 0x01) ? color1R : color0R;
        output[dstOffset++] = (byte & 0x01) ? color1G : color0G;
        output[dstOffset++] = (byte & 0x01) ? color1B : color0B;
      }

      // Process remaining pixels
      let x = fullBytes * 8;
      if (x < absWidth) {
        const byte = bmp[srcOffset];
        for (let bit = 7; x < absWidth; bit--, x++) {
          const colorIdx = (byte >> bit) & 0x01;
          output[dstOffset++] = colorIdx ? color1R : color0R;
          output[dstOffset++] = colorIdx ? color1G : color0G;
          output[dstOffset++] = colorIdx ? color1B : color0B;
        }
      }
    }
  }

  return {
    width: absWidth,
    height: absHeight,
    channels: channels,
    data: output,
  };
}

/** Decode 2 bits per pixel (4 colors) */
function decode2Bit(bmp: Uint8Array, header: BMPHeader): RGBImageData {
  // 0. Get header data
  const { bfOffBits } = header.fileHeader;
  const { biWidth, biHeight, biBitCount } = getNormalizedHeaderInfo(header.infoHeader);

  // 1. Calculate image dimensions and orientation
  const absWidth = Math.abs(biWidth);
  const absHeight = Math.abs(biHeight);
  const isTopDown = biHeight < 0;

  // 2. Calculate row stride and extract color palette
  const stride = Math.ceil((biBitCount * absWidth) / 32) * 4;
  const palette = extractColorTable(bmp, header)!;

  // 3. Allocate output buffer
  const output = new Uint8Array(absWidth * absHeight * 3);

  // 4. Process pixels (palette indices to RGB)
  for (let y = 0; y < absHeight; y++) {
    const srcY = isTopDown ? y : (absHeight - 1 - y);
    const srcRowStart = bfOffBits + srcY * stride;
    let dstOffset = y * absWidth * 3;
    let srcOffset = srcRowStart;

    // Process full bytes (4 pixels per byte)
    const fullBytes = Math.floor(absWidth / 4);
    for (let b = 0; b < fullBytes; b++) {
      const byte = bmp[srcOffset++];

      const c0 = palette[(byte >> 6) & 0x03];
      output[dstOffset++] = c0.rgbRed;
      output[dstOffset++] = c0.rgbGreen;
      output[dstOffset++] = c0.rgbBlue;

      const c1 = palette[(byte >> 4) & 0x03];
      output[dstOffset++] = c1.rgbRed;
      output[dstOffset++] = c1.rgbGreen;
      output[dstOffset++] = c1.rgbBlue;

      const c2 = palette[(byte >> 2) & 0x03];
      output[dstOffset++] = c2.rgbRed;
      output[dstOffset++] = c2.rgbGreen;
      output[dstOffset++] = c2.rgbBlue;

      const c3 = palette[byte & 0x03];
      output[dstOffset++] = c3.rgbRed;
      output[dstOffset++] = c3.rgbGreen;
      output[dstOffset++] = c3.rgbBlue;
    }

    // Process remaining pixels
    let x = fullBytes * 4;
    if (x < absWidth) {
      const byte = bmp[srcOffset];
      for (let shift = 6; x < absWidth; shift -= 2, x++) {
        const color = palette[(byte >> shift) & 0x03];
        output[dstOffset++] = color.rgbRed;
        output[dstOffset++] = color.rgbGreen;
        output[dstOffset++] = color.rgbBlue;
      }
    }
  }

  return {
    width: absWidth,
    height: absHeight,
    channels: 3,
    data: output,
  };
}

/** Decode 4 bits per pixel (16 colors) */
function decode4Bit(bmp: Uint8Array, header: BMPHeader): RGBImageData {
  // 0. Get header data
  const { bfOffBits } = header.fileHeader;
  const { biWidth, biHeight, biBitCount } = getNormalizedHeaderInfo(header.infoHeader);

  // 1. Calculate image dimensions and orientation
  const absWidth = Math.abs(biWidth);
  const absHeight = Math.abs(biHeight);
  const isTopDown = biHeight < 0;

  // 2. Calculate row stride and extract color palette
  const stride = Math.ceil((biBitCount * absWidth) / 32) * 4;
  const palette = extractColorTable(bmp, header)!;

  // 3. Allocate output buffer
  const output = new Uint8Array(absWidth * absHeight * 3);

  // 4. Process pixels (palette indices to RGB)
  for (let y = 0; y < absHeight; y++) {
    const srcY = isTopDown ? y : (absHeight - 1 - y);
    const srcRowStart = bfOffBits + srcY * stride;
    let dstOffset = y * absWidth * 3;
    let srcOffset = srcRowStart;

    // Process full bytes (2 pixels per byte)
    const fullBytes = Math.floor(absWidth / 2);
    for (let b = 0; b < fullBytes; b++) {
      const byte = bmp[srcOffset++];

      const c0 = palette[(byte >> 4) & 0x0F];
      output[dstOffset++] = c0.rgbRed;
      output[dstOffset++] = c0.rgbGreen;
      output[dstOffset++] = c0.rgbBlue;

      const c1 = palette[byte & 0x0F];
      output[dstOffset++] = c1.rgbRed;
      output[dstOffset++] = c1.rgbGreen;
      output[dstOffset++] = c1.rgbBlue;
    }

    // Process remaining pixel (if width is odd)
    if (absWidth % 2 !== 0) {
      const byte = bmp[srcOffset];
      const color = palette[(byte >> 4) & 0x0F];
      output[dstOffset++] = color.rgbRed;
      output[dstOffset++] = color.rgbGreen;
      output[dstOffset++] = color.rgbBlue;
    }
  }

  return {
    width: absWidth,
    height: absHeight,
    channels: 3,
    data: output,
  };
}

/** Decode 8 bits per pixel (256 colors) */
function decode8Bit(bmp: Uint8Array, header: BMPHeader): RGBImageData {
  // 0. Get header data
  const { bfOffBits } = header.fileHeader;
  const { biWidth, biHeight, biBitCount } = getNormalizedHeaderInfo(header.infoHeader);

  // 1. Calculate image dimensions and orientation
  const absWidth = Math.abs(biWidth);
  const absHeight = Math.abs(biHeight);
  const isTopDown = biHeight < 0;

  // 2. Calculate row stride and extract color palette
  const stride = Math.ceil((biBitCount * absWidth) / 32) * 4;
  const palette = extractColorTable(bmp, header)!;

  // 3. Allocate output buffer
  const output = new Uint8Array(absWidth * absHeight * 3);

  // 4. Process pixels (palette indices to RGB)
  for (let y = 0; y < absHeight; y++) {
    const srcY = isTopDown ? y : (absHeight - 1 - y);
    let srcOffset = bfOffBits + srcY * stride;
    let dstOffset = y * absWidth * 3;

    for (let x = 0; x < absWidth; x++) {
      // Direct palette lookup (1 byte per pixel)
      const color = palette[bmp[srcOffset++]];
      output[dstOffset++] = color.rgbRed;
      output[dstOffset++] = color.rgbGreen;
      output[dstOffset++] = color.rgbBlue;
    }
  }

  return {
    width: absWidth,
    height: absHeight,
    channels: 3,
    data: output,
  };
}

/** Lookup table for converting 5-bit color values (0-31) to 8-bit (0-255). */
const RGB555_TO_RGB888_LUT = new Uint8Array(32);
for (let i = 0; i < 32; i++) RGB555_TO_RGB888_LUT[i] = Math.round((i * 255) / 31);

/** Decode 16 bits per pixel (RGB555) */
function decode16Bit(bmp: Uint8Array, header: BMPHeader): RGBImageData {
  // 0. Get header data
  const { bfOffBits } = header.fileHeader;
  const { biWidth, biHeight, biBitCount } = getNormalizedHeaderInfo(header.infoHeader);

  // 1. Calculate image dimensions and orientation
  const absWidth = Math.abs(biWidth);
  const absHeight = Math.abs(biHeight);
  const isTopDown = biHeight < 0;

  // 2. Calculate row stride
  const stride = Math.ceil((biBitCount * absWidth) / 32) * 4;

  // 3. Allocate output buffer
  const output = new Uint8Array(absWidth * absHeight * 3);

  // 4. Process pixels (RGB555 to RGB888)
  for (let y = 0; y < absHeight; y++) {
    const srcY = isTopDown ? y : (absHeight - 1 - y);
    let srcOffset = bfOffBits + srcY * stride;
    let dstOffset = y * absWidth * 3;

    for (let x = 0; x < absWidth; x++) {
      // Read 16-bit pixel (little-endian)
      const pixel = bmp[srcOffset] | (bmp[srcOffset + 1] << 8);

      // Extract 5-bit components and convert to 8-bit using lookup table
      const r = RGB555_TO_RGB888_LUT[(pixel >> 10) & 0x1F];
      const g = RGB555_TO_RGB888_LUT[(pixel >> 5) & 0x1F];
      const b = RGB555_TO_RGB888_LUT[pixel & 0x1F];

      output[dstOffset++] = r;
      output[dstOffset++] = g;
      output[dstOffset++] = b;

      srcOffset += 2;
    }
  }

  return {
    width: absWidth,
    height: absHeight,
    channels: 3,
    data: output,
  };
}

/** Decode 24 bits per pixel (BGR) */
function decode24Bit(bmp: Uint8Array, header: BMPHeader): RGBImageData {
  // 0. Get header data
  const { bfOffBits } = header.fileHeader;
  const { biWidth, biHeight, biBitCount } = getNormalizedHeaderInfo(header.infoHeader);

  // 1. Calculate image dimensions and orientation
  const absWidth = Math.abs(biWidth);
  const absHeight = Math.abs(biHeight);
  const isTopDown = biHeight < 0;

  // 2. Calculate row stride
  const stride = Math.ceil((biBitCount * absWidth) / 32) * 4;

  // 3. Allocate output buffer
  const output = new Uint8Array(absWidth * absHeight * 3);

  // 4. Process pixels (BGR to RGB)
  for (let y = 0; y < absHeight; y++) {
    const srcY = isTopDown ? y : (absHeight - 1 - y);
    let srcOffset = bfOffBits + srcY * stride;
    let dstOffset = y * absWidth * 3;

    for (let x = 0; x < absWidth; x++) {
      // Convert BGR to RGB
      const r = bmp[srcOffset + 2];
      const g = bmp[srcOffset + 1];
      const b = bmp[srcOffset];

      output[dstOffset++] = r;
      output[dstOffset++] = g;
      output[dstOffset++] = b;

      srcOffset += 3;
    }
  }

  return {
    width: absWidth,
    height: absHeight,
    channels: 3,
    data: output,
  };
}

/** Decode 32 bits per pixel (BGRA) */
function decode32Bit(bmp: Uint8Array, header: BMPHeader): RGBImageData {
  // 0. Get header data
  const { bfOffBits } = header.fileHeader;
  const { biWidth, biHeight, biBitCount } = getNormalizedHeaderInfo(header.infoHeader);

  // 1. Calculate image dimensions and orientation
  const absWidth = Math.abs(biWidth);
  const absHeight = Math.abs(biHeight);
  const isTopDown = biHeight < 0;

  // 2. Calculate row stride
  const stride = Math.ceil((biBitCount * absWidth) / 32) * 4;

  // 3. Check if alpha channel is present (scan all alpha bytes first)
  let hasAlpha = false;
  for (let y = 0; y < absHeight; y++) {
    const srcY = isTopDown ? y : (absHeight - 1 - y);
    let srcOffset = bfOffBits + srcY * stride + 3; // Start at alpha byte

    for (let x = 0; x < absWidth; x++) {
      if (bmp[srcOffset] !== 0) {
        hasAlpha = true;
        break;
      }
      srcOffset += 4;
    }
    if (hasAlpha) break;
  }

  // 4. Allocate output buffer based on alpha presence
  const channels = hasAlpha ? 4 : 3;
  const output = new Uint8Array(absWidth * absHeight * channels);

  // 5. Process pixels (BGRA to RGB(A))
  if (hasAlpha) {
    for (let y = 0; y < absHeight; y++) {
      const srcY = isTopDown ? y : (absHeight - 1 - y);
      let srcOffset = bfOffBits + srcY * stride;
      let dstOffset = y * absWidth * 4;

      for (let x = 0; x < absWidth; x++) {
        output[dstOffset++] = bmp[srcOffset + 2]; // R
        output[dstOffset++] = bmp[srcOffset + 1]; // G
        output[dstOffset++] = bmp[srcOffset]; // B
        output[dstOffset++] = bmp[srcOffset + 3]; // A
        srcOffset += 4;
      }
    }
  } else {
    for (let y = 0; y < absHeight; y++) {
      const srcY = isTopDown ? y : (absHeight - 1 - y);
      let srcOffset = bfOffBits + srcY * stride;
      let dstOffset = y * absWidth * 3;

      for (let x = 0; x < absWidth; x++) {
        output[dstOffset++] = bmp[srcOffset + 2]; // R
        output[dstOffset++] = bmp[srcOffset + 1]; // G
        output[dstOffset++] = bmp[srcOffset]; // B
        srcOffset += 4;
      }
    }
  }

  return {
    width: absWidth,
    height: absHeight,
    channels: channels,
    data: output,
  };
}

/** Decode 64 bits per pixel (16-bit BGRA s2.13 float, linear to sRGB) */
function decode64Bit(bmp: Uint8Array, header: BMPHeader): RGBImageData {
  // 0. Get header data
  const { bfOffBits } = header.fileHeader;
  const { biWidth, biHeight, biBitCount } = getNormalizedHeaderInfo(header.infoHeader);

  // 1. Calculate image dimensions and orientation
  const absWidth = Math.abs(biWidth);
  const absHeight = Math.abs(biHeight);
  const isTopDown = biHeight < 0;

  // 2. Calculate row stride
  const stride = Math.ceil((biBitCount * absWidth) / 32) * 4;

  // 3. Allocate output buffer
  const output = new Uint8Array(absWidth * absHeight * 4);

  // 4. Process pixels (s2.13 linear to sRGB)
  for (let y = 0; y < absHeight; y++) {
    const srcY = isTopDown ? y : (absHeight - 1 - y);
    let srcOffset = bfOffBits + srcY * stride;
    let dstOffset = y * absWidth * 4;

    for (let x = 0; x < absWidth; x++) {
      // Read as unsigned 16-bit (little-endian)
      const b = bmp[srcOffset] | (bmp[srcOffset + 1] << 8);
      const g = bmp[srcOffset + 2] | (bmp[srcOffset + 3] << 8);
      const r = bmp[srcOffset + 4] | (bmp[srcOffset + 5] << 8);
      const a = bmp[srcOffset + 6] | (bmp[srcOffset + 7] << 8);

      // Convert to signed (sign-extend from 16-bit)
      const rs = (r & 0x8000) ? (r | 0xFFFF0000) : r;
      const gs = (g & 0x8000) ? (g | 0xFFFF0000) : g;
      const bs = (b & 0x8000) ? (b | 0xFFFF0000) : b;
      const as = (a & 0x8000) ? (a | 0xFFFF0000) : a;

      // s2.13 format: 2 integer bits, 13 fractional bits (-4.0 to +4.0 range)
      const rf = rs / 8192;
      const gf = gs / 8192;
      const bf = bs / 8192;
      const af = as / 8192;

      // Clamp to [0, 1] range
      const rc = Math.max(0, Math.min(1, rf));
      const gc = Math.max(0, Math.min(1, gf));
      const bc = Math.max(0, Math.min(1, bf));
      const ac = Math.max(0, Math.min(1, af));

      // Apply sRGB gamma to RGB (alpha remains linear)
      output[dstOffset++] = Math.round(linearToSRGB(rc) * 255);
      output[dstOffset++] = Math.round(linearToSRGB(gc) * 255);
      output[dstOffset++] = Math.round(linearToSRGB(bc) * 255);
      output[dstOffset++] = Math.round(ac * 255);

      srcOffset += 8;
    }
  }

  return {
    width: absWidth,
    height: absHeight,
    channels: 4,
    data: output,
  };
}

/** Convert linear color to sRGB gamma-corrected color */
function linearToSRGB(linear: number): number {
  if (linear <= 0.0031308) {
    return linear * 12.92;
  } else {
    return 1.055 * Math.pow(linear, 1 / 2.4) - 0.055;
  }
}
