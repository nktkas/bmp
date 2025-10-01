// deno-lint-ignore-file no-import-prefix
import { decode } from "@nktkas/bmp";
import { assertEquals } from "jsr:@std/assert@^1.0.14";

function pam2raw(buffer: Uint8Array) {
  const text = new TextDecoder().decode(buffer);
  const lines = text.split("\n");

  if (lines[0] !== "P7") throw new Error("Invalid PAM file");

  let width = 0, height = 0, channels = 0;

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (line.startsWith("WIDTH ")) width = parseInt(line.split(" ")[1]);
    else if (line.startsWith("HEIGHT ")) height = parseInt(line.split(" ")[1]);
    else if (line.startsWith("DEPTH ")) channels = parseInt(line.split(" ")[1]);
  }

  const dataOffset = text.indexOf("\nENDHDR\n") + 8;
  const data = buffer.slice(dataOffset);

  return { width, height, channels, data };
}

function isEqualsUint8ArrayWithTolerance(a: Uint8Array, b: Uint8Array, tolerance: number): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (Math.abs(a[i] - b[i]) > tolerance) return false;
  }
  return true;
}

function compareDecodeResult(bmpBuffer: Uint8Array, pamBuffer: Uint8Array) {
  const bmp = decode(bmpBuffer);
  const pam = pam2raw(pamBuffer);

  assertEquals(bmp.width, pam.width);
  assertEquals(bmp.height, pam.height);
  assertEquals(bmp.channels, pam.channels);
  try {
    assertEquals(bmp.data, pam.data);
  } catch (error) {
    // colors may differ by 2 units due to the peculiarity of some other decoders
    if (!isEqualsUint8ArrayWithTolerance(bmp.data, pam.data, 2)) {
      throw error;
    }
  }
}

Deno.test('Decode "good" BMP', async (t) => {
  for await (const sample of Deno.readDir("./tests/decode/images/good")) {
    if (!sample.name.endsWith(".bmp")) continue;

    await t.step(sample.name, async () => {
      const bmpBuffer = await Deno.readFile(`./tests/decode/images/good/${sample.name}`);
      const pamBuffer = await Deno.readFile(`./tests/decode/images/good/${sample.name.replace(/\.bmp$/, ".pam")}`);
      compareDecodeResult(bmpBuffer, pamBuffer);
    });
  }
});

Deno.test('Decode "questionable" BMP', async (t) => {
  for await (const sample of Deno.readDir("./tests/decode/images/questionable")) {
    if (!sample.name.endsWith(".bmp")) continue;

    await t.step(sample.name, async () => {
      const bmpBuffer = await Deno.readFile(`./tests/decode/images/questionable/${sample.name}`);
      const pamBuffer = await Deno.readFile(
        `./tests/decode/images/questionable/${sample.name.replace(/\.bmp$/, ".pam")}`,
      );
      compareDecodeResult(bmpBuffer, pamBuffer);
    });
  }
});
