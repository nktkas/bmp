/** BMP file header structure (14 bytes). */
export interface BITMAPFILEHEADER {
  /** File type identifier, must be 0x4D42 ("BM" in ASCII) */
  bfType: number;
  /** Total file size in bytes including headers and pixel data */
  bfSize: number;
  /** Reserved field, must be 0 */
  bfReserved1: number;
  /** Reserved field, must be 0 */
  bfReserved2: number;
  /** Offset in bytes from file start to pixel data array */
  bfOffBits: number;
}

/** OS/2 1.x bitmap header (12 bytes). */
export interface BITMAPCOREHEADER {
  /** Size of this header in bytes (12) */
  bcSize: number;
  /** Image width in pixels */
  bcWidth: number;
  /** Image height in pixels */
  bcHeight: number;
  /** Number of color planes, must be 1 */
  bcPlanes: number;
  /** Bits per pixel */
  bcBitCount: number;
}

/** OS/2 2.x bitmap header (16 or 64 bytes). */
export interface OS22XBITMAPHEADER {
  /** Size of this header in bytes (16 or 64) */
  biSize: number;
  /** Image width in pixels */
  biWidth: number;
  /** Image height in pixels */
  biHeight: number;
  /** Number of color planes, must be 1 */
  biPlanes: number;
  /** Bits per pixel */
  biBitCount: number;
  /** Compression method */
  biCompression: number;
  /** Size of raw pixel data in bytes */
  biSizeImage: number;
  /** Horizontal resolution in pixels per meter */
  biXPelsPerMeter: number;
  /** Vertical resolution in pixels per meter */
  biYPelsPerMeter: number;
  /** Number of colors in color table */
  biClrUsed: number;
  /** Number of important colors */
  biClrImportant: number;
  /** Units for resolution fields */
  biUnits: number;
  /** Reserved field */
  biReserved: number;
  /** Recording algorithm */
  biRecording: number;
  /** Halftoning algorithm */
  biRendering: number;
  /** Size of field 1 for halftoning */
  biSize1: number;
  /** Size of field 2 for halftoning */
  biSize2: number;
  /** Color encoding */
  biColorEncoding: number;
  /** Application-defined identifier */
  biIdentifier: number;
}

/** BMP information header (40 bytes). */
export interface BITMAPINFOHEADER {
  /** Size of this header in bytes (40 for BITMAPINFOHEADER, 108 for V4, 124 for V5) */
  biSize: number;
  /** Image width in pixels, signed integer */
  biWidth: number;
  /** Image height in pixels, positive = bottom-up DIB, negative = top-down DIB */
  biHeight: number;
  /** Number of color planes, must be 1 */
  biPlanes: number;
  /** Bits per pixel */
  biBitCount: number;
  /** Compression method: 0=BI_RGB (none), 1=BI_RLE8 (8-bit RLE), 2=BI_RLE4 (4-bit RLE), 3=BI_BITFIELDS (RGB masks), 4=BI_JPEG, 5=BI_PNG */
  biCompression: number;
  /** Size of raw pixel data in bytes, can be 0 for BI_RGB bitmaps */
  biSizeImage: number;
  /** Horizontal resolution in pixels per meter, often 2835 (72 DPI) */
  biXPelsPerMeter: number;
  /** Vertical resolution in pixels per meter, often 2835 (72 DPI) */
  biYPelsPerMeter: number;
  /** Number of colors in color table, 0 means 2^biBitCount colors */
  biClrUsed: number;
  /** Number of important colors for display, 0 means all colors are important */
  biClrImportant: number;
}

/** BMP V2 header (52 bytes). */
export interface BITMAPV2INFOHEADER extends BITMAPINFOHEADER {
  /** Bit mask for red channel */
  biRedMask: number;
  /** Bit mask for green channel */
  biGreenMask: number;
  /** Bit mask for blue channel */
  biBlueMask: number;
}

/** BMP V3 header (56 bytes). */
export interface BITMAPV3INFOHEADER extends BITMAPV2INFOHEADER {
  /** Bit mask for alpha channel */
  biAlphaMask: number;
}

/** BMP V4 header (108 bytes). */
export interface BITMAPV4HEADER extends BITMAPINFOHEADER {
  /** Bit mask for red channel, e.g., 0x00FF0000 for 8-bit red in 32-bit pixel */
  bV4RedMask: number;
  /** Bit mask for green channel, e.g., 0x0000FF00 for 8-bit green in 32-bit pixel */
  bV4GreenMask: number;
  /** Bit mask for blue channel, e.g., 0x000000FF for 8-bit blue in 32-bit pixel */
  bV4BlueMask: number;
  /** Bit mask for alpha channel, e.g., 0xFF000000 for 8-bit alpha in 32-bit pixel */
  bV4AlphaMask: number;
  /** Color space type: 0=LCS_CALIBRATED_RGB, 'sRGB'=LCS_sRGB, 'Win '=LCS_WINDOWS_COLOR_SPACE, 'LINK'=LCS_PROFILE_LINKED, 'MBED'=LCS_PROFILE_EMBEDDED */
  bV4CSType: number;
  /** CIE XYZ endpoints for RGB color space calibration, FXPT2DOT30 fixed-point values */
  bV4Endpoints: {
    /** Red endpoint X, Y, Z values in CIE color space */
    ciexyzRed: { ciexyzX: number; ciexyzY: number; ciexyzZ: number };
    /** Green endpoint X, Y, Z values in CIE color space */
    ciexyzGreen: { ciexyzX: number; ciexyzY: number; ciexyzZ: number };
    /** Blue endpoint X, Y, Z values in CIE color space */
    ciexyzBlue: { ciexyzX: number; ciexyzY: number; ciexyzZ: number };
  };
  /** Gamma correction value for red channel, 16.16 fixed-point */
  bV4GammaRed: number;
  /** Gamma correction value for green channel, 16.16 fixed-point */
  bV4GammaGreen: number;
  /** Gamma correction value for blue channel, 16.16 fixed-point */
  bV4GammaBlue: number;
}

/** BMP V5 header (124 bytes). */
export interface BITMAPV5HEADER extends BITMAPV4HEADER {
  /** Rendering intent: 1=LCS_GM_BUSINESS (saturation), 2=LCS_GM_GRAPHICS (relative colorimetric), 4=LCS_GM_IMAGES (perceptual), 8=LCS_GM_ABS_COLORIMETRIC */
  bV5Intent: number;
  /** Offset in bytes from beginning of BITMAPV5HEADER to ICC profile data */
  bV5ProfileData: number;
  /** Size of embedded ICC profile data in bytes */
  bV5ProfileSize: number;
  /** Reserved field, must be 0 */
  bV5Reserved: number;
}

/** Complete BMP header structure containing both file and info headers */
export interface BMPHeader {
  /** 14-byte file header with file metadata */
  fileHeader: BITMAPFILEHEADER;
  /** Variable-size DIB header with image format details (12, 40, 52, 56, 64, 108, or 124 bytes) */
  infoHeader:
    | BITMAPCOREHEADER
    | OS22XBITMAPHEADER
    | BITMAPINFOHEADER
    | BITMAPV2INFOHEADER
    | BITMAPV3INFOHEADER
    | BITMAPV4HEADER
    | BITMAPV5HEADER;
}

/** Type guard to check if header is BITMAPCOREHEADER */
export function isBITMAPCOREHEADER(header: BMPHeader["infoHeader"]): header is BITMAPCOREHEADER {
  return "bcSize" in header && header.bcSize === 12;
}

/** Helper to get normalized BITMAPINFOHEADER from various header types */
export function getNormalizedHeaderInfo(
  header: BMPHeader["infoHeader"],
): Exclude<BMPHeader["infoHeader"], BITMAPCOREHEADER> {
  if (isBITMAPCOREHEADER(header)) {
    return {
      biSize: header.bcSize,
      biWidth: header.bcWidth,
      biHeight: header.bcHeight,
      biPlanes: header.bcPlanes,
      biBitCount: header.bcBitCount,
      biCompression: 0,
      biSizeImage: 0,
      biXPelsPerMeter: 0,
      biYPelsPerMeter: 0,
      biClrUsed: 0,
      biClrImportant: 0,
    };
  }
  return header;
}

/**
 * Parses BMP file headers from raw byte array
 * @param data Raw BMP file data as Uint8Array
 * @returns Parsed header structure with appropriate version
 * @throws {Error} If file signature is not 0x4D42 ("BM")
 */
export function parseBMPHeader(data: Uint8Array): BMPHeader {
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);

  // BITMAPFILEHEADER
  const fileHeader: BITMAPFILEHEADER = {
    bfType: view.getUint16(0, true),
    bfSize: view.getUint32(2, true),
    bfReserved1: view.getUint16(6, true),
    bfReserved2: view.getUint16(8, true),
    bfOffBits: view.getUint32(10, true),
  };

  // Check BMP signature
  if (fileHeader.bfType !== 0x4D42) {
    throw new Error("Invalid BMP signature");
  }

  // Read header size to determine type
  const headerSize = view.getUint32(14, true);

  let infoHeader:
    | BITMAPCOREHEADER
    | OS22XBITMAPHEADER
    | BITMAPINFOHEADER
    | BITMAPV2INFOHEADER
    | BITMAPV3INFOHEADER
    | BITMAPV4HEADER
    | BITMAPV5HEADER;

  // BITMAPCOREHEADER
  if (headerSize === 12) {
    infoHeader = {
      bcSize: headerSize,
      bcWidth: view.getUint16(18, true),
      bcHeight: view.getUint16(20, true),
      bcPlanes: view.getUint16(22, true),
      bcBitCount: view.getUint16(24, true),
    };
  } else if (headerSize === 16 || headerSize === 64) { // OS22XBITMAPHEADER
    infoHeader = {
      biSize: headerSize,
      biWidth: view.getInt32(18, true),
      biHeight: view.getInt32(22, true),
      biPlanes: view.getUint16(26, true),
      biBitCount: view.getUint16(28, true),
      biCompression: 0,
      biSizeImage: 0,
      biXPelsPerMeter: 0,
      biYPelsPerMeter: 0,
      biClrUsed: 0,
      biClrImportant: 0,
      biUnits: 0,
      biReserved: 0,
      biRecording: 0,
      biRendering: 0,
      biSize1: 0,
      biSize2: 0,
      biColorEncoding: 0,
      biIdentifier: 0,
    };
    if (headerSize === 64) {
      infoHeader = {
        ...infoHeader,
        biCompression: view.getUint32(30, true),
        biSizeImage: view.getUint32(34, true),
        biXPelsPerMeter: view.getInt32(38, true),
        biYPelsPerMeter: view.getInt32(42, true),
        biClrUsed: view.getUint32(46, true),
        biClrImportant: view.getUint32(50, true),
        biUnits: view.getUint16(54, true),
        biReserved: view.getUint16(56, true),
        biRecording: view.getUint16(58, true),
        biRendering: view.getUint16(60, true),
        biSize1: view.getUint32(62, true),
        biSize2: view.getUint32(66, true),
        biColorEncoding: view.getUint32(70, true),
        biIdentifier: view.getUint32(74, true),
      };
    }
  } else if (headerSize === 52) { // BITMAPV2INFOHEADER
    infoHeader = {
      // BITMAPINFOHEADER
      biSize: headerSize,
      biWidth: view.getInt32(18, true),
      biHeight: view.getInt32(22, true),
      biPlanes: view.getUint16(26, true),
      biBitCount: view.getUint16(28, true),
      biCompression: view.getUint32(30, true),
      biSizeImage: view.getUint32(34, true),
      biXPelsPerMeter: view.getInt32(38, true),
      biYPelsPerMeter: view.getInt32(42, true),
      biClrUsed: view.getUint32(46, true),
      biClrImportant: view.getUint32(50, true),
      // BITMAPV2INFOHEADER
      biRedMask: view.getUint32(54, true),
      biGreenMask: view.getUint32(58, true),
      biBlueMask: view.getUint32(62, true),
    };
  } else if (headerSize === 56) { // BITMAPV3INFOHEADER
    infoHeader = {
      // BITMAPINFOHEADER
      biSize: headerSize,
      biWidth: view.getInt32(18, true),
      biHeight: view.getInt32(22, true),
      biPlanes: view.getUint16(26, true),
      biBitCount: view.getUint16(28, true),
      biCompression: view.getUint32(30, true),
      biSizeImage: view.getUint32(34, true),
      biXPelsPerMeter: view.getInt32(38, true),
      biYPelsPerMeter: view.getInt32(42, true),
      biClrUsed: view.getUint32(46, true),
      biClrImportant: view.getUint32(50, true),
      // BITMAPV2INFOHEADER
      biRedMask: view.getUint32(54, true),
      biGreenMask: view.getUint32(58, true),
      biBlueMask: view.getUint32(62, true),
      // BITMAPV3INFOHEADER
      biAlphaMask: view.getUint32(66, true),
    };
  } else if (headerSize === 108) { // BITMAPV4HEADER
    infoHeader = {
      // BITMAPINFOHEADER
      biSize: headerSize,
      biWidth: view.getInt32(18, true),
      biHeight: view.getInt32(22, true),
      biPlanes: view.getUint16(26, true),
      biBitCount: view.getUint16(28, true),
      biCompression: view.getUint32(30, true),
      biSizeImage: view.getUint32(34, true),
      biXPelsPerMeter: view.getInt32(38, true),
      biYPelsPerMeter: view.getInt32(42, true),
      biClrUsed: view.getUint32(46, true),
      biClrImportant: view.getUint32(50, true),
      // BITMAPV4HEADER
      bV4RedMask: view.getUint32(54, true),
      bV4GreenMask: view.getUint32(58, true),
      bV4BlueMask: view.getUint32(62, true),
      bV4AlphaMask: view.getUint32(66, true),
      bV4CSType: view.getUint32(70, true),
      bV4Endpoints: {
        ciexyzRed: {
          ciexyzX: view.getInt32(74, true),
          ciexyzY: view.getInt32(78, true),
          ciexyzZ: view.getInt32(82, true),
        },
        ciexyzGreen: {
          ciexyzX: view.getInt32(86, true),
          ciexyzY: view.getInt32(90, true),
          ciexyzZ: view.getInt32(94, true),
        },
        ciexyzBlue: {
          ciexyzX: view.getInt32(98, true),
          ciexyzY: view.getInt32(102, true),
          ciexyzZ: view.getInt32(106, true),
        },
      },
      bV4GammaRed: view.getUint32(110, true),
      bV4GammaGreen: view.getUint32(114, true),
      bV4GammaBlue: view.getUint32(118, true),
    };
  } else if (headerSize === 124) { // BITMAPV5HEADER
    infoHeader = {
      // BITMAPINFOHEADER
      biSize: headerSize,
      biWidth: view.getInt32(18, true),
      biHeight: view.getInt32(22, true),
      biPlanes: view.getUint16(26, true),
      biBitCount: view.getUint16(28, true),
      biCompression: view.getUint32(30, true),
      biSizeImage: view.getUint32(34, true),
      biXPelsPerMeter: view.getInt32(38, true),
      biYPelsPerMeter: view.getInt32(42, true),
      biClrUsed: view.getUint32(46, true),
      biClrImportant: view.getUint32(50, true),
      // BITMAPV4HEADER
      bV4RedMask: view.getUint32(54, true),
      bV4GreenMask: view.getUint32(58, true),
      bV4BlueMask: view.getUint32(62, true),
      bV4AlphaMask: view.getUint32(66, true),
      bV4CSType: view.getUint32(70, true),
      bV4Endpoints: {
        ciexyzRed: {
          ciexyzX: view.getInt32(74, true),
          ciexyzY: view.getInt32(78, true),
          ciexyzZ: view.getInt32(82, true),
        },
        ciexyzGreen: {
          ciexyzX: view.getInt32(86, true),
          ciexyzY: view.getInt32(90, true),
          ciexyzZ: view.getInt32(94, true),
        },
        ciexyzBlue: {
          ciexyzX: view.getInt32(98, true),
          ciexyzY: view.getInt32(102, true),
          ciexyzZ: view.getInt32(106, true),
        },
      },
      bV4GammaRed: view.getUint32(110, true),
      bV4GammaGreen: view.getUint32(114, true),
      bV4GammaBlue: view.getUint32(118, true),
      // BITMAPV5HEADER
      bV5Intent: view.getUint32(122, true),
      bV5ProfileData: view.getUint32(126, true),
      bV5ProfileSize: view.getUint32(130, true),
      bV5Reserved: view.getUint32(134, true),
    };
  } else if (headerSize >= 40) { // BITMAPINFOHEADER or any larger header
    infoHeader = {
      biSize: headerSize,
      biWidth: view.getInt32(18, true),
      biHeight: view.getInt32(22, true),
      biPlanes: view.getUint16(26, true),
      biBitCount: view.getUint16(28, true),
      biCompression: view.getUint32(30, true),
      biSizeImage: view.getUint32(34, true),
      biXPelsPerMeter: view.getInt32(38, true),
      biYPelsPerMeter: view.getInt32(42, true),
      biClrUsed: view.getUint32(46, true),
      biClrImportant: view.getUint32(50, true),
    };
  } else {
    throw new Error(`Unsupported BMP header size: ${headerSize} bytes`);
  }

  return { fileHeader, infoHeader };
}
