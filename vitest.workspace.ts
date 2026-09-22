import { defineWorkspace } from 'vitest/config';
import { resolve } from 'path';

const alias = {
  '@shared': resolve(__dirname, 'src/shared'),
  '@renderer': resolve(__dirname, 'src/renderer/src'),
  '@main': resolve(__dirname, 'src/main')
};

export default defineWorkspace([
  {
    resolve: { alias },
    test: {
      name: 'unit',
      environment: 'node',
      include: ['tests/unit/**/*.test.ts']
    }
  },
  {
    resolve: { alias },
    test: {
      name: 'integration',
      environment: 'node',
      include: ['tests/integration/**/*.test.ts'],
      testTimeout: 60_000,
      hookTimeout: 120_000,
      fileParallelism: false
    }
  }
]);
