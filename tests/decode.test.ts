// deno-lint-ignore-file no-import-prefix

/**
 * Decode tests against the BMP Suite by Jason Summers (https://entropymine.com/jason/bmpsuite/):
 * pixel comparison vs reference PNGs for good/questionable files, plus crash safety over the malformed "b/" files.
 */

import { assert, assertEquals } from "jsr:@std/assert@1";
import { join } from "jsr:@std/path@1";
import sharp from "npm:sharp@^0.34.5";
import { BmpError, decode, extractCompressedData, type RawImageData } from "../src/mod.ts";
import { assertPixelsMatch, SUITE_DIR } from "./_utils.ts";

/** Decodes one suite file and compares it against the PNG the suite ships beside it. */
async function runTest(filePath: string) {
  const bmpBuffer = await Deno.readFile(join(SUITE_DIR, filePath));
  const pngBuffer = await Deno.readFile(join(SUITE_DIR, filePath.replace(/\.bmp$/, ".png")));

  let bmp: RawImageData;
  try {
    bmp = decode(bmpBuffer);
  } catch (error) {
    // An embedded JPEG or PNG is read through `extractCompressedData`, as the docs prescribe.
    if (error instanceof BmpError && error.code === "EMBEDDED_IMAGE") {
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

  const png = await sharp(pngBuffer).raw().toBuffer({ resolveWithObject: true });

  // The tolerance covers rounding that differs between our channel scaling and the reference renderer's.
  assertPixelsMatch(bmp, {
    width: png.info.width,
    height: png.info.height,
    channels: png.info.channels as 1 | 3 | 4,
    data: png.data,
  }, 0.004);
}

Deno.test("decode() matches the reference image for every 'good' file", async (t) => {
  for await (const entry of Deno.readDir(join(SUITE_DIR, "g"))) {
    if (!entry.name.endsWith(".bmp")) continue;

    await t.step(entry.name, async () => {
      await runTest(`g/${entry.name}`);
    });
  }
});

Deno.test("decode() matches the reference image for every 'questionable' file", async (t) => {
  // rgb24prof2.bmp relies on an embedded ICC profile to correct swapped channels; we don't apply ICC profiles.
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

Deno.test("decode() either returns a self-consistent image or throws on every malformed file", async (t) => {
  for await (const entry of Deno.readDir(join(SUITE_DIR, "b"))) {
    if (!entry.name.endsWith(".bmp")) continue;

    await t.step(entry.name, async () => {
      const buf = await Deno.readFile(join(SUITE_DIR, "b", entry.name));
      // The pixel values are not asserted: on input this broken there is no correct output to compare with.
      try {
        const r = decode(buf);
        assert(Number.isInteger(r.width) && r.width >= 0);
        assert(Number.isInteger(r.height) && r.height >= 0);
        assertEquals(r.data.length, r.width * r.height * r.channels);
      } catch (err) {
        assert(err instanceof BmpError, `A malformed file must fail with our own error, got ${err}`);
      }
    });
  }
});
