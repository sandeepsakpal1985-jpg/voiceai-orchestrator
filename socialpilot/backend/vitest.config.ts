import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    setupFiles: ['./src/__tests__/setup.ts'],
    testTimeout: 30000,
    hookTimeout: 30000,
    fileParallelism: false,
    sequence: {
      // Run tests in files sequentially to avoid DB collisions
      concurrent: false,
    },
    // Run test files in order (auth first, then the rest)
    include: ['src/__tests__/**/*.test.ts'],
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@socialpilot/shared': path.resolve(__dirname, '../packages/shared/src'),
    },
  },
});
