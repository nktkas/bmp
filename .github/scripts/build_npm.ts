// deno-lint-ignore-file no-import-prefix

/**
 * Builds the Deno library into an ESM-only npm package.
 *
 * @example
 * ```sh
 * deno run -A .github/scripts/build_npm.ts
 * ```
 */

import { build } from "jsr:@nktkas/dtn@^1";
import denoJson from "../../deno.json" with { type: "json" };

if (import.meta.main) {
  await build({
    outDir: "dist",
    denoJson,
    packageJson: {
      description: "A fast, lightweight, zero-dependency BMP image encoder/decoder written in pure JavaScript.",
      keywords: ["bmp", "bitmap", "encoder", "decoder", "image"],
      homepage: "https://github.com/nktkas/bmp",
      bugs: { url: "https://github.com/nktkas/bmp/issues" },
      repository: { type: "git", url: "git+https://github.com/nktkas/bmp.git" },
      license: "MIT",
      author: { name: "nktkas", email: "github.turk9@passmail.net", url: "https://github.com/nktkas" },
      sideEffects: false,
      engines: { node: ">=22.12.0" },
    },
    copyFiles: ["README.md", "LICENSE"],
  });
}
