import { decode } from "@nktkas/bmp";

function runBench(group: string, data: Uint8Array<ArrayBuffer>) {
  Deno.bench("decode + convert to RGB", { group }, () => {
    const decoded = decode(data);
    toRGB(decoded.data, decoded.channels);
  });
  Deno.bench("desiredChannels: 3 (RGB)", { group }, () => {
    decode(data, { desiredChannels: 3 });
  });
  Deno.bench("decode + convert to RGBA", { group }, () => {
    const decoded = decode(data);
    toRGBA(decoded.data, decoded.channels);
  });
  Deno.bench("desiredChannels: 4 (RGBA)", { group }, () => {
    decode(data, { desiredChannels: 4 });
  });
}

function toRGB(data: Uint8Array, channels: 1 | 3 | 4): Uint8Array {
  if (channels === 1) { // grayscale to RGB
    const rgb = new Uint8Array(data.length * 3);
    for (let i = 0, j = 0; i < data.length; i++, j += 3) {
      rgb[j] = data[i];
      rgb[j + 1] = data[i];
      rgb[j + 2] = data[i];
    }
    return rgb;
  } else if (channels === 3) { // RGB to RGB
    return data;
  } else { // RGBA to RGB
    const rgb = new Uint8Array((data.length / 4) * 3);
    for (let i = 0, j = 0; i < data.length; i += 4, j += 3) {
      rgb[j] = data[i];
      rgb[j + 1] = data[i + 1];
      rgb[j + 2] = data[i + 2];
    }
    return rgb;
  }
}

function toRGBA(data: Uint8Array, channels: 1 | 3 | 4): Uint8Array {
  if (channels === 1) { // grayscale to RGBA
    const rgba = new Uint8Array(data.length * 4);
    for (let i = 0, j = 0; i < data.length; i++, j += 4) {
      rgba[j] = data[i];
      rgba[j + 1] = data[i];
      rgba[j + 2] = data[i];
      rgba[j + 3] = 255;
    }
    return rgba;
  } else if (channels === 3) { // RGB to RGBA
    const rgba = new Uint8Array((data.length / 3) * 4);
    for (let i = 0, j = 0; i < data.length; i += 3, j += 4) {
      rgba[j] = data[i];
      rgba[j + 1] = data[i + 1];
      rgba[j + 2] = data[i + 2];
      rgba[j + 3] = 255;
    }
    return rgba;
  } else { // RGBA to RGBA
    return data;
  }
}

const pal1bg = await Deno.readFile("./tests/_bmpsuite-2.8/g/pal1bg.bmp");
runBench("desiredChannels: BI_RGB 1-bit", pal1bg);

const pal1 = await Deno.readFile("./tests/_bmpsuite-2.8/g/pal1.bmp");
runBench("desiredChannels: BI_RGB 1-bit grayscale", pal1);

const pal4 = await Deno.readFile("./tests/_bmpsuite-2.8/g/pal4.bmp");
runBench("desiredChannels: BI_RGB 4-bit", pal4);

const pal4gs = await Deno.readFile("./tests/_bmpsuite-2.8/g/pal4gs.bmp");
runBench("desiredChannels: BI_RGB 4-bit grayscale", pal4gs);

const pal8 = await Deno.readFile("./tests/_bmpsuite-2.8/g/pal8.bmp");
runBench("desiredChannels: BI_RGB 8-bit", pal8);

const pal8gs = await Deno.readFile("./tests/_bmpsuite-2.8/g/pal8gs.bmp");
runBench("desiredChannels: BI_RGB 8-bit grayscale", pal8gs);

const rgb16 = await Deno.readFile("./tests/_bmpsuite-2.8/g/rgb16.bmp");
runBench("desiredChannels: BI_RGB 16-bit", rgb16);

const rgb24 = await Deno.readFile("./tests/_bmpsuite-2.8/g/rgb24.bmp");
runBench("desiredChannels: BI_RGB 24-bit", rgb24);

const rgb32 = await Deno.readFile("./tests/_bmpsuite-2.8/g/rgb32.bmp");
runBench("desiredChannels: BI_RGB 32-bit", rgb32);

const pal4rle = await Deno.readFile("./tests/_bmpsuite-2.8/g/pal4rle.bmp");
runBench("desiredChannels: BI_RLE4", pal4rle);

const pal8rle = await Deno.readFile("./tests/_bmpsuite-2.8/g/pal8rle.bmp");
runBench("desiredChannels: BI_RLE8", pal8rle);

const rgb16bfdef = await Deno.readFile("./tests/_bmpsuite-2.8/g/rgb16bfdef.bmp");
runBench("desiredChannels: BI_BITFIELDS 16-bit", rgb16bfdef);

const rgb32bfdef = await Deno.readFile("./tests/_bmpsuite-2.8/g/rgb32bfdef.bmp");
runBench("desiredChannels: BI_BITFIELDS 32-bit", rgb32bfdef);
