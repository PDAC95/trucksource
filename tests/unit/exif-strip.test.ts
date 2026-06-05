// exif-strip.test.ts — Phase-5 P0 no-GPS regression test (the LIST-03 CI gate).
//
// This is the automated proof that CLAUDE.md invariant #4 holds: a photo that
// arrives WITH GPS must come back out with NO GPS. We build a GPS-tagged JPEG in
// memory, sanity-assert it really has GPS, run it through stripAndReencode, then
// read the OUTPUT bytes back with `exifr` and assert no GPS / no EXIF survives.
// If anyone ever adds .withMetadata()/.keepMetadata()/.keepExif() to the strip
// chain, this test goes red and fails the build.
//
// Runs in the NODE environment (sharp is a native binding and needs node, not
// jsdom) — the default Vitest env in this repo is jsdom, so the docblock below
// overrides it for this file only.
//
// @vitest-environment node
import { describe, it, expect } from "vitest";
import sharp from "sharp";
import exifr from "exifr";
// @ts-expect-error — piexifjs ships no types; it is a test-only EXIF writer.
import piexif from "piexifjs";
import { stripAndReencode } from "@/lib/images/strip";

/**
 * Build a JPEG that genuinely carries a GPS EXIF block readable by `exifr`.
 *
 * NOTE: sharp 0.34's `.withExif({ GPS: ... })` silently DROPS the GPS IFD (verified
 * 2026-06-05 — the round-tripped buffer has no `gps` block), so it cannot produce a
 * meaningful fixture. `piexifjs` is the canonical JS EXIF writer and injects a real
 * GPS APP1 segment that exifr reads back as lat/long. This is a test-only dependency.
 */
async function jpegWithGps(): Promise<Buffer> {
  const base = await sharp({
    create: { width: 64, height: 64, channels: 3, background: "#888" },
  })
    .jpeg()
    .toBuffer();
  const binary = base.toString("binary");
  const gps: Record<number, unknown> = {
    [piexif.GPSIFD.GPSLatitudeRef]: "N",
    [piexif.GPSIFD.GPSLatitude]: [
      [50, 1],
      [17, 1],
      [0, 1],
    ],
    [piexif.GPSIFD.GPSLongitudeRef]: "E",
    [piexif.GPSIFD.GPSLongitude]: [
      [14, 1],
      [25, 1],
      [0, 1],
    ],
  };
  const exifObj = {
    "0th": { [piexif.ImageIFD.Make]: "TestCam" },
    GPS: gps,
  };
  const exifBytes = piexif.dump(exifObj);
  const withGpsBinary = piexif.insert(exifBytes, binary);
  return Buffer.from(withGpsBinary, "binary");
}

describe("EXIF/GPS strip (LIST-03 P0 gate)", () => {
  it("removes GPS from a photo that contained GPS", async () => {
    // Build an input image WITH GPS EXIF so the assertion is meaningful.
    const withGps = await jpegWithGps();

    // Sanity: the input really carries GPS (otherwise the test proves nothing).
    const before = await exifr.gps(withGps);
    expect(before).toBeTruthy();

    const out = await stripAndReencode(withGps, "image/jpeg");
    expect(out.ok).toBe(true);
    if (!out.ok) return;

    // PRIMARY, AUTHORITATIVE proof: sharp exposes the raw embedded EXIF buffer via
    // metadata().exif when present. After a clean strip there is NO EXIF buffer at
    // all — so neither GPS nor any other tag can possibly survive.
    const outMeta = await sharp(out.buffer).metadata();
    expect(outMeta.exif).toBeUndefined();

    // DEFENSIVE second read with exifr on the actual stripped bytes. exifr only
    // parses a recognizable EXIF/metadata container; on a metadata-less WebP it
    // EITHER returns undefined OR throws "Unknown file format" — both mean "no GPS".
    // We treat a throw as proof-of-absence and assert on any parsed coordinates.
    const gps = await exifr.gps(out.buffer).catch(() => undefined);
    expect(gps == null || (gps.latitude == null && gps.longitude == null)).toBe(
      true,
    );
    const all = await exifr
      .parse(out.buffer, { gps: true, exif: true })
      .catch(() => undefined);
    expect(all?.latitude).toBeUndefined();
    expect(all?.longitude).toBeUndefined();
  });

  it("rejects HEIC / non-accepted declared types", async () => {
    const r = await stripAndReencode(Buffer.from([0, 1, 2]), "image/heic");
    expect(r).toEqual({ ok: false, error: "unsupported_type" });
  });
});
