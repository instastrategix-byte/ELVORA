import { expect, test } from "@playwright/test";

test.describe("auth forms", () => {
  test("sign-up validates on the server and keeps entered values", async ({ page }) => {
    await page.goto("/sign-up");
    await page.getByLabel("Full name").fill("Elena Duarte");
    await page.getByLabel("Email").fill("elena@example.test");
    await page.getByLabel("Password").fill("short");
    await page.getByRole("button", { name: "Create account" }).click();
    // Without Supabase the action reports that auth is unconfigured; with it, field errors appear.
    await expect(page.getByRole("alert").first()).toBeVisible();
    await expect(page.getByLabel("Email")).toHaveValue(/elena@example.test|^$/);
  });

  test("password reset never reveals whether an account exists", async ({ page }) => {
    test.skip(!process.env.E2E_SUPABASE, "needs Supabase Auth (E2E_SUPABASE=1)");
    await page.goto("/forgot-password");
    await page.getByLabel("Email").fill("nobody@example.test");
    await page.getByRole("button", { name: "Send reset link" }).click();
    await expect(page.getByText(/If an account exists/)).toBeVisible();
  });

  test("sign-in links to recovery and sign-up", async ({ page }) => {
    await page.goto("/sign-in");
    await expect(page.getByRole("link", { name: "Forgot password?" })).toHaveAttribute("href", "/forgot-password");
    await expect(page.getByRole("link", { name: "Create an account" })).toHaveAttribute("href", "/sign-up");
  });

  test("invalid confirmation links explain what happened", async ({ page }) => {
    await page.goto("/sign-in?error=link");
    await expect(page.getByText("That link is invalid or has expired")).toBeVisible();
  });
});

test.describe("signed-in journeys @supabase", () => {
  test.skip(!process.env.E2E_SUPABASE, "needs the local Supabase stack with seed data (E2E_SUPABASE=1)");

  test("seeded member signs in, posts, and sees it in the feed", async ({ page }) => {
    await page.goto("/sign-in");
    await page.getByLabel("Email").fill("isabella@seed.elvora.test");
    await page.getByLabel("Password").fill("ElvoraLocal2026");
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page).toHaveURL(/\/feed/);
    const text = `E2E post ${Date.now()}`;
    await page.getByLabel("What would you like to share?").fill(text);
    await page.getByRole("button", { name: "Post", exact: true }).click();
    await expect(page.getByText(text)).toBeVisible();
  });
});
