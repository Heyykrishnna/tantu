import { chooseOption } from "./helpers/select.js";
import { test, expect } from "@playwright/test";

const workspaceId = "00000000-0000-4000-8000-000000000001";
const userId = "00000000-0000-4000-8000-000000000002";
const preferences = {
  theme: "dark",
  density: "comfortable",
  timezone: "UTC",
  weekStart: "monday",
  locale: "en",
  accent: "neutral",
  reduceMotion: false,
  updatedAt: "2026-11-01T00:00:00Z",
};

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.route("**/api/v1/**", async (route) => {
    const path = new URL(route.request().url()).pathname.replace("/api/v1", "");
    let body: unknown;
    if (path === "/auth/session")
      body = {
        user: {
          id: userId,
          name: "Navigation review",
          email: "navigation@example.test",
        },
        csrf: "synthetic-navigation-csrf",
      };
    else if (path === "/workspaces")
      body = {
        items: [
          {
            id: workspaceId,
            name: "Navigation workspace",
            icon: "⚡",
            role: "owner",
          },
        ],
      };
    else if (path.endsWith("/preferences")) body = { preferences };
    else if (path.endsWith("/tasks") || path.endsWith("/pages"))
      body = { items: [], nextCursor: null };
    else if (path.endsWith("/quotas"))
      body = {
        quota: {
          storageBytesUsed: 0,
          storageBytesLimit: 1000000,
          recordCount: 0,
          recordLimit: 5000,
          automationRunsToday: 0,
          automationLimitDaily: 500,
          quotaResetAt: "2026-11-02T00:00:00Z",
        },
      };
    else if (path.endsWith("/decisions")) body = { decisions: [] };
    else {
      await route.fulfill({
        status: 404,
        json: { code: "TEST_ROUTE_NOT_DEFINED", message: path },
      });
      return;
    }
    await route.fulfill({ json: body });
  });
});

test("loaded settings keep drafts and perform no repeat fetch on section changes", async ({
  page,
}) => {
  await page.goto(`/settings?w=${workspaceId}`);
  await expect(
    page.getByRole("heading", { name: "Navigation workspace", exact: true }),
  ).toBeVisible();
  const requests: string[] = [];
  page.on("request", (request) => {
    if (
      request.method() === "GET" &&
      new URL(request.url()).pathname.endsWith("/preferences")
    )
      requests.push(request.url());
  });
  const navigation = page.getByRole("navigation", {
    name: "Workspace settings sections",
  });
  await navigation.evaluate((node) =>
    node.setAttribute("data-continuity", "retained"),
  );
  await navigation
    .getByRole("button", { name: "Appearance", exact: true })
    .click();
  await page.getByLabel("Timezone", { exact: true }).fill("Europe/London");
  const count = requests.length;
  await navigation
    .getByRole("button", { name: "General", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Workspace Profile", exact: true }),
  ).toBeVisible();
  await navigation
    .getByRole("button", { name: "Appearance", exact: true })
    .click();
  await expect(page.getByLabel("Timezone", { exact: true })).toHaveValue(
    "Europe/London",
  );
  expect(requests.length).toBe(count);
  await expect(navigation).toHaveAttribute("data-continuity", "retained");
  await page.route("**/api/v1/workspaces/*/preferences", (route) =>
    route.fulfill({
      json: {
        preferences: {
          ...preferences,
          timezone: "Europe/Berlin",
          updatedAt: "2026-11-02T00:00:01Z",
        },
      },
    }),
  );
  await page
    .getByRole("button", { name: "Refresh workspace view", exact: true })
    .click();
  await expect(page.getByLabel("Timezone", { exact: true })).toHaveValue(
    "Europe/Berlin",
  );
  expect(requests.length).toBe(count + 1);
});

test("workspace navigation retains feature panels and record snapshots until explicit refresh", async ({
  page,
}) => {
  const calls: string[] = [];
  page.on("request", (request) => {
    const path = new URL(request.url()).pathname;
    if (
      request.method() === "GET" &&
      path.startsWith("/api/v1/") &&
      /\/(tasks|decisions)$/.test(path)
    )
      calls.push(path);
  });
  await page.goto(`/tasks?w=${workspaceId}`);
  await expect(page.getByRole("region", { name: "Task list" })).toHaveAttribute(
    "aria-busy",
    "false",
  );
  const sidebar = page.getByRole("navigation", {
    name: "Workspace navigation",
    exact: true,
  });
  await sidebar.evaluate((node) =>
    node.setAttribute("data-continuity", "retained"),
  );
  await page.getByRole("link", { name: "Decisions", exact: true }).click();
  await expect(
    page.getByText("No decisions found", { exact: false }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Record Decision", exact: true })
    .click();
  await page
    .getByLabel("Decision Title", { exact: true })
    .fill("Keep this decision draft");
  await page.getByRole("link", { name: "Tasks", exact: true }).click();
  await expect(page.getByRole("region", { name: "Task list" })).toHaveAttribute(
    "aria-busy",
    "false",
  );
  expect(calls.filter((path) => path.endsWith("/tasks"))).toHaveLength(1);
  await page.getByRole("link", { name: "Decisions", exact: true }).click();
  await expect(page.getByLabel("Decision Title", { exact: true })).toHaveValue(
    "Keep this decision draft",
  );
  expect(calls.filter((path) => path.endsWith("/decisions"))).toHaveLength(1);
  await expect(sidebar).toHaveAttribute("data-continuity", "retained");
  await page
    .getByRole("button", { name: "Refresh workspace view", exact: true })
    .click();
  await expect(
    page.getByText("No decisions found", { exact: false }),
  ).toBeVisible();
  await expect
    .poll(() => calls.filter((path) => path.endsWith("/decisions")).length)
    .toBe(2);
});

test("settings navigation and appearance drafts survive leaving the feature", async ({
  page,
}) => {
  await page.goto(`/settings?w=${workspaceId}&section=preferences`);
  const navigation = page.getByRole("navigation", {
    name: "Workspace settings sections",
  });
  await navigation.evaluate((node) =>
    node.setAttribute("data-continuity", "retained"),
  );
  await page.getByLabel("Timezone", { exact: true }).fill("Asia/Kolkata");
  await page.getByRole("link", { name: "Decisions", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Decision Memory", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("link", { name: "Workspace settings", exact: true })
    .click();
  await expect(page.getByLabel("Timezone", { exact: true })).toHaveValue(
    "Asia/Kolkata",
  );
  await expect(navigation).toHaveAttribute("data-continuity", "retained");
  await page.goBack();
  await expect(
    page.getByRole("heading", { name: "Decision Memory", exact: true }),
  ).toBeVisible();
  await page.goForward();
  await expect(page.getByLabel("Timezone", { exact: true })).toHaveValue(
    "Asia/Kolkata",
  );
});

test("file trees support keyboard selection and preserve collapsed folders", async ({
  page,
}) => {
  await page.goto(`/settings?w=${workspaceId}`);
  const tree = page.getByRole("tree", {
    name: "Settings sections",
    exact: true,
  });
  const workspace = tree.getByRole("treeitem", {
    name: "Workspace",
    exact: true,
  });
  await workspace.focus();
  await workspace.press("ArrowLeft");
  await expect(workspace).toHaveAttribute("aria-expanded", "false");
  await tree.getByRole("button", { name: "Appearance", exact: true }).click();
  await expect(
    page.getByRole("heading", {
      name: "Appearance & preferences",
      exact: true,
    }),
  ).toBeVisible();
  await expect(workspace).toHaveAttribute("aria-expanded", "false");
  await workspace.focus();
  await workspace.press("ArrowRight");
  await workspace.press("ArrowRight");
  await expect(
    tree.getByRole("treeitem", { name: "Overview", exact: true }),
  ).toBeFocused();
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Enter");
  await expect(
    page.getByRole("heading", { name: "Workspace Profile", exact: true }),
  ).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await chooseOption(page
    .getByLabel("Settings section", { exact: true }), "preferences");
  await expect(
    page.getByRole("heading", {
      name: "Appearance & preferences",
      exact: true,
    }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});

test("creating a space switches once without reauthenticating and clears previous drafts", async ({
  page,
}) => {
  const createdId = "00000000-0000-4000-8000-000000000003";
  let created = false;
  let sessionReads = 0;
  await page.route("**/api/v1/auth/session", async (route) => {
    sessionReads++;
    await route.fulfill({
      json: {
        user: {
          id: userId,
          name: "Navigation review",
          email: "navigation@example.test",
        },
        csrf: "synthetic-navigation-csrf",
      },
    });
  });
  await page.route("**/api/v1/workspaces", async (route) => {
    if (route.request().method() === "POST") {
      expect(route.request().postDataJSON()).toEqual({ name: "Design studio" });
      created = true;
      await route.fulfill({ status: 201, json: { id: createdId } });
    } else
      await route.fulfill({
        json: {
          items: [
            { id: workspaceId, name: "Navigation workspace", role: "owner" },
            ...(created
              ? [{ id: createdId, name: "Design studio", role: "owner" }]
              : []),
          ],
        },
      });
  });
  await page.goto(`/settings?w=${workspaceId}&section=preferences`);
  await page.getByLabel("Timezone", { exact: true }).fill("Europe/London");
  await page
    .getByRole("navigation", { name: "Workspace settings sections" })
    .getByRole("button", { name: "Spaces", exact: true })
    .click();
  await page
    .getByLabel("New space name", { exact: true })
    .fill("  Design studio  ");
  await page.getByRole("button", { name: "Create space", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Design studio", exact: true }),
  ).toBeVisible();
  expect(new URL(page.url()).searchParams.get("w")).toBe(createdId);
  expect(sessionReads).toBe(1);
  await page
    .getByRole("navigation", { name: "Workspace settings sections" })
    .getByRole("button", { name: "Appearance", exact: true })
    .click();
  await expect(page.getByLabel("Timezone", { exact: true })).toHaveValue("UTC");
});

test("appearance controls persist together and stay synchronized with the header", async ({
  page,
}) => {
  let saved = { ...preferences };
  let version = 0;
  await page.route("**/api/v1/workspaces/*/preferences", async (route) => {
    if (route.request().method() === "PATCH") {
      expect(route.request().headers()["x-csrf-token"]).toBe(
        "synthetic-navigation-csrf",
      );
      const changes: unknown = route.request().postDataJSON();
      if (typeof changes !== "object" || changes === null)
        throw new Error("Invalid preference request.");
      saved = {
        ...saved,
        ...changes,
        updatedAt: `2026-11-02T00:00:0${++version}Z`,
      };
    }
    await route.fulfill({ json: { preferences: saved } });
  });
  await page.goto(`/settings?w=${workspaceId}&section=preferences`);
  await page.getByRole("radio", { name: "Light", exact: true }).check();
  await page.getByRole("radio", { name: "Compact", exact: true }).check();
  await page.getByRole("radio", { name: "Forest", exact: true }).check();
  await page
    .getByRole("switch", { name: "Reduce decorative motion", exact: true })
    .check();
  await page
    .getByRole("button", { name: "Save Preferences", exact: true })
    .click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await expect(page.locator("html")).toHaveAttribute("data-accent", "sage");
  await expect(page.locator("html")).toHaveAttribute("data-density", "compact");
  await expect(page.locator("html")).toHaveAttribute(
    "data-reduce-motion",
    "true",
  );
  await page.evaluate(() => {
    if (document.activeElement instanceof HTMLElement)
      document.activeElement.blur();
    window.scrollTo(0, 0);
  });
  await page.screenshot({
    path: "../local-data/navigation-review/settings-desktop.png",
    fullPage: true,
    animations: "disabled",
  });
  await page
    .getByRole("button", { name: "Switch to dark theme", exact: true })
    .click();
  await expect(
    page.getByRole("radio", { name: "Dark", exact: true }),
  ).toBeChecked();
  await page.reload();
  await expect(
    page.getByRole("radio", { name: "Dark", exact: true }),
  ).toBeChecked();
  await expect(
    page.getByRole("switch", { name: "Reduce decorative motion", exact: true }),
  ).toBeChecked();
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.evaluate(() => {
    if (document.activeElement instanceof HTMLElement)
      document.activeElement.blur();
    window.scrollTo(0, 0);
  });
  await page.screenshot({
    path: "../local-data/navigation-review/settings-mobile.png",
    fullPage: true,
    animations: "disabled",
  });
});

test("asynchronous settings use a noninteractive solving loader and Candy buttons", async ({
  page,
}) => {
  let release: (() => void) | undefined;
  const pending = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route("**/api/v1/workspaces/*/ai/settings", async (route) => {
    await pending;
    await route.fulfill({
      json: {
        settings: {
          isEnabled: false,
          allowedScopes: [],
          maxMonthlyTokens: 10000,
        },
      },
    });
  });
  await page.goto(`/settings?w=${workspaceId}`);
  await page
    .getByRole("navigation", { name: "Workspace settings sections" })
    .getByRole("button", { name: "AI & data controls", exact: true })
    .click();
  const loading = page
    .getByRole("status")
    .filter({ hasText: "Loading AI preferences…" });
  await expect(loading).toBeVisible();
  await expect(loading.locator("canvas")).toHaveCount(1);
  await expect(loading.getByRole("button")).toHaveCount(0);
  release?.();
  await expect(
    page.getByRole("switch", {
      name: "Allow assisted processing",
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    page.locator("button:not([data-candy-button=true])"),
  ).toHaveCount(0);
});

test("a membership role change discards retained administrator forms", async ({
  page,
}) => {
  let role = "owner";
  await page.route("**/api/v1/workspaces", async (route) => {
    await route.fulfill({
      json: {
        items: [{ id: workspaceId, name: "Navigation workspace", role }],
      },
    });
  });
  await page.clock.install();
  await page.goto(`/settings?w=${workspaceId}&section=general`);
  await page
    .getByLabel("Workspace Name", { exact: true })
    .fill("Unsaved administrator draft");
  role = "member";
  await page.clock.runFor(15_001);
  await expect(
    page.getByLabel("Workspace Name", { exact: true }),
  ).toBeDisabled();
  await expect(page.getByLabel("Workspace Name", { exact: true })).toHaveValue(
    "Navigation workspace",
  );
  await expect(
    page
      .getByRole("tree", { name: "Settings sections", exact: true })
      .getByRole("button", { name: "Administration", exact: true }),
  ).toHaveCount(0);
});

test("unavailable operations show an explicit permission state", async ({
  page,
}) => {
  await page.route("**/api/v1/workspaces", (route) =>
    route.fulfill({
      json: {
        items: [
          { id: workspaceId, name: "Navigation workspace", role: "member" },
        ],
      },
    }),
  );
  await page.goto(`/operations?w=${workspaceId}`);
  await expect(
    page
      .getByRole("alert")
      .filter({ hasText: "Your workspace role cannot access operations." }),
  ).toBeVisible();
});

test("device theme changes apply immediately while preserving the system preference", async ({
  page,
}) => {
  await page.route("**/api/v1/workspaces/*/preferences", (route) =>
    route.fulfill({
      json: { preferences: { ...preferences, theme: "system" } },
    }),
  );
  await page.goto(`/settings?w=${workspaceId}&section=preferences`);
  await expect(
    page.getByRole("radio", { name: "Follow device", exact: true }),
  ).toBeChecked();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.emulateMedia({ colorScheme: "light" });
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await page.emulateMedia({ colorScheme: "dark" });
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await expect(
    page.getByRole("radio", { name: "Follow device", exact: true }),
  ).toBeChecked();
});

test("promises handle the actual flat member response without a map error", async ({ page }) => {
  await page.route("**/api/v1/workspaces/*/promises", route => route.fulfill({ json: { promises: [] } }));
  await page.route("**/api/v1/workspaces/*/members", route => route.fulfill({ json: { items: [{ id: userId, name: "Navigation review", role: "owner", active: true, email: "navigation@example.test" }] } }));
  await page.route("**/api/v1/workspaces/*/promises/people", route => route.fulfill({ json: { items: [{ id: userId, name: "Navigation review" }] } }));
  await page.goto(`/promises?w=${workspaceId}`);
  await expect(page.getByText("No promises found matching the current filters.", { exact: true })).toBeVisible();
  await expect(page.getByRole("status").filter({ hasText: "Cannot read properties" })).toHaveCount(0);
  await page.getByRole("button", { name: "New Promise", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "Record Promise Commitment", exact: true })).toBeVisible();
});

test("collection creation opens a focus-managed dialog", async ({ page }) => {
  await page.route("**/api/v1/workspaces/*/collections", route => route.fulfill({ json: { items: [] } }));
  await page.goto(`/collections?w=${workspaceId}`);
  await page.getByText("Create a collection on a page", { exact: true }).click();
  await expect(page.getByRole("dialog", { name: "Create a collection on a page", exact: true })).toBeVisible();
});
