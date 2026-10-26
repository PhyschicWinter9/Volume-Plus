import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: 'tests',
  testMatch: ['dsp/**/*.spec.js', 'e2e/**/*.spec.js'],
  timeout: 60_000,
  workers: 1,                       // extension E2E uses persistent contexts; keep deterministic
  reporter: [['list']],
  use: { trace: 'retain-on-failure' }
});
