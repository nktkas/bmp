/**
 * For testing, we use sample images from Jason Summers' BMP Suite (https://entropymine.com/jason/bmpsuite/).
 */

// deno-lint-ignore-file no-import-prefix
import { decode, extractCompressedData } from "@nktkas/bmp";
import { assertEquals } from "jsr:@std/assert@^1.0.14";
import { exists } from "jsr:@std/fs@^1.0.19";
import sharp from "npm:sharp@^0.34.4";
import pixelmatch from "npm:pixelmatch@^7.1.0";

async function compareDecodeResult(bmpBuffer: Uint8Array, pngBuffer: Uint8Array) {
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

  const png = await sharp(pngBuffer).raw().toBuffer({ resolveWithObject: true });

  assertEquals(bmp.width, png.info.width);
  assertEquals(bmp.height, png.info.height);

  const diff = pixelmatch(
    addAlphaChannel(bmp.data, bmp.channels),
    addAlphaChannel(png.data, png.info.channels as 1 | 3 | 4),
    undefined,
    bmp.width,
    bmp.height,
    { threshold: 0.004 }, // Allow very small differences (due to different rounding strategies)
  );
  assertEquals(diff, 0, `Found ${diff} different pixels`);
}

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

Deno.test('Decode "good" BMP', async (t) => {
  for await (const sample of Deno.readDir("./tests/decode/bmpsuite-2.8/g")) {
    if (!sample.name.endsWith(".bmp")) continue;
    await t.step(sample.name, async () => {
      const bmpBuffer = await Deno.readFile(`./tests/decode/bmpsuite-2.8/g/${sample.name}`);
      const pngBuffer = await Deno.readFile(`./tests/decode/bmpsuite-2.8/g/${sample.name.replace(/\.bmp$/, ".png")}`);
      await compareDecodeResult(bmpBuffer, pngBuffer);
    });
  }
});

Deno.test('Decode "questionable" BMP', async (t) => {
  for await (const sample of Deno.readDir("./tests/decode/bmpsuite-2.8/q")) {
    if (!sample.name.endsWith(".bmp")) continue;
    await t.step(sample.name, async () => {
      const bmpBuffer = await Deno.readFile(`./tests/decode/bmpsuite-2.8/q/${sample.name}`);
      const pngBuffer = await Deno.readFile(`./tests/decode/bmpsuite-2.8/q/${sample.name.replace(/\.bmp$/, ".png")}`);
      await compareDecodeResult(bmpBuffer, pngBuffer);
    });
  }
});

Deno.test('Decode "bad" BMP', async (t) => {
  for await (const sample of Deno.readDir("./tests/decode/bmpsuite-2.8/b")) {
    if (!sample.name.endsWith(".bmp")) continue;
    const hasPng = await exists(`./tests/decode/bmpsuite-2.8/b/${sample.name.replace(/\.bmp$/, ".png")}`);
    await t.step({
      name: sample.name,
      fn: async () => {
        const bmpBuffer = await Deno.readFile(`./tests/decode/bmpsuite-2.8/b/${sample.name}`);
        const pngBuffer = await Deno.readFile(`./tests/decode/bmpsuite-2.8/b/${sample.name.replace(/\.bmp$/, ".png")}`);
        await compareDecodeResult(bmpBuffer, pngBuffer);
      },
      ignore: !hasPng,
    });
  }
});
