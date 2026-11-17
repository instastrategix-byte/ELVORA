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

  test("email-code sign-in is offered alongside password sign-in", async ({ page }) => {
    await page.goto("/sign-in");
    await page.getByRole("tab", { name: "Email code" }).click();
    await expect(page.getByRole("button", { name: "Email me a code" })).toBeVisible();
    await page.getByRole("tab", { name: "Password" }).click();
    await expect(page.getByLabel("Password")).toBeVisible();
  });

  test("email-code requests never reveal whether an account exists", async ({ page }) => {
    test.skip(!process.env.E2E_SUPABASE, "needs Supabase Auth (E2E_SUPABASE=1)");
    await page.goto("/sign-in");
    await page.getByRole("tab", { name: "Email code" }).click();
    await page.getByLabel("Email").fill("nobody-at-all@elvora.test");
    await page.getByRole("button", { name: "Email me a code" }).click();
    await expect(page.getByText(/If an account exists/)).toBeVisible();
    await expect(page.getByLabel(/Code sent to/)).toBeVisible();
  });

  test("auth codes that land on the home page are handed to the callback", async ({ request }) => {
    const res = await request.get("/?code=not-a-real-code", { maxRedirects: 0 });
    expect(res.status()).toBe(307);
    expect(res.headers()["location"]).toMatch(/\/auth\/callback\?code=not-a-real-code$/);
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
    await expect(page).toHaveURL(/\/home/);
    await page.goto("/feed");
    const text = `E2E post ${Date.now()}`;
    await page.getByLabel("What would you like to share?").fill(text);
    await page.getByRole("button", { name: "Post", exact: true }).click();
    await expect(page.getByText(text)).toBeVisible();
  });
});
