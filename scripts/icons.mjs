// Renders `assets/icon.svg` to the PNG sizes the stores and browsers need, in `public/icon/`,
// where WXT picks them up for the manifest. Run with `pnpm icons` after changing the SVG.
import { mkdir } from "node:fs/promises";
import sharp from "sharp";

const SIZES = [16, 32, 48, 96, 128];
const source = new URL("../assets/icon.svg", import.meta.url);
const outDir = new URL("../public/icon/", import.meta.url);

await mkdir(outDir, { recursive: true });
for (const size of SIZES) {
    await sharp(source.pathname, { density: ((72 * size) / 128) * 4 })
        .resize(size, size)
        .png({ compressionLevel: 9 })
        .toFile(new URL(`${size}.png`, outDir).pathname);
}
console.log(`Wrote ${SIZES.map((s) => `${s}.png`).join(", ")} to public/icon/`);
