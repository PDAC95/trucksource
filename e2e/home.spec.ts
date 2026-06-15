import { expect, test } from "@playwright/test";

test("home page shows the brand wordmark", async ({ page }) => {
  await page.goto("/");
  await expect(
    page.getByRole("link", { name: "OG Truck Parts" }),
  ).toBeVisible();
});
