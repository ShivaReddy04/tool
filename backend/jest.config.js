/** @type {import('jest').Config} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  testMatch: ['<rootDir>/src/**/*.test.ts'],
  setupFiles: ['<rootDir>/src/__tests__/setup-env.ts'],
  moduleFileExtensions: ['ts', 'js', 'json'],
  clearMocks: true,
};
