/**
 * @module
 * Color quantization for reducing images to a limited palette.
 *
 * Uses the Median Cut algorithm to find the best N colors for an image,
 * and a K-d tree for fast nearest-neighbor lookup when mapping pixels
 * to palette indices.
 */

import type { Color, RawImageData } from "../common.ts";

// ============================================================================
// K-d Tree for fast nearest-color search
// ============================================================================

/** Node in a K-d tree partitioning RGB color space. */
class KdNode {
  color: [number, number, number];
  index: number;
  left: KdNode | null = null;
  right: KdNode | null = null;

  constructor(color: [number, number, number], index: number) {
    this.color = color;
    this.index = index;
  }
}

/** K-d tree for efficient nearest-color search in RGB space. */
class KdTree {
  private root: KdNode | null = null;

  constructor(palette: Color[]) {
    const points: { color: [number, number, number]; index: number }[] = [];
    for (let i = 0; i < palette.length; i++) {
      points.push({
        color: [palette[i].red, palette[i].green, palette[i].blue],
        index: i,
      });
    }
    this.root = this.buildTree(points, 0);
  }

  private buildTree(
    points: { color: [number, number, number]; index: number }[],
    depth: number,
  ): KdNode | null {
    if (points.length === 0) return null;

    // Alternate splitting axis: 0=red, 1=green, 2=blue
    const axis = depth % 3;
    points.sort((a, b) => a.color[axis] - b.color[axis]);

    const median = Math.floor(points.length / 2);
    const node = new KdNode(points[median].color, points[median].index);
    node.left = this.buildTree(points.slice(0, median), depth + 1);
    node.right = this.buildTree(points.slice(median + 1), depth + 1);

    return node;
  }

  /** Finds the palette index of the color closest to `target` in RGB space. */
  findNearest(target: [number, number, number]): number {
    let bestNode: KdNode | null = null;
    let bestDistance = Infinity;

    const search = (node: KdNode | null, depth: number) => {
      if (node === null) return;

      const dr = target[0] - node.color[0];
      const dg = target[1] - node.color[1];
      const db = target[2] - node.color[2];
      const distance = dr * dr + dg * dg + db * db;

      if (distance < bestDistance) {
        bestDistance = distance;
        bestNode = node;
        if (distance === 0) return; // Exact match
      }

      const axis = depth % 3;
      const diff = target[axis] - node.color[axis];

      // Search the nearer subtree first
      const near = diff < 0 ? node.left : node.right;
      const far = diff < 0 ? node.right : node.left;

      search(near, depth + 1);

      // Only search the farther subtree if it could contain a closer point
      if (diff * diff < bestDistance) {
        search(far, depth + 1);
      }
    };

    search(this.root, 0);
    return bestNode!.index;
  }
}

// ============================================================================
// Median Cut algorithm
// ============================================================================

/** A box of colors in RGB space, used by the Median Cut algorithm. */
interface ColorBox {
  colors: number[]; // Packed RGB values: (r << 16) | (g << 8) | b
  rMin: number;
  rMax: number;
  gMin: number;
  gMax: number;
  bMin: number;
  bMax: number;
}

/** Creates a box from a set of packed RGB colors, computing the bounding range. */
function createColorBox(colors: number[]): ColorBox {
  let rMin = 255, rMax = 0;
  let gMin = 255, gMax = 0;
  let bMin = 255, bMax = 0;

  for (const packed of colors) {
    const r = (packed >> 16) & 0xFF;
    const g = (packed >> 8) & 0xFF;
    const b = packed & 0xFF;
    rMin = Math.min(rMin, r);
    rMax = Math.max(rMax, r);
    gMin = Math.min(gMin, g);
    gMax = Math.max(gMax, g);
    bMin = Math.min(bMin, b);
    bMax = Math.max(bMax, b);
  }

  return { colors, rMin, rMax, gMin, gMax, bMin, bMax };
}

/** Splits a box along its longest color axis at the median. */
function splitColorBox(box: ColorBox): [ColorBox, ColorBox] {
  const rRange = box.rMax - box.rMin;
  const gRange = box.gMax - box.gMin;
  const bRange = box.bMax - box.bMin;

  // Sort along the axis with the widest range
  if (rRange >= gRange && rRange >= bRange) {
    box.colors.sort((a, b) => ((a >> 16) & 0xFF) - ((b >> 16) & 0xFF));
  } else if (gRange >= bRange) {
    box.colors.sort((a, b) => ((a >> 8) & 0xFF) - ((b >> 8) & 0xFF));
  } else {
    box.colors.sort((a, b) => (a & 0xFF) - (b & 0xFF));
  }

  const median = Math.floor(box.colors.length / 2);
  return [
    createColorBox(box.colors.slice(0, median)),
    createColorBox(box.colors.slice(median)),
  ];
}

/** Computes the average color of all colors in a box. */
function getAverageColor(box: ColorBox): Color {
  let rSum = 0, gSum = 0, bSum = 0;
  for (const packed of box.colors) {
    rSum += (packed >> 16) & 0xFF;
    gSum += (packed >> 8) & 0xFF;
    bSum += packed & 0xFF;
  }
  const n = box.colors.length;
  return {
    red: Math.round(rSum / n),
    green: Math.round(gSum / n),
    blue: Math.round(bSum / n),
  };
}

// ============================================================================
// Public API
// ============================================================================

/**
 * Generates an evenly-spaced grayscale palette.
 *
 * @param numColors - Number of colors (e.g. 2, 16, or 256).
 * @returns Array of grayscale colors.
 */
export function generateGrayscalePalette(numColors: number): Color[] {
  const palette: Color[] = [];

  for (let i = 0; i < numColors; i++) {
    // Linear interpolation: first entry = 0, last entry = 255
    const gray = numColors === 1 ? 0 : Math.round((i * 255) / (numColors - 1));
    palette.push({ red: gray, green: gray, blue: gray });
  }

  return palette;
}

/**
 * Generates an optimal color palette using the Median Cut algorithm.
 *
 * @param raw - Source image (RGB or RGBA).
 * @param numColors - Target palette size (e.g. 2, 16, 256).
 * @returns Array of representative colors.
 */
export function generatePalette(raw: RawImageData, numColors: number): Color[] {
  // Extract unique colors as packed integers
  const uniqueSet = new Set<number>();
  for (let i = 0; i < raw.data.length; i += raw.channels) {
    const r = raw.data[i];
    const g = raw.data[i + 1];
    const b = raw.data[i + 2];
    uniqueSet.add((r << 16) | (g << 8) | b);
  }
  const uniqueColors = Array.from(uniqueSet);

  // If fewer unique colors than target, use them directly
  if (uniqueColors.length <= numColors) {
    const palette = uniqueColors.map((packed) => ({
      red: (packed >> 16) & 0xFF,
      green: (packed >> 8) & 0xFF,
      blue: packed & 0xFF,
    }));
    while (palette.length < numColors) {
      palette.push({ red: 0, green: 0, blue: 0 });
    }
    return palette;
  }

  // Median Cut: repeatedly split the largest box until we have enough
  const boxes = [createColorBox(uniqueColors)];

  while (boxes.length < numColors) {
    // Find the box with the widest color range
    let maxRange = -1;
    let maxIndex = 0;
    for (let i = 0; i < boxes.length; i++) {
      const range = Math.max(
        boxes[i].rMax - boxes[i].rMin,
        boxes[i].gMax - boxes[i].gMin,
        boxes[i].bMax - boxes[i].bMin,
      );
      if (range > maxRange) {
        maxRange = range;
        maxIndex = i;
      }
    }

    const [box1, box2] = splitColorBox(boxes[maxIndex]);
    boxes.splice(maxIndex, 1, box1, box2);
  }

  return boxes.map(getAverageColor);
}

/**
 * Maps each pixel in the image to the nearest palette color index.
 *
 * @param raw - Source pixel data.
 * @param palette - Target color palette.
 * @returns Array of palette indices, one per pixel.
 */
export function convertToIndexed(raw: RawImageData, palette: Color[]): Uint8Array {
  const { data, channels, width, height } = raw;

  const pixelCount = width * height;
  const indices = new Uint8Array(pixelCount);

  // K-d tree + cache for large palettes
  if (palette.length >= 64) {
    const tree = new KdTree(palette);
    const cache = new Map<number, number>();

    for (let i = 0; i < pixelCount; i++) {
      const offset = i * channels;
      let r: number, g: number, b: number;
      if (channels === 1) r = g = b = data[offset];
      else {
        r = data[offset];
        g = data[offset + 1];
        b = data[offset + 2];
      }

      const packed = (r << 16) | (g << 8) | b;
      let index = cache.get(packed);
      if (index === undefined) {
        index = tree.findNearest([r, g, b]);
        cache.set(packed, index);
      }
      indices[i] = index;
    }
    // Linear search for small palettes
  } else {
    // flat typed arrays for faster access
    const palLen = palette.length;
    const palR = new Uint8Array(palLen);
    const palG = new Uint8Array(palLen);
    const palB = new Uint8Array(palLen);
    for (let j = 0; j < palLen; j++) {
      palR[j] = palette[j].red;
      palG[j] = palette[j].green;
      palB[j] = palette[j].blue;
    }

    for (let i = 0; i < pixelCount; i++) {
      const offset = i * channels;
      let r: number, g: number, b: number;
      if (channels === 1) r = g = b = data[offset];
      else {
        r = data[offset];
        g = data[offset + 1];
        b = data[offset + 2];
      }

      let minDist = Infinity;
      let closest = 0;
      for (let j = 0; j < palLen; j++) {
        const dr = r - palR[j];
        const dg = g - palG[j];
        const db = b - palB[j];
        const dist = dr * dr + dg * dg + db * db;
        if (dist < minDist) {
          minDist = dist;
          closest = j;
          if (dist === 0) break;
        }
      }
      indices[i] = closest;
    }
  }

  return indices;
}
