import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "test",
  testMatch: "prototype.spec.ts",
  workers: 1,
  outputDir: ".artifacts/browser",
  use: {
    baseURL: "http://127.0.0.1:4173",
    ...(process.env.CI ? {} : { channel: "chrome" }),
    headless: true,
  },
  webServer: {
    command: "python3 -m http.server 4173 --bind 127.0.0.1 --directory prototype",
    url: "http://127.0.0.1:4173",
    reuseExistingServer: true,
    timeout: 15_000,
  },
});
