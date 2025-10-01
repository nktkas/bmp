import type { DecodeOptions, RGBImageData } from "./mod.ts";
import { type BMPHeader, getNormalizedHeaderInfo } from "./_bmpHeader.ts";
import { parseColorTable } from "./_colorTable.ts";

/**
 * Converts a BMP with BI_RGB compression to an raw RGB(A) image
 * @param bmp The BMP array to convert
 * @param header Optional pre-parsed BMP header (to avoid re-parsing)
 * @returns The raw RGB(A) image data and metadata
 */
export function BI_RGB_TO_RAW(bmp: Uint8Array, header: BMPHeader, options?: DecodeOptions): RGBImageData {
  const { biBitCount, biCompression } = getNormalizedHeaderInfo(header.infoHeader);

  if (biCompression !== 0) {
    throw new Error(`Unsupported BMP compression method: received ${biCompression}, expected 0 (BI_RGB)`);
  }

  // Process based on bit depth
  if (biBitCount === 1) {
    return decode1Bit(bmp, header);
  } else if (biBitCount === 4) {
    return decode4Bit(bmp, header);
  } else if (biBitCount === 8) {
    return decode8Bit(bmp, header);
  } else if (biBitCount === 16) {
    return decode16Bit(bmp, header);
  } else if (biBitCount === 24) {
    return decode24Bit(bmp, header);
  } else if (biBitCount === 32) {
    return decode32Bit(bmp, header, options?.removeEmptyAlpha ?? true);
  } else if (biBitCount === 64) {
    return decode64Bit(bmp, header);
  } else {
    throw new Error(`Unsupported BMP bit depth: ${biBitCount} bpp`);
  }
}

/** Decode 1 bit per pixel (monochrome) */
function decode1Bit(bmp: Uint8Array, header: BMPHeader): RGBImageData {
  const { bfOffBits } = header.fileHeader;
  const { biWidth, biHeight, biBitCount } = getNormalizedHeaderInfo(header.infoHeader);

  const palette = parseColorTable(bmp, header.infoHeader)!;
  const absHeight = Math.abs(biHeight);
  const isTopDown = biHeight < 0;
  const stride = Math.floor((biBitCount * biWidth + 31) / 32) * 4;

  const output = new Uint8Array(biWidth * absHeight * 3);

  for (let y = 0; y < absHeight; y++) {
    // Calculate source row (handle top-down vs bottom-up)
    const srcY = isTopDown ? y : (absHeight - 1 - y);
    const srcRowStart = bfOffBits + srcY * stride;

    // Calculate destination offset
    let dstOffset = y * biWidth * 3;

    for (let x = 0; x < biWidth; x++) {
      // Each byte contains 8 pixels, extract bit for current pixel
      const byte = bmp[srcRowStart + Math.floor(x / 8)];
      const color = palette[(byte >> (7 - (x % 8))) & 0x01];
      output[dstOffset++] = color.rgbRed;
      output[dstOffset++] = color.rgbGreen;
      output[dstOffset++] = color.rgbBlue;
    }
  }

  return {
    width: biWidth,
    height: absHeight,
    channels: 3,
    data: output,
  };
}

/** Decode 4 bits per pixel (16 colors) */
function decode4Bit(bmp: Uint8Array, header: BMPHeader): RGBImageData {
  const { bfOffBits } = header.fileHeader;
  const { biWidth, biHeight, biBitCount } = getNormalizedHeaderInfo(header.infoHeader);

  const palette = parseColorTable(bmp, header.infoHeader)!;
  const absHeight = Math.abs(biHeight);
  const isTopDown = biHeight < 0;
  const stride = Math.floor((biBitCount * biWidth + 31) / 32) * 4;

  const output = new Uint8Array(biWidth * absHeight * 3);

  for (let y = 0; y < absHeight; y++) {
    // Calculate source row (handle top-down vs bottom-up)
    const srcY = isTopDown ? y : (absHeight - 1 - y);
    const srcRowStart = bfOffBits + srcY * stride;

    // Calculate destination offset
    let dstOffset = y * biWidth * 3;

    for (let x = 0; x < biWidth; x++) {
      // Each byte contains 2 pixels (4 bits each), extract nibble for current pixel
      const byte = bmp[srcRowStart + Math.floor(x / 2)];
      const color = palette[(byte >> ((1 - (x % 2)) * 4)) & 0x0F];
      output[dstOffset++] = color.rgbRed;
      output[dstOffset++] = color.rgbGreen;
      output[dstOffset++] = color.rgbBlue;
    }
  }

  return {
    width: biWidth,
    height: absHeight,
    channels: 3,
    data: output,
  };
}

/** Decode 8 bits per pixel (256 colors) */
function decode8Bit(bmp: Uint8Array, header: BMPHeader): RGBImageData {
  const { bfOffBits } = header.fileHeader;
  const { biWidth, biHeight, biBitCount } = getNormalizedHeaderInfo(header.infoHeader);

  const palette = parseColorTable(bmp, header.infoHeader)!;
  const absHeight = Math.abs(biHeight);
  const isTopDown = biHeight < 0;
  const stride = Math.floor((biBitCount * biWidth + 31) / 32) * 4;

  const output = new Uint8Array(biWidth * absHeight * 3);

  for (let y = 0; y < absHeight; y++) {
    // Calculate source row (handle top-down vs bottom-up)
    const srcY = isTopDown ? y : (absHeight - 1 - y);

    // Calculate source offset and destination offset
    let srcOffset = bfOffBits + srcY * stride;
    let dstOffset = y * biWidth * 3;

    for (let x = 0; x < biWidth; x++) {
      // Direct palette lookup, one byte per pixel
      const color = palette[bmp[srcOffset++]];
      output[dstOffset++] = color.rgbRed;
      output[dstOffset++] = color.rgbGreen;
      output[dstOffset++] = color.rgbBlue;
    }
  }

  return {
    width: biWidth,
    height: absHeight,
    channels: 3,
    data: output,
  };
}

/** Lookup table for converting 5-bit color values (0-31) to 8-bit (0-255). */
const RGB555_TO_RGB888_LUT = new Uint8Array([
  0,
  8,
  16,
  25,
  33,
  41,
  49,
  58,
  66,
  74,
  82,
  90,
  99,
  107,
  115,
  123,
  132,
  140,
  148,
  156,
  165,
  173,
  181,
  189,
  197,
  206,
  214,
  222,
  230,
  239,
  247,
  255,
]);

/** Decode 16 bits per pixel (RGB555) */
function decode16Bit(bmp: Uint8Array, header: BMPHeader): RGBImageData {
  const { bfOffBits } = header.fileHeader;
  const { biWidth, biHeight, biBitCount } = getNormalizedHeaderInfo(header.infoHeader);

  const absHeight = Math.abs(biHeight);
  const isTopDown = biHeight < 0;
  const stride = Math.floor((biBitCount * biWidth + 31) / 32) * 4;

  const output = new Uint8Array(biWidth * absHeight * 3);

  for (let y = 0; y < absHeight; y++) {
    // Calculate source row (handle top-down vs bottom-up)
    const srcY = isTopDown ? y : (absHeight - 1 - y);

    // Calculate source offset and destination offset
    let srcOffset = bfOffBits + srcY * stride;
    let dstOffset = y * biWidth * 3;

    for (let x = 0; x < biWidth; x++) {
      // Read 16-bit pixel (little-endian)
      const pixel = bmp[srcOffset] | (bmp[srcOffset + 1] << 8);

      // Extract 5-bit components and convert to 8-bit using lookup table
      const r = RGB555_TO_RGB888_LUT[(pixel >> 10) & 0x1F];
      const g = RGB555_TO_RGB888_LUT[(pixel >> 5) & 0x1F];
      const b = RGB555_TO_RGB888_LUT[pixel & 0x1F];

      output[dstOffset++] = r; // R
      output[dstOffset++] = g; // G
      output[dstOffset++] = b; // B

      srcOffset += 2;
    }
  }

  return {
    width: biWidth,
    height: absHeight,
    channels: 3,
    data: output,
  };
}

/** Decode 24 bits per pixel (BGR) */
function decode24Bit(bmp: Uint8Array, header: BMPHeader): RGBImageData {
  const { bfOffBits } = header.fileHeader;
  const { biWidth, biHeight, biBitCount } = getNormalizedHeaderInfo(header.infoHeader);

  const absHeight = Math.abs(biHeight);
  const isTopDown = biHeight < 0;
  const stride = Math.floor((biBitCount * biWidth + 31) / 32) * 4;

  const output = new Uint8Array(biWidth * absHeight * 3);

  for (let y = 0; y < absHeight; y++) {
    // Calculate source row (handle top-down vs bottom-up)
    const srcY = isTopDown ? y : (absHeight - 1 - y);

    // Calculate source offset and destination offset
    let srcOffset = bfOffBits + srcY * stride;
    let dstOffset = y * biWidth * 3;

    for (let x = 0; x < biWidth; x++) {
      // Convert BGR to RGB
      const r = bmp[srcOffset + 2];
      const g = bmp[srcOffset + 1];
      const b = bmp[srcOffset];

      output[dstOffset++] = r; // R
      output[dstOffset++] = g; // G
      output[dstOffset++] = b; // B

      srcOffset += 3;
    }
  }

  return {
    width: biWidth,
    height: absHeight,
    channels: 3,
    data: output,
  };
}

/** Decode 32 bits per pixel (BGRA) */
function decode32Bit(bmp: Uint8Array, header: BMPHeader, removeEmptyAlpha: boolean = true): RGBImageData {
  const { bfOffBits } = header.fileHeader;
  const { biWidth, biHeight, biBitCount } = getNormalizedHeaderInfo(header.infoHeader);

  const absHeight = Math.abs(biHeight);
  const isTopDown = biHeight < 0;
  const stride = Math.floor((biBitCount * biWidth + 31) / 32) * 4;

  let output = new Uint8Array(biWidth * absHeight * 4);
  let hasAlpha = false;

  for (let y = 0; y < absHeight; y++) {
    // Calculate source row (handle top-down vs bottom-up)
    const srcY = isTopDown ? y : (absHeight - 1 - y);

    // Calculate source offset and destination offset
    let srcOffset = bfOffBits + srcY * stride;
    let dstOffset = y * biWidth * 4;

    for (let x = 0; x < biWidth; x++) {
      // Convert BGR(A) to RGBA
      const r = bmp[srcOffset + 2];
      const g = bmp[srcOffset + 1];
      const b = bmp[srcOffset];
      const a = bmp[srcOffset + 3];

      output[dstOffset++] = r; // R
      output[dstOffset++] = g; // G
      output[dstOffset++] = b; // B
      output[dstOffset++] = a; // A

      srcOffset += 4;

      // In the specification, 4th byte is reserved (default 0), but for a 32-bit image it often contains alpha
      // If any alpha value is non-zero, we consider the image to have alpha
      hasAlpha ||= a !== 0;
    }
  }

  // If no alpha found and removal requested, convert to RGB
  if (!hasAlpha && removeEmptyAlpha) {
    output = toRGB(output, biWidth, absHeight);
  }

  return {
    width: biWidth,
    height: absHeight,
    channels: !hasAlpha && removeEmptyAlpha ? 3 : 4,
    data: output,
  };
}

/** Remove alpha channel from RGBA data */
function toRGB(data: Uint8Array<ArrayBuffer>, width: number, height: number): Uint8Array<ArrayBuffer> {
  if (data.length !== width * height * 4) return data; // not RGBA data

  const output = new Uint8Array(width * height * 3);
  for (let i = 0, dstIdx = 0, srcIdx = 0; i < width * height; i++) {
    output[dstIdx++] = data[srcIdx++]; // R
    output[dstIdx++] = data[srcIdx++]; // G
    output[dstIdx++] = data[srcIdx++]; // B
    srcIdx++;
  }
  return output;
}

/** Decode 64 bits per pixel (BGR, but I'm not sure about the alpha channel) */
function decode64Bit(bmp: Uint8Array, header: BMPHeader): RGBImageData {
  const { bfOffBits } = header.fileHeader;
  const { biWidth, biHeight, biBitCount } = getNormalizedHeaderInfo(header.infoHeader);

  const absHeight = Math.abs(biHeight);
  const isTopDown = biHeight < 0;
  const stride = Math.floor((biBitCount * biWidth + 31) / 32) * 4;

  const output = new Uint8Array(biWidth * absHeight * 3);

  for (let y = 0; y < absHeight; y++) {
    // Calculate source row (handle top-down vs bottom-up)
    const srcY = isTopDown ? y : (absHeight - 1 - y);

    // Calculate source offset and destination offset
    let srcOffset = bfOffBits + srcY * stride;
    let dstOffset = y * biWidth * 3;

    for (let x = 0; x < biWidth; x++) {
      // Read 16-bit values (little-endian), convert BGR to RGB and scale to 8-bit
      const r = bmp[srcOffset + 4] | (bmp[srcOffset + 5] << 8);
      const g = bmp[srcOffset + 2] | (bmp[srcOffset + 3] << 8);
      const b = bmp[srcOffset] | (bmp[srcOffset + 1] << 8);

      output[dstOffset++] = r >> 8; // R
      output[dstOffset++] = g >> 8; // G
      output[dstOffset++] = b >> 8; // B

      srcOffset += 8;
    }
  }

  return {
    width: biWidth,
    height: absHeight,
    channels: 3,
    data: output,
  };
}
