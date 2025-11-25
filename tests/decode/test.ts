/**
 * Compares decoded BMPs against reference PNGs from the BMP Suite by Jason Summers (https://entropymine.com/jason/bmpsuite/).
 */

// deno-lint-ignore-file no-import-prefix
import { assertEquals } from "jsr:@std/assert@1";
import { decode, extractCompressedData } from "../../src/mod.ts";
import sharp from "npm:sharp@^0.34.5";
import pixelmatch from "npm:pixelmatch@7";

/** Check if file exists */
async function exists(path: string): Promise<boolean> {
  try {
    await Deno.stat(path);
    return true;
  } catch {
    return false;
  }
}

/** Converts grayscale/RGB/RGBA to RGBA for pixelmatch comparison */
function addAlphaChannel(data: Uint8Array, channels: 1 | 3 | 4): Uint8Array {
  if (channels === 1) {
    // Grayscale to RGBA
    const withAlpha = new Uint8Array(data.length * 4);
    for (let i = 0, j = 0; i < data.length; i++, j += 4) {
      withAlpha[j] = data[i];
      withAlpha[j + 1] = data[i];
      withAlpha[j + 2] = data[i];
      withAlpha[j + 3] = 255;
    }
    return withAlpha;
  }
  if (channels === 3) {
    // RGB to RGBA
    const withAlpha = new Uint8Array((data.length / 3) * 4);
    for (let i = 0, j = 0; i < data.length; i += 3, j += 4) {
      withAlpha[j] = data[i];
      withAlpha[j + 1] = data[i + 1];
      withAlpha[j + 2] = data[i + 2];
      withAlpha[j + 3] = 255;
    }
    return withAlpha;
  }
  return data; // Already RGBA
}

/** Compares decoded BMP with PNG reference */
async function runTest(filePath: string) {
  const bmpBuffer = await Deno.readFile(`./tests/_bmpsuite-2.8${filePath}`);
  const pngBuffer = await Deno.readFile(`./tests/_bmpsuite-2.8${filePath.replace(/\.bmp$/, ".png")}`);

  // Step 1: Decode BMP
  let bmp: ReturnType<typeof decode>;
  try {
    bmp = decode(bmpBuffer);
  } catch (error) {
    // for BI_JPEG and BI_PNG, we test `extractCompressedData` instead of `decode`
    if (error instanceof Error && error.message.includes('Use "extractCompressedData" to')) {
      const extracted = extractCompressedData(bmpBuffer);
      const raw = await sharp(extracted.data).raw().toBuffer({ resolveWithObject: true });
      bmp = { width: raw.info.width, height: raw.info.height, channels: raw.info.channels as 3 | 4, data: raw.data };
    } else {
      throw error;
    }
  }

  // Step 2: Decode PNG using sharp
  const png = await sharp(pngBuffer).raw().toBuffer({ resolveWithObject: true });

  // Step 3: Compare results
  assertEquals(bmp.width, png.info.width, "Width mismatch");
  assertEquals(bmp.height, png.info.height, "Height mismatch");

  // Pixel-by-pixel comparison
  const diff = pixelmatch(
    addAlphaChannel(bmp.data, bmp.channels),
    addAlphaChannel(png.data, png.info.channels as 1 | 3 | 4),
    undefined,
    bmp.width,
    bmp.height,
    { threshold: 0.004 }, // Allow very small differences (due to different rounding strategies)
  );
  assertEquals(diff, 0, "Found different pixels");
}

Deno.test("Decode", async (t) => {
  await t.step("'good' BMPs", async (t) => {
    const files = await Deno.readDir("./tests/_bmpsuite-2.8/g");
    for await (const sample of files) {
      if (!sample.name.endsWith(".bmp")) continue;

      await t.step(sample.name, async () => {
        await runTest(`/g/${sample.name}`);
      });
    }
  });

  await t.step("'questionable' BMPs", async (t) => {
    const files = await Deno.readDir("./tests/_bmpsuite-2.8/q");
    for await (const sample of files) {
      if (!sample.name.endsWith(".bmp")) continue;

      await t.step(sample.name, async () => {
        await runTest(`/q/${sample.name}`);
      });
    }
  });

  await t.step("'bad' BMPs", async (t) => {
    const files = await Deno.readDir("./tests/_bmpsuite-2.8/b");
    for await (const sample of files) {
      if (!sample.name.endsWith(".bmp")) continue;

      const hasPng = await exists(`./tests/_bmpsuite-2.8/b/${sample.name.replace(/\.bmp$/, ".png")}`);

      await t.step({
        name: sample.name,
        ignore: !hasPng,
        fn: async () => {
          await runTest(`/b/${sample.name}`);
        },
      });
    }
  });
});
