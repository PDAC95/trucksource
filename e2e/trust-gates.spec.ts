import { expect, test } from "@playwright/test";

/**
 * Phase 17 trust-gate e2e — the DETERMINISTIC slice of the seller-activation /
 * transaction trust gates: nav presence + the just-in-time verification gate
 * ROUTING (sell → /verify?require=seller, contact → /verify?require=phone) +
 * the anon→/login regression guard.
 *
 * This spec mirrors verify-wizard.spec's posture: it asserts routing/gating
 * with ZERO external network. The LIVE happy paths — a real OTP round-trip then
 * return-to-publish (draft-preserving) and return-to-contact (modal auto-open) —
 * and the prod-only BotID protect-path matching are validated MANUALLY at the
 * plan's human-verify checkpoint (Twilio Verify is live-SMS; BotID always scores
 * non-bot locally), NOT here. The server gates are unit-/RLS-covered (Plans
 * 17-01/17-02), so a lighter routing assertion is sufficient in CI.
 *
 * Required env:
 *   E2E_TEST_EMAIL / E2E_TEST_PASSWORD
 *     a CONFIRMED test account (the nav-presence leg needs any logged-in user).
 *   E2E_UNVERIFIED_EMAIL / E2E_UNVERIFIED_PASSWORD
 *     a CONFIRMED account WITHOUT phone_verified_at (exercises the unverified
 *     sell/contact gate legs). The standard E2E_TEST_* account in the staging
 *     fixtures is phone-verified, so it would NOT trip the gate — hence a
 *     separate pair. Both gate legs `test.skip` cleanly when it is absent.
 */

const TEST_EMAIL = process.env.E2E_TEST_EMAIL;
const TEST_PASSWORD = process.env.E2E_TEST_PASSWORD;
const UNVERIFIED_EMAIL = process.env.E2E_UNVERIFIED_EMAIL;
const UNVERIFIED_PASSWORD = process.env.E2E_UNVERIFIED_PASSWORD;

async function login(
  page: import("@playwright/test").Page,
  email: string,
  password: string,
) {
  await page.goto("/login");
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: /^log in$/i }).click();
  await expect(page).not.toHaveURL(/\/login/);
}

// Resolve the URL of the first active listing from the public /browse feed.
// Returns the relative /listings/<id> path, or null when the feed is empty
// (the dependent contact-gate legs self-skip in that case — they need a real
// active listing, which Claude cannot seed deterministically here).
async function firstListingPath(
  page: import("@playwright/test").Page,
): Promise<string | null> {
  await page.goto("/browse");
  const card = page.locator('a[href^="/listings/"]').first();
  if ((await card.count()) === 0) return null;
  const href = await card.getAttribute("href");
  return href ?? null;
}

test.describe("trust gates — nav presence (logged-in)", () => {
  test.skip(
    !TEST_EMAIL || !TEST_PASSWORD,
    "Set E2E_TEST_EMAIL and E2E_TEST_PASSWORD (a confirmed test account) to run the authed nav-presence leg.",
  );

  test("header shows Sell, and the user menu shows My Listings + Account", async ({
    page,
  }) => {
    await login(page, TEST_EMAIL!, TEST_PASSWORD!);

    // VERF-02: Sell is the primary conversion affordance in the header action
    // cluster — present for any logged-in user, linking the create-listing flow.
    const sell = page.getByRole("link", { name: "Sell" });
    await expect(sell).toBeVisible();
    await expect(sell).toHaveAttribute("href", "/sell");

    // VERF-03/04: the seller-listings + account entries live in the user menu
    // dropdown (Radix — open it to render the items).
    await page.getByRole("button", { name: TEST_EMAIL ? /.+/ : /account/i });
    // The menu trigger is the avatar button (aria-label = username). Open it.
    await page
      .locator("header")
      .getByRole("button")
      .filter({ has: page.locator("img") })
      .last()
      .click();

    const myListings = page.getByRole("menuitem", { name: /my listings/i });
    await expect(myListings).toBeVisible();
    await expect(
      myListings.locator("a, [href]").or(myListings),
    ).toHaveAttribute("href", "/sell/listings");

    const account = page.getByRole("menuitem", { name: /^account$/i });
    await expect(account).toBeVisible();
    await expect(account.locator("a, [href]").or(account)).toHaveAttribute(
      "href",
      "/account",
    );
  });
});

test.describe("trust gates — sell gate routing (unverified)", () => {
  test.skip(
    !UNVERIFIED_EMAIL || !UNVERIFIED_PASSWORD,
    "Set E2E_UNVERIFIED_EMAIL and E2E_UNVERIFIED_PASSWORD (a confirmed account WITHOUT phone_verified_at) to run the unverified sell-gate leg.",
  );

  test("an unverified seller on /sell sees the verify banner; Publish routes to /verify?require=seller", async ({
    page,
  }) => {
    await login(page, UNVERIFIED_EMAIL!, UNVERIFIED_PASSWORD!);

    await page.goto("/sell");
    await expect(page).toHaveURL(/\/sell/);

    // The persistent publish-gate banner is the unverified affordance (Plan 04).
    await expect(page.getByText(/verify your phone to publish/i)).toBeVisible();

    // Completing the heavy create form is not required to prove the gate (the
    // server gate is unit-covered in Plan 01) — assert the unverified Publish
    // bounces to /verify carrying require=seller and next=/sell. The form is
    // valid-incomplete, so clicking Publish runs the client-side draft-save +
    // router.push to /verify (Plan 04) before any server submit.
    await page
      .getByRole("button", { name: /publish/i })
      .first()
      .click();

    await expect(page).toHaveURL(/\/verify\?[^]*require=seller/);
    await expect(page).toHaveURL(/next=%2Fsell|next=\/sell/);
  });
});

test.describe("trust gates — contact gate routing", () => {
  // ANON regression guard runs unconditionally (no secrets): an anonymous
  // visitor's Contact button must still route to /login?next=… (NOT /verify) —
  // the gate-ordering invariant (anon → login before any verify prompt).
  test("anon: Contact Seller routes to /login (regression guard)", async ({
    page,
  }) => {
    const listingPath = await firstListingPath(page);
    test.skip(
      listingPath === null,
      "No active listing in the /browse feed to exercise the contact CTA.",
    );

    await page.goto(listingPath!);
    const contact = page.getByRole("link", {
      name: /contact seller about this part/i,
    });
    await expect(contact).toBeVisible();
    const href = await contact.getAttribute("href");
    expect(href).toMatch(/^\/login\?next=/);
    expect(href).toContain("/listings/");
  });

  test.describe("unverified buyer", () => {
    test.skip(
      !UNVERIFIED_EMAIL || !UNVERIFIED_PASSWORD,
      "Set E2E_UNVERIFIED_EMAIL and E2E_UNVERIFIED_PASSWORD (a confirmed account WITHOUT phone_verified_at) to run the unverified contact-gate leg.",
    );

    test("Contact Seller routes to /verify?require=phone with an encoded next carrying contact=1", async ({
      page,
    }) => {
      await login(page, UNVERIFIED_EMAIL!, UNVERIFIED_PASSWORD!);

      const listingPath = await firstListingPath(page);
      test.skip(
        listingPath === null,
        "No active listing in the /browse feed to exercise the contact CTA.",
      );

      await page.goto(listingPath!);

      // The early contact gate (Plan 05): the CTA is visually identical to the
      // verified modal-opener but is a Link to /verify?require=phone with a
      // next= back to this listing carrying ?contact=1 (encoded) so the modal
      // auto-opens on return.
      const contact = page.getByRole("link", {
        name: /contact seller about this part/i,
      });
      await expect(contact).toBeVisible();
      const href = await contact.getAttribute("href");
      expect(href).toMatch(/^\/verify\?[^]*require=phone/);
      // next= is encodeURIComponent("/listings/<id>?contact=1").
      expect(href).toContain("next=");
      expect(decodeURIComponent(href ?? "")).toContain("contact=1");
    });
  });
});
