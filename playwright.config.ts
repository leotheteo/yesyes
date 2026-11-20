import "dotenv/config";
import { defineConfig } from "@playwright/test";
process.env.DATABASE_URL =
  process.env.TEST_DATABASE_URL ||
  "postgresql://family:local-development-only@127.0.0.1:55432/family_e2e";
process.env.BETTER_AUTH_URL = "http://localhost:3100";
export default defineConfig({
  testDir: "./e2e",
  workers: 1,
  fullyParallel: false,
  timeout: 60000,
  use: {
    baseURL: "http://localhost:3100",
    browserName: "chromium",
    headless: true,
    trace: "retain-on-failure",
  },
  webServer: {
    command: "npm start -- --port 3100",
    url: "http://localhost:3100/api/health",
    reuseExistingServer: !process.env.CI,
    timeout: 60000,
  },
});
