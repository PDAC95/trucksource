import { describe, expect, it, vi, beforeEach } from "vitest";

// Unit-test the LISTING TRUST BOUNDARY's security spine WITHOUT a live DB: the
// unauthenticated guard, the strip-fail short-circuit (never upload), and the
// photo-path ownership guard (Pitfall 5, never insert). The RLS behavior itself is
// covered by 05-01's live integration test — here we prove the guard ORDER.

// Mock the EXIF strip so no native sharp work runs; each test sets its own return.
const stripAndReencode = vi.fn();
vi.mock("@/lib/images/strip", () => ({
  stripAndReencode: (...a: unknown[]) => stripAndReencode(...a),
}));

// Supabase server stub: getClaims -> sub, a chainable storage.from() with upload/remove,
// and a chainable from() that records insert calls. Each test wires the bits it needs.
const getClaims = vi.fn();
const storageUpload = vi.fn();
const storageRemove = vi.fn();
const fromInsert = vi.fn();

// A minimal chainable .from() builder. .insert() records via fromInsert; the
// .select().single()/.maybeSingle() terminals resolve to benign data so create flows
// that reach the DB don't crash (the guard tests short-circuit before they matter).
function makeFrom() {
  const chain: Record<string, unknown> = {};
  const ret = () => chain;
  chain.select = vi.fn(ret);
  chain.eq = vi.fn(ret);
  chain.insert = vi.fn((rows: unknown) => {
    fromInsert(rows);
    return {
      select: () => ({
        single: async () => ({ data: { id: 1 }, error: null }),
      }),
    };
  });
  chain.maybeSingle = vi.fn(async () => ({
    data: { model_id: 1 },
    error: null,
  }));
  chain.single = vi.fn(async () => ({ data: { id: 1 }, error: null }));
  chain.delete = vi.fn(ret);
  chain.order = vi.fn(ret);
  return chain;
}

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { getClaims: () => getClaims() },
    storage: {
      from: () => ({
        upload: (...a: unknown[]) => storageUpload(...a),
        remove: (...a: unknown[]) => storageRemove(...a),
      }),
    },
    from: () => makeFrom(),
  }),
}));

import { uploadListingPhoto, createListing } from "@/lib/actions/listings";

const UID = "11111111-1111-1111-1111-111111111111";

function validListingInput(overrides: Record<string, unknown> = {}) {
  return {
    title: "Hood for 379",
    askingPrice: 250,
    conditionId: 1,
    shippingOption: "local_pickup",
    isBarnyard: true, // barnyard so fitment may be empty (schema refine)
    fitment: [],
    // LIST-08: 3 photos minimum, so the schema gate passes and the tests below
    // exercise the guards that come AFTER it.
    photoPaths: [
      `${UID}/staging/abc.webp`,
      `${UID}/staging/def.webp`,
      `${UID}/staging/ghi.webp`,
    ],
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  getClaims.mockResolvedValue({ data: { claims: { sub: UID } } });
  stripAndReencode.mockResolvedValue({
    ok: true,
    buffer: Buffer.from("x"),
    contentType: "image/webp",
    ext: "webp",
  });
  storageUpload.mockResolvedValue({ error: null });
});

describe("uploadListingPhoto — EXIF gate is the spine", () => {
  it("unauthenticated -> error, never strips, never uploads", async () => {
    getClaims.mockResolvedValue({ data: { claims: null } });
    const form = new FormData();
    form.set(
      "file",
      new File([new Uint8Array([1, 2])], "p.jpg", { type: "image/jpeg" }),
    );

    const res = await uploadListingPhoto(form);

    expect(res).toEqual({ ok: false, error: "unauthenticated" });
    expect(stripAndReencode).not.toHaveBeenCalled();
    expect(storageUpload).not.toHaveBeenCalled();
  });

  it("strip fails (unsupported_type) -> propagates, NEVER uploads", async () => {
    stripAndReencode.mockResolvedValue({
      ok: false,
      error: "unsupported_type",
    });
    const form = new FormData();
    form.set(
      "file",
      new File([new Uint8Array([1, 2])], "p.heic", { type: "image/heic" }),
    );

    const res = await uploadListingPhoto(form);

    expect(res).toEqual({ ok: false, error: "unsupported_type" });
    expect(storageUpload).not.toHaveBeenCalled();
  });

  it("happy path -> strips then uploads ONLY the clean buffer to a staging path", async () => {
    const form = new FormData();
    form.set(
      "file",
      new File([new Uint8Array([1, 2])], "p.jpg", { type: "image/jpeg" }),
    );

    const res = await uploadListingPhoto(form);

    expect(res.ok).toBe(true);
    if (res.ok) expect(res.path.startsWith(`${UID}/staging/`)).toBe(true);
    expect(storageUpload).toHaveBeenCalledOnce();
  });
});

describe("createListing — photo-path ownership + schema guards", () => {
  it("unauthenticated -> error, never inserts", async () => {
    getClaims.mockResolvedValue({ data: { claims: null } });

    const res = await createListing(validListingInput());

    expect(res).toEqual({ ok: false, error: "unauthenticated" });
    expect(fromInsert).not.toHaveBeenCalled();
  });

  it("photoPath outside the caller's folder -> invalid_photo_path, never inserts", async () => {
    const res = await createListing(
      validListingInput({
        // 3 paths so the LIST-08 schema gate passes — the ownership guard is
        // what must reject (one foreign path is enough).
        photoPaths: [
          `${UID}/staging/a.webp`,
          `${UID}/staging/b.webp`,
          "someone-else/staging/x.webp",
        ],
      }),
    );

    expect(res).toEqual({ ok: false, error: "invalid_photo_path" });
    expect(fromInsert).not.toHaveBeenCalled();
  });

  it("fewer than 3 photos -> invalid (LIST-08), never inserts", async () => {
    const res = await createListing(
      validListingInput({
        photoPaths: [`${UID}/staging/a.webp`, `${UID}/staging/b.webp`],
      }),
    );

    expect(res).toEqual({ ok: false, error: "invalid" });
    expect(fromInsert).not.toHaveBeenCalled();
  });

  it("invalid payload (missing title) -> invalid, never inserts", async () => {
    const res = await createListing(validListingInput({ title: "" }));

    expect(res).toEqual({ ok: false, error: "invalid" });
    expect(fromInsert).not.toHaveBeenCalled();
  });
});
