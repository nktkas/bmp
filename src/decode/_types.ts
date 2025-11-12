/** Options for decoding BMP images */
export interface DecodeOptions {
  /**
   * Desired number of channels in the output.
   * - 3 (RGB) - Convert to RGB format
   * - 4 (RGBA) - Convert to RGBA format
   *
   * Default: Auto-detected from image data
   * - Images with alpha channel → 4 (RGBA)
   * - Grayscale images → 1 (grayscale)
   * - All other images → 3 (RGB)
   *
   * Performance: Using `desiredChannels` parameter is faster than manual conversion after decoding.
   */
  desiredChannels?: 3 | 4;
}
