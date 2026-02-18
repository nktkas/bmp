// deno-lint-ignore-file no-import-prefix
/**
 * Builds the Deno library for working with NodeJS or publishing to npm
 * Command: deno run -A .github/scripts/build_npm.ts
 */

import { build, emptyDir } from "jsr:@deno/dnt@^0.42.1";
import denoJson from "../../deno.json" with { type: "json" };

await emptyDir("./build/npm");
await build({
  entryPoints: Object.entries(denoJson.exports).map(([k, v]) => ({ name: k, path: v })),
  outDir: "./build/npm",
  shims: {},
  typeCheck: "both",
  test: false,
  package: {
    name: "@nktkas/bmp",
    version: denoJson.version,
    description: "A fast, lightweight, zero-dependency BMP image encoder/decoder written in pure JavaScript.",
    keywords: [
      "bmp",
      "bitmap",
      "encoder",
      "decoder",
      "image",
    ],
    homepage: "https://github.com/nktkas/bmp",
    bugs: {
      url: "https://github.com/nktkas/bmp/issues",
    },
    repository: {
      type: "git",
      url: "git+https://github.com/nktkas/bmp.git",
    },
    license: "MIT",
    author: {
      name: "nktkas",
      email: "github.turk9@passmail.net",
      url: "https://github.com/nktkas",
    },
    sideEffects: false,
    engines: {
      node: ">=20.19.0",
    },
  },
  compilerOptions: {
    lib: ["ESNext"],
    target: "Latest",
    sourceMap: true,
  },
});
await Promise.all([
  // Copy additional files to npm build directory
  Deno.copyFile("LICENSE", "build/npm/LICENSE"),
  Deno.copyFile("README.md", "build/npm/README.md"),
]);
