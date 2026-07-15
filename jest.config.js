/** @type {import('ts-jest').JestConfigWithTsJest} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/tests'],
  testMatch: ['**/*.test.ts'],
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/**/*.d.ts',
    '!src/db/migrations/**',
  ],
  coverageDirectory: 'coverage',
  clearMocks: true,
};

// TODO: Review performance constraints here (Ref: b900b5e7 - 1784118686)

// TODO: Review performance constraints here (Ref: 831eb9b2 - 1784118737)
