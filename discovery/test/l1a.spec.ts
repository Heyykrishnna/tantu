import { spawn } from "node:child_process";
import type { ChildProcess } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { setTimeout } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import { test, expect } from "@playwright/test";
import type { Page } from "@playwright/test";
import { fixture, testPassword } from "../../backend/test/integration/support.js";

let environment: Awaited<ReturnType<typeof fixture>>;
let owner: Awaited<ReturnType<Awaited<ReturnType<typeof fixture>>["account"]>>;
let ownerEmail: string;
let server: ChildProcess | undefined;
let serverOutput = "";
const backendPort = Number(process.env.L1A_BACKEND_PORT ?? 4000);

test.beforeAll(async () => {
  environment = await fixture({ origin: "http://localhost:3100" });
  if (!Number.isInteger(backendPort) || backendPort < 1024 || backendPort > 65535) throw new Error("L1A_BACKEND_PORT must be an unprivileged TCP port.");
  await environment.app.listen({ host: "127.0.0.1", port: backendPort });
  server = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "--port", "3100", "--hostname", "127.0.0.1"], { cwd: fileURLToPath(new URL("../../frontend/", import.meta.url)), stdio: ["ignore", "pipe", "pipe"] });
  server.stdout?.on("data", (chunk: Buffer) => { serverOutput = (serverOutput + chunk.toString()).slice(-20_000); });
  server.stderr?.on("data", (chunk: Buffer) => { serverOutput = (serverOutput + chunk.toString()).slice(-20_000); });
  for (let attempt = 0; attempt < 100; attempt++) {
    try { if (serverOutput.includes("Ready in") && (await fetch("http://localhost:3100")).ok) return; } catch (error) { if (!(error instanceof Error)) throw error; }
    if (server.exitCode !== null) throw new Error("Frontend stopped: " + serverOutput);
    await setTimeout(200);
  }
  throw new Error("Frontend startup timed out: " + serverOutput);
});

test.beforeEach(async () => {
  ownerEmail = `browser-${randomUUID()}@example.test`;
  owner = await environment.account(ownerEmail);
});

test.afterAll(async () => {
  if (server && server.exitCode === null) {
    server.kill("SIGTERM");
    await Promise.race([new Promise<void>((resolve) => server?.once("exit", () => resolve())), setTimeout(5000)]);
    if (server.exitCode === null) server.kill("SIGKILL");
  }
  if (environment) await environment.close();
});

async function login(page: Page, email = ownerEmail) {
  await page.goto("/");
  await page.getByLabel("Email address").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(testPassword);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.getByRole("button", { name: "Sign out" })).toBeVisible();
}

test("closed search discards private results and performs no background requests", async ({ page }) => {
  await login(page);
  const requests: string[] = [];
  page.on("request", request => { if (new URL(request.url()).pathname.endsWith("/search")) requests.push(request.url()); });
  await page.keyboard.press("ControlOrMeta+k");
  const search = page.getByRole("dialog", { name: "Unified live search" });
  const input = search.getByPlaceholder("Search tasks, pages, projects, promises, or archives...");
  await input.fill("release");
  await expect.poll(() => requests.length).toBe(1);
  await search.getByRole("button", { name: "Close search" }).click();
  await expect(search).toHaveCount(0);
  await page.waitForTimeout(350);
  expect(requests).toHaveLength(1);
  await page.keyboard.press("ControlOrMeta+k");
  await expect(input).toHaveValue("");
  await page.waitForTimeout(350);
  expect(requests).toHaveLength(1);
  await search.getByRole("button", { name: "Close search" }).click();
});

test("enterprise reviews cannot report an unpersisted privilege change", async ({ page }) => {
  await login(page);
  await page.getByRole("link", { name: "Enterprise & Governance", exact: true }).click();
  await page.getByRole("button", { name: "Access Requests", exact: true }).click();
  await expect(page.getByText("Access request reviews are not available yet.", { exact: false })).toBeVisible();
  await expect(page.getByText("Marcus Aurelius")).toHaveCount(0);
  await expect(page.getByRole("button", { name: /approve|decline/i })).toHaveCount(0);
});

test("real task/page persistence, conflict recovery, keyboard and responsive shell", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await login(page);
  await page.getByRole("button", { name: "+ New task", exact: true }).click();
  await page.getByLabel("Title", { exact: true }).fill("Prepare a considered release");
  await page.getByLabel("Deadline", { exact: true }).fill("2026-11-20");
  await page.getByRole("button", { name: "Create task", exact: true }).click();
  await expect(page.getByRole("status").filter({ hasText: "Saved." })).toBeVisible();
  const id = new URL(page.url()).searchParams.get("r");
  expect(id).toMatch(/^[a-f0-9-]{36}$/);
  await page.reload();
  await expect(page.getByLabel("Title", { exact: true })).toHaveValue("Prepare a considered release");
  await page.getByLabel("Status", { exact: true }).selectOption("done");
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect(page.getByRole("button", { name: /Prepare a considered release/ })).toContainText("Complete");
  expect(new URL(page.url()).searchParams.get("r")).toBe(id);
  await page.getByLabel("Title", { exact: true }).fill("My unsaved draft");
  const concurrent = await environment.app.inject({ method: "PATCH", url: `/api/v1/workspaces/${owner.workspaceId}/tasks/${id}`, headers: owner.headers, payload: { title: "Concurrent change", expectedVersion: 2, operationId: randomUUID() } });
  expect(concurrent.statusCode).toBe(200);
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect(page.getByRole("alert").filter({ hasText: "This record changed" })).toBeVisible();
  await expect(page.getByLabel("Title", { exact: true })).toHaveValue("My unsaved draft");
  await page.getByRole("button", { name: "Close record details" }).click();
  await page.getByRole("link", { name: "Pages", exact: true }).click();
  await page.getByRole("button", { name: "+ New page", exact: true }).click();
  await page.getByLabel("Title", { exact: true }).fill("Release notes");
  await page.getByLabel("Page text", { exact: true }).fill("# A careful beginning\n<script>unsafe text stays text</script>");
  await page.getByRole("button", { name: "Create page", exact: true }).click();
  await expect(page).toHaveURL(/\/pages\?w=[^&]+&r=/);
  await expect(page.getByRole("button", { name: "Save changes", exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByLabel("Page text", { exact: true })).toHaveValue("# A careful beginning\n<script>unsafe text stays text</script>");
  const parentId = new URL(page.url()).searchParams.get("r");
  await page.getByRole("button", { name: "Add nested page", exact: true }).click();
  await expect(page.getByLabel("Parent page ID", { exact: false })).toHaveValue(parentId ?? "");
  await page.getByLabel("Title", { exact: true }).fill("Nested release checklist");
  await page.getByRole("button", { name: "Create page", exact: true }).click();
  await expect(page.getByRole("button", { name: "Open parent page", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Open parent page", exact: true }).click();
  await expect(page.getByLabel("Title", { exact: true })).toHaveValue("Release notes");
  expect(new URL(page.url()).searchParams.get("r")).toBe(parentId);
  await page.getByRole("button", { name: "View history" }).click();
  await expect(page.getByText(/Version 1 ·/)).toBeVisible();
  await page.keyboard.press(process.platform === "darwin" ? "Meta+k" : "Control+k");
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).not.toBeVisible();
  await mkdir(new URL("../.artifacts/l1a-browser/", import.meta.url), { recursive: true });
  await page.evaluate(() => { if (document.activeElement instanceof HTMLElement) document.activeElement.blur(); window.scrollTo(0, 0); });
  await page.screenshot({ animations: "disabled", path: fileURLToPath(new URL("../.artifacts/l1a-browser/desktop.png", import.meta.url)), fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ animations: "disabled", path: fileURLToPath(new URL("../.artifacts/l1a-browser/mobile.png", import.meta.url)), fullPage: true });
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.getByRole("button", { name: /Switch to (light|dark) theme/ }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await expect(page.getByLabel("Title", { exact: true })).toHaveCSS("background-color", "rgb(255, 255, 255)");
  await page.screenshot({ animations: "disabled", path: fileURLToPath(new URL("../.artifacts/l1a-browser/mobile-light.png", import.meta.url)), fullPage: true });
  await page.getByRole("button", { name: /Switch to (light|dark) theme/ }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await expect(page.getByLabel("Title", { exact: true })).toHaveCSS("background-color", "rgb(20, 20, 22)");
  await page.screenshot({ animations: "disabled", path: fileURLToPath(new URL("../.artifacts/l1a-browser/mobile-dark.png", import.meta.url)), fullPage: true });
  expect(errors).toEqual([]);
});

test("lost save acknowledgement reuses its operation key after browser reload", async ({ page }) => {
  await login(page);
  await page.getByRole("button", { name: "+ New task", exact: true }).click();
  await page.getByLabel("Title", { exact: true }).fill("Durable despite a lost response");
  let interrupted = false;
  await page.route("**/api/v1/workspaces/*/tasks", async (route) => {
    if (route.request().method() === "POST" && !interrupted) { interrupted = true; await route.fetch(); await route.abort("failed"); }
    else await route.continue();
  });
  await page.getByRole("button", { name: "Create task", exact: true }).click();
  await expect(page.getByRole("alert").filter({ hasText: "Could not confirm" })).toBeVisible();
  await page.reload();
  await expect(page.getByLabel("Title", { exact: true })).toHaveValue("Durable despite a lost response");
  await page.getByRole("button", { name: "Create task", exact: true }).click();
  await expect(page.getByRole("status").filter({ hasText: "Saved." })).toBeVisible();
  const count = await environment.owner.query<{ count: number }>("SELECT count(*)::int AS count FROM tantu.records WHERE title='Durable despite a lost response'");
  expect(count.rows[0]?.count).toBe(1);
});

test("guest access is read-only and revoked membership stops subsequent requests", async ({ page }) => {
  const guest = await environment.account("guest-browser@example.test");
  const parent = await environment.app.inject({ method: "POST", url: `/api/v1/workspaces/${owner.workspaceId}/pages`, headers: owner.headers, payload: { title: "Shared guest page", operationId: randomUUID() } });
  const id = parent.json<{ id: string }>().id;
  await environment.owner.query("INSERT INTO tantu.memberships(workspace_id,user_id,role) VALUES($1,$2,'guest')", [owner.workspaceId, guest.userId]);
  await environment.owner.query("INSERT INTO tantu.grants VALUES($1,$2,$3,'read')", [owner.workspaceId, id, guest.userId]);
  await login(page, "guest-browser@example.test");
  await page.goto(`/?w=${owner.workspaceId}&view=pages&r=${id}`);
  await expect(page.getByText("You have read-only access to this record.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Save changes" })).toBeDisabled();
  await expect(page.getByRole("button", { name: "+ New page" })).toHaveCount(0);
  await environment.owner.query("UPDATE tantu.memberships SET active=false WHERE workspace_id=$1 AND user_id=$2", [owner.workspaceId, guest.userId]);
  const result = await page.request.get(`/api/v1/workspaces/${owner.workspaceId}/pages/${id}`);
  expect(result.status()).toBe(404);
  await environment.owner.query("UPDATE tantu.sessions SET expires_at=now()-interval '1 second' WHERE user_id=$1", [guest.userId]);
  await page.reload();
  await expect(page.getByRole("button", { name: "Sign in", exact: true })).toBeVisible();
  await writeFile(new URL("../.artifacts/l1a-browser/scope.json", import.meta.url), JSON.stringify({ scope: "real local HTTP and PostgreSQL; synthetic accounts only", providerAccounts: false, realMalwareEngine: false }, null, 2) + "\n");
});


test("reference UI uses local fonts, aligned surfaces and working mobile navigation in both themes", async ({ page }) => {
  const titles = ["Refine workspace navigation", "Review the next release", "Organize page structure", "Prepare accessibility review", "Document sharing decisions", "Review upload recovery"];
  for (const [index, title] of titles.entries()) {
    const response = await environment.app.inject({ method: "POST", url: `/api/v1/workspaces/${owner.workspaceId}/tasks`, headers: owner.headers, payload: { title, operationId: randomUUID(), status: index === 1 ? "done" : "open", priority: index === 0 ? "high" : "normal", visibility: index === 2 ? "workspace" : "private", deadline: index % 2 ? null : "2026-11-20" } });
    expect(response.statusCode).toBe(201);
  }
  const remoteRequests: string[] = [];
  page.on("request", (request) => { if (!request.url().startsWith("http://localhost:3100") && !request.url().startsWith("data:")) remoteRequests.push(request.url()); });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await login(page);
  await expect(page.getByRole("button", { name: /Refine workspace navigation/ })).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
  const typography = await page.evaluate(() => ({ body: getComputedStyle(document.body).fontFamily, heading: getComputedStyle(document.querySelector("h1") ?? document.body).fontFamily, inter: getComputedStyle(document.documentElement).getPropertyValue("--font-inter"), poppins: getComputedStyle(document.documentElement).getPropertyValue("--font-poppins"), background: getComputedStyle(document.body).backgroundColor }));
  expect(typography.inter.trim()).not.toBe("");
  expect(typography.poppins.trim()).not.toBe("");
  expect(typography.heading).not.toBe(typography.body);
  expect(typography.background).toBe("rgb(12, 12, 14)");
  const heading = await page.getByRole("heading", { name: "My tasks", exact: true }).boundingBox();
  const table = await page.getByRole("region", { name: "Task list", exact: true }).boundingBox();
  expect(heading && table && Math.abs(heading.x - table.x) < 1).toBe(true);
  await page.screenshot({ animations: "disabled", path: fileURLToPath(new URL("../.artifacts/l1a-browser/reference-tasks-dark.png", import.meta.url)), fullPage: true });
  await page.getByRole("button", { name: /Switch to (light|dark) theme/ }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await expect(page.locator("html")).not.toHaveClass(/(^|\s)dark(\s|$)/);
  expect(await page.evaluate(() => localStorage.getItem("tantu-theme"))).toBe("light");
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await expect(page.getByRole("button", { name: /Refine workspace navigation/ })).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ animations: "disabled", path: fileURLToPath(new URL("../.artifacts/l1a-browser/reference-tasks-light.png", import.meta.url)), fullPage: true });
  await page.getByRole("link", { name: "Workspace settings", exact: true }).click();
  await page.getByRole("button", { name: "People & Roles", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Invite Teammate", exact: true })).toBeVisible();
  await expect(page.locator("a[aria-current=page]:visible")).toHaveCount(1);
  await page.screenshot({ animations: "disabled", path: fileURLToPath(new URL("../.artifacts/l1a-browser/reference-settings-light.png", import.meta.url)), fullPage: true });
  await page.getByRole("link", { name: "Activity", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Recent activity", exact: true })).toBeVisible();
  await page.screenshot({ animations: "disabled", path: fileURLToPath(new URL("../.artifacts/l1a-browser/reference-activity-light.png", import.meta.url)), fullPage: true });
  await page.getByRole("link", { name: "Operations", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Processing history", exact: true })).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: "Open navigation", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "Workspace navigation drawer" })).toBeVisible();
  await page.getByRole("link", { name: "Tasks", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "Workspace navigation drawer" })).not.toBeVisible();
  await expect(page.getByRole("heading", { name: "My tasks", exact: true })).toBeVisible();
  const mobileSearch = await page.getByRole("searchbox", { name: "Search tasks", exact: true }).boundingBox();
  expect(mobileSearch && mobileSearch.width > 150).toBe(true);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.getByRole("button", { name: "Open navigation", exact: true }).click();
  await page.getByRole("button", { name: /Search or jump to/ }).click();
  await expect(page.getByRole("dialog", { name: "Command palette" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog", { name: "Command palette" })).not.toBeVisible();
  expect(remoteRequests).toEqual([]);
  await page.getByRole("button", { name: "Open navigation", exact: true }).click();
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await expect(page.getByRole("button", { name: "Sign in", exact: true })).toBeVisible();
  await page.screenshot({ animations: "disabled", path: fileURLToPath(new URL("../.artifacts/l1a-browser/reference-sign-in-mobile.png", import.meta.url)), fullPage: true });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.screenshot({ animations: "disabled", path: fileURLToPath(new URL("../.artifacts/l1a-browser/reference-sign-in.png", import.meta.url)), fullPage: true });
});

test("connected project views, reviewed scheduling and private provider configuration", async ({ page }) => {
  const title = "Connected journey task";
  const created = await environment.app.inject({ method: "POST", url: `/api/v1/workspaces/${owner.workspaceId}/tasks`, headers: owner.headers, payload: { operationId: randomUUID(), title, deadline: "2026-12-31" } });
  expect(created.statusCode).toBe(201);
  await login(page);
  await page.getByRole("link", { name: "Projects", exact: true }).click();
  await page.getByText("New project", { exact: true }).click();
  await page.getByLabel("Project title", { exact: true }).fill("Connected journey project");
  await page.getByRole("button", { name: "Create project", exact: true }).click();
  await page.getByRole("button", { name: /Connected journey project/ }).click();
  await page.getByText("Manage project and task links", { exact: true }).click();
  await page.getByLabel("Existing task (first 50)", { exact: true }).selectOption(created.json<{ id: string }>().id);
  await page.getByRole("button", { name: "Link task", exact: true }).click();
  await expect(page.getByRole("button", { name: title, exact: true })).toBeVisible();
  for (const mode of ["board", "table", "timeline", "list"]) {
    await page.getByRole("button", { name: mode, exact: true }).click();
    await expect(page.getByRole("button", { name: mode === "board" ? `Open ${title}` : title, exact: true })).toBeVisible();
  }
  await page.getByRole("link", { name: "Calendar", exact: true }).click();
  await page.getByLabel("Calendar date", { exact: true }).fill("2026-11-03");
  await page.getByText("Schedule a task", { exact: true }).click();
  await page.getByLabel("Task to schedule", { exact: true }).selectOption(created.json<{ id: string }>().id);
  await page.getByLabel("Start (local time)", { exact: true }).fill("2026-11-03T09:00");
  await page.getByLabel("End (local time)", { exact: true }).fill("2026-11-03T10:00");
  await page.getByRole("button", { name: "Review schedule", exact: true }).click();
  await expect(page.getByRole("region", { name: "Schedule review" })).toBeVisible();
  await page.getByRole("button", { name: "Confirm and apply schedule", exact: true }).click();
  await expect(page.getByRole("button", { name: title, exact: true })).toBeVisible();
  const persisted = await environment.app.inject({ url: `/api/v1/workspaces/${owner.workspaceId}/tasks/${created.json<{ id: string }>().id}`, headers: owner.headers });
  expect(persisted.json<{ deadline: string }>().deadline).toBe("2026-12-31");
  await page.getByRole("link", { name: "Mail", exact: true }).click();
  await expect(page.getByRole("button", { name: "Connect Google", exact: true })).toBeDisabled();
  await expect(page.getByText("No connected accounts yet.", { exact: true })).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test("typed collection UI keeps canonical identity and reviews shared schema edits", async ({ page }) => {
  const source = await environment.app.inject({ method: "POST", url: `/api/v1/workspaces/${owner.workspaceId}/pages`, headers: owner.headers, payload: { operationId: randomUUID(), title: "Collection journey page" } });
  const task = await environment.app.inject({ method: "POST", url: `/api/v1/workspaces/${owner.workspaceId}/tasks`, headers: owner.headers, payload: { operationId: randomUUID(), title: "Collection journey task" } });
  expect(source.statusCode).toBe(201); expect(task.statusCode).toBe(201);
  await login(page);
  await page.getByRole("link", { name: "Collections", exact: true }).click();
  await page.getByText("Create a collection on a page", { exact: true }).click();
  await page.getByLabel("Collection page", { exact: true }).selectOption(source.json<{ id: string }>().id);
  await page.getByRole("button", { name: "Create collection", exact: true }).click();
  await page.getByText("Shared collection schema", { exact: true }).click();
  await page.getByLabel("New property name", { exact: true }).fill("Hours");
  await page.getByLabel("Property type", { exact: true }).selectOption("number");
  await page.getByRole("button", { name: "Add property to review", exact: true }).click();
  await page.getByRole("button", { name: "Review schema changes", exact: true }).click();
  await expect(page.getByRole("region", { name: "Schema change review" })).toBeVisible();
  await page.getByRole("button", { name: "Confirm schema changes", exact: true }).click();
  await page.getByLabel("Link or edit an existing record", { exact: true }).selectOption(task.json<{ id: string }>().id);
  await page.getByLabel("Hours", { exact: true }).fill("4");
  await page.getByRole("button", { name: "Save linked values", exact: true }).click();
  await expect(page.getByRole("cell", { name: "4", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Collection journey task", exact: true }).click();
  await expect(page.getByLabel("Title", { exact: true })).toHaveValue("Collection journey task");
  expect(new URL(page.url()).searchParams.get("r")).toBe(task.json<{ id: string }>().id);
});

test("two browser editors converge and recover an unacknowledged collaborative draft", async ({ page, context }) => {
  const response = await environment.app.inject({ method: "POST", url: `/api/v1/workspaces/${owner.workspaceId}/pages`, headers: owner.headers, payload: { operationId: randomUUID(), title: "Concurrent browser body", visibility: "workspace", body: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "Initial" }] }] } } });
  expect(response.statusCode).toBe(201); const id = response.json<{ id: string }>().id;
  await login(page); await page.goto(`/?w=${owner.workspaceId}&view=pages&r=${id}`);
  await expect(page.getByLabel("Page text", { exact: true })).toHaveValue("Initial");
  const second = await context.newPage(); await second.goto(`/?w=${owner.workspaceId}&view=pages&r=${id}`);
  await expect(second.getByLabel("Page text", { exact: true })).toHaveValue("Initial");
  let release: (() => void) | undefined; const gate = new Promise<void>((resolve) => { release = resolve; });
  for (const editor of [page, second]) await editor.route("**/collaboration", async (route) => { if (route.request().method() === "POST") await gate; await route.continue(); });
  await page.getByLabel("Page text", { exact: true }).fill("Left Initial");
  await second.getByLabel("Page text", { exact: true }).fill("Initial Right");
  release?.();
  await expect(page.getByLabel("Page text", { exact: true })).toHaveValue("Left Initial Right");
  await expect(second.getByLabel("Page text", { exact: true })).toHaveValue("Left Initial Right");
  await page.unroute("**/collaboration");
  await page.route("**/collaboration", async (route) => { if (route.request().method() === "POST") await route.abort("connectionfailed"); else await route.continue(); });
  await page.getByLabel("Page text", { exact: true }).fill("Left Initial Right recovered draft");
  await expect(page.getByRole("status").filter({ hasText: "Offline or unavailable" })).toBeVisible();
  await page.reload();
  await expect(page.getByLabel("Page text", { exact: true })).toHaveValue("Left Initial Right recovered draft");
  await page.unroute("**/collaboration");
  await page.getByRole("button", { name: "Sync body now", exact: true }).click();
  await expect(page.getByRole("status").filter({ hasText: "All body changes saved" })).toBeVisible();
  await expect(second.getByLabel("Page text", { exact: true })).toHaveValue("Left Initial Right recovered draft");
  await second.close();
});

test("rich formatting persists through reload while canonical text remains compatible", async ({ page }) => {
  const user=await environment.account("rich-browser@example.test");
  const response = await environment.app.inject({ method: "POST", url: `/api/v1/workspaces/${user.workspaceId}/pages`, headers: user.headers, payload: { title: "Rich formatting journey", operationId: randomUUID(), body: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "Formatted content" }] }] } } }); expect(response.statusCode).toBe(201); const id = response.json<{ id: string }>().id;
  await login(page,"rich-browser@example.test"); await page.goto(`/?w=${user.workspaceId}&view=pages&r=${id}`); await expect(page.getByLabel("Page text", { exact: true })).toHaveValue("Formatted content"); await page.getByText("Rich text formatting", { exact: true }).click();
  const editor = page.getByRole("textbox", { name: "Rich page body", exact: true }); await expect(editor).toBeVisible(); await editor.click(); await editor.press("ControlOrMeta+a"); await page.getByRole("button", { name: "bold", exact: true }).click(); await page.getByRole("button", { name: "Sync body now", exact: true }).click(); await expect(page.getByRole("status").filter({ hasText: "All body changes saved" })).toBeVisible();
  await expect(editor.locator("strong")).toHaveText("Formatted content"); await page.reload(); await expect(page.getByLabel("Page text", { exact: true })).toHaveValue("Formatted content"); await page.getByText("Rich text formatting", { exact: true }).click(); await expect(page.getByRole("textbox", { name: "Rich page body", exact: true }).locator("strong")).toHaveText("Formatted content");
});

test("reviewed archive recovery and saved collection views survive reload", async ({ page }) => {
  const user=await environment.account("recovery-browser@example.test");
  const title = "Reviewed archive browser task"; const task = await environment.app.inject({ method: "POST", url: `/api/v1/workspaces/${user.workspaceId}/tasks`, headers: user.headers, payload: { title, operationId: randomUUID() } }); expect(task.statusCode).toBe(201);
  await login(page,"recovery-browser@example.test"); await page.getByRole("link", { name: "Tasks", exact: true }).click(); await page.getByText("Reviewed work actions and recovery", { exact: true }).first().click(); await page.getByRole("checkbox", { name: title, exact: true }).check(); await page.getByRole("combobox", { name: "Work action", exact: true }).selectOption("archive"); await page.getByRole("button", { name: "Review selected work", exact: true }).click(); await expect(page.getByRole("region", { name: "Work impact review" })).toBeVisible(); await page.getByRole("button", { name: "Confirm reviewed work", exact: true }).click(); await expect(page.getByRole("status").filter({ hasText: "Reviewed work action saved" })).toBeVisible();
  await page.getByRole("button", { name: "Load archived tasks", exact: true }).click(); await page.getByRole("checkbox", { name: title, exact: true }).check(); await page.getByRole("button", { name: "Review selected work", exact: true }).click(); await page.getByRole("button", { name: "Confirm reviewed work", exact: true }).click(); await expect(page.getByRole("button", { name: title }).last()).toBeVisible();
  const source = await environment.app.inject({ method: "POST", url: `/api/v1/workspaces/${user.workspaceId}/pages`, headers: user.headers, payload: { title: "Saved view browser collection", operationId: randomUUID() } }); const sourceId = source.json<{ id: string }>().id; await environment.app.inject({ method: "POST", url: `/api/v1/workspaces/${user.workspaceId}/collections`, headers: user.headers, payload: { pageId: sourceId, operationId: randomUUID() } });
  await page.getByRole("link", { name: "Collections", exact: true }).click(); await page.getByRole("button", { name: "Saved view browser collection", exact: true }).click(); await page.getByText("Saved collection views", { exact: true }).click(); await page.getByLabel("Collection view name", { exact: true }).fill("Browser focus"); await page.getByRole("button", { name: "Save collection view", exact: true }).click(); await expect(page.getByRole("button", { name: "Browser focus · Personal", exact: true })).toBeVisible(); await page.reload(); await page.getByRole("button", { name: "Saved view browser collection", exact: true }).click(); await page.getByText("Saved collection views", { exact: true }).click(); await expect(page.getByRole("button", { name: "Browser focus · Personal", exact: true })).toBeVisible();
});
