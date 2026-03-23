/** @type {import('ts-jest').JestConfigWithTsJest} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'jsdom',
  testEnvironmentOptions: { url: 'http://localhost' },
  roots: ['<rootDir>/src'],
  moduleNameMapper: {
    '\\.module\\.css$': '<rootDir>/src/test/__mocks__/styleMock.js',
    '\\.css$': '<rootDir>/src/test/__mocks__/styleMock.js',
    '\\.svg$': '<rootDir>/src/test/__mocks__/fileMock.js',
  },
  transform: {
    '^.+\\.tsx?$': ['ts-jest', { tsconfig: 'tsconfig.json' }],
  },
  setupFilesAfterEnv: ['<rootDir>/src/test/setup.ts'],
  testMatch: ['**/__tests__/**/*.test.ts?(x)', '**/*.test.ts?(x)'],
};
