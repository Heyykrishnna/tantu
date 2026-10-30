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
let server: ChildProcess | undefined;
let serverOutput = "";

test.beforeAll(async () => {
  environment = await fixture({ origin: "http://localhost:3100" });
  owner = await environment.account("browser@example.test");
  await environment.app.listen({ host: "127.0.0.1", port: 4000 });
  server = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "--port", "3100", "--hostname", "127.0.0.1"], { cwd: fileURLToPath(new URL("../../frontend/", import.meta.url)), stdio: ["ignore", "pipe", "pipe"] });
  server.stdout?.on("data", (chunk: Buffer) => { serverOutput = (serverOutput + chunk.toString()).slice(-20_000); });
  server.stderr?.on("data", (chunk: Buffer) => { serverOutput = (serverOutput + chunk.toString()).slice(-20_000); });
  for (let attempt = 0; attempt < 100; attempt++) {
    try { if ((await fetch("http://localhost:3100")).ok) return; } catch (error) { if (!(error instanceof Error)) throw error; }
    if (server.exitCode !== null) throw new Error("Frontend stopped: " + serverOutput);
    await setTimeout(200);
  }
  throw new Error("Frontend startup timed out: " + serverOutput);
});

test.afterAll(async () => {
  if (server && server.exitCode === null) {
    server.kill("SIGTERM");
    await Promise.race([new Promise<void>((resolve) => server?.once("exit", () => resolve())), setTimeout(5000)]);
    if (server.exitCode === null) server.kill("SIGKILL");
  }
  if (environment) await environment.close();
});

async function login(page: Page, email = "browser@example.test") {
  await page.goto("/");
  await page.getByLabel("Email address").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(testPassword);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.getByRole("button", { name: "Sign out" })).toBeVisible();
}

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
  await page.getByRole("button", { name: "Pages", exact: true }).click();
  await page.getByRole("button", { name: "+ New page", exact: true }).click();
  await page.getByLabel("Title", { exact: true }).fill("Release notes");
  await page.getByLabel("Page text", { exact: true }).fill("# A careful beginning\n<script>unsafe text stays text</script>");
  await page.getByRole("button", { name: "Create page", exact: true }).click();
  await expect(page).toHaveURL(/view=pages&r=/);
  await expect(page.getByRole("button", { name: "Save changes", exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByLabel("Page text", { exact: true })).toHaveValue("# A careful beginning\n<script>unsafe text stays text</script>");
  await page.getByRole("button", { name: "View history" }).click();
  await expect(page.getByText(/Version 1 ·/)).toBeVisible();
  await page.keyboard.press(process.platform === "darwin" ? "Meta+k" : "Control+k");
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).not.toBeVisible();
  await mkdir(new URL("../.artifacts/l1a-browser/", import.meta.url), { recursive: true });
  await page.evaluate(() => { if (document.activeElement instanceof HTMLElement) document.activeElement.blur(); window.scrollTo(0, 0); });
  await page.screenshot({ path: fileURLToPath(new URL("../.artifacts/l1a-browser/desktop.png", import.meta.url)), fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: fileURLToPath(new URL("../.artifacts/l1a-browser/mobile.png", import.meta.url)), fullPage: true });
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
