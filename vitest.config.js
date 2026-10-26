import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/unit/**/*.test.js'],
    environment: 'node',
    coverage: {
      provider: 'v8',
      include: ['src/**/*.js'],
      reporter: ['text-summary', 'text', 'json-summary'],
      // Release thresholds; `npm run test:coverage` fails below them.
      thresholds: { lines: 85, functions: 85, statements: 85, branches: 80 }
    }
  }
});
