/**
 * Color quantization for reducing images to a limited palette.
 *
 * Uses the Median Cut algorithm to find the best N colors for an image,
 * and a K-d tree for fast nearest-neighbor lookup when mapping pixels to palette indices.
 *
 * @module
 */

import type { Color, RawImageData } from "../common.ts";

// ============================================================
// K-d Tree for fast nearest-color search
// ============================================================

/** Node in a K-d tree partitioning RGB color space. */
class KdNode {
  /** RGB color coordinates. */
  color: [number, number, number];
  /** Palette index this node represents. */
  index: number;
  /** Left child (values below the splitting plane). */
  left: KdNode | null = null;
  /** Right child (values above the splitting plane). */
  right: KdNode | null = null;

  /**
   * Create a new K-d tree node.
   *
   * @param color RGB color tuple.
   * @param index Palette index.
   */
  constructor(color: [number, number, number], index: number) {
    this.color = color;
    this.index = index;
  }
}

/** K-d tree for efficient nearest-color search in RGB space. */
class KdTree {
  /** Root node of the tree (null if the palette is empty). */
  protected root: KdNode | null = null;

  /**
   * Build a K-d tree from a color palette.
   *
   * @param palette Array of palette colors.
   */
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

  /**
   * Recursively build the K-d tree by splitting along alternating color axes.
   *
   * @param points Array of color points to partition.
   * @param depth Current recursion depth (determines the splitting axis).
   * @return Root node of the subtree, or null if empty.
   */
  protected buildTree(
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

  /**
   * Find the palette index of the color closest to `target` in RGB space.
   *
   * @param target RGB color tuple to match.
   * @return Palette index of the nearest color.
   */
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

// ============================================================
// Median Cut algorithm
// ============================================================

/** A box of colors in RGB space, used by the Median Cut algorithm. */
interface ColorBox {
  /** Packed RGB values: (r << 16) | (g << 8) | b. */
  colors: number[];
  /** Minimum red value in this box. */
  rMin: number;
  /** Maximum red value in this box. */
  rMax: number;
  /** Minimum green value in this box. */
  gMin: number;
  /** Maximum green value in this box. */
  gMax: number;
  /** Minimum blue value in this box. */
  bMin: number;
  /** Maximum blue value in this box. */
  bMax: number;
}

/**
 * Create a box from a set of packed RGB colors, computing the bounding range.
 *
 * @param colors Array of packed RGB values.
 * @return Color box with computed min/max bounds.
 */
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

/**
 * Split a box along its longest color axis at the median.
 *
 * @param box Color box to split.
 * @return Two new color boxes.
 */
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

/**
 * Compute the average color of all colors in a box.
 *
 * @param box Color box to average.
 * @return Average color.
 */
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

// ============================================================
// Public API
// ============================================================

/**
 * Generate an evenly-spaced grayscale palette.
 *
 * @param numColors Number of colors (e.g. 2, 16, or 256).
 * @return Array of grayscale colors.
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
 * Generate an optimal color palette using the Median Cut algorithm.
 *
 * @param raw Source image (RGB or RGBA).
 * @param numColors Target palette size (e.g. 2, 16, 256).
 * @return Array of representative colors.
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
 * Map each pixel in the image to the nearest palette color index.
 *
 * @param raw Source pixel data.
 * @param palette Target color palette.
 * @return Array of palette indices, one per pixel.
 */
export function convertToIndexed(raw: RawImageData, palette: Color[]): Uint8Array {
  const { data, channels, width, height } = raw;

  const pixelCount = width * height;
  const indices = new Uint8Array(pixelCount);

  // K-d tree + cache for large palettes (linear search is faster below this threshold)
  if (palette.length >= 64) {
    const tree = new KdTree(palette);
    const cache = new Map<number, number>();

    for (let i = 0; i < pixelCount; i++) {
      const srcOffset = i * channels;
      let r: number, g: number, b: number;
      if (channels === 1) r = g = b = data[srcOffset];
      else {
        r = data[srcOffset];
        g = data[srcOffset + 1];
        b = data[srcOffset + 2];
      }

      const packed = (r << 16) | (g << 8) | b;
      let index = cache.get(packed);
      if (index === undefined) {
        index = tree.findNearest([r, g, b]);
        cache.set(packed, index);
      }
      indices[i] = index;
    }
  } else {
    // Linear search for small palettes — flat typed arrays for faster access
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
      const srcOffset = i * channels;
      let r: number, g: number, b: number;
      if (channels === 1) r = g = b = data[srcOffset];
      else {
        r = data[srcOffset];
        g = data[srcOffset + 1];
        b = data[srcOffset + 2];
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
