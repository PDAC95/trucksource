import { expect, test } from "@playwright/test";

test("home page shows the brand heading", async ({ page }) => {
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Take-Off Parts" }),
  ).toBeVisible();
});
