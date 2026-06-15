// Brand asset generation — derives the favicon/icon set, the apple-touch icon,
// the OpenGraph share card, and the header logo mark FROM the stakeholder
// originals in private/brand/ (git-ignored). Only the derived copies in app/
// and public/ are committed. Re-run with `npm run gen:icons`.
//
// Sources (exact on-disk paths — note the SQUARE icon filename has spaces):
//   private/brand/logo.png            -> full horizontal wordmark ("OG TRUCK PARTS" + 11 + trailer)
//   private/brand/og icon  logo.png   -> square "OG" icon mark (double space between "icon" and "logo")
//
// sharp re-encodes/resizes/composites; sharp CANNOT emit .ico, so the favicon
// goes through png-to-ico from a small PNG buffer.

import { existsSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import sharp from "sharp";
import pngToIco from "png-to-ico";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");

// The navy base token (--background == oklch(0.18 0.022 264)). Used for opaque
// flattening (iOS fills transparency unpredictably) and the OG canvas.
const NAVY = "#0d111b";

// Exact source paths on disk — quoted/escaped via resolve() segments so the
// spaces in the icon filename are handled correctly on every platform.
const SRC_FULL = resolve(root, "private/brand/logo.png");
const SRC_ICON = resolve(root, "private/brand/og icon  logo.png");

// Fail loudly if the stakeholder source is missing — never emit blank images.
for (const src of [SRC_FULL, SRC_ICON]) {
  if (!existsSync(src)) {
    console.error(`MISSING SOURCE: ${src}`);
    console.error(
      "Stakeholder brand source not found in private/brand/. Aborting — refusing to emit blank assets.",
    );
    process.exit(1);
  }
}

const out = (p) => resolve(root, p);

// Build an RGBA PNG buffer from a source image with near-white pixels turned
// transparent. Any pixel whose R, G, and B all exceed `threshold` becomes
// fully transparent; everything else keeps full opacity. Used to lift the
// stakeholder wordmark off its white background so it composites on navy.
async function removeWhiteBackground(src, threshold) {
  const { data, info } = await sharp(src)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const px = info.width * info.height;
  const ch = info.channels; // 4 after ensureAlpha
  for (let i = 0; i < px; i++) {
    const o = i * ch;
    if (data[o] >= threshold && data[o + 1] >= threshold && data[o + 2] >= threshold) {
      data[o + 3] = 0;
    }
  }
  return sharp(data, { raw: { width: info.width, height: info.height, channels: ch } })
    .png()
    .toBuffer();
}

async function run() {
  // app/icon.png — 512x512 from the square icon mark, transparency preserved.
  await sharp(SRC_ICON)
    .resize(512, 512, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toFile(out("app/icon.png"));

  // app/apple-icon.png — 180x180, FLATTENED onto opaque navy (iOS quirk).
  await sharp(SRC_ICON)
    .resize(180, 180, { fit: "contain", background: NAVY })
    .flatten({ background: NAVY })
    .png()
    .toFile(out("app/apple-icon.png"));

  // public/logo-mark.png — header-sized icon mark (96px square, transparent).
  await sharp(SRC_ICON)
    .resize(96, 96, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toFile(out("public/logo-mark.png"));

  // app/opengraph-image.png — 1200x630 navy canvas with the full wordmark
  // composited centered. The wordmark is scaled to ~80% of the canvas width,
  // and a subtle red neon drop-shadow glow is baked behind it (static).
  const ogW = 1200;
  const ogH = 630;
  // Constrain the wordmark to a box well inside the canvas so the blurred glow
  // (which bleeds outward) still fits without exceeding the canvas dimensions.
  const boxW = Math.round(ogW * 0.78);
  const boxH = Math.round(ogH * 0.7);

  // The full wordmark source ships on a near-white (#fdfdfd) background. On the
  // navy OG canvas that white box looks broken, so knock the near-white pixels
  // out to transparency before compositing. The neon art is dark/saturated, so
  // a high luminance threshold (>=245) cleanly targets only the background.
  const knockedOut = await removeWhiteBackground(SRC_FULL, 245);

  const wordmark = await sharp(knockedOut)
    .resize({ width: boxW, height: boxH, fit: "inside", withoutEnlargement: false })
    .png()
    .toBuffer();
  const wm = await sharp(wordmark).metadata();

  // A blurred red copy of the wordmark sits beneath it as a neon glow halo,
  // sized to match the wordmark exactly so it never overflows the canvas.
  const glow = await sharp(knockedOut)
    .resize({ width: wm.width, height: wm.height, fit: "inside" })
    .tint({ r: 232, g: 26, b: 26 }) // neon red accent
    .blur(18)
    .png()
    .toBuffer();
  const gm = await sharp(glow).metadata();

  await sharp({
    create: {
      width: ogW,
      height: ogH,
      channels: 4,
      background: NAVY,
    },
  })
    .composite([
      {
        input: glow,
        top: Math.round((ogH - gm.height) / 2),
        left: Math.round((ogW - gm.width) / 2),
        blend: "screen",
      },
      {
        input: wordmark,
        top: Math.round((ogH - wm.height) / 2),
        left: Math.round((ogW - wm.width) / 2),
      },
    ])
    .png()
    .toFile(out("app/opengraph-image.png"));

  // app/favicon.ico — 32 + 48 px PNG buffers fed to png-to-ico (REPLACES the
  // create-next-app default). Flattened onto navy so the tab glyph reads.
  const fav32 = await sharp(SRC_ICON)
    .resize(32, 32, { fit: "contain", background: NAVY })
    .flatten({ background: NAVY })
    .png()
    .toBuffer();
  const fav48 = await sharp(SRC_ICON)
    .resize(48, 48, { fit: "contain", background: NAVY })
    .flatten({ background: NAVY })
    .png()
    .toBuffer();
  const ico = await pngToIco([fav32, fav48]);
  const { writeFileSync } = await import("node:fs");
  writeFileSync(out("app/favicon.ico"), ico);

  // Report sizes so a too-small (blank) asset is obvious in CI logs.
  for (const f of [
    "app/icon.png",
    "app/apple-icon.png",
    "app/opengraph-image.png",
    "app/favicon.ico",
    "public/logo-mark.png",
  ]) {
    console.log(`  ${f} — ${statSync(out(f)).size} bytes`);
  }
  console.log("Brand assets generated.");
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
