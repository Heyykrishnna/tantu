import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "test",
  testMatch: "navigation.spec.ts",
  workers: 1,
  timeout: 30_000,
  outputDir: ".artifacts/navigation-browser",
  use: {
    baseURL: "http://localhost:3110",
    colorScheme: "dark",
    ...(process.env.CI ? {} : { channel: "chrome" }),
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },
  webServer: {
    command:
      "node ../frontend/node_modules/next/dist/bin/next start --hostname 127.0.0.1 --port 3110",
    cwd: "../frontend",
    url: "http://localhost:3110",
    reuseExistingServer: false,
    timeout: 30_000,
  },
});
