/** Represents raw pixel image data (grayscale, RGB, or RGBA) */
export interface RawImageData {
  /** Width of the image in pixels */
  width: number;
  /** Height of the image in pixels */
  height: number;
  /** Number of channels: 1 (grayscale), 3 (RGB), or 4 (RGBA) */
  channels: 1 | 3 | 4;
  /** Raw pixel data buffer */
  data: Uint8Array;
}
