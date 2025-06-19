module.exports = {
  testEnvironment: "jsdom", // <-- Explicitly use Jest's standard JSDOM environment
  // Add/ensure these lines:
  setupFilesAfterEnv: [
    "<rootDir>/test/mock/index.js" // <rootDir> resolves to the project root
  ],
  // You might also need to ensure Jest can resolve module paths correctly
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
  },
  // This is important if you're testing Vue files and ES modules
  transform: {
    '^.+\\.js$': 'babel-jest',
  },
  moduleFileExtensions: ['js', 'json'],
  // REMOVE or set to default:
  // transformIgnorePatterns: [], // <-- make sure node_modules is NOT ignored
};

