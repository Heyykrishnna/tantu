import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "test",
  testMatch: "workspace-routes.spec.ts",
  workers: 1,
  timeout: 60_000,
  outputDir: ".artifacts/workspace-routes",
  use: {
    baseURL: process.env.ROUTE_TEST_ORIGIN ?? "http://localhost:3000",
    headless: true,
    trace: "off",
    screenshot: "only-on-failure",
    ...(process.env.CI ? {} : { channel: "chrome" }),
  },
});
