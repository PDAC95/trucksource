import { expect, test } from "@playwright/test";

/**
 * Phase 2 verification-wizard e2e — the deterministic, no-external-network slice
 * of the /verify wizard: the auth gate and step rendering. The full happy path
 * (real SMS round-trip) and the resume-after-OTP transitions require a LIVE
 * Twilio Verify service and a confirmed test account, and BotID is prod-only
 * (always non-bot locally), so those legs are validated MANUALLY in the plan's
 * human-verify checkpoint — NOT here. This spec stays green in CI with zero
 * external calls: it asserts routing/gating and that an authed user lands on a
 * wizard step (never bounced to /login), not the SMS exchange.
 *
 * Required env (the authed leg `test.skip`s cleanly when absent):
 *   E2E_TEST_EMAIL      a CONFIRMED test account's email
 *   E2E_TEST_PASSWORD   that account's password
 */

const TEST_EMAIL = process.env.E2E_TEST_EMAIL;
const TEST_PASSWORD = process.env.E2E_TEST_PASSWORD;

test.describe("verify wizard — auth gate", () => {
  // Runs unconditionally (no secrets needed): the (app) layout's getClaims()
  // gate must bounce an anonymous visitor to /login before /verify renders.
  test("unauthenticated visit to /verify redirects to /login", async ({
    page,
  }) => {
    await page.goto("/verify");
    await expect(page).toHaveURL(/\/login/);
    await expect(
      page.getByRole("heading", { name: /welcome back/i }),
    ).toBeVisible();
  });
});

test.describe("verify wizard — authed step rendering", () => {
  test.skip(
    !TEST_EMAIL || !TEST_PASSWORD,
    "Set E2E_TEST_EMAIL and E2E_TEST_PASSWORD (a confirmed test account) to run the authed /verify step-render leg.",
  );

  test("an authenticated user lands on a wizard step, not /login", async ({
    page,
  }) => {
    // Log in (cookie-backed session), then open /verify.
    await page.goto("/login");
    await page.getByLabel("Email", { exact: true }).fill(TEST_EMAIL!);
    await page.getByLabel("Password", { exact: true }).fill(TEST_PASSWORD!);
    await page.getByRole("button", { name: /^log in$/i }).click();
    await expect(page).not.toHaveURL(/\/login/);

    const response = await page.goto("/verify");
    expect(response?.ok()).toBeTruthy();
    // The auth gate did NOT bounce us — we are on the wizard, not /login.
    await expect(page).toHaveURL(/\/verify/);

    // The page resolves to one of the wizard steps from persisted DB state. For a
    // fresh account that is the PHONE step (a tel input + "Send code"); a partly-
    // or fully-verified fixture resolves to OTP/terms/verified instead. We assert
    // the page rendered SOME wizard surface (one of the known step affordances),
    // which is deterministic without any Twilio call.
    const phoneStep = page.getByRole("button", { name: /send code/i });
    const otpStep = page.getByText(/verifying/i);
    const termsStep = page.getByRole("button", {
      name: /finish verification/i,
    });
    const verified = page.getByRole("heading", {
      name: /verified seller/i,
    });

    await expect(
      phoneStep.or(otpStep).or(termsStep).or(verified).first(),
    ).toBeVisible();
  });
});
