import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./assets/__tests__/setup.ts'],
    coverage: {
      reporter: ['text', 'json', 'html'],
      exclude: [
        'node_modules/**',
        'assets/__tests__/**',
        '**/*.config.ts',
        'utils/reindex.ts',
        'utils/preindex.ts'
      ]
    }
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './assets'),
      '@utils': path.resolve(__dirname, './utils')
    }
  }
});