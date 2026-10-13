/** @type {import('jest').Config} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/tests'],
  setupFiles: ['<rootDir>/tests/setup/env.ts'],
  testTimeout: 30000,
  collectCoverageFrom: ['src/**/*.ts', '!src/server.ts', '!src/scripts/**', '!src/types/**'],
  // The payout and budget rules live in src/domain and must stay fully covered.
  coverageThreshold: {
    './src/domain/': { branches: 100, functions: 100, lines: 100, statements: 100 },
  },
};
