import { expect, test } from "@playwright/test";

/**
 * Phase 1 public-profile e2e — anonymous render of /u/[username] plus the
 * cross-cutting no-PII assertion, and a not-found state for unknown handles.
 *
 * Required env (the render leg `test.skip`s cleanly when absent):
 *   E2E_TEST_USERNAME      a seeded public username to load
 *
 * PII fixtures for the no-PII assertion (the real values of that test account —
 * these MUST NOT appear anywhere on the public page or in its HTML source):
 *   E2E_TEST_FIRST_NAME
 *   E2E_TEST_LAST_NAME
 *   E2E_TEST_PHONE
 *   E2E_TEST_EMAIL         (reused from the auth spec's confirmed account)
 *
 * Privacy is structural (profiles_public/profiles_private split + RLS), so this
 * page can only ever read the four allowed public facts. This test is the
 * end-to-end proof that the rendered surface carries zero PII.
 */

const USERNAME = process.env.E2E_TEST_USERNAME;

// Only assert absence of fixtures that were actually provided.
const PII_FIXTURES = [
  process.env.E2E_TEST_FIRST_NAME,
  process.env.E2E_TEST_LAST_NAME,
  process.env.E2E_TEST_PHONE,
  process.env.E2E_TEST_EMAIL,
].filter((v): v is string => typeof v === "string" && v.trim().length > 0);

test.describe("anonymous public profile", () => {
  test.skip(
    !USERNAME,
    "Set E2E_TEST_USERNAME (a seeded public profile) to run the public-profile render + no-PII assertion.",
  );

  test("renders the four public facts and leaks no PII", async ({ page }) => {
    // No login — a logged-out (anon) context, as a buyer would visit.
    const response = await page.goto(`/u/${USERNAME}`);
    expect(response?.ok()).toBeTruthy();

    // Username heading.
    await expect(
      page.getByRole("heading", { name: USERNAME!, level: 1 }),
    ).toBeVisible();

    // "State/Province, Country" location line (rendered as "{state}, {country}").
    await expect(page.getByText(/,\s/)).toBeVisible();

    // "Member since {Month YYYY}".
    await expect(page.getByText(/member since/i)).toBeVisible();

    // Active-listings count / empty state (0 in Phase 1).
    await expect(page.getByText(/active listing/i)).toBeVisible();

    // No-PII assertion: none of the account's real PII appears in the rendered
    // text OR the raw HTML source (catches anything hidden in attributes/JSON).
    const bodyText = (await page.textContent("body")) ?? "";
    const html = await page.content();
    if (PII_FIXTURES.length === 0) {
      test.info().annotations.push({
        type: "note",
        description:
          "No PII fixtures provided — skipped the value-level no-PII check (structural privacy still holds; the page can only read profiles_public).",
      });
    }
    for (const pii of PII_FIXTURES) {
      expect(bodyText).not.toContain(pii);
      expect(html).not.toContain(pii);
    }
  });
});

// Needs no seeded user — runs unconditionally.
test("unknown username shows a not-found state, not a crash", async ({
  page,
}) => {
  const response = await page.goto("/u/__definitely_not_a_user__");
  // notFound() renders the 404 boundary (HTTP 404) with the not-found copy.
  expect(response?.status()).toBe(404);
  await expect(
    page.getByRole("heading", { name: /profile not found/i }),
  ).toBeVisible();
});
