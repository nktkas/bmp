/**
 * Color quantization for reducing images to a limited palette.
 *
 * Wu's moment-based algorithm builds the palette; an inverse colormap over the RGB cube maps each pixel to its
 * nearest palette color.
 *
 * @see https://gist.github.com/bert/1192520
 *
 * @module
 */

import type { Color, RawImageData } from "../common.ts";
import { grayscaleToIndices } from "./pixel.ts";

// =====================================================================================================================
// Wu's moment-based color quantizer
// =====================================================================================================================

/** Levels per channel (32) plus one guard slot used by the cumulative-moment integration. */
const WU_SIDE = 33;

/**
 * A box (axis-aligned region) in the quantized color space.
 *
 * Each pair of bounds is half-open: the low bound is one below the first cell, the high bound is the last cell.
 */
interface WuBox {
  /** Red bound below the box. */
  r0: number;
  /** Red bound at the box's top. */
  r1: number;
  /** Green bound below the box. */
  g0: number;
  /** Green bound at the box's top. */
  g1: number;
  /** Blue bound below the box. */
  b0: number;
  /** Blue bound at the box's top. */
  b1: number;
  /** Volume in histogram cells; a box of volume ≤ 1 cannot be cut further. */
  vol: number;
}

/**
 * Flattens a histogram cell coordinate into an index into the moment arrays.
 *
 * @param r Red cell, from `0` to {@linkcode WU_SIDE} − 1.
 * @param g Green cell, in the same range.
 * @param b Blue cell, in the same range.
 *
 * @return The index the cell's moments live at.
 */
function wuIndex(r: number, g: number, b: number): number {
  return (r * WU_SIDE + g) * WU_SIDE + b;
}

// The three axes a box can be cut along; the values only have to differ from one another.
const WU_RED = 2, WU_GREEN = 1, WU_BLUE = 0;

/**
 * Builds a palette of up to `numColors` colors by splitting the histogram along its highest-variance axis.
 *
 * @param raw Source image (RGB or RGBA).
 * @param numColors Target palette size.
 *
 * @return Array of representative colors (padded to `numColors` with black if fewer are found).
 */
function wuQuantize(raw: RawImageData, numColors: 2 | 16 | 256): Color[] {
  const size = WU_SIDE * WU_SIDE * WU_SIDE;
  const wt = new Float64Array(size); // pixel counts
  const mr = new Float64Array(size); // Σ red
  const mg = new Float64Array(size); // Σ green
  const mb = new Float64Array(size); // Σ blue
  const m2 = new Float64Array(size); // Σ (r² + g² + b²)

  // --- Bucket every pixel into a 32x32x32 grid, offset by one to leave the guard slot empty --------------------------

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

  // --- Integrate the grid, so that any box sum becomes an 8-corner lookup --------------------------------------------

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

  // --- Read the integrated grid --------------------------------------------------------------------------------------

  /**
   * Sums one moment over a whole box, by inclusion-exclusion of its 8 corners.
   *
   * @param c Box to sum over.
   * @param m Integrated moment array to read.
   *
   * @return The moment's total inside `c`.
   */
  const vol = (c: WuBox, m: Float64Array): number =>
    m[wuIndex(c.r1, c.g1, c.b1)] - m[wuIndex(c.r1, c.g1, c.b0)] -
    m[wuIndex(c.r1, c.g0, c.b1)] + m[wuIndex(c.r1, c.g0, c.b0)] -
    m[wuIndex(c.r0, c.g1, c.b1)] + m[wuIndex(c.r0, c.g1, c.b0)] +
    m[wuIndex(c.r0, c.g0, c.b1)] - m[wuIndex(c.r0, c.g0, c.b0)];

  /**
   * Sums one moment over the box's low face along `dir`, negated for adding to a {@linkcode top}.
   *
   * @param c Box whose face is taken.
   * @param dir Axis the face is perpendicular to.
   * @param m Integrated moment array to read.
   *
   * @return The moment's total over that face.
   */
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

  /**
   * Sums one moment over the box's cross-section at `pos`.
   *
   * @param c Box being cut.
   * @param dir Axis the cut runs along.
   * @param pos Position of the cut on that axis.
   * @param m Integrated moment array to read.
   *
   * @return The moment's total over that cross-section.
   */
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

  // --- Choose and perform the cuts -----------------------------------------------------------------------------------

  /**
   * Measures the color spread of a box, which each cut reduces.
   *
   * @param c Box to measure.
   *
   * @return Its weighted variance; `0` for a box holding no pixels.
   */
  const variance = (c: WuBox): number => {
    const dr = vol(c, mr), dg = vol(c, mg), db = vol(c, mb), n = vol(c, wt);
    if (n === 0) return 0;
    return vol(c, m2) - (dr * dr + dg * dg + db * db) / n;
  };

  /**
   * Finds where along `dir` a cut separates the box's colors best.
   *
   * @param c Box to cut.
   * @param dir Axis to cut along.
   * @param first First position the cut may take.
   * @param last One past the last position the cut may take.
   * @param whole The box's own red, green, blue and weight totals, in that order.
   *
   * @return The best score, and the position reaching it; `-1` when no position separates anything.
   */
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

  /**
   * Splits a box in two along whichever axis separates its colors best.
   *
   * @param s1 Box to split, shrunk in place to the lower half.
   * @param s2 Box to fill with the upper half.
   *
   * @return `false` when the box holds a single color and cannot be split, leaving both untouched.
   */
  const cut = (s1: WuBox, s2: WuBox): boolean => {
    const whole = [vol(s1, mr), vol(s1, mg), vol(s1, mb), vol(s1, wt)];
    const [mxr, cr] = maximize(s1, WU_RED, s1.r0 + 1, s1.r1, whole);
    const [mxg, cg] = maximize(s1, WU_GREEN, s1.g0 + 1, s1.g1, whole);
    const [mxb, cb] = maximize(s1, WU_BLUE, s1.b0 + 1, s1.b1, whole);

    let dir: number;
    if (mxr >= mxg && mxr >= mxb) {
      dir = WU_RED;
      // `maximize` returns -1 only when its score is 0, and a zero score always lands in this branch,
      // so green and blue need no such check.
      if (cr < 0) return false;
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

  // --- Split the highest-variance box until the palette is full ------------------------------------------------------

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

  // --- Take each box's weighted mean as its color --------------------------------------------------------------------

  // The mean uses the original channel values, so it is not quantized to the 32-level grid.
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

// =====================================================================================================================
// Palette building
// =====================================================================================================================

/** A palette together with the pixels rewritten as indices into it. */
export interface IndexedImage {
  /** The palette the indices point into, exactly `numColors` entries long. */
  palette: Color[];
  /** One index per pixel, in the row order of the source. */
  indices: Uint8Array;
}

/**
 * Reduces an image to a palette of `numColors` entries and the indices into it.
 *
 * @param raw Source pixel data.
 * @param numColors Palette size the target bit depth calls for.
 * @param palette Palette to encode against, holding at least `numColors` colors; a longer one is cut down to
 *                size. Omitting it builds a palette from the image.
 * @return The palette in use and one index per pixel.
 */
export function toIndexed(raw: RawImageData, numColors: 2 | 16 | 256, palette?: Color[]): IndexedImage {
  const custom = palette && palette.length >= numColors ? palette.slice(0, numColors) : undefined;
  const grayscale = custom === undefined && raw.channels === 1;
  const finalPalette = custom ?? (grayscale ? grayscalePalette(numColors) : wuPalette(raw, numColors));

  // A generated grayscale palette is an even ramp, so the index is the pixel value scaled to `numColors`.
  const indices = grayscale ? grayscaleToIndices(raw.data, numColors) : convertToIndexed(raw, finalPalette);
  return { palette: finalPalette, indices };
}

/**
 * Builds an evenly-spaced ramp from black to white.
 *
 * @param numColors Number of steps in the ramp.
 *
 * @return The ramp, first entry black and last entry white.
 */
function grayscalePalette(numColors: 2 | 16 | 256): Color[] {
  const palette: Color[] = [];
  for (let i = 0; i < numColors; i++) {
    const gray = Math.round((i * 255) / (numColors - 1));
    palette.push({ red: gray, green: gray, blue: gray });
  }
  return palette;
}

/**
 * Builds the palette for an image, using its own colors when there are no more than `numColors` of them.
 *
 * @param raw Source image (RGB or RGBA).
 * @param numColors Target palette size.
 *
 * @return Exactly `numColors` colors, padded with black when the image offers fewer.
 */
function wuPalette(raw: RawImageData, numColors: 2 | 16 | 256): Color[] {
  // The scan stops once the count passes the target, so a high-color image exits after few pixels.
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

// =====================================================================================================================
// Pixel mapping
// =====================================================================================================================

/** Larger than any squared distance between two 24-bit colors (3 x 255^2 = 195075). */
const MAX_SQUARED_DISTANCE = 0x7FFFFFFF;

/** Largest palette size mapped by a plain scan alone, with neither the color cache nor the colormap. */
const SCAN_ONLY_COLORS = 8;

/** Address bits of the direct-mapped color cache, so 4096 slots. */
const CACHE_BITS = 12;

/**
 * Cache misses after which the colormap is built rather than scanning on.
 *
 * The distinct-color count is unknown before the mapping runs, so the miss count stands in for it: every
 * distinct color misses at least once, and colors that collide in the cache miss again.
 */
const COLORMAP_AFTER_MISSES = 512;

/**
 * Maps each pixel in the image to the nearest palette color index.
 *
 * Ties are broken towards the lower palette index.
 *
 * @param raw Source pixel data.
 * @param palette Target color palette. Must hold at least one color.
 *
 * @return Array of palette indices, one per pixel.
 */
function convertToIndexed(raw: RawImageData, palette: Color[]): Uint8Array {
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
 * Splits a palette into one flat array per channel.
 *
 * @param palette Colors to split.
 *
 * @return The three channel arrays, in palette order.
 */
function flattenPalette(palette: Color[]): FlatColors {
  const palLen = palette.length;

  // The three channels share one allocation because a typed array costs about the same whatever its size.
  const channels = new Uint8Array(palLen * 3);
  const red = channels.subarray(0, palLen);
  const green = channels.subarray(palLen, palLen * 2);
  const blue = channels.subarray(palLen * 2);

  for (let i = 0; i < palLen; i++) {
    red[i] = palette[i].red;
    green[i] = palette[i].green;
    blue[i] = palette[i].blue;
  }
  return { red, green, blue };
}

/**
 * Finds the nearest palette color by comparing against every entry.
 *
 * @param r Red channel of the pixel.
 * @param g Green channel of the pixel.
 * @param b Blue channel of the pixel.
 * @param red Red channel of every palette color.
 * @param green Green channel of every palette color.
 * @param blue Blue channel of every palette color.
 * @param palLen Number of palette colors.
 *
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

// =====================================================================================================================
// Inverse colormap
// =====================================================================================================================

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
 * A cell's list is built on the first pixel that falls in it.
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
 * Tabulates, for one channel, the squared distance from each slab of cells to each palette color.
 *
 * @param component Channel value of every palette color.
 * @param side Cells per axis.
 *
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
 * Builds an inverse colormap, with the coarse blocks filled and the fine cells left empty.
 *
 * @param flat Palette split per channel.
 *
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
 * Finds the nearest palette color through the colormap, filling the pixel's cell if needed.
 *
 * @param map Inverse colormap, updated in place as cells are filled.
 * @param r Red channel of the pixel.
 * @param g Green channel of the pixel.
 * @param b Blue channel of the pixel.
 * @param red Red channel of every palette color.
 * @param green Green channel of every palette color.
 * @param blue Blue channel of every palette color.
 *
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
