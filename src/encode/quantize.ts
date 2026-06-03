/**
 * Color quantization for reducing images to a limited palette.
 *
 * Uses Wu's moment-based algorithm to find the best N colors for an image (a single
 * histogram pass with no sorting), and a K-d tree for fast nearest-neighbor lookup
 * when mapping pixels to palette indices.
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
// Wu's moment-based color quantizer
// ============================================================

/** Levels per channel (32) plus one guard slot used by the cumulative-moment integration. */
const WU_SIDE = 33;

/** A box (axis-aligned region) in the quantized color space. */
interface WuBox {
  r0: number;
  r1: number;
  g0: number;
  g1: number;
  b0: number;
  b1: number;
  /** Volume in histogram cells; a box of volume ≤ 1 cannot be cut further. */
  vol: number;
}

const wuIndex = (r: number, g: number, b: number): number => (r * WU_SIDE + g) * WU_SIDE + b;

/** Splitting axes, encoded so they can index the moment helpers. */
const WU_RED = 2, WU_GREEN = 1, WU_BLUE = 0;

/**
 * Build an optimal palette of up to `numColors` colors using Wu's algorithm.
 *
 * @param raw Source image (RGB or RGBA).
 * @param numColors Target palette size.
 * @return Array of representative colors (padded to `numColors` with black if fewer are found).
 */
function wuQuantize(raw: RawImageData, numColors: number): Color[] {
  const size = WU_SIDE * WU_SIDE * WU_SIDE;
  const wt = new Float64Array(size); // pixel counts
  const mr = new Float64Array(size); // Σ red
  const mg = new Float64Array(size); // Σ green
  const mb = new Float64Array(size); // Σ blue
  const m2 = new Float64Array(size); // Σ (r² + g² + b²)

  // Histogram: bucket each pixel into a 32×32×32 grid (channel >> 3), offset by 1.
  const { data, channels } = raw;
  const pixelCount = raw.width * raw.height;
  for (let i = 0; i < pixelCount; i++) {
    const o = i * channels;
    const r = data[o];
    const g = channels === 1 ? r : data[o + 1];
    const b = channels === 1 ? r : data[o + 2];
    const k = wuIndex((r >> 3) + 1, (g >> 3) + 1, (b >> 3) + 1);
    wt[k]++;
    mr[k] += r;
    mg[k] += g;
    mb[k] += b;
    m2[k] += r * r + g * g + b * b;
  }

  // Integrate into cumulative moments so any box sum is an O(1) 8-corner lookup.
  for (const v of [wt, mr, mg, mb, m2]) {
    const area = new Float64Array(WU_SIDE);
    for (let r = 1; r < WU_SIDE; r++) {
      area.fill(0);
      for (let g = 1; g < WU_SIDE; g++) {
        let line = 0;
        for (let b = 1; b < WU_SIDE; b++) {
          line += v[wuIndex(r, g, b)];
          area[b] += line;
          v[wuIndex(r, g, b)] = v[wuIndex(r - 1, g, b)] + area[b];
        }
      }
    }
  }

  // Total moment over a box, via inclusion-exclusion of its 8 corners.
  const vol = (c: WuBox, m: Float64Array): number =>
    m[wuIndex(c.r1, c.g1, c.b1)] - m[wuIndex(c.r1, c.g1, c.b0)] -
    m[wuIndex(c.r1, c.g0, c.b1)] + m[wuIndex(c.r1, c.g0, c.b0)] -
    m[wuIndex(c.r0, c.g1, c.b1)] + m[wuIndex(c.r0, c.g1, c.b0)] +
    m[wuIndex(c.r0, c.g0, c.b1)] - m[wuIndex(c.r0, c.g0, c.b0)];

  // Marginal moment over the bottom face of a box, perpendicular to `dir`.
  const bottom = (c: WuBox, dir: number, m: Float64Array): number => {
    if (dir === WU_RED) {
      return -m[wuIndex(c.r0, c.g1, c.b1)] + m[wuIndex(c.r0, c.g1, c.b0)] +
        m[wuIndex(c.r0, c.g0, c.b1)] - m[wuIndex(c.r0, c.g0, c.b0)];
    }
    if (dir === WU_GREEN) {
      return -m[wuIndex(c.r1, c.g0, c.b1)] + m[wuIndex(c.r1, c.g0, c.b0)] +
        m[wuIndex(c.r0, c.g0, c.b1)] - m[wuIndex(c.r0, c.g0, c.b0)];
    }
    return -m[wuIndex(c.r1, c.g1, c.b0)] + m[wuIndex(c.r1, c.g0, c.b0)] +
      m[wuIndex(c.r0, c.g1, c.b0)] - m[wuIndex(c.r0, c.g0, c.b0)];
  };

  // Marginal moment over the face at position `pos` along `dir`.
  const top = (c: WuBox, dir: number, pos: number, m: Float64Array): number => {
    if (dir === WU_RED) {
      return m[wuIndex(pos, c.g1, c.b1)] - m[wuIndex(pos, c.g1, c.b0)] -
        m[wuIndex(pos, c.g0, c.b1)] + m[wuIndex(pos, c.g0, c.b0)];
    }
    if (dir === WU_GREEN) {
      return m[wuIndex(c.r1, pos, c.b1)] - m[wuIndex(c.r1, pos, c.b0)] -
        m[wuIndex(c.r0, pos, c.b1)] + m[wuIndex(c.r0, pos, c.b0)];
    }
    return m[wuIndex(c.r1, c.g1, pos)] - m[wuIndex(c.r1, c.g0, pos)] -
      m[wuIndex(c.r0, c.g1, pos)] + m[wuIndex(c.r0, c.g0, pos)];
  };

  // Weighted variance of a box (the quantity each cut tries to reduce).
  const variance = (c: WuBox): number => {
    const dr = vol(c, mr), dg = vol(c, mg), db = vol(c, mb), n = vol(c, wt);
    if (n === 0) return 0;
    return vol(c, m2) - (dr * dr + dg * dg + db * db) / n;
  };

  // Find the position along `dir` that maximizes the combined between-box sum-of-squares.
  const maximize = (c: WuBox, dir: number, first: number, last: number, whole: number[]): [number, number] => {
    const baseR = bottom(c, dir, mr),
      baseG = bottom(c, dir, mg),
      baseB = bottom(c, dir, mb),
      baseW = bottom(c, dir, wt);
    let max = 0, cutAt = -1;
    for (let i = first; i < last; i++) {
      let hr = baseR + top(c, dir, i, mr);
      let hg = baseG + top(c, dir, i, mg);
      let hb = baseB + top(c, dir, i, mb);
      let hw = baseW + top(c, dir, i, wt);
      if (hw === 0) continue; // empty lower box
      let t = (hr * hr + hg * hg + hb * hb) / hw;
      hr = whole[0] - hr;
      hg = whole[1] - hg;
      hb = whole[2] - hb;
      hw = whole[3] - hw;
      if (hw === 0) continue; // empty upper box
      t += (hr * hr + hg * hg + hb * hb) / hw;
      if (t > max) {
        max = t;
        cutAt = i;
      }
    }
    return [max, cutAt];
  };

  // Cut box `s1` into `s1` and `s2` along the best axis; returns false if it cannot be split.
  const cut = (s1: WuBox, s2: WuBox): boolean => {
    const whole = [vol(s1, mr), vol(s1, mg), vol(s1, mb), vol(s1, wt)];
    const [mxr, cr] = maximize(s1, WU_RED, s1.r0 + 1, s1.r1, whole);
    const [mxg, cg] = maximize(s1, WU_GREEN, s1.g0 + 1, s1.g1, whole);
    const [mxb, cb] = maximize(s1, WU_BLUE, s1.b0 + 1, s1.b1, whole);

    let dir: number;
    if (mxr >= mxg && mxr >= mxb) {
      dir = WU_RED;
      if (cr < 0) return false; // box has zero range on every axis
    } else if (mxg >= mxr && mxg >= mxb) {
      dir = WU_GREEN;
    } else {
      dir = WU_BLUE;
    }

    s2.r1 = s1.r1;
    s2.g1 = s1.g1;
    s2.b1 = s1.b1;
    if (dir === WU_RED) {
      s2.r0 = s1.r1 = cr;
      s2.g0 = s1.g0;
      s2.b0 = s1.b0;
    } else if (dir === WU_GREEN) {
      s2.g0 = s1.g1 = cg;
      s2.r0 = s1.r0;
      s2.b0 = s1.b0;
    } else {
      s2.b0 = s1.b1 = cb;
      s2.r0 = s1.r0;
      s2.g0 = s1.g0;
    }
    s1.vol = (s1.r1 - s1.r0) * (s1.g1 - s1.g0) * (s1.b1 - s1.b0);
    s2.vol = (s2.r1 - s2.r0) * (s2.g1 - s2.g0) * (s2.b1 - s2.b0);
    return true;
  };

  // Greedily split the box with the largest variance until `numColors` boxes exist.
  const boxes: WuBox[] = Array.from(
    { length: numColors },
    () => ({ r0: 0, r1: 0, g0: 0, g1: 0, b0: 0, b1: 0, vol: 0 }),
  );
  boxes[0] = { r0: 0, r1: WU_SIDE - 1, g0: 0, g1: WU_SIDE - 1, b0: 0, b1: WU_SIDE - 1, vol: 0 };
  const vv = new Float64Array(numColors);
  let count = 1;
  let next = 0;
  for (let i = 1; i < numColors; i++) {
    if (cut(boxes[next], boxes[i])) {
      vv[next] = boxes[next].vol > 1 ? variance(boxes[next]) : 0;
      vv[i] = boxes[i].vol > 1 ? variance(boxes[i]) : 0;
    } else {
      vv[next] = 0; // cannot cut this box; retry the slot with the next-best box
      i--;
    }
    next = 0;
    let maxVar = vv[0];
    for (let k = 1; k <= i; k++) {
      if (vv[k] > maxVar) {
        maxVar = vv[k];
        next = k;
      }
    }
    count = i + 1;
    if (maxVar <= 0) break; // no box can be split usefully
  }

  // Representative color of each box = its weighted mean (full-resolution, not binned).
  const palette: Color[] = [];
  for (let k = 0; k < count; k++) {
    const w = vol(boxes[k], wt);
    if (w > 0) {
      palette.push({
        red: Math.round(vol(boxes[k], mr) / w),
        green: Math.round(vol(boxes[k], mg) / w),
        blue: Math.round(vol(boxes[k], mb) / w),
      });
    }
  }
  while (palette.length < numColors) palette.push({ red: 0, green: 0, blue: 0 });
  return palette;
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
 * Generate an optimal color palette using Wu's moment-based quantizer.
 *
 * @param raw Source image (RGB or RGBA).
 * @param numColors Target palette size (e.g. 2, 16, 256).
 * @return Array of representative colors.
 */
export function generatePalette(raw: RawImageData, numColors: number): Color[] {
  // Fast path: if the image has no more than `numColors` distinct colors, use them exactly.
  // Scanning stops as soon as the count exceeds the target, so a high-color image pays almost nothing.
  const { data, channels } = raw;
  const pixelCount = raw.width * raw.height;
  const unique = new Set<number>();
  let withinTarget = true;
  for (let i = 0; i < pixelCount; i++) {
    const o = i * channels;
    const r = data[o];
    const g = channels === 1 ? r : data[o + 1];
    const b = channels === 1 ? r : data[o + 2];
    unique.add((r << 16) | (g << 8) | b);
    if (unique.size > numColors) {
      withinTarget = false;
      break;
    }
  }

  if (withinTarget) {
    const palette = Array.from(unique, (packed) => ({
      red: (packed >> 16) & 0xFF,
      green: (packed >> 8) & 0xFF,
      blue: packed & 0xFF,
    }));
    while (palette.length < numColors) palette.push({ red: 0, green: 0, blue: 0 });
    return palette;
  }

  return wuQuantize(raw, numColors);
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
