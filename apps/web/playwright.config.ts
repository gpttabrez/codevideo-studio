import {defineConfig, devices} from '@playwright/test';
import {fileURLToPath} from 'node:url';

const here = fileURLToPath(new URL('.', import.meta.url));

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 60_000,
  expect: {timeout: 10_000},
  fullyParallel: true,
  reporter: 'list',
  use: {
    baseURL: 'http://127.0.0.1:5173',
    trace: 'on-first-retry',
    ...devices['Desktop Chrome'],
  },
  webServer: {
    command: 'pnpm dev --host 127.0.0.1 --port 5173',
    cwd: here,
    url: 'http://127.0.0.1:5173',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
