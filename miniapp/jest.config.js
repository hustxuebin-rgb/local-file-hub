module.exports = {
  testEnvironment: 'node',
  setupFiles: ['<rootDir>/__mocks__/setup.js'],
  transform: {
    '^.+\\.(ts|tsx)$': ['ts-jest', { tsconfig: 'tsconfig.json' }],
    '^.+\\.(js|jsx)$': 'babel-jest',
  },
  transformIgnorePatterns: [
    'node_modules/(?!(.*?\\.(ts|tsx)$)|@tarojs|@nutui)',
  ],
  moduleNameMapper: {
    '\\.(css|scss|less)$': '<rootDir>/__mocks__/styleMock.js',
  },
  testMatch: ['**/__tests__/**/*.test.(ts|tsx)'],
};
