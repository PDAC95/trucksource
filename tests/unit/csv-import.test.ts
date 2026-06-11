// csv-import.test.ts — ADMO-02 CSV bulk-import unit coverage.
//
// Two concerns:
//   1) The zod row schema (csvRowSchema): valid row, bad price, bad photo URL,
//      missing seller — per-row validation is the locked import contract.
//   2) The cross-cutting EXIF gate RE-VERIFICATION on the import path: a
//      GPS-laden JPEG fed through importPhoto() (the URL-fetch pipeline) must
//      come out of Storage with ZERO GPS/EXIF — same proof as
//      tests/unit/exif-strip.test.ts but through THIS code path, so a future
//      refactor can't quietly bypass stripAndReencode() for imported photos.
//
// Runs in node (sharp is a native binding), like exif-strip.test.ts.
//
// @vitest-environment node
import { describe, it, expect } from "vitest";
import sharp from "sharp";
import exifr from "exifr";
// @ts-expect-error — piexifjs ships no types; test-only EXIF writer.
import piexif from "piexifjs";
import type { SupabaseClient } from "@supabase/supabase-js";
import { csvRowSchema, importPhoto } from "@/lib/admin/import";

// ---------------------------------------------------------------------------
// 1) Row schema
// ---------------------------------------------------------------------------

const validRow = {
  seller: "BigRigBob",
  title: "Peterbilt 379 hood",
  part_number: "P379-HD-01",
  asking_price: "1250.50",
  condition: "Used - Good",
  shipping_option: "Local Pickup",
  damage_notes: "",
  is_barnyard: "",
  fitments: "Peterbilt 379",
  categories: "Hoods",
  photo_url_1: "https://example.com/hood.jpg",
  photo_url_2: "",
};

describe("csvRowSchema (per-row import contract)", () => {
  it("accepts a valid row and normalizes types", () => {
    const r = csvRowSchema.safeParse(validRow);
    expect(r.success).toBe(true);
    if (!r.success) return;
    expect(r.data.asking_price).toBe(1250.5);
    expect(r.data.shipping_option).toBe("local_pickup"); // normalized
    expect(r.data.is_barnyard).toBe(false);
    expect(r.data.photo_url_1).toBe("https://example.com/hood.jpg");
    expect(r.data.photo_url_2).toBeUndefined(); // empty cell collapses
    expect(r.data.damage_notes).toBeUndefined();
  });

  it("rejects a bad price (zero / negative / non-numeric)", () => {
    for (const bad of ["0", "-15", "abc", ""]) {
      const r = csvRowSchema.safeParse({ ...validRow, asking_price: bad });
      expect(r.success).toBe(false);
    }
  });

  it("rejects a non-https photo URL", () => {
    const r = csvRowSchema.safeParse({
      ...validRow,
      photo_url_1: "http://example.com/hood.jpg",
    });
    expect(r.success).toBe(false);
    const r2 = csvRowSchema.safeParse({
      ...validRow,
      photo_url_1: "not a url",
    });
    expect(r2.success).toBe(false);
  });

  it("rejects a missing seller", () => {
    expect(csvRowSchema.safeParse({ ...validRow, seller: "" }).success).toBe(
      false,
    );
    const { seller: _drop, ...withoutSeller } = validRow;
    expect(csvRowSchema.safeParse(withoutSeller).success).toBe(false);
  });

  it("requires fitments unless barnyard (the publish-gate rule, at import time)", () => {
    const noFit = csvRowSchema.safeParse({ ...validRow, fitments: "" });
    expect(noFit.success).toBe(false);
    const barnyard = csvRowSchema.safeParse({
      ...validRow,
      fitments: "",
      is_barnyard: "yes",
    });
    expect(barnyard.success).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 2) EXIF gate on the import path (cross-cutting P0 re-verification)
// ---------------------------------------------------------------------------

/** GPS-laden JPEG fixture — same piexifjs approach as exif-strip.test.ts
 * (sharp 0.34's .withExif silently drops the GPS IFD, so it can't build one). */
async function jpegWithGps(): Promise<Buffer> {
  const base = await sharp({
    create: { width: 64, height: 64, channels: 3, background: "#777" },
  })
    .jpeg()
    .toBuffer();
  const gps: Record<number, unknown> = {
    [piexif.GPSIFD.GPSLatitudeRef]: "N",
    [piexif.GPSIFD.GPSLatitude]: [
      [43, 1],
      [39, 1],
      [0, 1],
    ],
    [piexif.GPSIFD.GPSLongitudeRef]: "W",
    [piexif.GPSIFD.GPSLongitude]: [
      [79, 1],
      [23, 1],
      [0, 1],
    ],
  };
  const exifBytes = piexif.dump({
    "0th": { [piexif.ImageIFD.Make]: "TestCam" },
    GPS: gps,
  });
  return Buffer.from(
    piexif.insert(exifBytes, base.toString("binary")),
    "binary",
  );
}

/** Fake admin client capturing whatever importPhoto uploads to Storage. */
function fakeAdminCapturingUpload(captured: {
  buffer?: Buffer;
  path?: string;
}) {
  return {
    storage: {
      from: () => ({
        upload: async (path: string, buffer: Buffer) => {
          captured.path = path;
          captured.buffer = buffer;
          return { error: null };
        },
      }),
    },
  } as unknown as SupabaseClient;
}

describe("importPhoto — EXIF/GPS gate on URL-fetched photos", () => {
  it("strips GPS from a fetched photo before it reaches Storage", async () => {
    const withGps = await jpegWithGps();
    // Sanity: the fixture genuinely carries GPS.
    expect(await exifr.gps(withGps)).toBeTruthy();

    const captured: { buffer?: Buffer; path?: string } = {};
    const fetchImpl = (async () =>
      new Response(new Uint8Array(withGps), {
        status: 200,
        headers: { "content-type": "image/jpeg" },
      })) as unknown as typeof fetch;

    const result = await importPhoto(
      fakeAdminCapturingUpload(captured),
      "https://example.com/gps-photo.jpg",
      "11111111-2222-3333-4444-555555555555",
      fetchImpl,
    );

    expect(result.ok).toBe(true);
    expect(captured.buffer).toBeTruthy();
    if (!captured.buffer) return;

    // Path convention: the SELLER's uid prefix (same as regular uploads).
    expect(
      captured.path?.startsWith("11111111-2222-3333-4444-555555555555/"),
    ).toBe(true);

    // AUTHORITATIVE: no EXIF buffer at all in the stored bytes.
    const meta = await sharp(captured.buffer).metadata();
    expect(meta.exif).toBeUndefined();

    // DEFENSIVE: exifr finds no coordinates (throw = unparseable = no GPS).
    const gps = await exifr.gps(captured.buffer).catch(() => undefined);
    expect(gps == null || (gps.latitude == null && gps.longitude == null)).toBe(
      true,
    );
  });

  it("rejects non-https URLs without fetching", async () => {
    const captured: { buffer?: Buffer } = {};
    const result = await importPhoto(
      fakeAdminCapturingUpload(captured),
      "http://example.com/x.jpg",
      "uid",
      (async () => {
        throw new Error("must not fetch");
      }) as unknown as typeof fetch,
    );
    expect(result.ok).toBe(false);
    expect(captured.buffer).toBeUndefined();
  });

  it("rejects oversized photos before the strip", async () => {
    const big = Buffer.alloc(10 * 1024 * 1024 + 1);
    const captured: { buffer?: Buffer } = {};
    const fetchImpl = (async () =>
      new Response(new Uint8Array(big), {
        status: 200,
        headers: { "content-type": "image/jpeg" },
      })) as unknown as typeof fetch;
    const result = await importPhoto(
      fakeAdminCapturingUpload(captured),
      "https://example.com/huge.jpg",
      "uid",
      fetchImpl,
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toContain("10MB");
    expect(captured.buffer).toBeUndefined();
  });
});
