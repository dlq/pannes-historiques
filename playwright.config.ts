import { defineConfig, devices } from "@playwright/test";

const port = Number(process.env.APP_PORT || 4173);
const baseURL = `http://127.0.0.1:${port}`;
const skipWebServer = process.env.PLAYWRIGHT_SKIP_WEBSERVER === "1";

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  timeout: 30_000,
  expect: {
    timeout: 10_000,
  },
  use: {
    baseURL,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  webServer: skipWebServer
    ? undefined
    : {
        command: `APP_PORT=${port} UV_CACHE_DIR=.uv-cache uv run python tests/e2e_server.py`,
        url: `${baseURL}/healthz`,
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
      },
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
      },
    },
    {
      name: "mobile-chromium",
      use: {
        ...devices["iPhone 13"],
        browserName: "chromium",
      },
    },
  ],
});
