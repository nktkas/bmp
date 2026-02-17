/**
 * Compares decoded BMPs against reference PNGs from the BMP Suite by Jason Summers (https://entropymine.com/jason/bmpsuite/).
 */

// deno-lint-ignore-file no-import-prefix
import { assertEquals } from "jsr:@std/assert@1";
import { join } from "jsr:@std/path@1";
import { decode, extractCompressedData, type RawImageData } from "../../src/mod.ts";
import sharp from "npm:sharp@^0.34.5";
import pixelmatch from "npm:pixelmatch@7";
import { SUITE_DIR, toRgba } from "../_utils.ts";

/** Checks if a file exists. */
async function exists(path: string): Promise<boolean> {
  try {
    await Deno.stat(path);
    return true;
  } catch {
    return false;
  }
}

/** Compares decoded BMP with PNG reference. */
async function runTest(filePath: string) {
  const bmpBuffer = await Deno.readFile(join(SUITE_DIR, filePath));
  const pngBuffer = await Deno.readFile(join(SUITE_DIR, filePath.replace(/\.bmp$/, ".png")));

  // Decode BMP
  let bmp: RawImageData;
  try {
    bmp = decode(bmpBuffer);
  } catch (error) {
    // For BI_JPEG and BI_PNG, test extractCompressedData instead
    if (error instanceof Error && error.message.includes('Use "extractCompressedData" to')) {
      const extracted = extractCompressedData(bmpBuffer);
      const raw = await sharp(extracted.data).raw().toBuffer({ resolveWithObject: true });
      bmp = {
        width: raw.info.width,
        height: raw.info.height,
        channels: raw.info.channels as 3 | 4,
        data: raw.data,
      };
    } else {
      throw error;
    }
  }

  // Decode PNG using sharp
  const png = await sharp(pngBuffer).raw().toBuffer({ resolveWithObject: true });

  // Compare dimensions and pixels
  assertEquals(bmp.width, png.info.width, "Width mismatch");
  assertEquals(bmp.height, png.info.height, "Height mismatch");

  const diff = pixelmatch(
    toRgba(bmp.data, bmp.channels),
    toRgba(png.data, png.info.channels as 1 | 3 | 4),
    undefined,
    bmp.width,
    bmp.height,
    { threshold: 0.004 }, // Allow very small differences (due to different rounding strategies)
  );
  assertEquals(diff, 0, "Found different pixels");
}

Deno.test("Decode", async (t) => {
  await t.step("'good' BMPs", async (t) => {
    for await (const entry of Deno.readDir(join(SUITE_DIR, "g"))) {
      if (!entry.name.endsWith(".bmp")) continue;

      await t.step(entry.name, async () => {
        await runTest(`g/${entry.name}`);
      });
    }
  });

  await t.step("'questionable' BMPs", async (t) => {
    const ignored = new Set(["rgb24prof2.bmp"]);

    for await (const entry of Deno.readDir(join(SUITE_DIR, "q"))) {
      if (!entry.name.endsWith(".bmp")) continue;

      await t.step({
        name: entry.name,
        ignore: ignored.has(entry.name),
        fn: async () => {
          await runTest(`q/${entry.name}`);
        },
      });
    }
  });

  await t.step("'bad' BMPs", async (t) => {
    for await (const entry of Deno.readDir(join(SUITE_DIR, "b"))) {
      if (!entry.name.endsWith(".bmp")) continue;

      const hasPng = await exists(join(SUITE_DIR, "b", entry.name.replace(/\.bmp$/, ".png")));

      await t.step({
        name: entry.name,
        ignore: !hasPng,
        fn: async () => {
          await runTest(`b/${entry.name}`);
        },
      });
    }
  });
});
