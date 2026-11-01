import { mkdir, writeFile } from "node:fs/promises";
import { URL } from "node:url";
import { chromium } from "@playwright/test";

const origin = new URL(process.env.PERFORMANCE_ORIGIN ?? "http://127.0.0.1:3200");
if (!["127.0.0.1", "localhost"].includes(origin.hostname) || origin.username || origin.password || origin.pathname !== "/")
  throw new Error("PERFORMANCE_ORIGIN must be a local frontend origin without credentials.");
const browser = await chromium.launch({ headless: true, ...(process.env.CI ? {} : { channel: "chrome" }) });
try {
  const page = await browser.newPage({ reducedMotion: "reduce" });
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.goto(origin.origin);
  await page.getByRole("button", { name: "Sign in", exact: true }).waitFor();
  await page.waitForLoadState("networkidle");
  const scripts = await page.evaluate(() => globalThis.performance.getEntriesByType("resource")
    .filter(entry => new globalThis.URL(entry.name).pathname.endsWith(".js"))
    .map(entry => ({ path: new globalThis.URL(entry.name).pathname, bytes: entry.decodedBodySize, transfer: entry.transferSize })));
  const result = { origin: origin.origin, scripts, totalJavaScriptBytes: scripts.reduce((sum, script) => sum + script.bytes, 0), errors };
  const directory = new URL("../.artifacts/performance/", import.meta.url);
  await mkdir(directory, { recursive: true });
  await writeFile(new URL("sign-in.json", directory), JSON.stringify(result, null, 2) + "\n");
  process.stdout.write(JSON.stringify({ javascriptBytes: result.totalJavaScriptBytes, scripts: scripts.length, errors }) + "\n");
  if (errors.length) throw new Error("The production sign-in journey raised browser errors.");
} finally {
  await browser.close();
}
