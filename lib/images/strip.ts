// lib/images/strip.ts — Phase 5, the P0 EXIF/GPS strip gate (CLAUDE.md invariant #4).
//
// Every uploaded photo is re-encoded server-side with `sharp` so the stored bytes
// carry ZERO metadata (no EXIF, no GPS, no XMP/IPTC). `sharp` strips ALL metadata
// by DEFAULT — the danger here is NOT forgetting to strip, it is *accidentally*
// re-attaching metadata via `.withMetadata()` / `.keepMetadata()` / `.keepExif()`.
// NONE of those appear in the chain below; the no-GPS regression test
// (tests/unit/exif-strip.test.ts) fails the build if metadata ever survives.
//
// `import "server-only"` keeps sharp on the server (invariant #3): sharp is a native
// libvips binding and must never reach a client bundle. Under Vitest the `server-only`
// import is aliased to a no-op stub so the helper's logic can be unit-tested directly.
//
// HEIC handling (Pitfall 2): the prebuilt npm `sharp` binary cannot decode HEIC/HEIF,
// so HEIC is REJECTED, not converted, in v1. Rejection happens two ways:
//   1) the declared MIME is not in ACCEPTED (an honest `image/heic` is rejected early);
//   2) the SNIFFED format (sharp().metadata().format) must be jpeg|png|webp — a
//      `.jpg`-labelled HEIC/SVG/other payload is rejected because its real format
//      isn't accepted (don't trust the client-declared MIME).
import "server-only";
import sharp from "sharp";

const MAX_BYTES = 10 * 1024 * 1024; // 10MB per photo (CONTEXT)
const ACCEPTED = ["image/jpeg", "image/png", "image/webp"]; // CONTEXT — JPG/PNG/WebP
const ACCEPTED_FORMATS = ["jpeg", "png", "webp"] as const; // sharp's detected `format`

export type StripResult =
  | { ok: true; buffer: Buffer; contentType: "image/webp"; ext: "webp" }
  | { ok: false; error: "too_large" | "unsupported_type" | "decode_failed" };

/**
 * Re-encode an image to WebP with ALL metadata stripped (the EXIF/GPS gate).
 *
 * Order of checks: size → declared MIME → sniffed format → re-encode.
 *
 * @param input        Raw uploaded bytes (the ORIGINAL — never persist these).
 * @param declaredType The browser-declared MIME (not trusted alone; cross-checked
 *                     against the sniffed format below).
 */
export async function stripAndReencode(
  input: Buffer,
  declaredType: string,
): Promise<StripResult> {
  if (input.byteLength > MAX_BYTES) return { ok: false, error: "too_large" };
  // An honest HEIC (image/heic) is rejected here; its MIME is not ACCEPTED.
  if (!ACCEPTED.includes(declaredType))
    return { ok: false, error: "unsupported_type" };

  try {
    // Sniff the REAL format — never trust the client-declared MIME. A `.jpg`-labelled
    // HEIC/SVG/other payload has a non-accepted detected format and is rejected.
    const meta = await sharp(input).metadata();
    if (
      !meta.format ||
      !ACCEPTED_FORMATS.includes(
        meta.format as (typeof ACCEPTED_FORMATS)[number],
      )
    ) {
      return { ok: false, error: "unsupported_type" };
    }

    // .rotate() with NO args bakes the EXIF orientation INTO the pixels, THEN all
    // metadata (incl. the orientation tag) is dropped — so the image stays upright
    // even after the tag is gone. ABSOLUTELY NO .withMetadata()/.keepMetadata()/
    // .keepExif(): those re-attach EXIF and silently break invariant #4.
    const buffer = await sharp(input).rotate().webp({ quality: 82 }).toBuffer();
    return { ok: true, buffer, contentType: "image/webp", ext: "webp" };
  } catch {
    // Any sharp throw (corrupt/undecodable payload, incl. HEIC slipping past the
    // MIME check) collapses to a single decode_failed.
    return { ok: false, error: "decode_failed" };
  }
}
