import { defineConfig } from 'vitest/config';
import path from 'node:path';

// Date-grouping tests assume a fixed time zone; workers inherit this.
process.env.TZ = 'UTC';

export default defineConfig({
  resolve: { alias: { '@': path.resolve(__dirname, '.') } },
  test: {
    environment: 'node',
    include: ['**/__tests__/**/*.test.ts'],
    exclude: ['node_modules/**', '.next/**'],
  },
});
