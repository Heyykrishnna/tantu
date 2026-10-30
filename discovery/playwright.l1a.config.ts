import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "test",
  testMatch: "l1a.spec.ts",
  workers: 1,
  timeout: 60_000,
  outputDir: ".artifacts/l1a-browser",
  use: { baseURL: "http://localhost:3100", headless: true, screenshot: "only-on-failure", trace: "retain-on-failure", ...(process.env.CI ? {} : { channel: "chrome" }) },
});
