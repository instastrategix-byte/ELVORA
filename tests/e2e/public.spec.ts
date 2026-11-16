import { expect, test } from "@playwright/test";

test.describe("public experience", () => {
  test("homepage explains the value proposition with clear calls to action", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveTitle(/ELVORA/);
    await expect(page.getByRole("heading", { level: 1 })).toContainText("private network");
    for (const pillar of ["Trusted networking", "Luxury discovery", "Private connections", "Premium business growth"]) {
      await expect(page.getByRole("heading", { name: pillar })).toBeVisible();
    }
    await expect(page.getByRole("link", { name: /Apply for membership/ })).toHaveAttribute("href", "/apply");
    await expect(page.getByRole("link", { name: "Explore the marketplace" })).toHaveAttribute("href", "/luxury");
  });

  for (const [path, heading] of [
    ["/about", "A network built on trust."],
    ["/membership", "Choose how you belong."],
    ["/advertise", "Be seen by the people who matter."],
    ["/privacy", "Privacy policy"],
    ["/terms", "Terms of membership"],
    ["/community-guidelines", "Community guidelines"],
    ["/discover", "People and businesses worth knowing."],
    ["/luxury", "The exceptional, verified."],
    ["/apply", "Join ELVORA."],
  ] as const) {
    test(`${path} renders`, async ({ page }) => {
      const response = await page.goto(path);
      expect(response?.status()).toBeLessThan(400);
      await expect(page.getByRole("heading", { level: 1, name: heading })).toBeVisible();
    });
  }

  test("luxury category filters are links that update the URL", async ({ page }) => {
    await page.goto("/luxury");
    await page.getByRole("navigation", { name: "Categories" }).getByRole("link", { name: "Yachts" }).click();
    await expect(page).toHaveURL(/category=yacht/);
    await expect(page.getByRole("link", { name: "Yachts" })).toHaveAttribute("aria-current", "page");
  });

  test("unknown pages show a helpful 404", async ({ page }) => {
    const response = await page.goto("/this-does-not-exist");
    expect(response?.status()).toBe(404);
    await expect(page.getByRole("heading", { name: /private or doesn.t exist/ })).toBeVisible();
  });

  test("theme toggle switches and persists", async ({ page }) => {
    await page.goto("/about");
    const toggle = page.getByRole("button", { name: /Switch to (light|dark) theme/ });
    const before = await page.evaluate(() => document.documentElement.dataset.theme ?? "system");
    await toggle.click();
    const after = await page.evaluate(() => document.documentElement.dataset.theme);
    expect(after).not.toBe(before);
    await page.reload();
    expect(await page.evaluate(() => document.documentElement.dataset.theme)).toBe(after);
  });

  test("skip link moves focus to main content", async ({ page }) => {
    await page.goto("/about");
    await page.keyboard.press("Tab");
    await expect(page.getByRole("link", { name: "Skip to content" })).toBeFocused();
  });
});

test.describe("access control", () => {
  for (const path of ["/feed", "/messages", "/notifications", "/account/membership", "/business", "/ads", "/admin"]) {
    test(`${path} requires sign-in`, async ({ page }) => {
      await page.goto(path);
      await expect(page).toHaveURL(new RegExp(`/sign-in\\?next=${encodeURIComponent(path).replace(/%2F/g, "(%2F|/)")}`));
      await expect(page.getByRole("heading", { name: "Welcome back" })).toBeVisible();
    });
  }

  test("mutating APIs reject unauthenticated and cross-site requests", async ({ request }) => {
    const unauth = await request.post("/api/v1/posts", { data: { body: "hi" } });
    expect(unauth.status()).toBe(401);
    const crossSite = await request.post("/api/v1/posts", { data: { body: "hi" }, headers: { origin: "https://evil.example" } });
    expect(crossSite.status()).toBe(403);
    const signOut = await request.post("/auth/sign-out", { headers: { origin: "https://evil.example" }, maxRedirects: 0 });
    expect(signOut.status()).toBe(403);
  });

  test("public read APIs without path params respond (no 'Invalid path')", async ({ request }) => {
    for (const path of ["/api/v1/membership", "/api/v1/listings", "/api/v1/members"]) {
      const res = await request.get(path);
      // 200 with Supabase configured; 503 when it is not. Never a validation failure.
      expect([200, 503], `${path} → ${res.status()}`).toContain(res.status());
    }
  });

  test("health endpoint reports integration configuration without secrets", async ({ request }) => {
    const res = await request.get("/api/health");
    expect(res.ok()).toBe(true);
    const body = await res.json();
    expect(body.status).toBe("ok");
    expect(JSON.stringify(body)).not.toMatch(/sk_|sb_secret|re_/);
  });
});
