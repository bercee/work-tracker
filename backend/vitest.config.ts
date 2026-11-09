import { defineConfig } from 'vitest/config';

const minimumNodeMajor = 24;
const currentNodeMajor = Number.parseInt(process.versions.node.split('.')[0] ?? '', 10);

if (!Number.isInteger(currentNodeMajor) || currentNodeMajor < minimumNodeMajor) {
  throw new Error(`Backend tests require Node.js 24 or newer; current runtime is ${process.version}`);
}

export default defineConfig({
  test: {
    environment: 'node',
    include: ['test/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      include: ['src/**/*.ts'],
      thresholds: {
        lines: 80,
        statements: 80,
        functions: 80,
        branches: 80,
      },
    },
  },
});
