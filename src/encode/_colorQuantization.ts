import type { RawImageData } from "../_common.ts";

/** Color palette entry for indexed color BMP images */
interface RGBQUAD {
  /** Blue channel intensity (0-255) */
  blue: number;
  /** Green channel intensity (0-255) */
  green: number;
  /** Red channel intensity (0-255) */
  red: number;
  /** Reserved field, typically 0 (used for alpha in some variants) */
  reserved: number;
}

/**
 * Represents a color cube in RGB space for median cut algorithm.
 */
interface ColorBox {
  colors: number[]; // Array of packed RGB values (r << 16 | g << 8 | b)
  rMin: number;
  rMax: number;
  gMin: number;
  gMax: number;
  bMin: number;
  bMax: number;
}

/**
 * Node in a K-d tree for fast nearest neighbor search in RGB space.
 */
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

/**
 * K-d tree for efficient nearest color search in RGB space.
 * Optimizes palette color lookup from O(P) to O(log P).
 */
class KdTree {
  private root: KdNode | null = null;

  constructor(palette: RGBQUAD[]) {
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

    const axis = depth % 3;
    points.sort((a, b) => a.color[axis] - b.color[axis]);

    const medianIdx = Math.floor(points.length / 2);
    const node = new KdNode(points[medianIdx].color, points[medianIdx].index);

    node.left = this.buildTree(points.slice(0, medianIdx), depth + 1);
    node.right = this.buildTree(points.slice(medianIdx + 1), depth + 1);

    return node;
  }

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
        if (distance === 0) return;
      }

      const axis = depth % 3;
      const diff = target[axis] - node.color[axis];

      const near = diff < 0 ? node.left : node.right;
      const far = diff < 0 ? node.right : node.left;

      search(near, depth + 1);

      if (diff * diff < bestDistance) {
        search(far, depth + 1);
      }
    };

    search(this.root, 0);
    return bestNode!.index;
  }
}

/**
 * Generates a grayscale palette with the specified number of colors.
 * @param numColors - Number of colors in palette (2, 16, or 256)
 * @returns Grayscale palette
 */
export function generateGrayscalePalette(numColors: 2 | 16 | 256): RGBQUAD[] {
  const palette: RGBQUAD[] = [];
  const step = Math.floor(256 / (numColors - 1));

  for (let i = 0; i < numColors; i++) {
    const gray = Math.min(i * step, 255);
    palette.push({ red: gray, green: gray, blue: gray, reserved: 0 });
  }

  return palette;
}

/**
 * Extracts unique colors from RGB/RGBA image data.
 * @param raw - Raw image data
 * @returns Array of packed RGB values
 */
function extractUniqueColors(raw: RawImageData): number[] {
  const uniqueColors = new Set<number>();
  const channels = raw.channels;

  for (let i = 0; i < raw.data.length; i += channels) {
    const r = raw.data[i];
    const g = raw.data[i + 1];
    const b = raw.data[i + 2];
    const packed = (r << 16) | (g << 8) | b;
    uniqueColors.add(packed);
  }

  return Array.from(uniqueColors);
}

/**
 * Creates a color box from a set of colors.
 * @param colors - Array of packed RGB values
 * @returns Color box with bounds
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
 * Splits a color box along its longest dimension.
 * @param box - Color box to split
 * @returns Two new color boxes
 */
function splitColorBox(box: ColorBox): [ColorBox, ColorBox] {
  const rRange = box.rMax - box.rMin;
  const gRange = box.gMax - box.gMin;
  const bRange = box.bMax - box.bMin;

  // Sort along longest axis
  if (rRange >= gRange && rRange >= bRange) {
    // Sort by red
    box.colors.sort((a, b) => ((a >> 16) & 0xFF) - ((b >> 16) & 0xFF));
  } else if (gRange >= bRange) {
    // Sort by green
    box.colors.sort((a, b) => ((a >> 8) & 0xFF) - ((b >> 8) & 0xFF));
  } else {
    // Sort by blue
    box.colors.sort((a, b) => (a & 0xFF) - (b & 0xFF));
  }

  // Split at median
  const medianIndex = Math.floor(box.colors.length / 2);
  const colors1 = box.colors.slice(0, medianIndex);
  const colors2 = box.colors.slice(medianIndex);

  return [createColorBox(colors1), createColorBox(colors2)];
}

/**
 * Calculates the average color of a color box.
 * @param box - Color box
 * @returns Average RGB color as RGBQUAD
 */
function getAverageColor(box: ColorBox): RGBQUAD {
  let rSum = 0, gSum = 0, bSum = 0;

  for (const packed of box.colors) {
    rSum += (packed >> 16) & 0xFF;
    gSum += (packed >> 8) & 0xFF;
    bSum += packed & 0xFF;
  }

  const count = box.colors.length;
  return {
    red: Math.round(rSum / count),
    green: Math.round(gSum / count),
    blue: Math.round(bSum / count),
    reserved: 0,
  };
}

/**
 * Generates a color palette using the median cut algorithm.
 * @param raw - Raw image data (RGB or RGBA)
 * @param numColors - Number of colors in palette (2, 16, or 256)
 * @returns Color palette
 */
export function generatePalette(raw: RawImageData, numColors: 2 | 16 | 256): RGBQUAD[] {
  if (raw.channels !== 3 && raw.channels !== 4) {
    throw new Error("generatePalette expects RGB or RGBA data");
  }

  // Extract unique colors
  const uniqueColors = extractUniqueColors(raw);

  // If unique colors <= target, use them directly
  if (uniqueColors.length <= numColors) {
    const palette = uniqueColors.map((packed) => ({
      red: (packed >> 16) & 0xFF,
      green: (packed >> 8) & 0xFF,
      blue: packed & 0xFF,
      reserved: 0,
    }));

    // Fill remaining slots with black
    while (palette.length < numColors) {
      palette.push({ red: 0, green: 0, blue: 0, reserved: 0 });
    }

    return palette;
  }

  // Median cut algorithm
  const boxes = [createColorBox(uniqueColors)];

  while (boxes.length < numColors) {
    // Find box with largest color range
    let maxRange = -1;
    let maxIndex = 0;

    for (let i = 0; i < boxes.length; i++) {
      const box = boxes[i];
      const rRange = box.rMax - box.rMin;
      const gRange = box.gMax - box.gMin;
      const bRange = box.bMax - box.bMin;
      const range = Math.max(rRange, gRange, bRange);

      if (range > maxRange) {
        maxRange = range;
        maxIndex = i;
      }
    }

    // Split the box
    const [box1, box2] = splitColorBox(boxes[maxIndex]);
    boxes.splice(maxIndex, 1, box1, box2);
  }

  // Generate palette from boxes
  return boxes.map((box) => getAverageColor(box));
}

/**
 * Converts grayscale/RGB/RGBA image data to indexed format using a palette.
 * @param raw - Raw image data (grayscale, RGB, or RGBA)
 * @param palette - Color palette
 * @returns Array of palette indices
 */
export function convertToIndexed(raw: RawImageData, palette: RGBQUAD[]): Uint8Array {
  const pixelCount = raw.width * raw.height;
  const indices = new Uint8Array(pixelCount);

  // OPTIMIZATION: Use K-d tree + caching for large palettes
  if (palette.length >= 64) {
    const kdtree = new KdTree(palette);
    const colorCache = new Map<number, number>();

    for (let i = 0; i < pixelCount; i++) {
      const offset = i * raw.channels;

      let r: number, g: number, b: number;
      if (raw.channels === 1) {
        r = g = b = raw.data[offset];
      } else {
        r = raw.data[offset];
        g = raw.data[offset + 1];
        b = raw.data[offset + 2];
      }

      const packed = (r << 16) | (g << 8) | b;
      let index = colorCache.get(packed);

      if (index === undefined) {
        index = kdtree.findNearest([r, g, b]);
        colorCache.set(packed, index);
      }

      indices[i] = index;
    }

    return indices;
  }

  // Direct linear search
  for (let i = 0; i < pixelCount; i++) {
    const offset = i * raw.channels;

    let r: number, g: number, b: number;
    if (raw.channels === 1) {
      r = g = b = raw.data[offset];
    } else {
      r = raw.data[offset];
      g = raw.data[offset + 1];
      b = raw.data[offset + 2];
    }

    // Linear search through palette
    let minDistance = Infinity;
    let closestIndex = 0;

    for (let j = 0; j < palette.length; j++) {
      const dr = r - palette[j].red;
      const dg = g - palette[j].green;
      const db = b - palette[j].blue;
      const distance = dr * dr + dg * dg + db * db;

      if (distance < minDistance) {
        minDistance = distance;
        closestIndex = j;
      }
    }

    indices[i] = closestIndex;
  }

  return indices;
}
