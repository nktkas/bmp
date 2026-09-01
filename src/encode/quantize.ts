/**
 * Color quantization for reducing images to a limited palette.
 *
 * Uses Wu's moment-based algorithm to find the best N colors for an image (a single histogram pass with no sorting),
 * and an inverse colormap over the RGB cube for fast nearest-neighbor lookup when mapping pixels to palette indices.
 *
 * @module
 */

import type { Color, RawImageData } from "../common.ts";

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

/** Flatten a histogram cell coordinate into an index into the moment arrays. */
const wuIndex = (r: number, g: number, b: number): number => (r * WU_SIDE + g) * WU_SIDE + b;

// Splitting axes, encoded so they can index the moment helpers.
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
// Palette building
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

// ============================================================
// Pixel mapping
// ============================================================

/** Larger than any squared distance between two 24-bit colors (3 x 255^2 = 195075). */
const MAX_SQUARED_DISTANCE = 0x7FFFFFFF;

/** Palette sizes up to which a plain scan costs less per pixel than any lookup structure. */
const SCAN_ONLY_COLORS = 8;

/** Slots in the direct-mapped color cache. Sized to stay inside L1 while covering flat images. */
const CACHE_BITS = 12;

/**
 * Distinct colors after which an inverse colormap earns back what it costs to build.
 *
 * The count is not known in advance, so it is discovered from cache misses as the image is mapped:
 * an image that keeps missing has many colors and the colormap pays off,
 * while one that settles into the cache never builds it.
 */
const COLORMAP_AFTER_MISSES = 512;

/**
 * Map each pixel in the image to the nearest palette color index.
 *
 * Ties are broken towards the lower palette index.
 *
 * @param raw Source pixel data.
 * @param palette Target color palette. Must hold at least one color.
 * @return Array of palette indices, one per pixel.
 */
export function convertToIndexed(raw: RawImageData, palette: Color[]): Uint8Array {
  const { data, channels, width, height } = raw;
  const palLen = palette.length;
  const flat = flattenPalette(palette);
  const { red, green, blue } = flat;

  const pixelCount = width * height;
  const indices = new Uint8Array(pixelCount);

  if (palLen <= SCAN_ONLY_COLORS) {
    for (let i = 0; i < pixelCount; i++) {
      const offset = i * channels;
      const r = data[offset];
      const g = channels === 1 ? r : data[offset + 1];
      const b = channels === 1 ? r : data[offset + 2];
      indices[i] = scanNearest(r, g, b, red, green, blue, palLen);
    }
    return indices;
  }

  const slots = 1 << CACHE_BITS;
  const cacheKeys = new Int32Array(slots).fill(-1);
  const cacheValues = new Uint8Array(slots);

  // First pass: scan on every miss, and count the misses to learn how varied the image is.
  let i = 0;
  let misses = 0;
  for (; i < pixelCount && misses < COLORMAP_AFTER_MISSES; i++) {
    const offset = i * channels;
    const r = data[offset];
    const g = channels === 1 ? r : data[offset + 1];
    const b = channels === 1 ? r : data[offset + 2];

    const color = (r << 16) | (g << 8) | b;
    const slot = Math.imul(color, 0x9E3779B1) >>> (32 - CACHE_BITS);
    if (cacheKeys[slot] === color) {
      indices[i] = cacheValues[slot];
      continue;
    }

    misses++;
    const closest = scanNearest(r, g, b, red, green, blue, palLen);
    indices[i] = closest;
    cacheKeys[slot] = color;
    cacheValues[slot] = closest;
  }
  if (i === pixelCount) return indices;

  // Second pass: too many distinct colors for scanning, so the rest goes through the colormap.
  const colormap = buildColormap(flat);
  for (; i < pixelCount; i++) {
    const offset = i * channels;
    const r = data[offset];
    const g = channels === 1 ? r : data[offset + 1];
    const b = channels === 1 ? r : data[offset + 2];

    const color = (r << 16) | (g << 8) | b;
    const slot = Math.imul(color, 0x9E3779B1) >>> (32 - CACHE_BITS);
    if (cacheKeys[slot] === color) {
      indices[i] = cacheValues[slot];
      continue;
    }

    const closest = colormapNearest(colormap, r, g, b, red, green, blue);
    indices[i] = closest;
    cacheKeys[slot] = color;
    cacheValues[slot] = closest;
  }

  return indices;
}

/** Palette split into one flat array per channel, for indexed access in the mapping loops. */
interface FlatColors {
  /** Red channel values, one per palette entry. */
  red: Uint8Array;
  /** Green channel values, one per palette entry. */
  green: Uint8Array;
  /** Blue channel values, one per palette entry. */
  blue: Uint8Array;
}

/**
 * Split a palette into one flat array per channel.
 *
 * @param palette Colors to split.
 * @return The three channel arrays, in palette order.
 */
function flattenPalette(palette: Color[]): FlatColors {
  const red = new Uint8Array(palette.length);
  const green = new Uint8Array(palette.length);
  const blue = new Uint8Array(palette.length);
  for (let i = 0; i < palette.length; i++) {
    red[i] = palette[i].red;
    green[i] = palette[i].green;
    blue[i] = palette[i].blue;
  }
  return { red, green, blue };
}

/**
 * Find the nearest palette color by comparing against every entry.
 *
 * @param r Red channel of the pixel.
 * @param g Green channel of the pixel.
 * @param b Blue channel of the pixel.
 * @param red Red channel of every palette color.
 * @param green Green channel of every palette color.
 * @param blue Blue channel of every palette color.
 * @param palLen Number of palette colors.
 * @return Index of the nearest color, the lowest one when several tie.
 */
function scanNearest(
  r: number,
  g: number,
  b: number,
  red: Uint8Array,
  green: Uint8Array,
  blue: Uint8Array,
  palLen: number,
): number {
  let closest = 0;
  let minDist = MAX_SQUARED_DISTANCE;
  for (let j = 0; j < palLen; j++) {
    const dr = r - red[j], dg = g - green[j], db = b - blue[j];
    const dist = dr * dr + dg * dg + db * db;
    if (dist < minDist) {
      minDist = dist;
      closest = j;
      if (dist === 0) break;
    }
  }
  return closest;
}

// ============================================================
// Inverse colormap
// ============================================================

// Cells per axis in the inverse colormap, and in the coarse grid that prunes it.
const CELL_BITS = 5, CELL_SIDE = 32, COARSE_BITS = 2, COARSE_SIDE = 4;

/** Per-axis squared distances from every slab of cells to every palette color. */
interface AxisDistances {
  /** Squared distance to the nearest point of the slab; `0` when the color lies inside it. */
  near: Int32Array;
  /** Squared distance to the farthest point of the slab. */
  far: Int32Array;
}

/**
 * An inverse colormap over the RGB cube: which palette colors each cell has to consider.
 *
 * A cell keeps every color that could be nearest to some point inside it:
 * those no farther from the cell's nearest corner than any color is from its farthest corner.
 * The list is filled the first time a pixel lands in the cell, so an image touching few cells pays for few lists.
 */
interface InverseColormap {
  /** Number of palette colors the map was built for. */
  palLen: number;
  /** Per-axis distances from each fine cell slab, one entry per channel. */
  fine: [AxisDistances, AxisDistances, AxisDistances];
  /** Candidate lists of the coarse blocks, concatenated. */
  coarseItems: Uint8Array;
  /** Start of each coarse block's list in {@linkcode coarseItems}, plus a closing entry. */
  coarseStart: Int32Array;
  /** Start of each fine cell's list in {@linkcode items}. */
  cellStart: Int32Array;
  /** End of each fine cell's list, `0` while the cell has not been filled yet. */
  cellEnd: Int32Array;
  /** Candidate lists of the fine cells filled so far, concatenated. */
  items: Uint8Array;
  /** Number of entries used in {@linkcode items}. */
  used: number;
}

/**
 * Tabulate, for one channel, the squared distance from each slab of cells to each palette color.
 *
 * @param component Channel value of every palette color.
 * @param side Cells per axis.
 * @return Nearest and farthest squared distances, indexed by `slab * palette length + color`.
 */
function tabulateAxis(component: Uint8Array, side: number): AxisDistances {
  const palLen = component.length;
  const cellSize = 256 / side;
  const near = new Int32Array(side * palLen);
  const far = new Int32Array(side * palLen);

  for (let cell = 0; cell < side; cell++) {
    const low = cell * cellSize, high = low + cellSize - 1, base = cell * palLen;
    for (let j = 0; j < palLen; j++) {
      const v = component[j];
      const toNear = v < low ? low - v : v > high ? v - high : 0;
      const toFar = v - low > high - v ? v - low : high - v;
      near[base + j] = toNear * toNear;
      far[base + j] = toFar * toFar;
    }
  }

  return { near, far };
}

/**
 * Build an inverse colormap, with the coarse blocks filled and the fine cells left empty.
 *
 * @param flat Palette split per channel.
 * @return The map, ready for {@linkcode colormapNearest}.
 */
function buildColormap(flat: FlatColors): InverseColormap {
  const { red, green, blue } = flat;
  const palLen = red.length;
  const coarse: [AxisDistances, AxisDistances, AxisDistances] = [
    tabulateAxis(red, COARSE_SIDE),
    tabulateAxis(green, COARSE_SIDE),
    tabulateAxis(blue, COARSE_SIDE),
  ];

  const coarseCells = COARSE_SIDE * COARSE_SIDE * COARSE_SIDE;
  const coarseStart = new Int32Array(coarseCells + 1);
  const coarseItems = new Uint8Array(coarseCells * palLen);
  let used = 0;
  for (let cr = 0; cr < COARSE_SIDE; cr++) {
    const rowRed = cr * palLen;
    for (let cg = 0; cg < COARSE_SIDE; cg++) {
      const rowGreen = cg * palLen;
      for (let cb = 0; cb < COARSE_SIDE; cb++) {
        const rowBlue = cb * palLen;
        coarseStart[(cr * COARSE_SIDE + cg) * COARSE_SIDE + cb] = used;
        let bound = MAX_SQUARED_DISTANCE;
        for (let j = 0; j < palLen; j++) {
          const far = coarse[0].far[rowRed + j] + coarse[1].far[rowGreen + j] + coarse[2].far[rowBlue + j];
          if (far < bound) bound = far;
        }
        for (let j = 0; j < palLen; j++) {
          const near = coarse[0].near[rowRed + j] + coarse[1].near[rowGreen + j] + coarse[2].near[rowBlue + j];
          if (near <= bound) coarseItems[used++] = j;
        }
      }
    }
  }
  coarseStart[coarseCells] = used;

  const cellCount = CELL_SIDE * CELL_SIDE * CELL_SIDE;
  return {
    palLen,
    fine: [tabulateAxis(red, CELL_SIDE), tabulateAxis(green, CELL_SIDE), tabulateAxis(blue, CELL_SIDE)],
    coarseItems,
    coarseStart,
    cellStart: new Int32Array(cellCount),
    cellEnd: new Int32Array(cellCount),
    items: new Uint8Array(1 << 14),
    used: 0,
  };
}

/**
 * Find the nearest palette color through the colormap, filling the pixel's cell if needed.
 *
 * @param map Inverse colormap, updated in place as cells are filled.
 * @param r Red channel of the pixel.
 * @param g Green channel of the pixel.
 * @param b Blue channel of the pixel.
 * @param red Red channel of every palette color.
 * @param green Green channel of every palette color.
 * @param blue Blue channel of every palette color.
 * @return Index of the nearest color, the lowest one when several tie.
 */
function colormapNearest(
  map: InverseColormap,
  r: number,
  g: number,
  b: number,
  red: Uint8Array,
  green: Uint8Array,
  blue: Uint8Array,
): number {
  const { palLen, fine, coarseItems, coarseStart, cellStart, cellEnd } = map;
  const cr = r >> 3, cg = g >> 3, cb = b >> 3;
  const cell = (cr * CELL_SIDE + cg) * CELL_SIDE + cb;

  let end = cellEnd[cell];
  if (end === 0) {
    if (map.used + palLen > map.items.length) {
      const grown = new Uint8Array(map.items.length * 2);
      grown.set(map.items);
      map.items = grown;
    }
    cellStart[cell] = map.used;

    const rowRed = cr * palLen, rowGreen = cg * palLen, rowBlue = cb * palLen;
    const parent = ((cr >> (CELL_BITS - COARSE_BITS)) * COARSE_SIDE + (cg >> (CELL_BITS - COARSE_BITS))) *
        COARSE_SIDE + (cb >> (CELL_BITS - COARSE_BITS));
    const from = coarseStart[parent], to = coarseStart[parent + 1];

    let bound = MAX_SQUARED_DISTANCE;
    for (let k = from; k < to; k++) {
      const j = coarseItems[k];
      const far = fine[0].far[rowRed + j] + fine[1].far[rowGreen + j] + fine[2].far[rowBlue + j];
      if (far < bound) bound = far;
    }
    for (let k = from; k < to; k++) {
      const j = coarseItems[k];
      const near = fine[0].near[rowRed + j] + fine[1].near[rowGreen + j] + fine[2].near[rowBlue + j];
      if (near <= bound) map.items[map.used++] = j;
    }

    end = map.used;
    cellEnd[cell] = end;
  }

  const items = map.items;
  let closest = 0;
  let minDist = MAX_SQUARED_DISTANCE;
  for (let k = cellStart[cell]; k < end; k++) {
    const j = items[k];
    const dr = r - red[j], dg = g - green[j], db = b - blue[j];
    const dist = dr * dr + dg * dg + db * db;
    if (dist < minDist) {
      minDist = dist;
      closest = j;
    }
  }
  return closest;
}
