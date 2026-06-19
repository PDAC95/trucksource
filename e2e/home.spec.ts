import { expect, test } from "@playwright/test";

test("welcome page shows the brand wordmark + entry points", async ({
  page,
}) => {
  await page.goto("/");

  // Header brand link (icon-only; accessible name from the logo alt).
  await expect(
    page.getByRole("link", { name: "OG Truck Parts" }),
  ).toBeVisible();

  // The welcome landing's primary ways in.
  await expect(
    page.getByRole("link", { name: /browse all parts/i }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: /browse by brand/i }),
  ).toBeVisible();
});

test("browse all parts routes to the /browse feed", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("link", { name: /browse all parts/i }).click();
  await expect(page).toHaveURL(/\/browse/);
  // The feed/search screen renders its always-present result count (the Phase-16
  // browse rework dropped the old "find your part" heading; the count is the
  // viewport- and data-independent signal that the feed mounted).
  await expect(page.getByText(/\d+ results?/i).first()).toBeVisible();
});
