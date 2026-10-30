import { expect, test } from "@playwright/test";

test("six keyboard-operable journey previews keep private sources unavailable to guests", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  await expect(page.locator("article[data-journey]")).toHaveCount(6);
  await page.keyboard.press("Tab");
  await expect(page.getByRole("link", { name: "Skip to journeys" })).toBeFocused();
  for (const article of await page.locator("article[data-journey]").all()) {
    await article.getByLabel("Review as").selectOption("guest");
    await article.getByRole("button", { name: "Review synthetic preview" }).focus();
    await page.keyboard.press("Enter");
    await expect(article.locator("output")).toContainText("Private source unavailable");
    await expect(article.locator("output")).toContainText("No private excerpt is copied");
    await article.getByRole("checkbox").check();
    await article.getByRole("button", { name: "Review synthetic preview" }).click();
    await expect(article.locator("output")).toContainText("separate destination-governed copy");
  }
  expect(errors).toEqual([]);
});

test("mobile review has no horizontal overflow and exposes every recovery path", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  for (const article of await page.locator("article[data-journey]").all()) {
    await article.locator("summary").click();
    await expect(article.locator("details")).toHaveAttribute("open", "");
  }
  await page.screenshot({ path: ".artifacts/prototype-mobile.png", fullPage: true });
});
