import { defineConfig } from 'vitest/config';
import { resolve } from 'path';

export default defineConfig({
  resolve: {
    alias: {
      '@shared': resolve(__dirname, 'src/shared'),
      '@renderer': resolve(__dirname, 'src/renderer/src'),
      '@main': resolve(__dirname, 'src/main')
    }
  },
  test: {
    workspace: './vitest.workspace.ts'
  }
});
