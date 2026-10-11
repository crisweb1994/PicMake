import { defineConfig, devices } from "@playwright/test";

// 冒烟用例只用 mock API（scripts/mock-api.mjs），不消耗额度，也不接触真实 Key。
// 用专用端口并总是新起服务：不复用日常开发的 5173 / 8787，避免连到别的分支或带状态的服务
const APP_PORT = 5273;
const MOCK_PORT = 8788;
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: `http://localhost:${APP_PORT}`,
    trace: "retain-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: [
    {
      command: "node scripts/mock-api.mjs",
      env: { MOCK_PORT: String(MOCK_PORT) },
      url: `http://localhost:${MOCK_PORT}/v1/models`,
      reuseExistingServer: false,
    },
    {
      command: `pnpm dev --port ${APP_PORT} --strictPort`,
      url: `http://localhost:${APP_PORT}`,
      reuseExistingServer: false,
    },
  ],
});
