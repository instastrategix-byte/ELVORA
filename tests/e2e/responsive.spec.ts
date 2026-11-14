import { expect, test } from "@playwright/test";

test("mobile menu opens as an accessible dialog and navigates", async ({ page, isMobile }) => {
  test.skip(!isMobile, "mobile-only navigation");
  await page.goto("/");
  await page.getByRole("button", { name: "Open menu" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await dialog.getByRole("link", { name: "Membership" }).click();
  await expect(page).toHaveURL(/\/membership$/);
  await expect(page.getByRole("dialog")).toBeHidden();
});

test("no horizontal overflow on key pages", async ({ page }) => {
  for (const path of ["/", "/luxury", "/membership", "/sign-up"]) {
    await page.goto(path);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow, path).toBeLessThanOrEqual(1);
  }
});
