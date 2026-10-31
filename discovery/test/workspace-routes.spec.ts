import { test, expect } from "@playwright/test";
import type { BrowserContext } from "@playwright/test";

const views = ["tasks", "pages", "capture", "promises", "decisions", "graph", "planning", "kits", "meetings", "integrations", "enterprise", "discovery", "projects", "calendar", "mail", "collections", "rules", "activity", "settings", "operations"];
let context: BrowserContext;

test.beforeAll(async ({ browser, baseURL }) => {
  const email = process.env.ROUTE_TEST_EMAIL;
  const password = process.env.ROUTE_TEST_PASSWORD;
  if (!email || !password || !baseURL) throw new Error("ROUTE_TEST_EMAIL and ROUTE_TEST_PASSWORD are required for an authorized test account.");
  context = await browser.newContext({ baseURL });
  const response = await context.request.post("/api/v1/auth/login", { headers: { origin: new URL(baseURL).origin }, data: { email, password } });
  expect(response.status()).toBe(200);
});

test.afterAll(async ({ baseURL }) => {
  if (!context) return;
  try {
    const csrf = (await context.cookies()).find((cookie) => cookie.name === "tantu_csrf")?.value;
    if (csrf && baseURL) {
      const response = await context.request.post("/api/v1/auth/logout", { headers: { origin: new URL(baseURL).origin, "x-csrf-token": csrf } });
      expect(response.status()).toBe(200);
    }
  } finally { await context.close(); }
});

for (const view of views) {
  test(`${view} loads directly, refreshes, and uses registered APIs`, async () => {
    const page = await context.newPage();
    const failures: string[] = [];
    page.on("pageerror", (error) => failures.push(error.message));
    page.on("response", (response) => {
      if (response.url().includes("/api/v1/") && response.status() >= 400) failures.push(`${response.status()} ${new URL(response.url()).pathname}`);
    });
    try {
      const response = await page.goto(`/${view}`);
      expect(response?.status()).toBe(200);
      await expect(page.locator(`nav a[href^="/${view}?"][aria-current="page"]`)).toBeVisible();
      await page.waitForLoadState("networkidle");
      await expect(page.locator("main").getByRole("heading").first()).toBeVisible();
      await expect(page.getByText("Route not found.", { exact: true })).toHaveCount(0);
      await expect(page.getByText("An unexpected error occurred.", { exact: true })).toHaveCount(0);
      expect(failures).toEqual([]);
      const refreshed = await page.reload({ waitUntil: "networkidle" });
      expect(refreshed?.status()).toBe(200);
      await expect(page.locator(`nav a[href^="/${view}?"][aria-current="page"]`)).toBeVisible();
      expect(failures).toEqual([]);
    } finally { await page.close(); }
  });
}

test("unknown pages show a recovery link instead of another workspace page", async () => {
  const page = await context.newPage();
  try {
    await page.goto("/missing-workspace-view");
    await expect(page.getByRole("heading", { name: "Page not found" })).toBeVisible();
    await page.getByRole("link", { name: "Go to tasks" }).click();
    await expect(page.locator('nav a[href^="/tasks?"][aria-current="page"]')).toBeVisible();
  } finally { await page.close(); }
});
