import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: 'tests/e2e',
  globalSetup: './tests/e2e/global-setup.ts',
  fullyParallel: true,
  reporter: process.env.CI ? 'github' : 'list',
  use: { baseURL: 'http://localhost:4599' },
  webServer: {
    command: 'bun tests/e2e/serve.ts',
    port: 4599,
    reuseExistingServer: !process.env.CI,
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] }, testIgnore: /extension\.spec\.ts/ },
    { name: 'firefox', use: { ...devices['Desktop Firefox'] }, testIgnore: /extension\.spec\.ts/ },
    // The example extension smoke test (Chromium only; launches its own persistent context).
    { name: 'extension', use: { ...devices['Desktop Chrome'] }, testMatch: /extension\.spec\.ts/ },
  ],
});
