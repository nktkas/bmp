/**
 * Compares decoded BMPs against reference PNGs from the BMP Suite by Jason Summers (https://entropymine.com/jason/bmpsuite/).
 */

// deno-lint-ignore-file no-import-prefix
import { decode, extractCompressedData } from "@nktkas/bmp";
import { assertEquals } from "jsr:@std/assert@^1.0.14";
import { exists } from "jsr:@std/fs@^1.0.19";
import sharp from "npm:sharp@^0.34.4";
import pixelmatch from "npm:pixelmatch@^7.1.0";

/** Converts any channel format to RGB (removes alpha, expands grayscale) */
function toRGB(data: Uint8Array, channels: 1 | 3 | 4): Uint8Array {
  if (channels === 1) {
    // Grayscale to RGB
    const rgb = new Uint8Array(data.length * 3);
    for (let i = 0, j = 0; i < data.length; i++, j += 3) {
      rgb[j] = data[i];
      rgb[j + 1] = data[i];
      rgb[j + 2] = data[i];
    }
    return rgb;
  }
  if (channels === 3) {
    return data; // Already RGB
  }
  // RGBA to RGB (remove alpha)
  const rgb = new Uint8Array((data.length / 4) * 3);
  for (let i = 0, j = 0; i < data.length; i += 4, j += 3) {
    rgb[j] = data[i];
    rgb[j + 1] = data[i + 1];
    rgb[j + 2] = data[i + 2];
  }
  return rgb;
}

/** Converts any channel format to RGBA (adds alpha=255, expands grayscale) */
function toRGBA(data: Uint8Array, channels: 1 | 3 | 4): Uint8Array {
  if (channels === 1) {
    // Grayscale to RGBA
    const rgba = new Uint8Array(data.length * 4);
    for (let i = 0, j = 0; i < data.length; i++, j += 4) {
      rgba[j] = data[i];
      rgba[j + 1] = data[i];
      rgba[j + 2] = data[i];
      rgba[j + 3] = 255;
    }
    return rgba;
  }
  if (channels === 3) {
    // RGB to RGBA
    const rgba = new Uint8Array((data.length / 3) * 4);
    for (let i = 0, j = 0; i < data.length; i += 3, j += 4) {
      rgba[j] = data[i];
      rgba[j + 1] = data[i + 1];
      rgba[j + 2] = data[i + 2];
      rgba[j + 3] = 255;
    }
    return rgba;
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
    toRGBA(bmp.data, bmp.channels),
    toRGBA(png.data, png.info.channels as 1 | 3 | 4),
    undefined,
    bmp.width,
    bmp.height,
    { threshold: 0.004 }, // Allow very small differences (due to different rounding strategies)
  );
  assertEquals(diff, 0, "Found different pixels");
}

Deno.test("Decode", async (t) => {
  await t.step("'good' BMPs", async (t) => {
    for await (const sample of Deno.readDir("./tests/_bmpsuite-2.8/g")) {
      if (!sample.name.endsWith(".bmp")) continue;

      await t.step(sample.name, async () => {
        await runTest(`/g/${sample.name}`);
      });
    }
  });

  await t.step("'questionable' BMPs", async (t) => {
    for await (const sample of Deno.readDir("./tests/_bmpsuite-2.8/q")) {
      if (!sample.name.endsWith(".bmp")) continue;

      await t.step(sample.name, async () => {
        await runTest(`/q/${sample.name}`);
      });
    }
  });

  await t.step("'bad' BMPs", async (t) => {
    for await (const sample of Deno.readDir("./tests/_bmpsuite-2.8/b")) {
      if (!sample.name.endsWith(".bmp")) continue;

      const hasPng = await exists(`./tests/_bmpsuite-2.8/b/${sample.name.replace(/\.bmp$/, ".png")}`);
      await t.step({
        name: sample.name,
        fn: async () => {
          await runTest(`/b/${sample.name}`);
        },
        ignore: !hasPng,
      });
    }
  });

  await t.step("'desiredChannels' parameter", async (t) => {
    await t.step("desiredChannels: 3 (RGB)", async (t) => {
      for await (const sample of Deno.readDir("./tests/_bmpsuite-2.8/g")) {
        if (!sample.name.endsWith(".bmp")) continue;

        await t.step(sample.name, async () => {
          const bmpBuffer = await Deno.readFile(`./tests/_bmpsuite-2.8/g/${sample.name}`);

          // Decode with auto-detect
          let autoDecoded: ReturnType<typeof decode>;
          try {
            autoDecoded = decode(bmpBuffer);
          } catch (error) {
            if (error instanceof Error && error.message.includes('Use "extractCompressedData" to')) {
              // Skip JPEG/PNG embedded images
              return;
            }
            throw error;
          }

          // Test desiredChannels: 3 (RGB)
          const rgb = decode(bmpBuffer, { desiredChannels: 3 });
          assertEquals(rgb.width, autoDecoded.width, "Width mismatch");
          assertEquals(rgb.height, autoDecoded.height, "Height mismatch");
          assertEquals(rgb.channels, 3, "Expected 3 channels");

          // Compare RGB pixels using conversion function
          const expectedRGB = toRGB(autoDecoded.data, autoDecoded.channels);
          assertEquals(rgb.data, expectedRGB, "RGB pixel data mismatch");
        });
      }
    });

    await t.step("desiredChannels: 4 (RGBA)", async (t) => {
      for await (const sample of Deno.readDir("./tests/_bmpsuite-2.8/g")) {
        if (!sample.name.endsWith(".bmp")) continue;

        await t.step(sample.name, async () => {
          const bmpBuffer = await Deno.readFile(`./tests/_bmpsuite-2.8/g/${sample.name}`);

          // Decode with auto-detect
          let autoDecoded: ReturnType<typeof decode>;
          try {
            autoDecoded = decode(bmpBuffer);
          } catch (error) {
            if (error instanceof Error && error.message.includes('Use "extractCompressedData" to')) {
              // Skip JPEG/PNG embedded images
              return;
            }
            throw error;
          }

          // Test desiredChannels: 4 (RGBA)
          const rgba = decode(bmpBuffer, { desiredChannels: 4 });
          assertEquals(rgba.width, autoDecoded.width, "Width mismatch");
          assertEquals(rgba.height, autoDecoded.height, "Height mismatch");
          assertEquals(rgba.channels, 4, "Expected 4 channels");

          // Compare RGBA pixels using conversion function
          const expectedRGBA = toRGBA(autoDecoded.data, autoDecoded.channels);
          assertEquals(rgba.data, expectedRGBA, "RGBA pixel data mismatch");
        });
      }
    });
  });
});
