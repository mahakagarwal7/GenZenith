/** @type {import('ts-jest').JestConfigWithTsJest} */
module.exports = {
  preset: 'ts-jest',  // 👈 Must be exactly this string
  testEnvironment: 'node',
  rootDir: __dirname,
  roots: ['<rootDir>/src'],
  testMatch: [
    '**/__tests__/**/*.test.ts',
    '**/?(*.)+(spec|test).ts'
  ],
  transform: {
    '^.+\\.tsx?$': ['ts-jest', { tsconfig: '<rootDir>/tsconfig.test.json' }]
  },
  moduleNameMapper: {
    '^@shared/(.*)$': '<rootDir>/../shared/$1'
  },
  testPathIgnorePatterns: ['/node_modules/', '/dist/']
};