module.exports = {
  preset: 'react-native',
  // React Native lazily initializes its component mocks; allow cold Windows runs.
  testTimeout: 15000,
  modulePathIgnorePatterns: ['<rootDir>/android/'],
};
